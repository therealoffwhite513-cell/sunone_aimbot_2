#!/usr/bin/env python3
"""Score recorded AI training PID logs and write a status summary."""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from statistics import mean
from time import time


REPO_ROOT = Path(__file__).resolve().parents[1]


def resolve_repo_path(path: str | Path) -> Path:
    resolved = Path(path)
    if resolved.is_absolute():
        return resolved
    return REPO_ROOT / resolved


def safe_float(value: object, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def write_status(
    status_path: Path,
    *,
    stage: str,
    progress: float,
    rows: int,
    average_score: float,
    dataset: Path,
    message: str,
) -> None:
    status_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "stage": stage,
        "progress": max(0.0, min(1.0, progress)),
        "rows": rows,
        "average_score": max(0.0, min(1.0, average_score)),
        "dataset": str(dataset),
        "model": "",
        "message": message,
        "updated_at": time(),
    }
    status_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def score_log(input_path: Path) -> dict[str, float | int]:
    if not input_path.exists():
        return {
            "rows": 0,
            "average_score": 0.0,
            "good_rows": 0,
            "average_normalized_error": 0.0,
            "overshoot_rows": 0,
        }

    scores: list[float] = []
    normalized_errors: list[float] = []
    overshoots = 0
    with input_path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            score = safe_float(row.get("convergence_score"))
            scores.append(score)
            normalized_errors.append(safe_float(row.get("normalized_error")))
            if safe_float(row.get("overshoot_risk")) > 0.5:
                overshoots += 1

    return {
        "rows": len(scores),
        "average_score": mean(scores) if scores else 0.0,
        "good_rows": sum(1 for score in scores if score >= 0.75),
        "average_normalized_error": mean(normalized_errors) if normalized_errors else 0.0,
        "overshoot_rows": overshoots,
    }


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Score an AI training PID CSV log.")
    parser.add_argument("--input", default="training/logs/ai_training_pid.csv")
    parser.add_argument("--status", default="training/status/ai_training_status.json")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_arg_parser().parse_args(argv)
    input_path = resolve_repo_path(args.input)
    status_path = resolve_repo_path(args.status)

    summary = score_log(input_path)
    rows = int(summary["rows"])
    average_score = float(summary["average_score"])
    good_rows = int(summary["good_rows"])
    avg_error = float(summary["average_normalized_error"])
    overshoots = int(summary["overshoot_rows"])
    message = (
        f"Scored {rows} rows, {good_rows} good rows, "
        f"avg normalized error {avg_error:.4f}, overshoot rows {overshoots}."
    )
    write_status(
        status_path,
        stage="scored",
        progress=1.0,
        rows=rows,
        average_score=average_score,
        dataset=input_path,
        message=message,
    )
    print(message)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
