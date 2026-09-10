"""`python -m app.download` fetches weights from the HF CDN. Network is faked here."""
import io
from pathlib import Path

import pytest

from app import download as dl


def test_resolve_url_uses_the_hf_resolve_endpoint():
    assert dl.resolve_url("onnx-community/swin-finetuned-food101-ONNX", "onnx/model_quantized.onnx") == (
        "https://huggingface.co/onnx-community/swin-finetuned-food101-ONNX/resolve/main/onnx/model_quantized.onnx"
    )
    assert dl.resolve_url("a/b", "c.json", revision="v1", endpoint="https://mirror.test") == "https://mirror.test/a/b/resolve/v1/c.json"


class FakeResponse(io.BytesIO):
    def __init__(self, payload: bytes):
        super().__init__(payload)
        self.headers = {"Content-Length": str(len(payload))}
        self.status = 200

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()
        return False


def test_download_file_writes_atomically_and_reports_size(tmp_path, monkeypatch):
    calls: list[str] = []
    monkeypatch.setattr(dl, "_open", lambda url, method="GET": (calls.append(f"{method} {url}"), FakeResponse(b"weights"))[1])
    result = dl.download_file("https://x/y.onnx", tmp_path / "sub" / "y.onnx")
    assert result.size == 7 and result.skipped is False
    assert (tmp_path / "sub" / "y.onnx").read_bytes() == b"weights"
    assert not list(tmp_path.glob("**/*.part")), "temp files must be cleaned up"
    assert calls == ["GET https://x/y.onnx"]


def test_download_file_is_idempotent_when_the_size_matches(tmp_path, monkeypatch):
    dest = tmp_path / "y.onnx"
    dest.write_bytes(b"weights")
    monkeypatch.setattr(dl, "_open", lambda url, method="GET": FakeResponse(b"weights"))
    result = dl.download_file("https://x/y.onnx", dest)
    assert result.skipped is True and result.size == 7


def test_download_file_refetches_when_the_local_file_is_truncated(tmp_path, monkeypatch):
    dest = tmp_path / "y.onnx"
    dest.write_bytes(b"trunc")
    monkeypatch.setattr(dl, "_open", lambda url, method="GET": FakeResponse(b"weights"))
    assert dl.download_file("https://x/y.onnx", dest).skipped is False
    assert dest.read_bytes() == b"weights"


def test_download_file_leaves_the_old_file_in_place_when_the_transfer_fails(tmp_path, monkeypatch):
    dest = tmp_path / "y.onnx"
    dest.write_bytes(b"old")

    def boom(url, method="GET"):
        raise OSError("connection reset")

    monkeypatch.setattr(dl, "_open", boom)
    with pytest.raises(OSError):
        dl.download_file("https://x/y.onnx", dest)
    assert dest.read_bytes() == b"old"
    assert not list(tmp_path.glob("*.part"))


def test_plan_lists_the_three_primary_artefacts(tmp_path):
    from app.settings import load_settings

    plan = dl.plan(load_settings({"MODEL_DIR": str(tmp_path)}), clip=False)
    assert [p.dest.relative_to(tmp_path).as_posix() for p in plan] == [
        "config.json",
        "preprocessor_config.json",
        "onnx/model_quantized.onnx",
    ]
    assert all(p.url.startswith("https://huggingface.co/onnx-community/swin-finetuned-food101-ONNX/resolve/main/") for p in plan)


def test_plan_adds_the_clip_gate_files_when_requested(tmp_path):
    from app.settings import load_settings

    plan = dl.plan(load_settings({"MODEL_DIR": str(tmp_path)}), clip=True)
    clip = [p for p in plan if "/clip/" in p.dest.as_posix()]
    assert {p.dest.name for p in clip} >= {"vocab.json", "merges.txt"}
    assert all("Xenova/clip-vit-base-patch32" in p.url for p in clip)


def test_main_downloads_the_plan_and_prints_sizes(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(dl, "_open", lambda url, method="GET": FakeResponse(b"0" * 1024))
    code = dl.main(["--model-dir", str(tmp_path)])
    assert code == 0
    out = capsys.readouterr().out
    assert "config.json" in out and "1.0 KB" in out
    assert (tmp_path / "onnx" / "model_quantized.onnx").is_file()


def test_human_size():
    assert dl.human_size(0) == "0 B"
    assert dl.human_size(1024) == "1.0 KB"
    assert dl.human_size(93_297_500) == "89.0 MB"
