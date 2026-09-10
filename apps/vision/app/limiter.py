"""Bounded inference concurrency.

~120 ms per inference on 4 vCPU ≈ 8 req/s sustained with a single worker. Requests that cannot be
served promptly are rejected with 429 rather than queued forever (research §6.4). The work itself runs
in a worker thread so the event loop keeps answering /health while the CPU is busy.
"""
from __future__ import annotations

import asyncio
from typing import Callable, TypeVar

T = TypeVar("T")


class Busy(Exception):
    """Raised when both the inference slots and the queue are full — maps to HTTP 429."""

    status = 429
    code = "BUSY"
    message = "Görüntü servisi şu an yoğun, lütfen tekrar deneyin"


class InferenceLimiter:
    def __init__(self, concurrency: int = 2, max_queue: int = 8):
        self._semaphore = asyncio.Semaphore(max(1, concurrency))
        self.concurrency = max(1, concurrency)
        self.max_queue = max(0, max_queue)
        self.waiting = 0
        self.in_flight = 0

    async def run(self, fn: Callable[[], T]) -> T:
        if self._semaphore.locked() and self.waiting >= self.max_queue:
            raise Busy()
        self.waiting += 1
        try:
            await self._semaphore.acquire()
        finally:
            self.waiting -= 1
        self.in_flight += 1
        try:
            return await asyncio.to_thread(fn)
        finally:
            self.in_flight -= 1
            self._semaphore.release()
