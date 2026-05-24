import tempfile
import unittest
from pathlib import Path

import yaml

from training.yolo_workspace_assistant import (
    build_class_mapping,
    build_export_kwargs,
    build_train_kwargs,
    collect_images,
    create_dataset_yaml,
    split_images,
    suggest_values_from_vram,
)


class YoloWorkspaceAssistantTests(unittest.TestCase):
    def test_collect_images_supports_recursive_common_ultralytics_formats(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            nested = root / "nested"
            nested.mkdir()
            for name in ["a.jpg", "b.PNG", "c.tiff", "d.txt"]:
                (root / name).write_bytes(b"image")
            (nested / "e.webp").write_bytes(b"image")

            shallow = [p.name for p in collect_images(root, recursive=False)]
            recursive = [p.name for p in collect_images(root, recursive=True)]

        self.assertEqual(shallow, ["a.jpg", "b.PNG", "c.tiff"])
        self.assertEqual(recursive, ["a.jpg", "b.PNG", "c.tiff", "e.webp"])

    def test_split_images_is_seeded_and_not_filename_order_dependent(self):
        images = [Path(f"frame_{i:03}.jpg") for i in range(20)]

        first = split_images(images, train_fraction=0.8, val_fraction=0.1, seed=7)
        second = split_images(images, train_fraction=0.8, val_fraction=0.1, seed=7)

        self.assertEqual(first, second)
        self.assertEqual(len([s for s in first.values() if s == "train"]), 16)
        self.assertEqual(len([s for s in first.values() if s == "val"]), 2)
        self.assertEqual(len([s for s in first.values() if s == "test"]), 2)
        self.assertNotEqual(list(first.keys()), images)

    def test_class_mapping_filters_and_preserves_model_class_names_by_default(self):
        mapping = build_class_mapping({0: "body", 1: "head", 2: "weapon"}, "", "1,2", False)

        self.assertEqual(mapping.names, ["head", "weapon"])
        self.assertEqual(mapping.class_to_output, {1: 0, 2: 1})
        self.assertIsNone(mapping.output_class_for(0))
        self.assertEqual(mapping.output_class_for(2), 1)

    def test_class_mapping_requires_explicit_single_class_mode_to_collapse(self):
        with self.assertRaises(ValueError):
            build_class_mapping({0: "body", 1: "head"}, "target", "", False)

        mapping = build_class_mapping({0: "body", 1: "head"}, "target", "", True)

        self.assertEqual(mapping.names, ["target"])
        self.assertEqual(mapping.class_to_output, {0: 0, 1: 0})

    def test_create_dataset_yaml_uses_yolo_directory_contract(self):
        with tempfile.TemporaryDirectory() as tmp:
            yaml_path = create_dataset_yaml(Path(tmp), ["head", "weapon"])
            data = yaml.safe_load(yaml_path.read_text(encoding="utf-8"))

        self.assertEqual(data["train"], "images/train")
        self.assertEqual(data["val"], "images/val")
        self.assertEqual(data["test"], "images/test")
        self.assertEqual(data["names"], {0: "head", 1: "weapon"})

    def test_train_kwargs_do_not_include_export_only_workspace(self):
        kwargs = build_train_kwargs(
            data="dataset.yaml",
            model="yolo.pt",
            epochs=50,
            batch="-1",
            imgsz=960,
            device="0",
            workers=4,
            project="runs",
            run_name="experiment",
            cache="disk",
            patience=25,
            seed=11,
        )

        self.assertNotIn("workspace", kwargs)
        self.assertEqual(kwargs["batch"], -1)
        self.assertEqual(kwargs["name"], "experiment")
        self.assertEqual(kwargs["cache"], "disk")

    def test_export_workspace_is_only_sent_for_tensorrt_engine(self):
        engine = build_export_kwargs("engine", 640, "0", True, 8)
        onnx = build_export_kwargs("onnx", 640, "0", True, 8)

        self.assertEqual(engine["workspace"], 8.0)
        self.assertNotIn("workspace", onnx)

    def test_gpu_suggestions_use_cpu_fallback_and_vram_tiers(self):
        self.assertEqual(suggest_values_from_vram(None), ("cpu", 640, 0, 4))
        self.assertEqual(suggest_values_from_vram(8), ("0", 960, 8, -1))
        self.assertEqual(suggest_values_from_vram(12), ("0", 1280, 10, -1))


if __name__ == "__main__":
    unittest.main()
