"""End-to-end HTTP contract. Every assertion here mirrors apps/api/src/modules/vision/client.ts."""
import asyncio
import io
import time

import httpx
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.main import create_app
from app.predictor import Detection, MockPredictor, Prediction
from app.settings import load_settings
from tests.conftest import png_bytes

ANALYZE_KEYS = {"detections", "modelVersion", "mock", "latencyMs", "imageSize", "gate"}
HEALTH_KEYS = {"ok", "mock", "modelLoaded", "modelVersion"}


@pytest.fixture
def client():
    app = create_app(load_settings({"VISION_MOCK": "1"}))
    with TestClient(app) as c:
        yield c


def post_image(client, data: bytes, content_type: str = "image/png", field: str = "image"):
    return client.post("/v1/analyze", files={field: ("scan.png", data, content_type)})


# ------------------------------------------------------------------------ health
def test_health_shape_is_exactly_what_the_node_client_reads(client):
    body = client.get("/health").json()
    assert set(body) == HEALTH_KEYS
    assert body == {"ok": True, "mock": True, "modelLoaded": False, "modelVersion": "mock"}


def test_health_is_served_even_while_inference_slots_are_busy(client):
    client.app.state.limiter.waiting = 99
    assert client.get("/health").status_code == 200


# ------------------------------------------------------------------------ analyze (mock mode)
def test_analyze_returns_the_contract_shape(client, png):
    response = post_image(client, png)
    assert response.status_code == 200
    body = response.json()
    assert set(body) == ANALYZE_KEYS
    assert body["mock"] is True
    assert body["modelVersion"] == "mock"
    assert body["gate"] == "off"
    assert body["imageSize"] == [64, 48]
    assert isinstance(body["latencyMs"], int) and body["latencyMs"] >= 0
    assert len(body["detections"]) == 3
    for detection in body["detections"]:
        assert set(detection) == {"label", "confidence", "bbox"}
        assert isinstance(detection["label"], str) and detection["bbox"] is None
        assert 0.0 <= detection["confidence"] <= 1.0


def test_analyze_is_deterministic_for_the_same_bytes(client, png):
    first = post_image(client, png).json()["detections"]
    second = post_image(client, png).json()["detections"]
    assert first == second


def test_analyze_matches_the_mock_predictor_for_those_exact_bytes(client, png):
    expected = MockPredictor(top_k=3).predict(Image.new("RGB", (1, 1)), png)
    assert [d["label"] for d in post_image(client, png).json()["detections"]] == [d.label for d in expected.detections]


def test_different_images_produce_different_answers(client):
    a = post_image(client, png_bytes(color=(10, 10, 10))).json()["detections"]
    b = post_image(client, png_bytes(color=(250, 250, 250))).json()["detections"]
    assert [d["label"] for d in a] != [d["label"] for d in b]


def test_confidences_are_descending(client, png):
    scores = [d["confidence"] for d in post_image(client, png).json()["detections"]]
    assert scores == sorted(scores, reverse=True)


def test_jpeg_uploads_are_accepted(client):
    buf = io.BytesIO()
    Image.new("RGB", (30, 30), (7, 7, 7)).save(buf, format="JPEG")
    assert post_image(client, buf.getvalue(), "image/jpeg").status_code == 200


def test_image_size_reports_the_uploaded_dimensions_not_the_downscaled_ones(client):
    body = post_image(client, png_bytes(1600, 1200)).json()
    assert body["imageSize"] == [1600, 1200]


# ------------------------------------------------------------------------ failure modes
def test_wrong_content_type_is_415(client, png):
    response = post_image(client, png, "text/plain")
    assert response.status_code == 415
    assert response.json()["error"]["code"] == "UNSUPPORTED_MEDIA_TYPE"


def test_oversize_upload_is_413():
    app = create_app(load_settings({"VISION_MOCK": "1", "MAX_UPLOAD_MB": "1"}))
    with TestClient(app) as c:
        response = post_image(c, b"\x89PNG\r\n\x1a\n" + b"0" * (2 * 1024 * 1024))
        assert response.status_code == 413
        assert response.json()["error"]["code"] == "PAYLOAD_TOO_LARGE"


def test_corrupt_image_is_400(client):
    response = post_image(client, b"definitely not a png")
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_IMAGE"


def test_missing_image_field_is_a_validation_error(client, png):
    response = post_image(client, png, field="photo")
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION"


def test_unknown_route_is_a_json_error_not_html(client):
    response = client.get("/v1/nope")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


# ------------------------------------------------------------------------ overload
class SlowPredictor:
    mock = True
    model_version = "slow"

    def predict(self, image, data):
        time.sleep(0.25)
        return Prediction([Detection("pizza", 0.9)], "slow", True, "off")


async def test_overload_returns_429_instead_of_queueing_forever(png):
    from app.limiter import InferenceLimiter

    app = create_app(load_settings({"VISION_MOCK": "1"}))
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://vision") as c:
        # ASGITransport does not run the lifespan, so wire the state this case needs by hand.
        app.state.predictor = SlowPredictor()
        app.state.limiter = InferenceLimiter(concurrency=1, max_queue=0)
        files = {"image": ("scan.png", png, "image/png")}
        responses = await asyncio.gather(*(c.post("/v1/analyze", files=files) for _ in range(4)))
    codes = sorted(r.status_code for r in responses)
    assert 429 in codes, codes
    assert 200 in codes
    busy = next(r for r in responses if r.status_code == 429)
    assert busy.json()["error"]["code"] == "BUSY"
    assert busy.headers.get("retry-after") == "1"


# ------------------------------------------------------------------------ startup behaviour
def test_service_falls_back_to_mock_when_weights_are_missing_and_vision_mock_is_unset(tmp_path, caplog):
    app = create_app(load_settings({"MODEL_DIR": str(tmp_path)}))
    with TestClient(app) as c:
        assert c.get("/health").json() == {"ok": True, "mock": True, "modelLoaded": False, "modelVersion": "mock"}
    assert any("mock" in record.message.lower() for record in caplog.records), "the fallback must log loudly"


def test_service_refuses_to_start_in_real_mode_without_weights(tmp_path):
    app = create_app(load_settings({"MODEL_DIR": str(tmp_path), "VISION_MOCK": "0"}))
    with pytest.raises(RuntimeError, match="MODEL_DIR"):
        with TestClient(app):
            pass


# ------------------------------------------------------------------------ logging
def test_startup_logs_the_effective_configuration(caplog):
    """Under uvicorn the root logger has no handler, so the service must configure its own —
    otherwise `mock: true` in production is silent."""
    import logging

    caplog.set_level(logging.INFO, logger="vision")
    app = create_app(load_settings({"VISION_MOCK": "1", "LOG_LEVEL": "info"}))
    with TestClient(app):
        pass
    messages = " ".join(r.message % r.args if r.args else r.message for r in caplog.records)
    assert "modelId" in messages or "starting with" in messages
    assert logging.getLogger("vision").handlers, "the 'vision' logger must own a handler"
    assert logging.getLogger("vision").level == logging.INFO


def test_log_level_is_configurable():
    import logging

    create_app(load_settings({"VISION_MOCK": "1", "LOG_LEVEL": "warning"}))
    assert logging.getLogger("vision").level == logging.WARNING
    create_app(load_settings({"VISION_MOCK": "1", "LOG_LEVEL": "nonsense"}))
    assert logging.getLogger("vision").level == logging.INFO, "an unknown level falls back to info"
