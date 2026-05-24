import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


class OpenCvCudaBuildScriptContractTest(unittest.TestCase):
    def read_script(self):
        return (REPO_ROOT / "tools" / "build_opencv_cuda.ps1").read_text(encoding="utf-8")

    def test_script_bootstraps_sources_tools_and_project_install_layout(self):
        script = self.read_script()

        self.assertIn('[string]$OpenCvVersion = "4.13.0"', script)
        self.assertIn('[string]$WorkRoot = ""', script)
        self.assertIn('[string]$DownloadsDir = ""', script)
        self.assertIn('[string]$ToolsDir = ""', script)
        self.assertIn('out\\opencv_cuda', script)
        self.assertIn('sunone_aimbot_2\\modules\\opencv\\build\\install', script)

    def test_script_downloads_opencv_contrib_and_ninja_without_git_requirement(self):
        script = self.read_script()

        self.assertIn("Initialize-SourceArchive", script)
        self.assertIn("https://github.com/opencv/opencv/archive/refs/tags", script)
        self.assertIn("https://github.com/opencv/opencv_contrib/archive/refs/tags", script)
        self.assertIn("Get-NinjaExe", script)
        self.assertIn("ninja-win.zip", script)

    def test_script_defaults_to_fast_local_rtx_3070_build_settings(self):
        script = self.read_script()

        self.assertIn('[ValidateSet("Ninja", "VisualStudio")]', script)
        self.assertIn('[string]$BuildSystem = "Ninja"', script)
        self.assertIn('[string]$CudaArchBin = "8.6"', script)
        self.assertIn("Import-VsDevEnvironment", script)
        self.assertIn("-G\", \"Ninja\"", script)
        self.assertIn("-DOPENCV_DNN_CUDA=ON", script)
        self.assertIn("-DBUILD_opencv_world=ON", script)
        self.assertIn("-DBUILD_TESTS=OFF", script)

    def test_script_can_verify_cuda_install_artifacts(self):
        script = self.read_script()

        self.assertIn("Test-InstalledOpenCvCuda", script)
        self.assertIn("opencv_version", script)
        self.assertIn("CUDA:", script)
        self.assertIn("opencv_world*.lib", script)


if __name__ == "__main__":
    unittest.main()
