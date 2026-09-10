"""Runtime configuration for the vision service. Environment only — no config files, no import-time I/O.

Every value has a safe default so `uvicorn app.main:app` works out of the box (mock mode when the
weights are missing). Boolean parsing mirrors `apps/api/src/config.ts` (zBool) so the same env value
means the same thing on both sides of the contract.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping

PACKAGE_ROOT = Path(__file__).resolve().parent.parent
"""apps/vision — the service root (models/, tests/, requirements.txt live here)."""

TRUE_WORDS = ("1", "true", "yes", "on")

DEFAULT_MODEL_ID = "onnx-community/swin-finetuned-food101-ONNX"
DEFAULT_MODEL_FILE = "onnx/model_quantized.onnx"
DEFAULT_CLIP_MODEL_ID = "Xenova/clip-vit-base-patch32"


def parse_bool(raw: str | bool | None) -> bool | None:
    """`None` when unset (caller decides the fallback), else Node's zBool semantics."""
    if raw is None:
        return None
    if isinstance(raw, bool):
        return raw
    return raw.strip().lower() in TRUE_WORDS


def _int(env: Mapping[str, str], key: str, default: int, *, minimum: int = 1) -> int:
    try:
        value = int(str(env[key]).strip())
    except (KeyError, ValueError, TypeError):
        return default
    return value if value >= minimum else default


def _float(env: Mapping[str, str], key: str, default: float, *, minimum: float = 0.0, maximum: float = 1.0) -> float:
    try:
        value = float(str(env[key]).strip())
    except (KeyError, ValueError, TypeError):
        return default
    return value if minimum <= value <= maximum else default


@dataclass(frozen=True, slots=True)
class Settings:
    mock: bool | None
    """True: always mock. False: never mock (fail loudly). None: mock only if the weights are missing."""
    model_dir: Path
    model_id: str
    model_file: str
    model_revision: str
    clip_enabled: bool
    clip_model_id: str
    clip_threshold: float
    turkish_head: bool
    top_k: int
    min_confidence: float
    intra_op_threads: int
    max_upload_mb: int
    max_image_side: int
    max_concurrency: int
    max_queue: int
    log_level: str

    # ----------------------------------------------------------------- paths
    @property
    def model_path(self) -> Path:
        return self.model_dir / self.model_file

    @property
    def config_path(self) -> Path:
        return self.model_dir / "config.json"

    @property
    def preprocessor_path(self) -> Path:
        return self.model_dir / "preprocessor_config.json"

    @property
    def clip_dir(self) -> Path:
        return self.model_dir / "clip"

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    def model_available(self) -> bool:
        """All three artefacts must be present — a lone .onnx without its label map is useless."""
        return self.model_path.is_file() and self.config_path.is_file() and self.preprocessor_path.is_file()

    def clip_available(self) -> bool:
        from .predictor import CLIP_REQUIRED_FILES  # local import: keeps settings dependency-free

        return all((self.clip_dir / name).is_file() for name in CLIP_REQUIRED_FILES)

    def snapshot(self) -> dict[str, Any]:
        """JSON-safe view for the startup log line."""
        return {
            "mock": self.mock,
            "modelId": self.model_id,
            "modelFile": self.model_file,
            "modelDir": str(self.model_dir),
            "clipEnabled": self.clip_enabled,
            "turkishHead": self.turkish_head,
            "topK": self.top_k,
            "minConfidence": self.min_confidence,
            "intraOpThreads": self.intra_op_threads,
            "maxUploadMb": self.max_upload_mb,
            "maxConcurrency": self.max_concurrency,
            "logLevel": self.log_level,
        }


def load_settings(env: Mapping[str, str] | None = None) -> Settings:
    import os

    env = os.environ if env is None else env
    model_dir = Path(env.get("MODEL_DIR") or (PACKAGE_ROOT / "models")).expanduser()
    return Settings(
        mock=parse_bool(env.get("VISION_MOCK")),
        model_dir=model_dir,
        model_id=env.get("MODEL_ID") or DEFAULT_MODEL_ID,
        model_file=env.get("MODEL_FILE") or DEFAULT_MODEL_FILE,
        model_revision=env.get("MODEL_REVISION") or "main",
        clip_enabled=bool(parse_bool(env.get("CLIP_ENABLED"))),
        clip_model_id=env.get("CLIP_MODEL_ID") or DEFAULT_CLIP_MODEL_ID,
        clip_threshold=_float(env, "CLIP_THRESHOLD", 0.6),
        turkish_head=bool(parse_bool(env.get("TURKISH_HEAD"))),
        top_k=_int(env, "TOP_K", 3),
        min_confidence=_float(env, "MIN_CONFIDENCE", 0.15),
        intra_op_threads=_int(env, "INTRA_OP_THREADS", 4),
        max_upload_mb=_int(env, "MAX_UPLOAD_MB", 6),
        max_image_side=_int(env, "MAX_IMAGE_SIDE", 1024, minimum=224),
        max_concurrency=_int(env, "MAX_CONCURRENCY", 2),
        max_queue=_int(env, "MAX_QUEUE", 8, minimum=0),
        log_level=(env.get("LOG_LEVEL") or "info").strip().lower(),
    )
