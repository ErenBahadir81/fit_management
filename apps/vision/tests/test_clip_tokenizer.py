"""Pure-python CLIP BPE. Expected ids are read from the model's own vocab.json, never from memory."""
import json

import pytest

from app.clip_tokenizer import ClipTokenizer, bytes_to_unicode
from app.settings import load_settings

pytestmark = pytest.mark.model


@pytest.fixture(scope="module")
def tokenizer():
    return ClipTokenizer.load(load_settings().clip_dir)


@pytest.fixture(scope="module")
def vocab():
    return json.loads((load_settings().clip_dir / "vocab.json").read_text(encoding="utf-8"))


def test_bytes_to_unicode_is_a_bijection_over_256_bytes():
    mapping = bytes_to_unicode()
    assert len(mapping) == 256 and len(set(mapping.values())) == 256


def test_encodes_a_simple_prompt_to_the_expected_vocabulary_ids(tokenizer, vocab):
    ids = tokenizer.encode("a photo of food")
    assert ids == [vocab["<|startoftext|>"], vocab["a</w>"], vocab["photo</w>"], vocab["of</w>"],
                   vocab["food</w>"], vocab["<|endoftext|>"]]


def test_lowercases_and_collapses_whitespace(tokenizer):
    assert tokenizer.encode("  A   PHOTO of\tfood ") == tokenizer.encode("a photo of food")


def test_punctuation_is_split_off(tokenizer, vocab):
    ids = tokenizer.encode("food, please")
    assert vocab["food</w>"] in ids and vocab[",</w>"] in ids


def test_unknown_words_fall_back_to_subword_pieces(tokenizer):
    ids = tokenizer.encode("mercimekcorbasi")
    assert len(ids) > 3 and ids[0] == tokenizer.sot and ids[-1] == tokenizer.eot


def test_encode_batch_pads_to_a_rectangular_int64_array(tokenizer):
    input_ids, attention_mask = tokenizer.encode_batch(["a photo of food", "a photo of a person holding a camera"])
    assert input_ids.shape == attention_mask.shape
    assert input_ids.shape[0] == 2 and input_ids.dtype.name == "int64"
    assert attention_mask[0].sum() < attention_mask[1].sum()
    assert int(input_ids[0][attention_mask[0].sum() - 1]) == tokenizer.eot, "eot must end the real tokens"
    assert set(int(x) for x in input_ids[0][attention_mask[0].sum():]) <= {tokenizer.eot}, "padding is the eot token"
