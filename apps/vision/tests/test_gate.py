"""The open-set gate and its effect on the classifier (research §6.1: closed-set heads cannot say "I don't know")."""
import numpy as np
import pytest
from PIL import Image

from app.labels import FOOD101_LABELS
from app.predictor import ClipGate, OnnxFood101Predictor, Preprocessor
from tests.conftest import FakeSession

PRE = Preprocessor.from_config({"size": {"height": 224, "width": 224}})


def make_gate(image_embedding, text_embeddings, *, nonfood_count=2, threshold=0.6):
    session = FakeSession([np.array([image_embedding], dtype=np.float32)], output_names=("image_embeds",))
    return ClipGate(session, PRE, np.array(text_embeddings, dtype=np.float32), nonfood_count, threshold=threshold)


def test_gate_says_food_when_the_image_matches_the_food_prompts():
    gate = make_gate([1.0, 0.0], [[1.0, 0.0], [0.9, 0.1], [0.0, 1.0], [0.1, 0.9]])
    assert gate.evaluate(Image.new("RGB", (32, 32))) == "food"
    assert gate.nonfood_probability(Image.new("RGB", (32, 32))) < 0.4


def test_gate_says_not_food_when_the_image_matches_the_non_food_prompts():
    gate = make_gate([0.0, 1.0], [[1.0, 0.0], [0.9, 0.1], [0.0, 1.0], [0.1, 0.9]])
    assert gate.evaluate(Image.new("RGB", (32, 32))) == "notFood"


def test_gate_threshold_is_configurable():
    """CLIP's logit scale is 100, so only near-ties land between thresholds — this is one of them
    (cosine gap 0.01 -> non-food probability 0.731)."""
    embeddings = [[1.0, 0.0], [0.99, 0.141]]  # food prompt, non-food prompt (nearly parallel)
    img = Image.new("RGB", (8, 8))
    towards_nonfood = make_gate([0.99, 0.141], embeddings, nonfood_count=1)
    assert towards_nonfood.nonfood_probability(img) == pytest.approx(0.731, abs=0.01)
    assert towards_nonfood.evaluate(img) == "notFood"          # 0.731 > 0.6
    towards_food = make_gate([1.0, 0.0], embeddings, nonfood_count=1)
    assert towards_food.evaluate(img) == "food"                 # 0.269 < 0.6
    assert make_gate([1.0, 0.0], embeddings, nonfood_count=1, threshold=0.2).evaluate(img) == "notFood"


def test_gate_normalises_the_image_embedding():
    gate = make_gate([10.0, 0.0], [[1.0, 0.0], [0.0, 1.0]], nonfood_count=1)
    scaled = make_gate([1.0, 0.0], [[1.0, 0.0], [0.0, 1.0]], nonfood_count=1)
    img = Image.new("RGB", (8, 8))
    assert gate.nonfood_probability(img) == pytest.approx(scaled.nonfood_probability(img), abs=1e-6)


# ------------------------------------------------------------------ classifier + gate wiring
def logits_for(label: str) -> np.ndarray:
    logits = np.full((1, len(FOOD101_LABELS)), -10.0, dtype=np.float32)
    logits[0, FOOD101_LABELS.index(label)] = 10.0
    return logits


def make_classifier(gate=None, label="pizza"):
    session = FakeSession([logits_for(label)], input_names=("pixel_values",), output_names=("logits",))
    return OnnxFood101Predictor(session, PRE, FOOD101_LABELS, model_version="swin-test", top_k=3,
                                min_confidence=0.15, gate=gate), session


def test_classifier_returns_top_labels_and_feeds_a_nchw_tensor():
    predictor, session = make_classifier()
    result = predictor.predict(Image.new("RGB", (300, 200), (120, 80, 40)), b"raw")
    assert result.detections[0].label == "pizza"
    assert result.detections[0].confidence > 0.9
    assert result.mock is False and result.gate == "off" and result.model_version == "swin-test"
    assert session.feeds[0]["pixel_values"].shape == (1, 3, 224, 224)


def test_classifier_short_circuits_to_empty_detections_when_the_gate_rejects():
    gate = make_gate([0.0, 1.0], [[1.0, 0.0], [0.0, 1.0]], nonfood_count=1)
    predictor, session = make_classifier(gate=gate)
    result = predictor.predict(Image.new("RGB", (64, 64)), b"raw")
    assert result.detections == [] and result.gate == "notFood"
    assert session.feeds == [], "the classifier must not run once the gate says non-food"


def test_classifier_reports_gate_food_when_the_gate_passes():
    gate = make_gate([1.0, 0.0], [[1.0, 0.0], [0.0, 1.0]], nonfood_count=1)
    predictor, _ = make_classifier(gate=gate)
    assert predictor.predict(Image.new("RGB", (64, 64)), b"raw").gate == "food"
