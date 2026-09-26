import asyncio
from typing import Dict, Any, List

class PravahReplayLedger:
    def __init__(self):
        self.ledger: List[Dict[str, Any]] = []
        self._lock = asyncio.Lock()

    async def append_event(self, event_type: str, data: Dict[str, Any]):
        async with self._lock:
            self.ledger.append({"event_type": event_type, "data": data})

    def get_ledger(self) -> List[Dict[str, Any]]:
        return self.ledger
