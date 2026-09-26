import hashlib
import json
import asyncio
from typing import Dict, Any, List

class DeterministicStateMachine:
    def __init__(self):
        self.state_hashes: List[str] = []
        self._lock = asyncio.Lock()

    async def transition(self, state_name: str, payload: Dict[str, Any]) -> str:
        async with self._lock:
            # Deterministic hash of state name and payload keys/values
            serialized = json.dumps({"state": state_name, "payload": payload}, sort_keys=True)
            state_hash = hashlib.sha256(serialized.encode("utf-8")).hexdigest()
            self.state_hashes.append(state_hash)
            return state_hash
