import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


def read_config(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or line.startswith("[") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


class NeuralTrackerRuntimeSafetyTests(unittest.TestCase):
    def test_packaged_runtime_configs_do_not_enable_unvalidated_neural_tracker(self):
        config_paths = [
            REPO_ROOT / "x64" / "good" / "DML" / "config.ini",
            REPO_ROOT / "x64" / "DML" / "config.ini",
            REPO_ROOT / "x64" / "cuda_onnx" / "config.ini",
            REPO_ROOT / "non_cuda" / "x64" / "DML" / "config.ini",
        ]

        checked = 0
        for path in config_paths:
            if not path.exists():
                continue

            checked += 1
            values = read_config(path)
            self.assertEqual(values.get("neural_tracker_enabled"), "false", path.as_posix())
            self.assertEqual(values.get("neural_tracker_blend"), "0.000", path.as_posix())

        self.assertGreater(checked, 0)


if __name__ == "__main__":
    unittest.main()
