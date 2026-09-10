"""Settings are read from the environment only — no globals, no import-time side effects."""
from pathlib import Path

import pytest

from app.settings import Settings, load_settings, parse_bool


def test_defaults_match_the_documented_contract():
    s = load_settings({})
    assert s.mock is None  # unset -> auto (mock only if the model is missing)
    assert s.model_id == "onnx-community/swin-finetuned-food101-ONNX"
    assert s.model_file == "onnx/model_quantized.onnx"
    assert s.clip_enabled is False
    assert s.turkish_head is False
    assert s.top_k == 3
    assert s.min_confidence == pytest.approx(0.15)
    assert s.intra_op_threads == 4
    assert s.max_upload_mb == 6
    assert s.model_dir == Path(__file__).resolve().parent.parent / "models"


def test_model_paths_are_derived_from_model_dir(tmp_path):
    s = load_settings({"MODEL_DIR": str(tmp_path), "MODEL_FILE": "onnx/model_quantized.onnx"})
    assert s.model_path == tmp_path / "onnx" / "model_quantized.onnx"
    assert s.config_path == tmp_path / "config.json"
    assert s.preprocessor_path == tmp_path / "preprocessor_config.json"
    assert s.clip_dir == tmp_path / "clip"
    assert s.model_available() is False
    s.model_path.parent.mkdir(parents=True)
    s.model_path.write_bytes(b"x")
    s.config_path.write_text("{}")
    s.preprocessor_path.write_text("{}")
    assert s.model_available() is True


def test_max_upload_bytes():
    assert load_settings({"MAX_UPLOAD_MB": "2"}).max_upload_bytes == 2 * 1024 * 1024


@pytest.mark.parametrize("raw,expected", [("1", True), ("true", True), ("TRUE", True), ("yes", True), ("on", True),
                                          ("0", False), ("false", False), ("", False), ("no", False), ("off", False)])
def test_parse_bool_matches_the_node_config_semantics(raw, expected):
    """apps/api/src/config.ts zBool: "1"|"true"|"yes"|"on" -> true, everything else false."""
    assert parse_bool(raw) is expected


def test_parse_bool_returns_none_when_unset():
    assert parse_bool(None) is None


def test_env_overrides_are_typed():
    s = load_settings({"VISION_MOCK": "1", "TOP_K": "5", "MIN_CONFIDENCE": "0.4", "INTRA_OP_THREADS": "2",
                       "MAX_UPLOAD_MB": "12", "CLIP_ENABLED": "true", "TURKISH_HEAD": "1"})
    assert (s.mock, s.top_k, s.min_confidence, s.intra_op_threads, s.max_upload_mb) == (True, 5, 0.4, 2, 12)
    assert s.clip_enabled is True and s.turkish_head is True


def test_invalid_numbers_fall_back_to_defaults_instead_of_crashing_the_service():
    s = load_settings({"TOP_K": "abc", "MIN_CONFIDENCE": "", "MAX_UPLOAD_MB": "-3"})
    assert s.top_k == 3
    assert s.min_confidence == pytest.approx(0.15)
    assert s.max_upload_mb == 6


def test_settings_is_immutable():
    s = load_settings({})
    with pytest.raises(Exception):
        s.top_k = 9  # type: ignore[misc]


def test_snapshot_is_json_safe_for_logging():
    snap = load_settings({"VISION_MOCK": "1"}).snapshot()
    assert snap["modelId"] == "onnx-community/swin-finetuned-food101-ONNX"
    assert snap["mock"] is True
    assert isinstance(snap["modelDir"], str)
