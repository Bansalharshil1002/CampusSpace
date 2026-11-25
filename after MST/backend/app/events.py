"""In-process fan-out for FR-14 live dashboard refresh."""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from typing import Any

_subscribers: set[asyncio.Queue[str]] = set()


def publish_room(payload: dict[str, Any]) -> None:
    message = json.dumps(payload, default=str)
    for queue in list(_subscribers):
        try:
            queue.put_nowait(message)
        except asyncio.QueueFull:
            continue


async def subscribe() -> AsyncIterator[str]:
    queue: asyncio.Queue[str] = asyncio.Queue(maxsize=32)
    _subscribers.add(queue)
    try:
        while True:
            yield await queue.get()
    finally:
        _subscribers.discard(queue)
