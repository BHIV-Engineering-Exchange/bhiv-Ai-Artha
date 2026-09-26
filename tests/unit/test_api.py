import pytest
from fastapi.testclient import TestClient
from api.production import app

client = TestClient(app)

def test_sync_endpoint_success():
    response = client.post(
        "/api/v1/bright-connection/sync",
        json={"tenant_id": "tenant_123", "query": "What is the balance?"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert "tally_sync_result" in data
    assert "Sunrise Distributors" in data["mitra_response"]

def test_sync_endpoint_validation_error():
    # Missing query field
    response = client.post(
        "/api/v1/bright-connection/sync",
        json={"tenant_id": "tenant_123"}
    )
    assert response.status_code == 422
