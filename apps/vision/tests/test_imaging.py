"""Upload validation + decode. Everything a hostile client can send must fail as a typed error."""
import io

import pytest
from PIL import Image

from app.imaging import (
    InvalidImage,
    PayloadTooLarge,
    UnsupportedMediaType,
    check_content_type,
    load_image,
)
from tests.conftest import png_bytes


def jpeg_bytes(width=40, height=20, orientation: int | None = None) -> bytes:
    img = Image.new("RGB", (width, height), (10, 120, 200))
    buf = io.BytesIO()
    if orientation is None:
        img.save(buf, format="JPEG")
    else:
        exif = Image.Exif()
        exif[0x0112] = orientation
        img.save(buf, format="JPEG", exif=exif)
    return buf.getvalue()


@pytest.mark.parametrize("raw", ["image/jpeg", "image/png", "image/webp", "IMAGE/JPEG", "image/jpeg; charset=binary", " image/png "])
def test_accepted_content_types(raw):
    assert check_content_type(raw).startswith("image/")


@pytest.mark.parametrize("raw", [None, "", "text/plain", "application/pdf", "application/octet-stream", "image/gif", "image/svg+xml"])
def test_rejected_content_types(raw):
    with pytest.raises(UnsupportedMediaType) as e:
        check_content_type(raw)
    assert e.value.status == 415 and e.value.code == "UNSUPPORTED_MEDIA_TYPE"


def test_load_image_returns_rgb_and_the_original_size():
    decoded = load_image(png_bytes(64, 48), "image/png", max_bytes=1 << 20, max_side=1024)
    assert decoded.size == (64, 48)
    assert decoded.image.mode == "RGB"
    assert decoded.image.size == (64, 48)


def test_load_image_downscales_large_photos_but_reports_the_original_size():
    decoded = load_image(png_bytes(2000, 1000), "image/png", max_bytes=8 << 20, max_side=1024)
    assert decoded.size == (2000, 1000), "imageSize must describe what the user uploaded"
    assert max(decoded.image.size) == 1024
    assert decoded.image.size == (1024, 512), "aspect ratio must be preserved"


def test_load_image_never_upscales_small_photos():
    decoded = load_image(png_bytes(32, 32), "image/png", max_bytes=1 << 20, max_side=1024)
    assert decoded.image.size == (32, 32)


def test_oversize_upload_is_rejected_before_decoding():
    data = png_bytes(600, 600)
    with pytest.raises(PayloadTooLarge) as e:
        load_image(data, "image/png", max_bytes=16, max_side=1024)
    assert e.value.status == 413 and e.value.code == "PAYLOAD_TOO_LARGE"
    assert "MB" in e.value.message, "the Turkish message must name the limit"


def test_empty_upload_is_rejected():
    with pytest.raises(InvalidImage):
        load_image(b"", "image/png", max_bytes=1 << 20, max_side=1024)


def test_corrupt_bytes_are_rejected_as_invalid_image():
    with pytest.raises(InvalidImage) as e:
        load_image(b"not really a png" * 10, "image/png", max_bytes=1 << 20, max_side=1024)
    assert e.value.status == 400 and e.value.code == "INVALID_IMAGE"


def test_wrong_content_type_is_rejected_before_anything_else():
    with pytest.raises(UnsupportedMediaType):
        load_image(png_bytes(), "text/plain", max_bytes=1 << 20, max_side=1024)


def test_exif_orientation_is_applied():
    """Phone photos are stored rotated; a 90° EXIF flag must swap the reported dimensions."""
    upright = load_image(jpeg_bytes(40, 20), "image/jpeg", max_bytes=1 << 20, max_side=1024)
    rotated = load_image(jpeg_bytes(40, 20, orientation=6), "image/jpeg", max_bytes=1 << 20, max_side=1024)
    assert upright.size == (40, 20)
    assert rotated.size == (20, 40)
    assert rotated.image.size == (20, 40)


def test_decompression_bomb_is_rejected(monkeypatch):
    import app.imaging as imaging

    monkeypatch.setattr(imaging, "MAX_PIXELS", 100)
    with pytest.raises(InvalidImage):
        load_image(png_bytes(64, 48), "image/png", max_bytes=1 << 20, max_side=1024)


def test_palette_and_grayscale_images_are_converted_to_rgb():
    buf = io.BytesIO()
    Image.new("L", (30, 30), 128).save(buf, format="PNG")
    decoded = load_image(buf.getvalue(), "image/png", max_bytes=1 << 20, max_side=1024)
    assert decoded.image.mode == "RGB"
