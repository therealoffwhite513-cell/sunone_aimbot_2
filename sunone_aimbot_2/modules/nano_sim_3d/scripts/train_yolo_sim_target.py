from __future__ import annotations

import argparse
from pathlib import Path


def parse_args() -> argparse.Namespace:
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description="Train a YOLO detector for the Nano Sim 3D target object.")
    parser.add_argument("--data", default=str(root / "training" / "sim_yolo_dataset" / "dataset.yaml"))
    parser.add_argument("--base", default="yolo11n.pt", help="Ultralytics base model, e.g. yolo11n.pt or yolov8n.pt")
    parser.add_argument("--epochs", type=int, default=60)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--batch", type=int, default=8)
    parser.add_argument("--device", default=None, help="Use 'cpu', '0', etc. Leave empty for Ultralytics auto-selection.")
    parser.add_argument("--project", default=str(root / "training" / "runs"))
    parser.add_argument("--name", default="sim_target_yolo")
    parser.add_argument("--export-onnx", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    data_path = Path(args.data)
    if not data_path.exists():
        print(f"Dataset yaml not found: {data_path}")
        print("Generate it first with: generate_yolo_dataset.cmd --samples 800")
        return 2

    try:
        from ultralytics import YOLO
    except ImportError:
        print("Ultralytics is not installed in this Python environment.")
        print("Install it with: python -m pip install ultralytics")
        return 2

    model = YOLO(args.base)
    train_kwargs = {
        "data": str(data_path),
        "epochs": args.epochs,
        "imgsz": args.imgsz,
        "batch": args.batch,
        "project": args.project,
        "name": args.name,
        "single_cls": True,
        "patience": 12,
        "plots": True,
    }
    if args.device:
        train_kwargs["device"] = args.device

    results = model.train(**train_kwargs)
    save_dir = Path(getattr(results, "save_dir", Path(args.project) / args.name))
    best_weights = save_dir / "weights" / "best.pt"
    print(f"Best weights: {best_weights}")

    if args.export_onnx:
        if not best_weights.exists():
            print("Best weights were not found, skipping ONNX export.")
            return 1
        exported = YOLO(str(best_weights)).export(format="onnx", imgsz=args.imgsz, opset=12, simplify=True)
        print(f"Exported ONNX: {exported}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
