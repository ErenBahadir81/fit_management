"""Inference concurrency: 2 in flight on 4 vCPU, a short queue, then 429 (research §6.4)."""
import asyncio
import threading
import time

import pytest

from app.limiter import Busy, InferenceLimiter


async def test_runs_the_work_off_the_event_loop():
    limiter = InferenceLimiter(concurrency=2, max_queue=4)
    thread = await limiter.run(lambda: threading.current_thread().name)
    assert thread != threading.main_thread().name


async def test_never_exceeds_the_configured_concurrency():
    limiter = InferenceLimiter(concurrency=2, max_queue=10)
    live = 0
    peak = 0
    lock = threading.Lock()

    def work():
        nonlocal live, peak
        with lock:
            live += 1
            peak = max(peak, live)
        time.sleep(0.05)
        with lock:
            live -= 1

    await asyncio.gather(*(limiter.run(work) for _ in range(6)))
    assert peak == 2


async def test_overflow_raises_busy_instead_of_piling_up():
    limiter = InferenceLimiter(concurrency=1, max_queue=1)
    started = asyncio.Event()

    def slow():
        started.set()
        time.sleep(0.15)

    first = asyncio.create_task(limiter.run(slow))
    await started.wait()
    queued = asyncio.create_task(limiter.run(slow))  # fills the single queue slot
    await asyncio.sleep(0.02)
    with pytest.raises(Busy):
        await limiter.run(slow)
    await asyncio.gather(first, queued)


async def test_queue_slot_is_released_after_the_wait():
    limiter = InferenceLimiter(concurrency=1, max_queue=1)
    await limiter.run(lambda: None)
    assert limiter.waiting == 0 and limiter.in_flight == 0


async def test_slot_is_released_when_the_work_raises():
    limiter = InferenceLimiter(concurrency=1, max_queue=0)

    def boom():
        raise ValueError("nope")

    with pytest.raises(ValueError):
        await limiter.run(boom)
    assert limiter.in_flight == 0
    assert await limiter.run(lambda: "ok") == "ok"


async def test_zero_queue_still_serves_up_to_concurrency():
    limiter = InferenceLimiter(concurrency=2, max_queue=0)
    assert await asyncio.gather(limiter.run(lambda: 1), limiter.run(lambda: 2)) == [1, 2]
