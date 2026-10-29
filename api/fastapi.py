"""Expose the existing API under its public Vercel prefix, including Swagger."""
from fastapi import FastAPI
from src.api.main import app as fraud_api

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
app.mount("/fastapi", fraud_api)
# Support direct function URLs as well as the public rewrite.
app.mount("/api/fastapi", fraud_api)

