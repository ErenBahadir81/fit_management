"""Export a HuggingFace image classifier to the ONNX layout this service expects.

DEV-ONLY, and NOT exercised by the test suite: it needs `requirements-export.txt` (torch + optimum,
~1.4 GB) which the runtime image deliberately does not contain. The primary model
(`onnx-community/swin-finetuned-food101-ONNX`) is already published as ONNX — use `python -m app.download`.
Reach for this script only for a checkpoint that ships torch weights only, e.g. the Turkish head
`prithivMLmods/TurkishFoods-25` or `nateraw/food`.

    .venv-export/bin/python scripts/export_onnx.py prithivMLmods/TurkishFoods-25 --out models/turkish25 --quantize

Output layout (identical to what `app.download` produces, so `MODEL_DIR` can point straight at it):
    <out>/config.json  <out>/preprocessor_config.json  <out>/onnx/model.onnx [+ model_quantized.onnx]
"""
from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("model_id", help="HuggingFace repo id of a torch image classifier")
    parser.add_argument("--out", required=True, help="target directory (becomes MODEL_DIR)")
    parser.add_argument("--quantize", action="store_true", help="also emit int8 onnx/model_quantized.onnx")
    args = parser.parse_args(argv)

    try:
        from optimum.onnxruntime import ORTModelForImageClassification, ORTQuantizer
        from optimum.onnxruntime.configuration import AutoQuantizationConfig
        from transformers import AutoImageProcessor
    except ImportError:
        print("Install requirements-export.txt first (torch + transformers + optimum).", file=sys.stderr)
        return 2

    out = Path(args.out)
    onnx_dir = out / "onnx"
    onnx_dir.mkdir(parents=True, exist_ok=True)

    print(f"[export] {args.model_id} -> {out}")
    model = ORTModelForImageClassification.from_pretrained(args.model_id, export=True)
    model.save_pretrained(onnx_dir)
    AutoImageProcessor.from_pretrained(args.model_id).save_pretrained(out)
    # optimum writes config.json next to the graph; the service expects it at the model dir root.
    if (onnx_dir / "config.json").is_file():
        shutil.copyfile(onnx_dir / "config.json", out / "config.json")

    if args.quantize:
        quantizer = ORTQuantizer.from_pretrained(onnx_dir)
        quantizer.quantize(save_dir=onnx_dir, quantization_config=AutoQuantizationConfig.avx512_vnni(is_static=False, per_channel=False))

    for path in sorted(out.rglob("*")):
        if path.is_file():
            print(f"[export] {path.relative_to(out)}  {path.stat().st_size / 1e6:.1f} MB")
    print(f"[export] done — point MODEL_DIR at {out} (and MODEL_FILE at onnx/model.onnx)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
