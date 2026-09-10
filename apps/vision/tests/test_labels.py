"""The label tables are the join key with the API's foods seed — integrity matters more than size."""
import json
import re
from pathlib import Path

import pytest

from app import labels as L

SNAKE = re.compile(r"^[a-z0-9]+(_[a-z0-9]+)*$")


def test_food101_has_exactly_101_unique_snake_case_labels():
    assert len(L.FOOD101_LABELS) == 101
    assert len(set(L.FOOD101_LABELS)) == 101
    assert all(SNAKE.match(x) for x in L.FOOD101_LABELS), [x for x in L.FOOD101_LABELS if not SNAKE.match(x)]
    assert L.FOOD101_LABELS[0] == "apple_pie" and L.FOOD101_LABELS[-1] == "waffles"
    for known in ("pizza", "hamburger", "omelette", "sushi", "steak", "baklava"):
        assert known in L.FOOD101_LABELS


def test_turkishfoods_has_exactly_25_unique_snake_case_labels():
    assert len(L.TURKISH25_LABELS) == 25
    assert len(set(L.TURKISH25_LABELS)) == 25
    assert all(SNAKE.match(x) for x in L.TURKISH25_LABELS)
    for known in ("lahmacun", "kuru_fasulye", "karniyarik", "manti", "yaprak_sarma"):
        assert known in L.TURKISH25_LABELS


def test_every_label_has_a_non_empty_turkish_name():
    for label in (*L.FOOD101_LABELS, *L.TURKISH25_LABELS, *L.MOCK_LABELS):
        name = L.TR_NAMES[label]
        assert name and name.strip() == name and name[0].isupper(), label


def test_turkish_names_have_no_stray_duplicates_inside_one_table():
    names = [L.TR_NAMES[x] for x in L.FOOD101_LABELS]
    assert len(set(names)) == len(names), "two Food-101 classes cannot share one Turkish name"


def test_tr_name_falls_back_gracefully_for_unknown_labels():
    assert L.tr_name("pizza") == "Pizza"
    assert L.tr_name("some_new_class") == "Some new class"


def test_mock_labels_mirror_the_node_client_byte_for_byte():
    """apps/api/src/modules/vision/client.ts MOCK_LABELS — order is part of the contract (index = hash byte % len)."""
    source = (Path(__file__).resolve().parents[3] / "apps/api/src/modules/vision/client.ts").read_text(encoding="utf-8")
    raw = re.search(r"MOCK_LABELS\s*=\s*\[(.*?)\]", source, re.S)
    assert raw, "MOCK_LABELS not found in the Node client"
    node_labels = [m.group(1) for m in re.finditer(r'"([^"]+)"', raw.group(1))]
    assert list(L.MOCK_LABELS) == node_labels


def test_clip_prompts_cover_both_sides_of_the_gate():
    assert len(L.CLIP_FOOD_PROMPTS) >= 2 and len(L.CLIP_NONFOOD_PROMPTS) >= 4
    assert all(p == p.lower() for p in (*L.CLIP_FOOD_PROMPTS, *L.CLIP_NONFOOD_PROMPTS))
    assert not set(L.CLIP_FOOD_PROMPTS) & set(L.CLIP_NONFOOD_PROMPTS)


@pytest.mark.model
def test_food101_labels_match_the_downloaded_model_config(model_config):
    id2label = model_config["id2label"]
    assert [id2label[str(i)] for i in range(len(id2label))] == list(L.FOOD101_LABELS)
