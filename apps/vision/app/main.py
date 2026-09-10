"""FastAPI surface of the vision microservice.

    GET  /health       -> { ok, mock, modelLoaded, modelVersion }
    POST /v1/analyze   -> multipart `image` -> { detections[], modelVersion, mock, latencyMs, imageSize, gate }

The response shape is a contract with `apps/api/src/modules/vision/client.ts` — change one, change both
(and `apps/api/test/vision-contract.test.ts` will tell you if you forgot).

Design notes: the model is loaded eagerly in the lifespan (fail fast, never a 30 s first request),
inference runs in a worker thread behind a small semaphore, and every response carries `mock` so a
mis-set env var in production is impossible to miss.
"""
from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, File, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .imaging import ImageError, check_content_type, load_image
from .limiter import Busy, InferenceLimiter
from .predictor import ClipGate, MockPredictor, OnnxFood101Predictor, Predictor
from .settings import Settings, load_settings

log = logging.getLogger("vision")

ERROR_STATUS_MESSAGES = {404: ("NOT_FOUND", "Kayıt bulunamadı"), 405: ("METHOD_NOT_ALLOWED", "Geçersiz istek")}


def configure_logging(level: str) -> None:
    """uvicorn configures its own loggers and leaves the root one bare, so the service logger needs a
    handler of its own — otherwise the startup mode line (`mock: true`!) never reaches the operator."""
    resolved = getattr(logging, level.upper(), None)
    log.setLevel(resolved if isinstance(resolved, int) else logging.INFO)
    if not log.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(levelname)s:     %(message)s"))
        log.addHandler(handler)


def error_response(status: int, code: str, message: str, headers: dict[str, str] | None = None) -> JSONResponse:
    """Same envelope as the Node API (`{ error: { code, message } }`) so logs read the same on both sides."""
    return JSONResponse({"error": {"code": code, "message": message}}, status_code=status, headers=headers)


def build_predictor(settings: Settings) -> Predictor:
    """Mock when asked or when the weights are missing; otherwise ONNX, with the CLIP gate if enabled."""
    if settings.mock is True:
        log.warning("[vision] MOCK MODE — deterministic fake detections (VISION_MOCK=1)")
        return MockPredictor(top_k=settings.top_k)
    if not settings.model_available():
        if settings.mock is False:
            raise RuntimeError(
                f"[vision] VISION_MOCK=0 but no weights in MODEL_DIR={settings.model_dir} — "
                "run `python -m app.download` or unset VISION_MOCK to allow the mock fallback"
            )
        log.warning(
            "[vision] MOCK MODE — no weights in MODEL_DIR=%s (run `python -m app.download`). "
            "Every response will carry mock:true.", settings.model_dir,
        )
        return MockPredictor(top_k=settings.top_k)

    gate = None
    if settings.clip_enabled:
        if settings.clip_available():
            gate = ClipGate.load(settings)
            log.info("[vision] CLIP open-set gate enabled (threshold %.2f)", settings.clip_threshold)
        else:
            log.warning("[vision] CLIP_ENABLED=1 but no CLIP weights in %s — gate reported as 'off' "
                        "(run `python -m app.download --clip`)", settings.clip_dir)
    predictor = OnnxFood101Predictor.load(settings, gate=gate)
    log.info("[vision] model loaded: %s (%s labels, %d ORT threads)", predictor.model_version,
             len(predictor.labels), settings.intra_op_threads)
    return predictor


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()
    configure_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        log.info("[vision] starting with %s", settings.snapshot())
        app.state.predictor = build_predictor(settings)
        app.state.limiter = InferenceLimiter(settings.max_concurrency, settings.max_queue)
        yield

    app = FastAPI(title="FitFloow Vision", version="2.0.0", lifespan=lifespan, docs_url="/docs", redoc_url=None)
    app.state.settings = settings
    app.state.predictor = None
    app.state.limiter = InferenceLimiter(settings.max_concurrency, settings.max_queue)

    # --------------------------------------------------------------- errors
    @app.exception_handler(ImageError)
    async def _image_error(_request: Request, exc: ImageError):
        return error_response(exc.status, exc.code, exc.message)

    @app.exception_handler(Busy)
    async def _busy(_request: Request, exc: Busy):
        return error_response(exc.status, exc.code, exc.message, headers={"Retry-After": "1"})

    @app.exception_handler(RequestValidationError)
    async def _validation(_request: Request, exc: RequestValidationError):
        return error_response(422, "VALIDATION", "Geçersiz istek: 'image' alanı zorunlu")

    @app.exception_handler(StarletteHTTPException)
    async def _http(_request: Request, exc: StarletteHTTPException):
        code, message = ERROR_STATUS_MESSAGES.get(exc.status_code, ("ERROR", str(exc.detail)))
        return error_response(exc.status_code, code, message)

    @app.exception_handler(Exception)
    async def _unhandled(_request: Request, exc: Exception):  # pragma: no cover - defensive
        log.exception("[vision] unhandled error")
        return error_response(500, "INTERNAL", "Görüntü analizi başarısız oldu")

    # --------------------------------------------------------------- routes
    @app.get("/health")
    async def health() -> dict[str, Any]:
        predictor = app.state.predictor
        mock = True if predictor is None else bool(predictor.mock)
        return {
            "ok": True,
            "mock": mock,
            "modelLoaded": predictor is not None and not mock,
            "modelVersion": None if predictor is None else predictor.model_version,
        }

    @app.post("/v1/analyze")
    async def analyze(image: UploadFile = File(...)) -> JSONResponse:
        started = time.perf_counter()
        check_content_type(image.content_type)
        data = await image.read(settings.max_upload_bytes + 1)
        decoded = load_image(data, image.content_type, max_bytes=settings.max_upload_bytes,
                             max_side=settings.max_image_side)
        predictor: Predictor = app.state.predictor
        limiter: InferenceLimiter = app.state.limiter
        prediction = await limiter.run(lambda: predictor.predict(decoded.image, data))
        return JSONResponse({
            "detections": [{"label": d.label, "confidence": d.confidence, "bbox": d.bbox} for d in prediction.detections],
            "modelVersion": prediction.model_version,
            "mock": prediction.mock,
            "latencyMs": int(round((time.perf_counter() - started) * 1000)),
            "imageSize": [decoded.size[0], decoded.size[1]],
            "gate": prediction.gate,
        })

    return app


app = create_app()
