#define WIN32_LEAN_AND_MEAN
#define _WINSOCKAPI_
#include <winsock2.h>
#include <Windows.h>

#include <algorithm>
#include <cctype>
#include <cstring>
#include <filesystem>
#include <iterator>
#include <string>
#include <vector>

#include "imgui/imgui.h"

#include "sunone_aimbot_2.h"
#include "overlay/config_dirty.h"
#include "overlay/ui_sections.h"

namespace
{
char neuralModelPathBuf[260] = {};
bool neuralUiInitialized = false;

bool hasNeuralModelExtension(const std::filesystem::path& path)
{
    std::string ext = path.extension().string();
    std::transform(ext.begin(), ext.end(), ext.begin(),
        [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
    return ext == ".onnx" || ext == ".engine";
}

std::vector<std::string> getAvailableNeuralTrackerModels()
{
    std::vector<std::string> models;
    const std::filesystem::path roots[] = {
        std::filesystem::path("training") / "models",
        std::filesystem::path("models")
    };

    for (const auto& root : roots)
    {
        std::error_code ec;
        std::filesystem::directory_iterator it(root, ec);
        if (ec)
            continue;

        for (const auto& entry : it)
        {
            if (!entry.is_regular_file() || !hasNeuralModelExtension(entry.path()))
                continue;

            models.push_back((root / entry.path().filename()).generic_string());
        }
    }

    std::sort(models.begin(), models.end());
    models.erase(std::unique(models.begin(), models.end()), models.end());
    return models;
}

void syncNeuralBuffers()
{
    if (neuralUiInitialized)
        return;

    strncpy_s(neuralModelPathBuf, config.neural_tracker_model_path.c_str(), _TRUNCATE);
    neuralUiInitialized = true;
}
}

void draw_neural()
{
    syncNeuralBuffers();

    if (OverlayUI::BeginSection("Neural Tracker", "neural_section_tracker"))
    {
        if (ImGui::Checkbox("Enable neural association", &config.neural_tracker_enabled))
        {
            OverlayConfig_MarkDirty();
        }

        const char* runtimeItems[] = {
            "CPU (ONNX Runtime)",
#ifdef USE_CUDA
            "CUDA (TensorRT)"
#endif
        };
        int runtimeIndex = config.neural_tracker_runtime == "CUDA" ? 1 : 0;
#ifndef USE_CUDA
        runtimeIndex = 0;
#endif
        if (ImGui::Combo("Association runtime", &runtimeIndex, runtimeItems, IM_ARRAYSIZE(runtimeItems)))
        {
            config.neural_tracker_runtime = (runtimeIndex == 1) ? "CUDA" : "CPU";
            OverlayConfig_MarkDirty();
        }

        std::vector<std::string> availableModels = getAvailableNeuralTrackerModels();
        if (!availableModels.empty())
        {
            auto it = std::find(availableModels.begin(), availableModels.end(), config.neural_tracker_model_path);
            if (it == availableModels.end())
            {
                availableModels.push_back(config.neural_tracker_model_path);
                it = std::prev(availableModels.end());
            }

            int currentModelIndex = static_cast<int>(std::distance(availableModels.begin(), it));
            std::vector<const char*> modelItems;
            modelItems.reserve(availableModels.size());
            for (const auto& model : availableModels)
                modelItems.push_back(model.c_str());

            ImGui::SetNextItemWidth(OverlayUI::AdaptiveItemWidth(0.78f));
            if (ImGui::Combo("Association model", &currentModelIndex, modelItems.data(), static_cast<int>(modelItems.size())))
            {
                config.neural_tracker_model_path = availableModels[currentModelIndex];
                strncpy_s(neuralModelPathBuf, config.neural_tracker_model_path.c_str(), _TRUNCATE);
                OverlayConfig_MarkDirty();
            }
        }

        ImGui::SetNextItemWidth(OverlayUI::AdaptiveItemWidth(0.78f));
        if (ImGui::InputText("Association path", neuralModelPathBuf, IM_ARRAYSIZE(neuralModelPathBuf)))
        {
            config.neural_tracker_model_path = neuralModelPathBuf;
            OverlayConfig_MarkDirty();
        }

        if (ImGui::SliderFloat("Association blend", &config.neural_tracker_blend, 0.0f, 1.0f, "%.2f"))
        {
            config.neural_tracker_blend = std::clamp(config.neural_tracker_blend, 0.0f, 1.0f);
            OverlayConfig_MarkDirty();
        }

        OverlayUI::EndSection();
    }

    if (OverlayUI::BeginSection("PID Governor", "neural_section_pid_governor"))
    {
        if (ImGui::Checkbox("Enable PID governor", &config.pid_governor_enabled))
        {
            OverlayConfig_MarkDirty();
        }

        if (ImGui::SliderInt("Governor speed", &config.pid_governor_speed, 1, 100))
        {
            config.pid_governor_speed = std::clamp(config.pid_governor_speed, 1, 100);
            OverlayConfig_MarkDirty();
        }

        if (ImGui::SliderInt("Governor blend", &config.pid_governor_blend, 1, 100))
        {
            config.pid_governor_blend = std::clamp(config.pid_governor_blend, 1, 100);
            OverlayConfig_MarkDirty();
        }

        if (ImGui::SliderInt("Target lead %", &config.pid_governor_lead_percent, 0, 50))
        {
            config.pid_governor_lead_percent = std::clamp(config.pid_governor_lead_percent, 0, 50);
            OverlayConfig_MarkDirty();
        }

        OverlayUI::EndSection();
    }
}
