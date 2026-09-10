"""Fetch model weights into MODEL_DIR.

    python -m app.download            # primary Food-101 classifier (~93 MB)
    python -m app.download --clip     # + the open-set CLIP gate (~120 MB)

Uses `urllib` only (no huggingface_hub dependency): HF `resolve` URLs 302-redirect to their CDN and
urllib follows redirects by default. Proxies come from the standard `http(s)_proxy` env vars and the
CA bundle from `SSL_CERT_FILE`. The service NEVER downloads at request time — this runs at build/dev time.

Idempotent: a file whose size already matches the remote `Content-Length` is skipped, so re-running is cheap.
"""
from __future__ import annotations

import argparse
import os
import shutil
import sys
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from .settings import Settings, load_settings

HF_ENDPOINT = os.environ.get("HF_ENDPOINT", "https://huggingface.co").rstrip("/")
USER_AGENT = "fitfloow-vision/2.0 (+model download; contact: dev@fitfloow.app)"
CHUNK = 1 << 20

CLIP_FILES = (
    "config.json",
    "preprocessor_config.json",
    "vocab.json",
    "merges.txt",
    "onnx/text_model_quantized.onnx",
    "onnx/vision_model_quantized.onnx",
)


def resolve_url(repo: str, filename: str, revision: str = "main", endpoint: str = HF_ENDPOINT) -> str:
    return f"{endpoint.rstrip('/')}/{repo}/resolve/{revision}/{filename}"


def human_size(n: int) -> str:
    step = 1024.0
    value = float(n)
    for unit in ("B", "KB", "MB", "GB"):
        if value < step or unit == "GB":
            return f"{int(value)} {unit}" if unit == "B" else f"{value:.1f} {unit}"
        value /= step
    return f"{value:.1f} GB"  # pragma: no cover


def _open(url: str, method: str = "GET"):
    req = urllib.request.Request(url, method=method, headers={"User-Agent": USER_AGENT, "Accept": "*/*"})
    return urllib.request.urlopen(req, timeout=120)  # noqa: S310 — https URLs from a constant endpoint


@dataclass(frozen=True, slots=True)
class Artifact:
    url: str
    dest: Path


@dataclass(frozen=True, slots=True)
class Result:
    dest: Path
    size: int
    skipped: bool


def download_file(url: str, dest: Path, *, force: bool = False) -> Result:
    """Download `url` to `dest` atomically. Skips when the local size already matches the remote one."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    with _open(url) as response:
        remote = response.headers.get("Content-Length")
        remote_size = int(remote) if remote is not None and str(remote).isdigit() else None
        if not force and dest.is_file() and remote_size is not None and dest.stat().st_size == remote_size:
            return Result(dest, remote_size, True)
        try:
            with open(tmp, "wb") as out:
                shutil.copyfileobj(response, out, CHUNK)
        except BaseException:
            tmp.unlink(missing_ok=True)
            raise
    os.replace(tmp, dest)
    return Result(dest, dest.stat().st_size, False)


def plan(settings: Settings, *, clip: bool = False) -> list[Artifact]:
    items = [
        Artifact(resolve_url(settings.model_id, name, settings.model_revision), settings.model_dir / name)
        for name in ("config.json", "preprocessor_config.json", settings.model_file)
    ]
    if clip:
        items += [
            Artifact(resolve_url(settings.clip_model_id, name), settings.clip_dir / name) for name in CLIP_FILES
        ]
    return items


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.download", description="Download vision model weights.")
    parser.add_argument("--model-dir", help="target directory (default: MODEL_DIR or apps/vision/models)")
    parser.add_argument("--clip", action="store_true", help="also fetch the open-set CLIP gate")
    parser.add_argument("--force", action="store_true", help="re-download even if the size matches")
    args = parser.parse_args(argv)

    env = dict(os.environ)
    if args.model_dir:
        env["MODEL_DIR"] = args.model_dir
    settings = load_settings(env)
    artifacts = plan(settings, clip=args.clip)
    print(f"[download] {settings.model_id} -> {settings.model_dir}")
    total = 0
    for item in artifacts:
        try:
            result = download_file(item.url, item.dest, force=args.force)
        except Exception as exc:  # noqa: BLE001 — a failed file must name itself, then stop the run
            print(f"[download] FAILED {item.dest.name}: {exc}", file=sys.stderr)
            return 1
        total += result.size
        print(f"[download] {'skip' if result.skipped else 'get '} {item.dest.relative_to(settings.model_dir)}  {human_size(result.size)}")
    print(f"[download] done — {human_size(total)} in {settings.model_dir}")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
