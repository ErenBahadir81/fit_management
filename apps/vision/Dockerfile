# FitFloow vision microservice — CPU only, no torch (≈330 MB total: 237 MB deps + 93 MB weights).
# Build context is apps/vision:  docker build -t fitfloow-vision apps/vision
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    MODEL_DIR=/models \
    INTRA_OP_THREADS=4 \
    OMP_NUM_THREADS=4

WORKDIR /srv

# curl is only here for the container HEALTHCHECK below.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY pytest.ini ./
COPY tests ./tests

# Bake the weights into the image (research §6.3): no HuggingFace dependency on cold start.
# Skip with `--build-arg DOWNLOAD_MODEL=0` for a mock-only image; add DOWNLOAD_CLIP=1 for the open-set gate.
ARG DOWNLOAD_MODEL=1
ARG DOWNLOAD_CLIP=0
RUN mkdir -p "$MODEL_DIR" \
 && if [ "$DOWNLOAD_MODEL" = "1" ]; then \
      if [ "$DOWNLOAD_CLIP" = "1" ]; then python -m app.download --clip; else python -m app.download; fi; \
    fi

RUN useradd --system --uid 10001 --home /srv vision && chown -R vision /srv "$MODEL_DIR"
USER vision

EXPOSE 8100
HEALTHCHECK --interval=30s --timeout=3s --start-period=25s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8100/health || exit 1

# One worker on purpose: ORT already uses INTRA_OP_THREADS cores (research §6.4 — 4 workers × 4 threads
# on 4 cores is the oversubscription that produced a 20× bogus latency reading).
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8100", "--workers", "1"]
