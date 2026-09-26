import pytest
import asyncio
from evaluation_engine.rule_engine import DeterministicStateMachine

@pytest.mark.asyncio
async def test_deterministic_execution():
    # Ensure 50 consecutive runs produce identical SHA-256 state hashes
    hashes_list = []
    
    for _ in range(50):
        sm = DeterministicStateMachine()
        await sm.transition("START", {"id": "123"})
        await sm.transition("END", {"id": "123"})
        hashes_list.append(sm.state_hashes)
        
    first_hashes = hashes_list[0]
    for hashes in hashes_list:
        assert hashes == first_hashes, "Non-deterministic state execution detected"
