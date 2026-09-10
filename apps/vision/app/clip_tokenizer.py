"""Minimal CLIP byte-pair tokenizer (vocab.json + merges.txt), in pure Python.

The service tokenizes a handful of *constant* English prompts at startup and nothing else, so this
deliberately avoids pulling in `transformers`/`tokenizers` (120 MB+) for ~60 lines of BPE.
Scope: lowercase ASCII prompts. It is not a general-purpose CLIP tokenizer — see `CLIP_FOOD_PROMPTS`.
"""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

import numpy as np

PATTERN = re.compile(r"<\|startoftext\|>|<\|endoftext\|>|'s|'t|'re|'ve|'m|'ll|'d|[a-zçğıöşü]+|[0-9]|[^\sa-zçğıöşü0-9]+")


@lru_cache(maxsize=1)
def bytes_to_unicode() -> dict[int, str]:
    """GPT-2/CLIP byte encoder: every byte gets a printable unicode stand-in."""
    printable = list(range(ord("!"), ord("~") + 1)) + list(range(ord("¡"), ord("¬") + 1)) + list(range(ord("®"), ord("ÿ") + 1))
    mapped = printable[:]
    extra = 0
    for byte in range(256):
        if byte not in printable:
            printable.append(byte)
            mapped.append(256 + extra)
            extra += 1
    return dict(zip(printable, (chr(c) for c in mapped)))


def _pairs(word: tuple[str, ...]) -> set[tuple[str, str]]:
    return {(word[i], word[i + 1]) for i in range(len(word) - 1)}


class ClipTokenizer:
    def __init__(self, encoder: dict[str, int], ranks: dict[tuple[str, str], int]):
        self.encoder = encoder
        self.ranks = ranks
        self.byte_encoder = bytes_to_unicode()
        self.sot = encoder["<|startoftext|>"]
        self.eot = encoder["<|endoftext|>"]
        self._cache: dict[str, list[str]] = {}

    @classmethod
    def load(cls, clip_dir: Path) -> "ClipTokenizer":
        encoder = json.loads((clip_dir / "vocab.json").read_text(encoding="utf-8"))
        lines = (clip_dir / "merges.txt").read_text(encoding="utf-8").splitlines()
        if lines and lines[0].startswith("#"):
            lines = lines[1:]
        ranks = {}
        for rank, line in enumerate(lines):
            parts = line.split()
            if len(parts) == 2:
                ranks[(parts[0], parts[1])] = rank
        return cls(encoder, ranks)

    def _bpe(self, token: str) -> list[str]:
        cached = self._cache.get(token)
        if cached is not None:
            return cached
        word = tuple(token[:-1]) + (token[-1] + "</w>",)
        while len(word) > 1:
            pairs = _pairs(word)
            best = min(pairs, key=lambda p: self.ranks.get(p, float("inf")))
            if best not in self.ranks:
                break
            first, second = best
            merged: list[str] = []
            i = 0
            while i < len(word):
                if i < len(word) - 1 and word[i] == first and word[i + 1] == second:
                    merged.append(first + second)
                    i += 2
                else:
                    merged.append(word[i])
                    i += 1
            word = tuple(merged)
        result = list(word)
        self._cache[token] = result
        return result

    def encode(self, text: str) -> list[int]:
        """`[sot, …tokens…, eot]` — no padding, no truncation (prompts are short by construction)."""
        cleaned = re.sub(r"\s+", " ", text).strip().lower()
        ids = [self.sot]
        for chunk in PATTERN.findall(cleaned):
            token = "".join(self.byte_encoder[b] for b in chunk.encode("utf-8"))
            ids.extend(self.encoder[piece] for piece in self._bpe(token) if piece in self.encoder)
        ids.append(self.eot)
        return ids

    def encode_batch(self, texts: list[str] | tuple[str, ...]) -> tuple[np.ndarray, np.ndarray]:
        """Right-pads with the eot token (CLIP pools at the *first* eot, so padding is inert)."""
        rows = [self.encode(t) for t in texts]
        width = max(len(r) for r in rows)
        input_ids = np.full((len(rows), width), self.eot, dtype=np.int64)
        attention_mask = np.zeros((len(rows), width), dtype=np.int64)
        for i, row in enumerate(rows):
            input_ids[i, : len(row)] = row
            attention_mask[i, : len(row)] = 1
        return input_ids, attention_mask
