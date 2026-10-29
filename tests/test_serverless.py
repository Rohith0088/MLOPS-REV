from fastapi.testclient import TestClient
from api.fastapi import app
import src.api.main as api_module


def test_prefixed_swagger_and_schema():
    client = TestClient(app)
    docs = client.get("/fastapi/docs")
    assert docs.status_code == 200
    assert "/fastapi/openapi.json" in docs.text
    schema = client.get("/fastapi/openapi.json")
    assert schema.status_code == 200
    assert "/predict" in schema.json()["paths"]
    assert {"url": "/fastapi"} in schema.json()["servers"]


def test_prefixed_health_and_direct_function_url():
    client = TestClient(app)
    for prefix in ("/fastapi", "/api/fastapi"):
        response = client.get(prefix + "/health")
        assert response.status_code == 200
        assert response.json()["model_status"] in ("loaded", "missing")


def test_missing_model_returns_503_not_a_fake_prediction(monkeypatch):
    monkeypatch.setattr(api_module, "model", None)
    def missing(_path):
        raise FileNotFoundError("private/model/path")
    monkeypatch.setattr(api_module, "load_model", missing)
    response = TestClient(app).post("/fastapi/predict", json={
        "transaction_id": "synthetic-test", "amount": 10,
        "merchant_category": "retail", "customer_age": 30,
        "account_age_days": 100, "distance_from_home_km": 1,
        "hour": 12, "device_trust_score": 0.9, "previous_chargebacks": 0,
    })
    assert response.status_code == 503
    assert "fraud_probability" not in response.json()
    assert "private/model/path" not in response.text
