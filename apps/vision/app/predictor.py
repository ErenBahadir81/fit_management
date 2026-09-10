"""Predictors.

Two implementations behind one protocol:
  * `MockPredictor`   — deterministic, weight-free, byte-for-byte identical to the Node client's
                        `mockAnalysis` (apps/api/src/modules/vision/client.ts). Powers CI and demo builds.
  * `OnnxFood101Predictor` — onnxruntime over `onnx-community/swin-finetuned-food101-ONNX`
                        (int8, 93 MB, 92.1 % top-1, Apache-2.0). No torch at runtime (research §5.3).

Plus an optional `ClipGate` (open-set "is this food at all?"), because both fine-tuned heads are
closed-set softmax classifiers and are *confidently wrong* off-domain (research §1.4/§6.1).
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal, Protocol, Sequence

import numpy as np
from PIL import Image

from .labels import CLIP_FOOD_PROMPTS, CLIP_NONFOOD_PROMPTS, FOOD101_LABELS, MOCK_LABELS

Gate = Literal["food", "notFood", "off"]

CLIP_REQUIRED_FILES: tuple[str, ...] = (
    "vocab.json",
    "merges.txt",
    "onnx/text_model_quantized.onnx",
    "onnx/vision_model_quantized.onnx",
)

# PIL resampling filters as numbered by HF image processors (`preprocessor_config.json: resample`).
_RESAMPLE = {0: Image.NEAREST, 1: Image.LANCZOS, 2: Image.BILINEAR, 3: Image.BICUBIC, 4: Image.BOX, 5: Image.HAMMING}


@dataclass(frozen=True, slots=True)
class Detection:
    label: str
    confidence: float
    bbox: None = None
    """Always null in v1: single-plate classification, no detector (research §1.7 — ultralytics is AGPL)."""


@dataclass(frozen=True, slots=True)
class Prediction:
    detections: list[Detection]
    model_version: str
    mock: bool
    gate: Gate = "off"


class Predictor(Protocol):
    model_version: str
    mock: bool

    def predict(self, image: Image.Image, data: bytes) -> Prediction: ...


# --------------------------------------------------------------------------- scoring helpers
def softmax(logits: np.ndarray) -> np.ndarray:
    shifted = np.exp(logits.astype(np.float64) - float(np.max(logits)))
    return (shifted / shifted.sum()).astype(np.float64)


def top_detections(probs: np.ndarray, labels: Sequence[str], *, top_k: int, min_confidence: float) -> list[Detection]:
    """Top-k above the floor, but never empty: a low-confidence guess plus a picker beats a blank screen."""
    order = np.argsort(probs)[::-1][: max(1, top_k)]
    out = [Detection(labels[int(i)], round(float(probs[int(i)]), 3)) for i in order]
    kept = [d for d in out if d.confidence >= min_confidence]
    return kept or out[:1]


# --------------------------------------------------------------------------- preprocessing
@dataclass(frozen=True, slots=True)
class Preprocessor:
    """Exactly what the model was trained with — read from its own `preprocessor_config.json`."""

    size: tuple[int, int]
    mean: np.ndarray
    std: np.ndarray
    rescale_factor: float
    resample: int
    center_crop: bool = False
    """CLIP-style: resize the shortest edge to `size`, then crop the centre (ViT/Swin just resize to a square)."""

    @classmethod
    def from_config(cls, config: dict[str, Any]) -> "Preprocessor":
        size = config.get("size") or {}
        crop = config.get("crop_size") or {}
        center_crop = bool(config.get("do_center_crop")) and bool(crop)
        source = crop if center_crop else size
        height = int(source.get("height") or source.get("shortest_edge") or 224)
        width = int(source.get("width") or source.get("shortest_edge") or 224)
        mean = np.array(config.get("image_mean") or [0.485, 0.456, 0.406], dtype=np.float32)
        std = np.array(config.get("image_std") or [0.229, 0.224, 0.225], dtype=np.float32)
        return cls(
            size=(width, height),
            mean=mean,
            std=std,
            rescale_factor=float(config.get("rescale_factor") or 1 / 255),
            resample=int(config.get("resample") if config.get("resample") is not None else 3),
            center_crop=center_crop,
        )

    def __call__(self, image: Image.Image) -> np.ndarray:
        rgb = image.convert("RGB")
        resample = _RESAMPLE.get(self.resample, Image.BICUBIC)
        if self.center_crop:
            target = max(self.size)
            width, height = rgb.size
            scale = target / min(width, height)
            rgb = rgb.resize((max(target, round(width * scale)), max(target, round(height * scale))), resample)
            left, top = (rgb.width - self.size[0]) // 2, (rgb.height - self.size[1]) // 2
            resized = rgb.crop((left, top, left + self.size[0], top + self.size[1]))
        else:
            resized = rgb.resize(self.size, resample)
        array = np.asarray(resized, dtype=np.float32) * np.float32(self.rescale_factor)
        array = (array - self.mean) / self.std
        return np.ascontiguousarray(array.transpose(2, 0, 1)[None], dtype=np.float32)


# --------------------------------------------------------------------------- mock
class MockPredictor:
    """sha256(image bytes) -> labels. Same algorithm, same label order, same rounding as the Node client."""

    mock = True
    model_version = "mock"

    def __init__(self, *, top_k: int = 3, labels: Sequence[str] = MOCK_LABELS):
        self.top_k = top_k
        self.labels = tuple(labels)

    def predict(self, image: Image.Image, data: bytes) -> Prediction:
        digest = hashlib.sha256(data).digest()
        wanted = min(self.top_k, len(self.labels))
        picks: list[str] = []
        for i in range(32):
            if len(picks) >= wanted:
                break
            label = self.labels[digest[i] % len(self.labels)]
            if label in picks:
                continue
            picks.append(label)
        detections = [Detection(label, round(0.9 - 0.22 * i, 3)) for i, label in enumerate(picks)]
        return Prediction(detections=detections, model_version=self.model_version, mock=True, gate="off")


# --------------------------------------------------------------------------- onnx classifier
class OnnxFood101Predictor:
    """Swin-B int8 ONNX, one session, `intra_op_num_threads` pinned — one worker, no oversubscription."""

    mock = False

    def __init__(self, session: Any, preprocessor: Preprocessor, labels: Sequence[str], *, model_version: str,
                 top_k: int = 3, min_confidence: float = 0.15, gate: "ClipGate | None" = None):
        self.session = session
        self.preprocessor = preprocessor
        self.labels = tuple(labels)
        self.model_version = model_version
        self.top_k = top_k
        self.min_confidence = min_confidence
        self.gate = gate
        self.input_name = session.get_inputs()[0].name

    @classmethod
    def load(cls, settings: Any, *, gate: "ClipGate | None" = None) -> "OnnxFood101Predictor":
        import onnxruntime as ort

        config = json.loads(settings.config_path.read_text(encoding="utf-8"))
        id2label = config.get("id2label") or {}
        labels = [id2label[str(i)] for i in range(len(id2label))] if id2label else list(FOOD101_LABELS)
        options = ort.SessionOptions()
        options.intra_op_num_threads = settings.intra_op_threads
        options.inter_op_num_threads = 1
        options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        session = ort.InferenceSession(str(settings.model_path), options, providers=["CPUExecutionProvider"])
        preprocessor = Preprocessor.from_config(json.loads(settings.preprocessor_path.read_text(encoding="utf-8")))
        version = f"{settings.model_id.split('/')[-1]}/{Path(settings.model_file).stem}"
        return cls(session, preprocessor, labels, model_version=version, top_k=settings.top_k,
                   min_confidence=settings.min_confidence, gate=gate)

    def predict(self, image: Image.Image, data: bytes) -> Prediction:
        gate_result: Gate = "off"
        if self.gate is not None:
            gate_result = self.gate.evaluate(image)
            if gate_result == "notFood":
                return Prediction(detections=[], model_version=self.model_version, mock=False, gate=gate_result)
        tensor = self.preprocessor(image)
        logits = np.asarray(self.session.run(None, {self.input_name: tensor})[0]).reshape(-1)
        probs = softmax(logits)
        detections = top_detections(probs, self.labels, top_k=self.top_k, min_confidence=self.min_confidence)
        return Prediction(detections=detections, model_version=self.model_version, mock=False, gate=gate_result)


# --------------------------------------------------------------------------- open-set gate
class ClipGate:
    """Zero-shot "is this food?" over CLIP ViT-B/32 (ONNX).

    Text embeddings for the fixed prompt list are computed once at startup (encoding prompts per
    request is the classic mistake — research §1.6); per request only the vision encoder runs (~84 ms).
    """

    def __init__(self, vision_session: Any, preprocessor: Preprocessor, text_embeddings: np.ndarray,
                 nonfood_count: int, *, threshold: float = 0.6, logit_scale: float = 100.0):
        self.vision_session = vision_session
        self.preprocessor = preprocessor
        self.text_embeddings = text_embeddings  # (n_prompts, dim), L2-normalised, food prompts first
        self.nonfood_count = nonfood_count
        self.threshold = threshold
        self.logit_scale = logit_scale
        self.input_name = vision_session.get_inputs()[0].name

    @classmethod
    def load(cls, settings: Any) -> "ClipGate":
        import onnxruntime as ort

        from .clip_tokenizer import ClipTokenizer

        options = ort.SessionOptions()
        options.intra_op_num_threads = settings.intra_op_threads
        options.inter_op_num_threads = 1
        vision = ort.InferenceSession(str(settings.clip_dir / "onnx/vision_model_quantized.onnx"), options,
                                      providers=["CPUExecutionProvider"])
        text = ort.InferenceSession(str(settings.clip_dir / "onnx/text_model_quantized.onnx"), options,
                                    providers=["CPUExecutionProvider"])
        tokenizer = ClipTokenizer.load(settings.clip_dir)
        prompts = [*CLIP_FOOD_PROMPTS, *CLIP_NONFOOD_PROMPTS]
        input_ids, attention_mask = tokenizer.encode_batch(prompts)
        feeds = {i.name: (input_ids if "ids" in i.name else attention_mask) for i in text.get_inputs()}
        embeddings = _first_embedding(text.run(None, feeds), text)
        embeddings = embeddings / np.linalg.norm(embeddings, axis=-1, keepdims=True)
        preprocessor = Preprocessor.from_config(json.loads((settings.clip_dir / "preprocessor_config.json").read_text()))
        return cls(vision, preprocessor, embeddings.astype(np.float32), len(CLIP_NONFOOD_PROMPTS),
                   threshold=settings.clip_threshold)

    def evaluate(self, image: Image.Image) -> Gate:
        return "notFood" if self.nonfood_probability(image) > self.threshold else "food"

    def nonfood_probability(self, image: Image.Image) -> float:
        tensor = self.preprocessor(image)
        outputs = self.vision_session.run(None, {self.input_name: tensor})
        image_embedding = _first_embedding(outputs, self.vision_session).reshape(-1)
        image_embedding = image_embedding / np.linalg.norm(image_embedding)
        probs = softmax(self.logit_scale * (self.text_embeddings @ image_embedding))
        return float(probs[-self.nonfood_count:].sum()) if self.nonfood_count else 0.0


def _first_embedding(outputs: Sequence[np.ndarray], session: Any) -> np.ndarray:
    """Xenova CLIP exports name the projected output `text_embeds` / `image_embeds`; fall back to output 0."""
    names = [o.name for o in session.get_outputs()]
    for wanted in ("text_embeds", "image_embeds"):
        if wanted in names:
            return np.asarray(outputs[names.index(wanted)], dtype=np.float32)
    return np.asarray(outputs[0], dtype=np.float32)
