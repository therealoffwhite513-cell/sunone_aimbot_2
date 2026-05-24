import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


class RazerInputContractTest(unittest.TestCase):
    def read(self, relative_path):
        return (REPO_ROOT / relative_path).read_text(encoding="utf-8")

    def test_razer_backend_is_exposed_in_config_ui_and_build_files(self):
        self.assertTrue((REPO_ROOT / "sunone_aimbot_2/mouse/rzctl.h").exists())
        self.assertTrue((REPO_ROOT / "sunone_aimbot_2/mouse/rzctl.cpp").exists())

        draw_mouse = self.read("sunone_aimbot_2/overlay/draw_mouse.cpp")
        self.assertIn('"RAZER"', draw_mouse)
        self.assertIn('config.input_method == "RAZER"', draw_mouse)

        config_cpp = self.read("sunone_aimbot_2/config/config.cpp")
        self.assertIn("RAZER", config_cpp)

        vcxproj = self.read("sunone_aimbot_2/sunone_aimbot_2.vcxproj")
        self.assertIn("mouse\\rzctl.cpp", vcxproj)
        self.assertIn("mouse\\rzctl.h", vcxproj)
        self.assertIn('None Include="rzctl.dll"', vcxproj)
        self.assertIn("<CopyToOutputDirectory>PreserveNewest</CopyToOutputDirectory>", vcxproj)

        cmake = self.read("CMakeLists.txt")
        self.assertIn("mouse/rzctl.cpp", cmake)
        self.assertIn("AIMBOT_RZCTL_DLL", cmake)

    def test_razer_backend_routes_movement_and_clicks_through_mouse_thread(self):
        main_cpp = self.read("sunone_aimbot_2/sunone_aimbot_2.cpp")
        self.assertIn("RzctlMouse* razerControl", main_cpp)
        self.assertIn('config.input_method == "RAZER"', main_cpp)
        self.assertIn("setRazerMouse(razerControl)", main_cpp)

        main_h = self.read("sunone_aimbot_2/sunone_aimbot_2.h")
        self.assertIn("extern RzctlMouse* razerControl", main_h)

        mouse_h = self.read("sunone_aimbot_2/mouse/mouse.h")
        self.assertIn("RzctlMouse* razer", mouse_h)
        self.assertIn("setRazerMouse", mouse_h)

        mouse_cpp = self.read("sunone_aimbot_2/mouse/mouse.cpp")
        self.assertIn("razer->mouse_xy", mouse_cpp)
        self.assertIn("razer->mouse_down", mouse_cpp)
        self.assertIn("razer->mouse_up", mouse_cpp)


if __name__ == "__main__":
    unittest.main()
