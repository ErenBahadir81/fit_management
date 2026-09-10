"""Real-weights smoke tests. Opt in with RUN_MODEL_TESTS=1 after `python -m app.download`.

Set MODEL_TEST_IMAGE=/path/to/food.jpg to additionally assert semantic behaviour on a real photo
(no photo is committed to the repo — licence hygiene).
"""
import os
import statistics
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from app.labels import FOOD101_LABELS
from app.main import create_app
from app.predictor import ClipGate, OnnxFood101Predictor
from app.settings import load_settings

pytestmark = pytest.mark.model

REAL_PHOTO = os.environ.get("MODEL_TEST_IMAGE")


def sample_image() -> Image.Image:
    if REAL_PHOTO:
        return Image.open(REAL_PHOTO).convert("RGB")
    img = Image.new("RGB", (512, 512), (198, 142, 78))
    draw = ImageDraw.Draw(img)
    draw.ellipse((40, 40, 472, 472), fill=(232, 214, 180), outline=(140, 96, 42), width=8)
    draw.ellipse((120, 120, 392, 392), fill=(206, 74, 44))
    for x, y in ((180, 190), (300, 180), (240, 300), (190, 290), (310, 300)):
        draw.ellipse((x, y, x + 42, y + 42), fill=(240, 214, 150))
    return img


def document_image() -> Image.Image:
    img = Image.new("RGB", (512, 512), (250, 250, 250))
    draw = ImageDraw.Draw(img)
    for row in range(12):
        draw.rectangle((60, 60 + row * 34, 60 + (380 if row % 3 else 240), 60 + row * 34 + 12), fill=(30, 30, 30))
    return img


@pytest.fixture(scope="module")
def predictor():
    return OnnxFood101Predictor.load(load_settings())


def test_session_input_matches_the_preprocessor(predictor):
    shape = predictor.session.get_inputs()[0].shape
    assert len(shape) == 4, shape
    assert predictor.preprocessor.size == (224, 224)
    assert len(predictor.labels) == 101


def test_real_inference_returns_food101_labels(predictor):
    result = predictor.predict(sample_image(), b"raw")
    assert result.mock is False
    assert 1 <= len(result.detections) <= 3
    assert all(d.label in FOOD101_LABELS for d in result.detections)
    assert all(0.0 <= d.confidence <= 1.0 and d.bbox is None for d in result.detections)
    assert [d.confidence for d in result.detections] == sorted((d.confidence for d in result.detections), reverse=True)
    assert result.model_version == "swin-finetuned-food101-ONNX/model_quantized"


def test_real_inference_latency_is_well_inside_the_budget(predictor, capsys):
    image = sample_image()
    predictor.predict(image, b"warmup")
    samples = []
    for _ in range(5):
        started = time.perf_counter()
        predictor.predict(image, b"raw")
        samples.append((time.perf_counter() - started) * 1000)
    median = statistics.median(samples)
    with capsys.disabled():
        print(f"\n[latency] onnx swin int8 median {median:.0f} ms (min {min(samples):.0f}, max {max(samples):.0f})")
    assert median < 2000, f"{median:.0f} ms — the product budget is 2 s"


def test_real_photo_is_recognised_when_one_is_provided(predictor):
    if not REAL_PHOTO:
        pytest.skip("set MODEL_TEST_IMAGE=/path/to/food.jpg for the semantic check")
    result = predictor.predict(Image.open(REAL_PHOTO).convert("RGB"), b"raw")
    expected = Path(REAL_PHOTO).stem.split("-")[0]
    assert expected in [d.label for d in result.detections], [(d.label, d.confidence) for d in result.detections]


def test_service_serves_real_model_end_to_end(png):
    app = create_app(load_settings({}))
    with TestClient(app) as client:
        health = client.get("/health").json()
        assert health["mock"] is False and health["modelLoaded"] is True
        assert health["modelVersion"] == "swin-finetuned-food101-ONNX/model_quantized"
        body = client.post("/v1/analyze", files={"image": ("scan.png", png, "image/png")}).json()
        assert body["mock"] is False and body["gate"] == "off"
        assert body["detections"] and body["detections"][0]["label"] in FOOD101_LABELS
        assert body["latencyMs"] > 0


@pytest.fixture(scope="module")
def gate():
    settings = load_settings({"CLIP_ENABLED": "1"})
    if not settings.clip_available():
        pytest.skip("CLIP weights missing — run `python -m app.download --clip`")
    return ClipGate.load(settings)


def test_clip_gate_rejects_a_page_of_text(gate, capsys):
    probability = gate.nonfood_probability(document_image())
    with capsys.disabled():
        print(f"\n[gate] document non-food probability {probability:.3f}")
    assert gate.evaluate(document_image()) == "notFood"


def test_clip_gate_accepts_a_food_photo_when_one_is_provided(gate, capsys):
    if not REAL_PHOTO:
        pytest.skip("set MODEL_TEST_IMAGE=/path/to/food.jpg for the semantic check")
    probability = gate.nonfood_probability(Image.open(REAL_PHOTO).convert("RGB"))
    with capsys.disabled():
        print(f"\n[gate] food photo non-food probability {probability:.3f}")
    assert gate.evaluate(Image.open(REAL_PHOTO).convert("RGB")) == "food"


def test_gated_service_reports_gate_in_the_response(png):
    settings = load_settings({"CLIP_ENABLED": "1"})
    if not settings.clip_available():
        pytest.skip("CLIP weights missing")
    app = create_app(settings)
    with TestClient(app) as client:
        body = client.post("/v1/analyze", files={"image": ("scan.png", png, "image/png")}).json()
        assert body["gate"] in ("food", "notFood")
