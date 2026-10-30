from datetime import datetime, timezone
import os
import time
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import Counter, Histogram, make_asgi_app
from src.common.config import settings
from src.common.model import frame_from_transaction, load_model
from src.common.schemas import Transaction, Prediction

app = FastAPI(title="Real-Time Fraud Detection API", version="1.0.0")
allowed_origins = [
    origin.strip().rstrip("/")
    for origin in os.getenv("CLIENT_ORIGIN", "").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
REQUESTS = Counter("fraud_prediction_requests_total", "Prediction requests")
FRAUDS = Counter("fraud_predictions_total", "Fraud predictions")
LATENCY = Histogram("fraud_prediction_latency_seconds", "Prediction latency")

try:
    model = load_model(settings.model_path)
    MODEL_STATUS = "loaded"
except FileNotFoundError:
    model = None
    MODEL_STATUS = "missing"

app.mount("/metrics", make_asgi_app())


@app.get("/health")
def health():
    return {"status": "ok", "model_status": MODEL_STATUS}


@app.post("/predict", response_model=Prediction)
def predict(transaction: Transaction):
    global model, MODEL_STATUS
    if model is None:
        try:
            model = load_model(settings.model_path)
            MODEL_STATUS = "loaded"
        except FileNotFoundError as exc:
            raise HTTPException(status_code=503, detail="No trained model artifact is configured. Train and deploy a model before requesting predictions.") from exc
    started = time.perf_counter()
    REQUESTS.inc()
    probability = float(model.predict_proba(frame_from_transaction(transaction.model_dump()))[0, 1])
    is_fraud = probability >= settings.fraud_threshold
    if is_fraud:
        FRAUDS.inc()
    LATENCY.observe(time.perf_counter() - started)
    return Prediction(
        transaction_id=transaction.transaction_id,
        fraud_probability=probability,
        is_fraud=is_fraud,
        model_version="local-joblib",
        timestamp=datetime.now(timezone.utc),
    )
