import re
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


class NonCudaBuildContractTest(unittest.TestCase):
    def read(self, relative_path):
        return (REPO_ROOT / relative_path).read_text(encoding="utf-8")

    def test_non_cuda_solution_is_dml_only(self):
        sln = self.read("non_cuda/non_cuda.sln")

        self.assertIn('"sunone_aimbot_2", "sunone_aimbot_2.vcxproj"', sln)
        self.assertIn("DML|x64 = DML|x64", sln)
        self.assertNotIn("CUDA|x64", sln)
        self.assertNotIn("cuda_onnx|x64", sln)

    def test_non_cuda_project_has_no_cuda_or_tensorrt_build_path(self):
        vcxproj = self.read("non_cuda/sunone_aimbot_2.vcxproj")

        self.assertIn('<ProjectConfiguration Include="DML|x64">', vcxproj)
        self.assertNotIn('<ProjectConfiguration Include="CUDA|x64">', vcxproj)
        self.assertNotIn("CudaCompile", vcxproj)
        self.assertNotIn("BuildCustomizations\\CUDA", vcxproj)
        self.assertNotIn("USE_CUDA", vcxproj)
        self.assertNotIn("nvinfer", vcxproj)
        self.assertNotIn("nvonnxparser", vcxproj)
        self.assertNotIn("cudart", vcxproj)
        self.assertNotIn("TensorRT-", vcxproj)
        self.assertNotIn("tensorrt\\", vcxproj)
        self.assertNotIn("trt_detector", vcxproj)
        self.assertNotIn("cuda_preprocess", vcxproj)
        self.assertNotIn("gpu_resource_manager", vcxproj)

        dml_block = re.search(
            r"<ItemDefinitionGroup Condition=\"'\$\(Configuration\)\|\$\(Platform\)'=='DML\|x64'\">(?P<body>.*?)</ItemDefinitionGroup>",
            vcxproj,
            re.DOTALL,
        )
        self.assertIsNotNone(dml_block)
        self.assertIn("opencv_world4140.lib", dml_block.group("body"))
        self.assertNotIn("cuda", dml_block.group("body").lower())

    def test_non_cuda_filters_do_not_expose_cuda_files(self):
        filters = self.read("non_cuda/sunone_aimbot_2.vcxproj.filters")

        for forbidden in (
            "CudaCompile",
            "tensorrt",
            "trt_detector",
            "cuda_preprocess",
            "gpu_resource_manager",
            "depth_anything_trt",
        ):
            self.assertNotIn(forbidden, filters)

    def test_non_cuda_copy_does_not_ship_tensorrt_or_cuda_runtime_bits(self):
        non_cuda_root = REPO_ROOT / "non_cuda"
        module_matches = list((non_cuda_root / "modules").glob("TensorRT*"))
        self.assertEqual(module_matches, [])

        runtime_dir = non_cuda_root / "x64" / "DML"
        if runtime_dir.exists():
            forbidden_names = [
                path.name
                for path in runtime_dir.rglob("*")
                if path.is_file()
                and re.search(r"cuda|cudnn|cudart|nvinfer|nvonnx|tensorrt", path.name, re.IGNORECASE)
            ]
            self.assertEqual(forbidden_names, [])


if __name__ == "__main__":
    unittest.main()
