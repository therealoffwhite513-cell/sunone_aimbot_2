import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


class AimRegionResolverContractTests(unittest.TestCase):
    def read(self, relative: str) -> str:
        return (REPO_ROOT / relative).read_text(encoding="utf-8", errors="replace")

    def test_resolver_defines_body_offset_dot_region(self):
        header = self.read("sunone_aimbot_2/mouse/AimRegionResolver.h")
        source = self.read("sunone_aimbot_2/mouse/AimRegionResolver.cpp")

        self.assertIn("struct AimRegion", header)
        self.assertIn("resolveAimRegion", header)
        self.assertIn("AimRegionSource::BodyAnchor", header)
        self.assertIn("config.body_y_offset", source)
        self.assertIn("config.aim_region_body_width_ratio", source)
        self.assertIn("config.aim_region_body_height_ratio", source)
        self.assertIn("config.aim_region_min_px", source)
        self.assertIn("config.aim_region_max_px", source)
        self.assertIn("box.x + box.width * 0.5f", source)
        self.assertIn("box.y + box.height * static_cast<float>(config.body_y_offset)", source)
        self.assertIn("makeCenteredRegion", source)

    def test_body_aim_uses_resolved_region_not_full_box(self):
        multitarget = self.read("sunone_aimbot_2/mouse/AimbotTarget.cpp")
        nanokeep = self.read("sunone_aimbot_2/mouse/NanoKeepTracker.cpp")

        for source in [multitarget, nanokeep]:
            self.assertIn('#include "AimRegionResolver.h"', source)
            self.assertIn("resolveAimRegion", source)
            self.assertIn("AimRegionSource::BodyAnchor", source)
            self.assertNotIn("d.aimBox = d.box;", source)
            self.assertNotIn("detection.aimBox = detection.box;", source)

    def test_config_and_gui_expose_body_aim_region_controls(self):
        config_h = self.read("sunone_aimbot_2/config/config.h")
        config_cpp = self.read("sunone_aimbot_2/config/config.cpp")
        neural_ui = self.read("sunone_aimbot_2/overlay/draw_neural.cpp")

        for field in [
            "aim_region_body_width_ratio",
            "aim_region_body_height_ratio",
            "aim_region_head_width_ratio",
            "aim_region_head_height_ratio",
            "aim_region_min_px",
            "aim_region_max_px",
        ]:
            self.assertIn(field, config_h)
            self.assertIn(field, config_cpp)

        self.assertIn("Aim Region", neural_ui)
        self.assertIn("Body width ratio", neural_ui)
        self.assertIn("Body height ratio", neural_ui)
        self.assertIn("Minimum size", neural_ui)
        self.assertIn("Maximum size", neural_ui)

    def test_project_builds_aim_region_files(self):
        project = self.read("sunone_aimbot_2/sunone_aimbot_2.vcxproj")
        filters = self.read("sunone_aimbot_2/sunone_aimbot_2.vcxproj.filters")

        self.assertIn('ClCompile Include="mouse\\AimRegionResolver.cpp"', project)
        self.assertIn('ClInclude Include="mouse\\AimRegionResolver.h"', project)
        self.assertIn('ClCompile Include="mouse\\AimRegionResolver.cpp"', filters)
        self.assertIn('ClInclude Include="mouse\\AimRegionResolver.h"', filters)


if __name__ == "__main__":
    unittest.main()
