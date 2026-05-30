#include <algorithm>
#include <numeric>
#include <chrono>
#include <limits>

#include "postProcess.h"
#include "sunone_aimbot_2.h"
#ifdef USE_CUDA
#include "trt_detector.h"
#endif

namespace
{
void LimitDetectionsByConfidence(std::vector<Detection>& detections, size_t limit)
{
    if (limit == 0 || detections.size() <= limit)
        return;

    const auto kth = detections.begin() + static_cast<std::vector<Detection>::difference_type>(limit);
    std::nth_element(
        detections.begin(),
        kth,
        detections.end(),
        [](const Detection& a, const Detection& b)
        {
            return a.confidence > b.confidence;
        });
    detections.resize(limit);
}

void RunBoundedNms(
    std::vector<Detection>& detections,
    float nmsThreshold,
    int maxDetections,
    std::chrono::duration<double, std::milli>* nmsTime)
{
    constexpr size_t kPreNmsHardLimit = 1000;

    size_t preNmsLimit = kPreNmsHardLimit;
    if (maxDetections > 0)
    {
        const size_t requested = static_cast<size_t>(maxDetections);
        preNmsLimit = std::min(kPreNmsHardLimit, std::max(requested, requested * 8));
    }

    LimitDetectionsByConfidence(detections, preNmsLimit);
    NMS(detections, nmsThreshold, nmsTime);

    if (maxDetections > 0)
        LimitDetectionsByConfidence(detections, static_cast<size_t>(maxDetections));
}
}

void NMS(std::vector<Detection>& detections, float nmsThreshold, std::chrono::duration<double, std::milli>* nmsTime)
{
    if (detections.empty()) return;

    if (nmsThreshold <= 0.0f)
    {
        if (nmsTime)
        {
            *nmsTime = std::chrono::duration<double, std::milli>(0);
        }
        return;
    }

    auto t0 = std::chrono::steady_clock::now();

    std::sort(
        detections.begin(),
        detections.end(),
        [](const Detection& a, const Detection& b)
        {
            return a.confidence > b.confidence;
        }
    );

    std::vector<bool> suppress(detections.size(), false);
    std::vector<Detection> result;
    result.reserve(detections.size());

    for (size_t i = 0; i < detections.size(); ++i)
    {
        if (suppress[i]) continue;

        result.push_back(detections[i]);

        const cv::Rect& box_i = detections[i].box;
        const float area_i = static_cast<float>(box_i.area());

        for (size_t j = i + 1; j < detections.size(); ++j)
        {
            if (suppress[j]) continue;

            const cv::Rect& box_j = detections[j].box;
            const cv::Rect intersection = box_i & box_j;

            if (intersection.width > 0 && intersection.height > 0)
            {
                const float intersection_area = static_cast<float>(intersection.area());
                const float union_area = area_i + static_cast<float>(box_j.area()) - intersection_area;

                if (intersection_area / union_area > nmsThreshold)
                {
                    suppress[j] = true;
                }
            }
        }
    }

    detections = std::move(result);

    auto t1 = std::chrono::steady_clock::now();
    if (nmsTime)
    {
        *nmsTime = t1 - t0;
    }
}

#ifdef USE_CUDA
std::vector<Detection> postProcessYolo(
    const float* output,
    const std::vector<int64_t>& shape,
    int numClasses,
    float confThreshold,
    float nmsThreshold,
    int maxDetections,
    std::chrono::duration<double, std::milli>* nmsTime
)
{
    std::vector<Detection> detections;
    detections.reserve(256);

    if (shape.size() < 3) return detections;

    int64_t rows = shape[1];
    int64_t cols = shape[2];
    const float img_scale = trt_detector.img_scale;

    if (cols == 6)
    {
        int64_t numDetections = rows;
        for (int i = 0; i < numDetections; ++i)
        {
            const float* det = output + i * cols;
            float confidence = det[4];

            if (confidence > confThreshold)
            {
                int classId = static_cast<int>(det[5]);

                float cx = det[0];
                float cy = det[1];
                float dx = det[2];
                float dy = det[3];

                Detection detection;
                detection.box.x = static_cast<int>(cx * img_scale);
                detection.box.y = static_cast<int>(cy * img_scale);
                detection.box.width = static_cast<int>((dx - cx) * img_scale);
                detection.box.height = static_cast<int>((dy - cy) * img_scale);
                detection.confidence = confidence;
                detection.classId = classId;

                detections.push_back(detection);
            }
        }
    }
    else
    {
        for (int i = 0; i < cols; ++i)
        {
            const float* col_data = output + i;

            float cx = col_data[0 * cols];
            float cy = col_data[1 * cols];
            float ow = col_data[2 * cols];
            float oh = col_data[3 * cols];

            float maxScore = 0.0f;
            int maxClassId = 0;
            for (int c = 0; c < numClasses; ++c)
            {
                float score = col_data[(4 + c) * cols];
                if (score > maxScore)
                {
                    maxScore = score;
                    maxClassId = c;
                }
            }

            if (maxScore > confThreshold)
            {
                const float half_ow = 0.5f * ow;
                const float half_oh = 0.5f * oh;

                Detection det;
                det.box.x = static_cast<int>((cx - half_ow) * img_scale);
                det.box.y = static_cast<int>((cy - half_oh) * img_scale);
                det.box.width = static_cast<int>(ow * img_scale);
                det.box.height = static_cast<int>(oh * img_scale);
                det.confidence = maxScore;
                det.classId = maxClassId;

                detections.push_back(det);
            }
        }
    }

    RunBoundedNms(detections, nmsThreshold, maxDetections, nmsTime);
    return detections;
}
#endif

std::vector<Detection> postProcessYoloDML(
    const float* output,
    const std::vector<int64_t>& shape,
    int numClasses,
    float confThreshold,
    float nmsThreshold,
    int maxDetections,
    std::chrono::duration<double, std::milli>* nmsTime
)
{
    std::vector<Detection> detections;
    if (shape.size() != 2) return detections;

    int64_t rows = shape[0];
    int64_t cols = shape[1];
    if (rows <= 0 || cols <= 0) return detections;
    if (rows > std::numeric_limits<int>::max() || cols > std::numeric_limits<int>::max()) return detections;
    const int rows_i = static_cast<int>(rows);
    const int cols_i = static_cast<int>(cols);

    if (cols_i == 6)
    {
        const int numDetections = rows_i;
        detections.reserve(static_cast<size_t>(numDetections));
        for (int i = 0; i < numDetections; ++i)
        {
            const float* det = output + i * cols_i;
            float confidence = det[4];
            if (confidence > confThreshold)
            {
                int classId = static_cast<int>(det[5]);
                float cx = det[0];
                float cy = det[1];
                float dx = det[2];
                float dy = det[3];

                cv::Rect box;
                box.x = static_cast<int>(cx);
                box.y = static_cast<int>(cy);
                box.width = static_cast<int>(dx - cx);
                box.height = static_cast<int>(dy - cy);
                detections.push_back(Detection{ box, confidence, classId });
            }
        }
        RunBoundedNms(detections, nmsThreshold, maxDetections, nmsTime);
        return detections;
    }

    if (numClasses <= 0 || rows_i < 4 + numClasses)
        return detections;

    detections.reserve(256);
    for (int i = 0; i < cols_i; ++i)
    {
        float maxScore = output[4 * cols_i + i];
        int maxClassId = 0;
        for (int c = 1; c < numClasses; ++c)
        {
            const float score = output[(4 + c) * cols_i + i];
            if (score > maxScore)
            {
                maxScore = score;
                maxClassId = c;
            }
        }

        if (maxScore > confThreshold)
        {
            float cx = output[i];
            float cy = output[cols_i + i];
            float ow = output[2 * cols_i + i];
            float oh = output[3 * cols_i + i];
            const float half_ow = 0.5f * ow;
            const float half_oh = 0.5f * oh;
            cv::Rect box;
            box.x = static_cast<int>(cx - half_ow);
            box.y = static_cast<int>(cy - half_oh);
            box.width = static_cast<int>(ow);
            box.height = static_cast<int>(oh);
            detections.push_back(Detection{ box, maxScore, maxClassId });
        }
    }
    if (!detections.empty())
    {
        RunBoundedNms(detections, nmsThreshold, maxDetections, nmsTime);
    }
    return detections;
}
