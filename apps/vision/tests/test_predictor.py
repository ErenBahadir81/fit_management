"""Predictors: the deterministic mock (contract with the Node client) and the ONNX classifier."""
import hashlib

import numpy as np
import pytest
from PIL import Image

from app.labels import FOOD101_LABELS, MOCK_LABELS
from app.predictor import (
    Detection,
    MockPredictor,
    Preprocessor,
    softmax,
    top_detections,
)
from tests.conftest import png_bytes

# Reference vectors produced by the Node implementation (apps/api/src/modules/vision/client.ts,
# `node -e` over mockAnalysis) — the Python mock must reproduce them byte-for-byte.
NODE_VECTORS = {
    b"": ["steak", "omelette", "kofte"],
    b"fitfloow-vision": ["pizza", "mercimek_corbasi", "hamburger"],
    bytes(range(32)): ["menemen", "hamburger", "pilav"],
    bytes([1, 2, 3, 4, 5]): ["omelette", "salad", "baklava"],
}


@pytest.mark.parametrize("data,expected", list(NODE_VECTORS.items()), ids=["empty", "text", "range32", "12345"])
def test_mock_matches_the_node_client_exactly(data, expected):
    p = MockPredictor(top_k=3)
    result = p.predict(Image.new("RGB", (4, 4)), data)
    assert [d.label for d in result.detections] == expected


def test_mock_confidences_follow_the_node_formula():
    result = MockPredictor(top_k=3).predict(Image.new("RGB", (4, 4)), b"fitfloow-vision")
    assert [d.confidence for d in result.detections] == [0.9, 0.68, 0.46]
    assert all(d.bbox is None for d in result.detections)


def test_mock_is_deterministic_and_never_repeats_a_label():
    data = png_bytes()
    first = MockPredictor(top_k=5).predict(Image.new("RGB", (4, 4)), data)
    second = MockPredictor(top_k=5).predict(Image.new("RGB", (4, 4)), data)
    labels = [d.label for d in first.detections]
    assert labels == [d.label for d in second.detections]
    assert len(set(labels)) == len(labels) == 5
    assert set(labels) <= set(MOCK_LABELS)


def test_mock_top_k_is_capped_by_the_label_list():
    result = MockPredictor(top_k=99).predict(Image.new("RGB", (4, 4)), b"x")
    assert len(result.detections) <= len(MOCK_LABELS)


def test_mock_reports_itself_as_mock():
    result = MockPredictor(top_k=3).predict(Image.new("RGB", (4, 4)), b"x")
    assert result.mock is True and result.model_version == "mock" and result.gate == "off"


def test_mock_hash_is_plain_sha256_over_the_upload_bytes():
    """Guards the algorithm itself: index = digest[i] % len(labels)."""
    data = b"fitfloow-vision"
    digest = hashlib.sha256(data).digest()
    assert MOCK_LABELS[digest[0] % len(MOCK_LABELS)] == "pizza"


# --------------------------------------------------------------------- preprocessing
PREPROCESSOR_CONFIG = {
    "do_normalize": True,
    "do_rescale": True,
    "do_resize": True,
    "image_mean": [0.485, 0.456, 0.406],
    "image_std": [0.229, 0.224, 0.225],
    "rescale_factor": 1 / 255,
    "size": {"height": 224, "width": 224},
}


def test_preprocessor_reads_the_models_own_config():
    pre = Preprocessor.from_config(PREPROCESSOR_CONFIG)
    assert pre.size == (224, 224)
    assert pre.mean.tolist() == pytest.approx([0.485, 0.456, 0.406], abs=1e-6)
    assert pre.mean.dtype == np.float32, "model input is float32; keep the constants in the same precision"


def test_preprocessor_produces_nchw_float32_batch_of_one():
    pre = Preprocessor.from_config(PREPROCESSOR_CONFIG)
    tensor = pre(Image.new("RGB", (640, 480), (255, 255, 255)))
    assert tensor.shape == (1, 3, 224, 224)
    assert tensor.dtype == np.float32


def test_preprocessor_applies_imagenet_normalisation():
    pre = Preprocessor.from_config(PREPROCESSOR_CONFIG)
    white = pre(Image.new("RGB", (10, 10), (255, 255, 255)))
    black = pre(Image.new("RGB", (10, 10), (0, 0, 0)))
    assert white[0, 0, 0, 0] == pytest.approx((1.0 - 0.485) / 0.229, abs=1e-5)
    assert black[0, 2, 0, 0] == pytest.approx((0.0 - 0.406) / 0.225, abs=1e-5)


def test_preprocessor_defaults_are_safe_when_the_config_is_partial():
    pre = Preprocessor.from_config({})
    assert pre.size == (224, 224)
    assert pre(Image.new("RGB", (8, 8))).shape == (1, 3, 224, 224)


# --------------------------------------------------------------------- scoring
def test_softmax_is_numerically_stable_and_sums_to_one():
    probs = softmax(np.array([1000.0, 1001.0, 999.0], dtype=np.float32))
    assert probs.sum() == pytest.approx(1.0)
    assert np.argmax(probs) == 1


def test_top_detections_are_sorted_and_rounded():
    probs = np.zeros(len(FOOD101_LABELS), dtype=np.float32)
    probs[FOOD101_LABELS.index("pizza")] = 0.7123456
    probs[FOOD101_LABELS.index("lasagna")] = 0.2
    probs[FOOD101_LABELS.index("waffles")] = 0.05
    out = top_detections(probs, FOOD101_LABELS, top_k=3, min_confidence=0.15)
    assert [d.label for d in out] == ["pizza", "lasagna"]
    assert out[0].confidence == 0.712, "confidences are rounded to 3 decimals like the mock"
    assert all(isinstance(d, Detection) and d.bbox is None for d in out)


def test_top_detections_always_returns_the_best_guess_even_below_the_floor():
    """A low-confidence answer plus a picker beats an empty screen (research §6.1)."""
    probs = np.zeros(len(FOOD101_LABELS), dtype=np.float32)
    probs[FOOD101_LABELS.index("pizza")] = 0.05
    probs[FOOD101_LABELS.index("lasagna")] = 0.04
    out = top_detections(probs, FOOD101_LABELS, top_k=3, min_confidence=0.15)
    assert [d.label for d in out] == ["pizza"]


def test_top_detections_respects_top_k():
    probs = np.full(len(FOOD101_LABELS), 1 / len(FOOD101_LABELS), dtype=np.float32)
    assert len(top_detections(probs, FOOD101_LABELS, top_k=2, min_confidence=0.0)) == 2


# --------------------------------------------------------------------- CLIP-style preprocessing
CLIP_PREPROCESSOR_CONFIG = {
    "crop_size": {"height": 224, "width": 224},
    "do_center_crop": True,
    "do_normalize": True,
    "do_rescale": True,
    "do_resize": True,
    "image_mean": [0.48145466, 0.4578275, 0.40821073],
    "image_std": [0.26862954, 0.26130258, 0.27577711],
    "rescale_factor": 1 / 255,
    "resample": 3,
    "size": {"shortest_edge": 224},
}


def test_preprocessor_supports_shortest_edge_plus_center_crop():
    """CLIP resizes the *short* side then centre-crops; a plain square resize distorts the gate."""
    pre = Preprocessor.from_config(CLIP_PREPROCESSOR_CONFIG)
    assert pre.size == (224, 224) and pre.center_crop is True
    assert pre(Image.new("RGB", (1000, 500), (255, 0, 0))).shape == (1, 3, 224, 224)


def test_center_crop_keeps_the_middle_of_a_wide_image():
    pre = Preprocessor.from_config(CLIP_PREPROCESSOR_CONFIG)
    wide = Image.new("RGB", (900, 300), (0, 0, 0))
    wide.paste(Image.new("RGB", (300, 300), (255, 255, 255)), (300, 0))  # white square in the middle
    tensor = pre(wide)
    centre = tensor[0, 0, 112, 112]
    assert centre == pytest.approx((1.0 - 0.48145466) / 0.26862954, abs=1e-4)


def test_square_resize_is_used_when_center_crop_is_off():
    pre = Preprocessor.from_config(PREPROCESSOR_CONFIG)
    assert pre.center_crop is False
