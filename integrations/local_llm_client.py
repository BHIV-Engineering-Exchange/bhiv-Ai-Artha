from typing import Dict, Any

class MitraClient:
    def query_context(self, account_context: Dict[str, Any], query: str) -> str:
        # Deterministic explainable result based on input data
        ledger_name = account_context.get("ledger_name", "Unknown Account")
        return f"Query '{query}' processed for {ledger_name}. Data indicates successful sync."
