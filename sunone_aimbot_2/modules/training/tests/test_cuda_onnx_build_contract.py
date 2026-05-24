import unittest
import re
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


class CudaOnnxBuildContractTest(unittest.TestCase):
    def read(self, relative_path):
        return (REPO_ROOT / relative_path).read_text(encoding="utf-8")

    def test_solution_exposes_cuda_onnx_configuration(self):
        sln = self.read("sunone_aimbot_2.sln")

        self.assertIn("cuda_onnx|x64 = cuda_onnx|x64", sln)
        self.assertIn(".cuda_onnx|x64.ActiveCfg = cuda_onnx|x64", sln)
        self.assertIn(".cuda_onnx|x64.Build.0 = cuda_onnx|x64", sln)

    def test_vcxproj_cuda_onnx_mirrors_dml_not_tensorrt_cuda(self):
        vcxproj = self.read("sunone_aimbot_2/sunone_aimbot_2.vcxproj")

        self.assertIn('<ProjectConfiguration Include="cuda_onnx|x64">', vcxproj)
        self.assertIn("<Configuration>cuda_onnx</Configuration>", vcxproj)
        self.assertIn("'$(Configuration)|$(Platform)'=='cuda_onnx|x64'", vcxproj)
        self.assertIn("<OutDir>$(SolutionDir)x64\\cuda_onnx\\</OutDir>", vcxproj)

        match = re.search(
            r"<ItemDefinitionGroup Condition=\"'\$\(Configuration\)\|\$\(Platform\)'=='cuda_onnx\|x64'\">(?P<body>.*?)</ItemDefinitionGroup>",
            vcxproj,
            re.DOTALL,
        )
        self.assertIsNotNone(match)
        cuda_onnx_block = match.group("body")
        self.assertNotIn("USE_CUDA", cuda_onnx_block)
        self.assertNotIn("nvinfer", cuda_onnx_block)
        self.assertNotIn("nvonnxparser", cuda_onnx_block)

        self.assertIn('<ExcludedFromBuild Condition="\'$(Configuration)|$(Platform)\'==\'cuda_onnx|x64\'">true</ExcludedFromBuild>', vcxproj)
        self.assertIn('<ItemGroup Condition="\'$(Configuration)|$(Platform)\'==\'CUDA|x64\'">', vcxproj)


if __name__ == "__main__":
    unittest.main()
