from __future__ import annotations

import csv
import os
import queue
import random
import shutil
import threading
import traceback
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import tkinter as tk
from tkinter import filedialog, messagebox, ttk

import yaml

try:
    import torch
except Exception:
    torch = None

try:
    from ultralytics import YOLO
except Exception:
    YOLO = None


IMAGE_SUFFIXES = {
    ".avif",
    ".bmp",
    ".jpeg",
    ".jpg",
    ".png",
    ".tif",
    ".tiff",
    ".webp",
}


@dataclass(frozen=True)
class ClassMapping:
    names: list[str]
    class_to_output: dict[int, int]

    def output_class_for(self, class_id: int) -> int | None:
        return self.class_to_output.get(int(class_id))


def collect_images(source: Path, recursive: bool = True) -> list[Path]:
    if not source.exists() or not source.is_dir():
        raise ValueError(f"Source image folder does not exist: {source}")

    iterator = source.rglob("*") if recursive else source.iterdir()
    return sorted(
        [p for p in iterator if p.is_file() and p.suffix.lower() in IMAGE_SUFFIXES],
        key=lambda p: p.as_posix().lower(),
    )


def split_images(
    images: Iterable[Path],
    train_fraction: float = 0.8,
    val_fraction: float = 0.1,
    seed: int = 0,
) -> dict[Path, str]:
    shuffled = list(images)
    if not shuffled:
        raise ValueError("No images were provided for splitting.")
    if train_fraction <= 0 or val_fraction < 0 or train_fraction + val_fraction >= 1:
        raise ValueError("Split fractions must leave room for a test split.")

    random.Random(seed).shuffle(shuffled)
    count = len(shuffled)
    train_count = max(1, int(count * train_fraction))
    val_count = int(count * val_fraction)

    if count >= 3:
        val_count = max(1, val_count)
        if train_count + val_count >= count:
            train_count = count - val_count - 1
    elif count == 2:
        train_count = 1
        val_count = 1
    else:
        train_count = 1
        val_count = 0

    split_map: dict[Path, str] = {}
    for index, image in enumerate(shuffled):
        if index < train_count:
            split = "train"
        elif index < train_count + val_count:
            split = "val"
        else:
            split = "test"
        split_map[image] = split
    return split_map


def normalize_model_names(model_names: object) -> dict[int, str]:
    if isinstance(model_names, dict):
        normalized: dict[int, str] = {}
        for key, value in model_names.items():
            normalized[int(key)] = str(value)
        return dict(sorted(normalized.items()))

    if isinstance(model_names, (list, tuple)):
        return {index: str(name) for index, name in enumerate(model_names)}

    return {0: "target"}


def _parse_class_ids(text: str, available_ids: set[int]) -> list[int]:
    if not text.strip():
        return sorted(available_ids)

    selected: set[int] = set()
    for raw_part in text.replace(";", ",").split(","):
        part = raw_part.strip()
        if not part:
            continue
        if "-" in part:
            start_text, end_text = part.split("-", 1)
            start = int(start_text.strip())
            end = int(end_text.strip())
            if end < start:
                raise ValueError(f"Invalid class id range: {part}")
            selected.update(range(start, end + 1))
        else:
            selected.add(int(part))

    unknown = sorted(selected - available_ids)
    if unknown:
        raise ValueError(f"Class IDs are not present in the model: {unknown}")
    return sorted(selected)


def _parse_names(text: str) -> list[str]:
    return [name.strip() for name in text.split(",") if name.strip()]


def build_class_mapping(
    model_names: object,
    output_names_text: str,
    include_class_ids_text: str,
    single_class_mode: bool,
) -> ClassMapping:
    names_by_id = normalize_model_names(model_names)
    selected_ids = _parse_class_ids(include_class_ids_text, set(names_by_id))
    if not selected_ids:
        raise ValueError("No model classes are selected for annotation.")

    requested_names = _parse_names(output_names_text)

    if single_class_mode:
        output_name = requested_names[0] if requested_names else "target"
        return ClassMapping([output_name], {class_id: 0 for class_id in selected_ids})

    if requested_names:
        if len(requested_names) != len(selected_ids):
            raise ValueError(
                "Class names must match the number of selected model classes, "
                "or enable single-class mode to intentionally collapse classes."
            )
        output_names = requested_names
    else:
        output_names = [names_by_id[class_id] for class_id in selected_ids]

    return ClassMapping(output_names, {class_id: index for index, class_id in enumerate(selected_ids)})


def create_dataset_yaml(workspace: Path, names: list[str]) -> Path:
    for split in ("train", "val", "test"):
        (workspace / "images" / split).mkdir(parents=True, exist_ok=True)
        (workspace / "labels" / split).mkdir(parents=True, exist_ok=True)

    data = {
        "path": str(workspace.resolve()),
        "train": "images/train",
        "val": "images/val",
        "test": "images/test",
        "names": {index: name for index, name in enumerate(names)},
    }
    yaml_path = workspace / "data.yaml"
    with yaml_path.open("w", encoding="utf-8") as handle:
        yaml.safe_dump(data, handle, sort_keys=False)
    return yaml_path


def suggest_values_from_vram(vram_gb: float | None) -> tuple[str, int, int, int]:
    if vram_gb is None:
        return "cpu", 640, 0, 4
    if vram_gb >= 12:
        return "0", 1280, 10, -1
    if vram_gb >= 8:
        return "0", 960, 8, -1
    if vram_gb >= 6:
        return "0", 768, 6, 8
    return "0", 640, 4, 4


def detect_local_vram_gb() -> float | None:
    if torch is None or not torch.cuda.is_available():
        return None
    return float(torch.cuda.get_device_properties(0).total_memory / (1024**3))


def parse_batch_value(value: str | int | float) -> int | float:
    if isinstance(value, (int, float)):
        return value
    text = str(value).strip()
    if not text:
        raise ValueError("Batch cannot be blank.")
    number = float(text)
    if number.is_integer():
        return int(number)
    return number


def _optional_text(value: str) -> str | None:
    text = value.strip()
    return text or None


def build_train_kwargs(
    *,
    data: str,
    model: str,
    epochs: int,
    batch: str | int | float,
    imgsz: int,
    device: str,
    workers: int,
    project: str,
    run_name: str = "",
    cache: str = "False",
    patience: int = 100,
    seed: int = 0,
) -> dict[str, object]:
    if not data.strip():
        raise ValueError("Dataset YAML is required.")
    if not model.strip():
        raise ValueError("A YOLO model path or model name is required for training.")

    cache_value: object
    cache_text = cache.strip().lower()
    if cache_text in {"", "false", "none", "no", "0"}:
        cache_value = False
    elif cache_text in {"true", "yes", "1"}:
        cache_value = True
    else:
        cache_value = cache.strip()

    kwargs: dict[str, object] = {
        "data": data,
        "epochs": int(epochs),
        "batch": parse_batch_value(batch),
        "imgsz": int(imgsz),
        "device": device.strip() or None,
        "workers": int(workers),
        "project": project,
        "cache": cache_value,
        "patience": int(patience),
        "seed": int(seed),
    }
    name = _optional_text(run_name)
    if name:
        kwargs["name"] = name
    return kwargs


def build_val_kwargs(data: str, imgsz: int, conf: float, iou: float, device: str) -> dict[str, object]:
    if not data.strip():
        raise ValueError("Dataset YAML is required.")
    return {
        "data": data,
        "imgsz": int(imgsz),
        "conf": float(conf),
        "iou": float(iou),
        "device": device.strip() or None,
    }


def build_export_kwargs(
    export_format: str,
    imgsz: int,
    device: str,
    half: bool,
    workspace: int | float,
) -> dict[str, object]:
    fmt = export_format.strip()
    kwargs: dict[str, object] = {
        "format": fmt,
        "imgsz": int(imgsz),
        "device": device.strip() or None,
        "half": bool(half),
    }
    if fmt == "engine":
        kwargs["workspace"] = float(workspace)
    return kwargs


def _safe_output_name(image: Path, source_root: Path, used_names: set[str]) -> str:
    try:
        relative = image.relative_to(source_root)
    except ValueError:
        relative = Path(image.name)

    if len(relative.parts) > 1:
        candidate = "__".join(relative.parts)
    else:
        candidate = image.name

    stem = Path(candidate).stem
    suffix = image.suffix
    output_name = candidate
    counter = 1
    while output_name.lower() in used_names:
        output_name = f"{stem}_{counter}{suffix}"
        counter += 1
    used_names.add(output_name.lower())
    return output_name


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


class YoloWorkspaceGUI(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("YOLO Workspace Assistant")
        self.geometry("1040x820")

        self.log_queue: queue.Queue[str] = queue.Queue()
        self._build_ui()
        self.after(200, self._drain_log_queue)

    def _build_ui(self) -> None:
        notebook = ttk.Notebook(self)
        notebook.pack(fill="both", expand=True, padx=8, pady=8)

        self.tab_annotate = ttk.Frame(notebook)
        self.tab_train = ttk.Frame(notebook)
        self.tab_test = ttk.Frame(notebook)
        self.tab_export = ttk.Frame(notebook)

        notebook.add(self.tab_annotate, text="Annotate")
        notebook.add(self.tab_train, text="Train")
        notebook.add(self.tab_test, text="Test")
        notebook.add(self.tab_export, text="Export")

        self._build_annotate_tab(self.tab_annotate)
        self._build_train_tab(self.tab_train)
        self._build_test_tab(self.tab_test)
        self._build_export_tab(self.tab_export)

        log_frame = ttk.LabelFrame(self, text="Run Log")
        log_frame.pack(fill="both", expand=False, padx=8, pady=(0, 8))
        self.log_text = tk.Text(log_frame, height=12, wrap="word")
        self.log_text.pack(fill="both", expand=True, padx=6, pady=6)

    def _browse_file(self, var: tk.Variable, filetypes=(("All files", "*.*"),)) -> None:
        path = filedialog.askopenfilename(filetypes=filetypes)
        if path:
            var.set(path)

    def _browse_dir(self, var: tk.Variable) -> None:
        path = filedialog.askdirectory()
        if path:
            var.set(path)

    def _gpu_suggestions(self) -> tuple[str, int, int, int]:
        return suggest_values_from_vram(detect_local_vram_gb())

    def _add_path_row(
        self,
        parent: ttk.Frame,
        row: int,
        label: str,
        var: tk.Variable,
        *,
        is_file: bool = False,
        filetypes=(("All files", "*.*"),),
    ) -> None:
        ttk.Label(parent, text=label).grid(row=row, column=0, sticky="w", padx=6, pady=4)
        ttk.Entry(parent, textvariable=var, width=86).grid(row=row, column=1, sticky="ew", padx=6, pady=4)
        command = (
            (lambda: self._browse_file(var, filetypes=filetypes))
            if is_file
            else (lambda: self._browse_dir(var))
        )
        ttk.Button(parent, text="Select", command=command).grid(row=row, column=2, padx=6, pady=4)

    def _build_annotate_tab(self, parent: ttk.Frame) -> None:
        device_default, imgsz_default, _, _ = self._gpu_suggestions()

        self.ann_model = tk.StringVar()
        self.ann_source = tk.StringVar()
        self.ann_workspace = tk.StringVar(value=str(Path.cwd() / "yolo_workspace"))
        self.ann_conf = tk.DoubleVar(value=0.35)
        self.ann_iou = tk.DoubleVar(value=0.45)
        self.ann_imgsz = tk.IntVar(value=imgsz_default)
        self.ann_device = tk.StringVar(value=str(device_default))
        self.ann_class_names = tk.StringVar()
        self.ann_class_ids = tk.StringVar()
        self.ann_single_class = tk.BooleanVar(value=False)
        self.ann_recursive = tk.BooleanVar(value=True)
        self.ann_seed = tk.IntVar(value=0)
        self.ann_train_fraction = tk.DoubleVar(value=0.8)
        self.ann_val_fraction = tk.DoubleVar(value=0.1)

        parent.columnconfigure(1, weight=1)
        self._add_path_row(
            parent,
            0,
            "Pretrained model (.pt/.engine/.onnx)",
            self.ann_model,
            is_file=True,
            filetypes=(("YOLO Models", "*.pt *.engine *.onnx"), ("All files", "*.*")),
        )
        self._add_path_row(parent, 1, "Source images folder", self.ann_source)
        self._add_path_row(parent, 2, "Workspace output folder", self.ann_workspace)

        self._add_field_grid(
            parent,
            start_row=3,
            fields=[
                ("Confidence", self.ann_conf),
                ("IoU", self.ann_iou),
                ("Image size", self.ann_imgsz),
                ("Device", self.ann_device),
                ("Train fraction", self.ann_train_fraction),
                ("Val fraction", self.ann_val_fraction),
                ("Split seed", self.ann_seed),
            ],
        )

        ttk.Label(parent, text="Class IDs to include").grid(row=7, column=0, sticky="w", padx=6, pady=4)
        ttk.Entry(parent, textvariable=self.ann_class_ids, width=55).grid(row=7, column=1, sticky="w", padx=6)

        ttk.Label(parent, text="Output class names").grid(row=8, column=0, sticky="w", padx=6, pady=4)
        ttk.Entry(parent, textvariable=self.ann_class_names, width=55).grid(row=8, column=1, sticky="w", padx=6)

        options = ttk.Frame(parent)
        options.grid(row=9, column=1, sticky="w", padx=2, pady=4)
        ttk.Checkbutton(options, text="Recursive image search", variable=self.ann_recursive).pack(side="left", padx=4)
        ttk.Checkbutton(options, text="Single-class output", variable=self.ann_single_class).pack(side="left", padx=14)

        actions = ttk.Frame(parent)
        actions.grid(row=10, column=0, columnspan=3, sticky="w", padx=2, pady=8)
        ttk.Button(actions, text="Suggest values from GPU", command=self._apply_gpu_suggestions).pack(side="left", padx=4)
        ttk.Button(actions, text="Analyze source", command=lambda: self._start_thread(self._analyze_source)).pack(
            side="left", padx=4
        )
        ttk.Button(actions, text="Load classes from model", command=lambda: self._start_thread(self._load_model_classes)).pack(
            side="left", padx=4
        )
        ttk.Button(actions, text="Create dataset + auto-label", command=lambda: self._start_thread(self._annotate_dataset)).pack(
            side="left", padx=4
        )

    def _build_train_tab(self, parent: ttk.Frame) -> None:
        device_default, imgsz_default, _, batch_default = self._gpu_suggestions()
        self.train_data_yaml = tk.StringVar()
        self.train_model = tk.StringVar()
        self.train_epochs = tk.IntVar(value=100)
        self.train_batch = tk.StringVar(value=str(batch_default))
        self.train_imgsz = tk.IntVar(value=imgsz_default)
        self.train_device = tk.StringVar(value=str(device_default))
        self.train_workers = tk.IntVar(value=max(2, (os.cpu_count() or 8) // 2))
        self.train_project = tk.StringVar(value=str(Path.cwd() / "runs"))
        self.train_name = tk.StringVar(value="pseudo_label_train")
        self.train_cache = tk.StringVar(value="False")
        self.train_patience = tk.IntVar(value=100)
        self.train_seed = tk.IntVar(value=0)

        parent.columnconfigure(1, weight=1)
        self._add_path_row(
            parent,
            0,
            "Dataset YAML",
            self.train_data_yaml,
            is_file=True,
            filetypes=(("YAML", "*.yaml *.yml"), ("All files", "*.*")),
        )
        self._add_path_row(
            parent,
            1,
            "Model to train/fine-tune",
            self.train_model,
            is_file=True,
            filetypes=(("YOLO Models", "*.pt *.yaml"), ("All files", "*.*")),
        )
        self._add_path_row(parent, 2, "Project output folder", self.train_project)

        self._add_field_grid(
            parent,
            start_row=3,
            fields=[
                ("Run name", self.train_name),
                ("Epochs", self.train_epochs),
                ("Batch", self.train_batch),
                ("Image size", self.train_imgsz),
                ("Device", self.train_device),
                ("Workers", self.train_workers),
                ("Patience", self.train_patience),
                ("Seed", self.train_seed),
            ],
        )

        ttk.Label(parent, text="Cache").grid(row=7, column=0, sticky="w", padx=6, pady=4)
        ttk.Combobox(
            parent,
            textvariable=self.train_cache,
            values=["False", "True", "ram", "disk"],
            state="readonly",
            width=14,
        ).grid(row=7, column=1, sticky="w", padx=6)

        ttk.Button(parent, text="Start training", command=lambda: self._start_thread(self._run_train)).grid(
            row=10, column=0, padx=6, pady=8, sticky="w"
        )

    def _build_test_tab(self, parent: ttk.Frame) -> None:
        device_default, imgsz_default, _, _ = self._gpu_suggestions()
        self.test_model = tk.StringVar()
        self.test_data_yaml = tk.StringVar()
        self.test_imgsz = tk.IntVar(value=imgsz_default)
        self.test_conf = tk.DoubleVar(value=0.25)
        self.test_iou = tk.DoubleVar(value=0.45)
        self.test_device = tk.StringVar(value=str(device_default))

        parent.columnconfigure(1, weight=1)
        self._add_path_row(
            parent,
            0,
            "Model",
            self.test_model,
            is_file=True,
            filetypes=(("YOLO Models", "*.pt *.engine *.onnx"), ("All files", "*.*")),
        )
        self._add_path_row(
            parent,
            1,
            "Dataset YAML",
            self.test_data_yaml,
            is_file=True,
            filetypes=(("YAML", "*.yaml *.yml"), ("All files", "*.*")),
        )

        self._add_field_grid(
            parent,
            start_row=2,
            fields=[
                ("Image size", self.test_imgsz),
                ("Confidence", self.test_conf),
                ("IoU", self.test_iou),
                ("Device", self.test_device),
            ],
        )

        ttk.Button(parent, text="Run validation", command=lambda: self._start_thread(self._run_val)).grid(
            row=6, column=0, padx=6, pady=8, sticky="w"
        )

    def _build_export_tab(self, parent: ttk.Frame) -> None:
        device_default, imgsz_default, workspace_default, _ = self._gpu_suggestions()
        self.exp_model = tk.StringVar()
        self.exp_format = tk.StringVar(value="engine")
        self.exp_imgsz = tk.IntVar(value=imgsz_default)
        self.exp_device = tk.StringVar(value=str(device_default))
        self.exp_half = tk.BooleanVar(value=True)
        self.exp_workspace = tk.IntVar(value=max(1, workspace_default))

        parent.columnconfigure(1, weight=1)
        self._add_path_row(
            parent,
            0,
            "Trained model (.pt)",
            self.exp_model,
            is_file=True,
            filetypes=(("YOLO Models", "*.pt"), ("All files", "*.*")),
        )

        ttk.Label(parent, text="Format").grid(row=1, column=0, sticky="w", padx=6, pady=4)
        ttk.Combobox(
            parent,
            textvariable=self.exp_format,
            values=["engine", "onnx", "openvino", "torchscript"],
            state="readonly",
            width=18,
        ).grid(row=1, column=1, sticky="w", padx=6)

        self._add_field_grid(
            parent,
            start_row=2,
            fields=[
                ("Image size", self.exp_imgsz),
                ("Device", self.exp_device),
                ("TensorRT workspace GB", self.exp_workspace),
            ],
        )

        ttk.Checkbutton(parent, text="Half precision", variable=self.exp_half).grid(row=5, column=1, sticky="w", padx=6)
        ttk.Button(parent, text="Export model", command=lambda: self._start_thread(self._run_export)).grid(
            row=6, column=0, padx=6, pady=8, sticky="w"
        )

    def _add_field_grid(self, parent: ttk.Frame, start_row: int, fields: list[tuple[str, tk.Variable]]) -> None:
        for index, (label, var) in enumerate(fields):
            row = start_row + index // 2
            column = (index % 2) * 2
            ttk.Label(parent, text=label).grid(row=row, column=column, sticky="w", padx=6, pady=4)
            ttk.Entry(parent, textvariable=var, width=16).grid(row=row, column=column + 1, sticky="w", padx=6)

    def _apply_gpu_suggestions(self) -> None:
        device, imgsz, workspace, batch = self._gpu_suggestions()
        self.ann_device.set(str(device))
        self.ann_imgsz.set(imgsz)
        self.train_device.set(str(device))
        self.train_imgsz.set(imgsz)
        self.train_batch.set(str(batch))
        self.test_device.set(str(device))
        self.test_imgsz.set(imgsz)
        self.exp_device.set(str(device))
        self.exp_imgsz.set(imgsz)
        self.exp_workspace.set(max(1, workspace))
        self._log(f"Applied suggestions -> device={device}, imgsz={imgsz}, batch={batch}, workspace={workspace}GB")

    def _start_thread(self, fn) -> None:
        threading.Thread(target=lambda: self._guarded_worker(fn), daemon=True).start()

    def _guarded_worker(self, fn) -> None:
        try:
            fn()
        except Exception as exc:
            details = traceback.format_exc()
            self._log(details)
            self._show_error("Run failed", str(exc))

    def _log(self, msg: str) -> None:
        self.log_queue.put(msg)

    def _show_error(self, title: str, msg: str) -> None:
        self.after(0, lambda: messagebox.showerror(title, msg))

    def _show_info(self, title: str, msg: str) -> None:
        self.after(0, lambda: messagebox.showinfo(title, msg))

    def _set_var(self, var: tk.Variable, value: object) -> None:
        self.after(0, lambda: var.set(value))

    def _drain_log_queue(self) -> None:
        while not self.log_queue.empty():
            msg = self.log_queue.get_nowait()
            self.log_text.insert("end", msg + "\n")
            self.log_text.see("end")
        self.after(200, self._drain_log_queue)

    def _require_yolo(self) -> None:
        if YOLO is None:
            raise RuntimeError("The ultralytics package is not available. Install it with: pip install ultralytics")

    def _load_model_classes(self) -> None:
        self._require_yolo()
        model_path = self.ann_model.get().strip()
        if not model_path:
            raise ValueError("Select a YOLO model before loading classes.")

        model = YOLO(model_path)
        names = normalize_model_names(getattr(model, "names", None))
        self._set_var(self.ann_class_names, ",".join(names.values()))
        self._log(f"Loaded {len(names)} classes from model.")

    def _analyze_source(self) -> None:
        source = Path(self.ann_source.get())
        images = collect_images(source, recursive=bool(self.ann_recursive.get()))
        split_map = split_images(
            images,
            train_fraction=float(self.ann_train_fraction.get()),
            val_fraction=float(self.ann_val_fraction.get()),
            seed=int(self.ann_seed.get()),
        )
        counts = {split: list(split_map.values()).count(split) for split in ("train", "val", "test")}
        self._log(
            "Source analysis -> "
            f"{len(images)} images, train={counts['train']}, val={counts['val']}, test={counts['test']}"
        )

    def _annotate_dataset(self) -> None:
        self._require_yolo()
        model_path = Path(self.ann_model.get())
        source = Path(self.ann_source.get())
        workspace = Path(self.ann_workspace.get())

        if not model_path.exists():
            raise ValueError(f"Model path does not exist: {model_path}")
        if not source.exists():
            raise ValueError(f"Source image folder does not exist: {source}")

        images = collect_images(source, recursive=bool(self.ann_recursive.get()))
        if not images:
            raise ValueError("No supported images found in source folder.")

        split_map = split_images(
            images,
            train_fraction=float(self.ann_train_fraction.get()),
            val_fraction=float(self.ann_val_fraction.get()),
            seed=int(self.ann_seed.get()),
        )

        model = YOLO(str(model_path))
        mapping = build_class_mapping(
            getattr(model, "names", None),
            self.ann_class_names.get(),
            self.ann_class_ids.get(),
            bool(self.ann_single_class.get()),
        )
        yaml_path = create_dataset_yaml(workspace, mapping.names)
        manifest_path = workspace / "pseudo_label_manifest.csv"

        self._log(f"Loaded model: {model_path}")
        self._log(f"Output classes: {mapping.names}")
        self._log("Validation/test labels are pseudo-labels. Manually review them before final metrics.")

        used_names: set[str] = set()
        manifest_rows: list[dict[str, object]] = []
        total_boxes = 0
        total_skipped = 0

        for index, image in enumerate(images, start=1):
            split = split_map[image]
            output_name = _safe_output_name(image, source, used_names)
            image_out = workspace / "images" / split / output_name
            label_out = workspace / "labels" / split / f"{Path(output_name).stem}.txt"
            image_out.parent.mkdir(parents=True, exist_ok=True)
            label_out.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(image, image_out)

            results = model.predict(
                source=str(image),
                conf=float(self.ann_conf.get()),
                iou=float(self.ann_iou.get()),
                imgsz=int(self.ann_imgsz.get()),
                device=self.ann_device.get().strip() or None,
                verbose=False,
            )

            lines: list[str] = []
            skipped = 0
            if results:
                boxes = getattr(results[0], "boxes", None)
                if boxes is not None and len(boxes) > 0:
                    xywhn = boxes.xywhn.detach().cpu().numpy()
                    classes = boxes.cls.detach().cpu().numpy().astype(int)
                    for class_id, (x_center, y_center, width, height) in zip(classes, xywhn):
                        output_class = mapping.output_class_for(int(class_id))
                        if output_class is None:
                            skipped += 1
                            continue
                        lines.append(
                            f"{output_class} "
                            f"{_clamp01(float(x_center)):.6f} "
                            f"{_clamp01(float(y_center)):.6f} "
                            f"{_clamp01(float(width)):.6f} "
                            f"{_clamp01(float(height)):.6f}"
                        )

            label_out.write_text("\n".join(lines), encoding="utf-8")
            total_boxes += len(lines)
            total_skipped += skipped
            manifest_rows.append(
                {
                    "source_image": str(image),
                    "split": split,
                    "output_image": str(image_out),
                    "output_label": str(label_out),
                    "boxes": len(lines),
                    "skipped_boxes": skipped,
                }
            )
            self._log(f"[{index}/{len(images)}] {image.name} -> {split} ({len(lines)} boxes, {skipped} skipped)")

        with manifest_path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(
                handle,
                fieldnames=["source_image", "split", "output_image", "output_label", "boxes", "skipped_boxes"],
            )
            writer.writeheader()
            writer.writerows(manifest_rows)

        self._set_var(self.train_data_yaml, str(yaml_path))
        self._set_var(self.test_data_yaml, str(yaml_path))
        self._log(f"Saved dataset config: {yaml_path}")
        self._log(f"Saved pseudo-label manifest: {manifest_path}")
        self._show_info(
            "Done",
            f"Dataset created at: {workspace}\nBoxes: {total_boxes}\nSkipped boxes: {total_skipped}",
        )

    def _run_train(self) -> None:
        self._require_yolo()
        model_path = self.train_model.get().strip()
        kwargs = build_train_kwargs(
            data=self.train_data_yaml.get(),
            model=model_path,
            epochs=int(self.train_epochs.get()),
            batch=self.train_batch.get(),
            imgsz=int(self.train_imgsz.get()),
            device=self.train_device.get(),
            workers=int(self.train_workers.get()),
            project=self.train_project.get(),
            run_name=self.train_name.get(),
            cache=self.train_cache.get(),
            patience=int(self.train_patience.get()),
            seed=int(self.train_seed.get()),
        )
        model = YOLO(model_path)
        self._log(f"Training with args: {kwargs}")
        model.train(**kwargs)
        self._log("Training completed.")

    def _run_val(self) -> None:
        self._require_yolo()
        model_path = self.test_model.get().strip()
        if not model_path:
            raise ValueError("Select a model before running validation.")
        kwargs = build_val_kwargs(
            self.test_data_yaml.get(),
            int(self.test_imgsz.get()),
            float(self.test_conf.get()),
            float(self.test_iou.get()),
            self.test_device.get(),
        )
        model = YOLO(model_path)
        self._log(f"Validation with args: {kwargs}")
        model.val(**kwargs)
        self._log("Validation completed.")

    def _run_export(self) -> None:
        self._require_yolo()
        model_path = self.exp_model.get().strip()
        if not model_path:
            raise ValueError("Select a trained model before exporting.")
        kwargs = build_export_kwargs(
            self.exp_format.get(),
            int(self.exp_imgsz.get()),
            self.exp_device.get(),
            bool(self.exp_half.get()),
            int(self.exp_workspace.get()),
        )
        model = YOLO(model_path)
        self._log(f"Export with args: {kwargs}")
        model.export(**kwargs)
        self._log("Export completed.")


if __name__ == "__main__":
    app = YoloWorkspaceGUI()
    app.mainloop()
