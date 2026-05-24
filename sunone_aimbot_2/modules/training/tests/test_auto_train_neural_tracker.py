import importlib.util
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = REPO_ROOT / "train_neural_tracker_auto.py"


def load_script_module():
    spec = importlib.util.spec_from_file_location("train_neural_tracker_auto", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class AutoTrainNeuralTrackerTests(unittest.TestCase):
    def test_script_exists_at_repo_root(self):
        self.assertTrue(SCRIPT_PATH.exists())

    def test_builds_generate_train_export_commands(self):
        module = load_script_module()
        args = module.build_arg_parser().parse_args(
            [
                "--config",
                "x64/DML/config.ini",
                "--dataset",
                "training/data/neural_tracker_dataset.csv",
                "--models-dir",
                "training/models",
                "--epochs",
                "2",
                "--samples",
                "128",
            ]
        )

        commands = module.build_commands(args, {"neural_tracker_model_path": "training/models/neural_tracker.onnx"})
        flat = [" ".join(str(part) for part in command) for command in commands]

        self.assertEqual(len(commands), 3)
        self.assertIn(str(REPO_ROOT / "training" / "generate_neural_tracker_dataset.py"), flat[0])
        self.assertIn("--samples 128", flat[0])
        self.assertIn(str(REPO_ROOT / "training" / "train_neural_tracker.py"), flat[1])
        self.assertIn("--epochs 2", flat[1])
        self.assertIn(str(REPO_ROOT / "training" / "export_neural_tracker_onnx.py"), flat[2])

    def test_copy_targets_include_runtime_root_and_config_relative_path(self):
        module = load_script_module()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            dml_dir = root / "x64" / "DML"
            dml_dir.mkdir(parents=True)
            onnx = root / "training" / "models" / "neural_tracker.onnx"
            meta = root / "training" / "models" / "neural_tracker_onnx.json"
            onnx.parent.mkdir(parents=True)
            onnx.write_bytes(b"onnx")
            meta.write_text("{}", encoding="utf-8")

            copied = module.copy_tracker_outputs(
                onnx,
                meta,
                dml_dir,
                {"neural_tracker_model_path": "training/models/neural_tracker.onnx"},
            )

            copied_paths = {path.relative_to(root).as_posix() for path in copied}

        self.assertIn("x64/DML/neural_tracker.onnx", copied_paths)
        self.assertIn("x64/DML/neural_tracker_onnx.json", copied_paths)
        self.assertIn("x64/DML/training/models/neural_tracker.onnx", copied_paths)
        self.assertIn("x64/DML/training/models/neural_tracker_onnx.json", copied_paths)

    def test_synthetic_only_training_does_not_deploy_by_default(self):
        module = load_script_module()
        args = module.build_arg_parser().parse_args([])

        self.assertFalse(module.should_deploy_outputs(args))

    def test_real_log_or_explicit_synthetic_flag_allows_deploy(self):
        module = load_script_module()

        with_log = module.build_arg_parser().parse_args(["--merge-log", "training/logs/session.csv"])
        explicit_synthetic = module.build_arg_parser().parse_args(["--deploy-synthetic"])

        self.assertTrue(module.should_deploy_outputs(with_log))
        self.assertTrue(module.should_deploy_outputs(explicit_synthetic))


if __name__ == "__main__":
    unittest.main()
