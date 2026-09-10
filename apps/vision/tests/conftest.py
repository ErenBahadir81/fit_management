"""Shared fixtures. Model-backed tests are opt-in: RUN_MODEL_TESTS=1 and the weights on disk."""
import io
import json
import os

import pytest
from PIL import Image

from app.settings import load_settings

RUN_MODEL_TESTS = os.environ.get("RUN_MODEL_TESTS", "") in ("1", "true", "yes", "on")


def pytest_collection_modifyitems(config, items):
    settings = load_settings()
    reason = (
        "set RUN_MODEL_TESTS=1 to run model-backed tests"
        if not RUN_MODEL_TESTS
        else f"weights missing in {settings.model_dir} — run `python -m app.download`"
    )
    if RUN_MODEL_TESTS and settings.model_available():
        return
    skip = pytest.mark.skip(reason=reason)
    for item in items:
        if "model" in item.keywords:
            item.add_marker(skip)


@pytest.fixture(scope="session")
def settings():
    return load_settings()


@pytest.fixture(scope="session")
def model_config(settings):
    return json.loads(settings.config_path.read_text(encoding="utf-8"))


def png_bytes(width: int = 64, height: int = 48, color: tuple[int, int, int] = (200, 90, 40)) -> bytes:
    """Deterministic PNG: identical arguments always produce identical bytes."""
    buf = io.BytesIO()
    Image.new("RGB", (width, height), color).save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture
def png():
    return png_bytes()


class FakeIO:
    def __init__(self, name: str):
        self.name = name


class FakeSession:
    """Stand-in for an onnxruntime InferenceSession: records feeds, returns canned outputs."""

    def __init__(self, outputs, input_names=("pixel_values",), output_names=("logits",)):
        self._outputs = outputs
        self._input_names = input_names
        self._output_names = output_names
        self.feeds = []

    def get_inputs(self):
        return [FakeIO(n) for n in self._input_names]

    def get_outputs(self):
        return [FakeIO(n) for n in self._output_names]

    def run(self, _requested, feeds):
        self.feeds.append(feeds)
        return list(self._outputs)
