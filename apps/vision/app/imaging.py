"""Upload validation and decoding.

Order is deliberate: content type -> byte size -> decode -> EXIF -> downscale. Rejecting on the cheap
checks first means a hostile 50 MB "image/png" never reaches Pillow. User-facing messages are Turkish.
"""
from __future__ import annotations

import io
from dataclasses import dataclass

from PIL import Image, ImageOps, UnidentifiedImageError

ALLOWED_CONTENT_TYPES: frozenset[str] = frozenset({"image/jpeg", "image/jpg", "image/png", "image/webp"})

MAX_PIXELS = 50_000_000
"""Decompression-bomb guard (a 50 MP image is already far beyond any phone camera)."""


class ImageError(Exception):
    """Base class for anything wrong with an upload. `status`/`code` map straight onto the HTTP response."""

    status = 400
    code = "INVALID_IMAGE"

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class UnsupportedMediaType(ImageError):
    status = 415
    code = "UNSUPPORTED_MEDIA_TYPE"


class PayloadTooLarge(ImageError):
    status = 413
    code = "PAYLOAD_TOO_LARGE"


class InvalidImage(ImageError):
    status = 400
    code = "INVALID_IMAGE"


@dataclass(frozen=True, slots=True)
class DecodedImage:
    image: Image.Image
    """RGB, EXIF-corrected, downscaled to `max_side` — ready for the predictor."""
    size: tuple[int, int]
    """Dimensions of what the user actually uploaded (after EXIF rotation, before downscaling)."""


def check_content_type(raw: str | None) -> str:
    """Normalize `image/jpeg; charset=binary` -> `image/jpeg`, or raise 415."""
    value = (raw or "").split(";")[0].strip().lower()
    if value not in ALLOWED_CONTENT_TYPES:
        raise UnsupportedMediaType("Yalnızca JPEG, PNG veya WEBP fotoğraf yükleyebilirsiniz")
    return value


def load_image(data: bytes, content_type: str | None, *, max_bytes: int, max_side: int) -> DecodedImage:
    check_content_type(content_type)
    if len(data) > max_bytes:
        limit_mb = max_bytes / (1024 * 1024)
        raise PayloadTooLarge(f"Fotoğraf çok büyük (en fazla {limit_mb:.0f} MB)")
    if not data:
        raise InvalidImage("Fotoğraf boş")
    try:
        with Image.open(io.BytesIO(data)) as opened:
            width, height = opened.size
            if width * height > MAX_PIXELS:
                raise InvalidImage("Fotoğraf çözünürlüğü çok yüksek")
            opened.load()
            image = ImageOps.exif_transpose(opened) or opened
            image = image.convert("RGB")
    except InvalidImage:
        raise
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
        raise InvalidImage("Fotoğraf okunamadı") from exc

    original = image.size
    longest = max(original)
    if longest > max_side:
        scale = max_side / longest
        image = image.resize((max(1, round(original[0] * scale)), max(1, round(original[1] * scale))), Image.BILINEAR)
    return DecodedImage(image=image, size=original)
