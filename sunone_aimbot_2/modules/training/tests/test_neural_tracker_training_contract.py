import tempfile
import unittest
from pathlib import Path

from training.neural_tracker.dataset import (
    FEATURE_COLUMNS,
    LABEL_COLUMN,
    NeuralTrackerDatasetConfig,
    generate_synthetic_dataset,
    read_dataset,
    resolve_repo_path,
    write_dataset,
)


REPO_ROOT = Path(__file__).resolve().parents[2]


class NeuralTrackerTrainingContractTests(unittest.TestCase):
    def read(self, relative_path):
        return (REPO_ROOT / relative_path).read_text(encoding="utf-8")

    def test_feature_order_matches_cpp_runtime_contract(self):
        header = self.read("sunone_aimbot_2/neural/NeuralTracker.h")

        self.assertIn("NeuralTrackerFeatureCount = 16", header)
        self.assertEqual(
            FEATURE_COLUMNS,
            [
                "distance_norm",
                "iou",
                "size_log_ratio",
                "detection_confidence",
                "track_confidence",
                "heading_alignment",
                "track_missed_norm",
                "track_hits_norm",
                "is_locked",
                "class_compatible",
                "dt",
                "speed_norm",
                "target_size_norm",
                "pivot_offset_x_norm",
                "pivot_offset_y_norm",
                "relaxed_gate",
            ],
        )
        self.assertEqual(len(FEATURE_COLUMNS), 16)
        self.assertEqual(LABEL_COLUMN, "label_match")

    def test_synthetic_generator_creates_balanced_training_rows(self):
        rows = generate_synthetic_dataset(NeuralTrackerDatasetConfig(samples=256, seed=9))

        labels = [row[LABEL_COLUMN] for row in rows]
        self.assertEqual(len(rows), 256)
        self.assertGreater(sum(labels), 80)
        self.assertLess(sum(labels), 176)

        for row in rows:
            for column in FEATURE_COLUMNS:
                self.assertIn(column, row)
                self.assertIsInstance(row[column], float)
            self.assertIn(row[LABEL_COLUMN], (0.0, 1.0))
            self.assertGreaterEqual(row["distance_norm"], 0.0)
            self.assertLessEqual(row["distance_norm"], 3.0)
            self.assertGreaterEqual(row["iou"], 0.0)
            self.assertLessEqual(row["iou"], 1.0)

    def test_dataset_roundtrip_and_runtime_log_labels(self):
        rows = generate_synthetic_dataset(NeuralTrackerDatasetConfig(samples=24, seed=12))
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "neural_tracker_dataset.csv"
            write_dataset(path, rows)
            loaded = read_dataset(path)

        self.assertEqual(len(loaded), len(rows))
        self.assertEqual(set(loaded[0].keys()), {"source", *FEATURE_COLUMNS, LABEL_COLUMN, "sample_weight"})

    def test_training_and_export_scripts_expose_expected_defaults(self):
        train_script = self.read("training/train_neural_tracker.py")
        export_script = self.read("training/export_neural_tracker_onnx.py")
        dataset_script = self.read("training/neural_tracker/dataset.py")

        self.assertIn("training/data/neural_tracker_dataset.csv", dataset_script)
        self.assertIn("training/models/neural_tracker.pt", train_script)
        self.assertIn("training/models/neural_tracker.onnx", export_script)
        self.assertIn("neural_tracker_features", export_script)
        self.assertIn("neural_tracker_score", export_script)

    def test_cli_paths_resolve_from_repo_root(self):
        expected = REPO_ROOT / "training" / "data" / "neural_tracker_dataset.csv"

        self.assertEqual(resolve_repo_path("training/data/neural_tracker_dataset.csv"), expected)
        self.assertEqual(resolve_repo_path(expected), expected)


if __name__ == "__main__":
    unittest.main()
