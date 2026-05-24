import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


class DetectionTrackingContractTest(unittest.TestCase):
    def read(self, relative_path):
        return (REPO_ROOT / relative_path).read_text(encoding="utf-8")

    def test_detection_confidence_reaches_pid_observation(self):
        buffer_h = self.read("sunone_aimbot_2/detector/detection_buffer.h")
        self.assertIn("std::vector<float> confidences", buffer_h)

        dml = self.read("sunone_aimbot_2/detector/dml_detector.cpp")
        trt = self.read("sunone_aimbot_2/detector/trt_detector.cpp")
        self.assertIn("detectionBuffer.confidences.push_back", dml)
        self.assertIn("detectionBuffer.confidences.push_back", trt)

        loop = self.read("sunone_aimbot_2/runtime/mouse_thread_loop.cpp")
        self.assertIn("confidences = detectionBuffer.confidences", loop)
        self.assertIn("targetTracker.update(", loop)
        self.assertIn("target.confidence", self.read("sunone_aimbot_2/mouse/mouse.cpp"))

    def test_tracker_uses_motcpp_style_association_signals(self):
        target_h = self.read("sunone_aimbot_2/mouse/AimbotTarget.h")
        target_cpp = self.read("sunone_aimbot_2/mouse/AimbotTarget.cpp")

        self.assertIn("double confidence", target_h)
        self.assertIn("float confidence", target_h)
        self.assertIn("predictedBox", target_cpp)
        self.assertIn("confidenceBonus", target_cpp)
        self.assertIn("trackAssigned", target_cpp)

    def test_tracker_keeps_locked_identity_with_soft_motion_features(self):
        target_h = self.read("sunone_aimbot_2/mouse/AimbotTarget.h")
        target_cpp = self.read("sunone_aimbot_2/mouse/AimbotTarget.cpp")

        self.assertIn("lastAssociationScore", target_h)
        self.assertIn("lastHeadingAlignment", target_h)
        self.assertIn("AssociationBreakdown", target_cpp)
        self.assertIn("headingPenalty", target_cpp)
        self.assertIn("lockedBias", target_cpp)

    def test_head_fused_player_tracks_publish_head_sized_aim_box(self):
        target_h = self.read("sunone_aimbot_2/mouse/AimbotTarget.h")
        target_cpp = self.read("sunone_aimbot_2/mouse/AimbotTarget.cpp")
        loop = self.read("sunone_aimbot_2/runtime/mouse_thread_loop.cpp")

        for token in ("aimW", "aimH", "aimBox"):
            self.assertIn(token, target_h + target_cpp)

        self.assertIn("playerHeadAimBox", target_cpp)
        self.assertIn("playerHeadPivotX[bestPlayer] = h.pivotX", target_cpp)
        self.assertIn("playerHeadPivotY[bestPlayer] = h.pivotY", target_cpp)
        self.assertIn("playerHeadAimBox[bestPlayer] = h.aimBox", target_cpp)
        self.assertIn("d.aimBox = playerHeadAimBox[i]", target_cpp)
        self.assertNotIn("playerHeadAimBox[bestPlayer] = h.box", target_cpp)
        self.assertIn("mouseThread.moveMouse(*activeTarget)", loop)
        self.assertIn("target.aimW", self.read("sunone_aimbot_2/mouse/mouse.cpp"))
        self.assertIn("target.aimH", self.read("sunone_aimbot_2/mouse/mouse.cpp"))

    def test_player_only_head_projection_path_is_removed(self):
        target_h = self.read("sunone_aimbot_2/mouse/AimbotTarget.h")
        target_cpp = self.read("sunone_aimbot_2/mouse/AimbotTarget.cpp")
        config_h = self.read("sunone_aimbot_2/config/config.h")
        config_cpp = self.read("sunone_aimbot_2/config/config.cpp")

        self.assertIn("bool headAim", target_h)
        for token in [
            "projectAimBoxFromTrack",
            "aim_project_player_to_head_enabled",
            "head_to_player_projection",
            "head_projection_recentered",
            "centerAimBoxInTarget",
            "clampAimBoxInsideTarget",
        ]:
            self.assertNotIn(token, target_h + target_cpp + config_h + config_cpp)
        self.assertIn("t.headAim = d.headAim", target_cpp)

    def test_reacquisition_smoothing_keeps_aim_box_aligned(self):
        target_h = self.read("sunone_aimbot_2/mouse/AimbotTarget.h")
        target_cpp = self.read("sunone_aimbot_2/mouse/AimbotTarget.cpp")

        self.assertIn("reacquisitionStartAimBox", target_h)
        self.assertIn("reacquisitionTargetAimBox", target_h)
        self.assertIn("t.aimBox = lerpRect(t.reacquisitionStartAimBox, t.reacquisitionTargetAimBox, alpha)", target_cpp)
        self.assertIn("t.aimBox = t.reacquisitionTargetAimBox", target_cpp)
        self.assertIn("const cv::Rect2f& targetAimBox", target_cpp)
        self.assertIn("beginReacquisitionSmoothing(t, d.box, d.aimBox, d.pivotX, d.pivotY, missedBeforeUpdate)", target_cpp)
        self.assertNotIn("applyReacquisitionSmoothing(t);\n                t.aimBox = d.aimBox", target_cpp)

    def test_aim_region_resolver_is_single_aim_box_projection_source(self):
        target_cpp = self.read("sunone_aimbot_2/mouse/AimbotTarget.cpp")

        self.assertIn("resolveAimRegion", target_cpp)
        self.assertIn("AimRegionSource::HeadAnchor", target_cpp)
        self.assertIn("AimRegionSource::BodyAnchor", target_cpp)
        self.assertNotIn("previousBoxWasAimBox", target_cpp)
        self.assertNotIn("targetBox.width > t.box.width * 1.50f", target_cpp)
        self.assertNotIn("targetBox.height > t.box.height * 1.50f", target_cpp)

    def test_prediction_does_not_extrapolate_outer_box_size(self):
        target_cpp = self.read("sunone_aimbot_2/mouse/AimbotTarget.cpp")

        self.assertIn("Keep predicted box size stable during detector gaps", target_cpp)
        self.assertIn("t.box.width = std::max(1.0f, t.box.width);", target_cpp)
        self.assertIn("t.box.height = std::max(1.0f, t.box.height);", target_cpp)
        self.assertIn("const float predW = std::max(1.0f, t.box.width);", target_cpp)
        self.assertIn("const float predH = std::max(1.0f, t.box.height);", target_cpp)
        self.assertNotIn("t.box.width + t.sizeVelocity.x", target_cpp)
        self.assertNotIn("t.box.height + t.sizeVelocity.y", target_cpp)

    def test_implausible_projection_recenter_path_is_removed(self):
        target_cpp = self.read("sunone_aimbot_2/mouse/AimbotTarget.cpp")

        self.assertNotIn("centerAimBoxInTarget", target_cpp)
        self.assertNotIn("head_projection_recentered", target_cpp)
        self.assertNotIn("projectionJump > static_cast<double>(config.aim_diagnostics_jump_threshold_px)", target_cpp)
        self.assertNotIn("d.aimBox = centerAimBoxInTarget(d.aimBox, d.box)", target_cpp)


if __name__ == "__main__":
    unittest.main()
