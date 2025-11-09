
from fastapi import FastAPI, Body, Response
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="CORS Probe Server")

# ✅ Enable very-permissive CORS (covers http://127.0.0.1:5500 and file:// null origins in most browsers)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r".*",
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    allow_credentials=True,
)

# ✅ Catch-all OPTIONS for preflight
@app.options("/{rest_of_path:path}")
def preflight_ok(rest_of_path: str):
    return Response(status_code=200)

# --- Test/health endpoints ---
@app.get("/scheduler/status")
def scheduler_status():
    return {"ok": True, "service": "cors-probe", "note": "CORS headers should be present"}

@app.post("/predict-proba")
def predict_proba(payload: dict = Body(...)):
    # Echo back with dummy probabilities
    features = payload.get("features", {})
    return {"proba": {"home": 0.45, "draw": 0.25, "away": 0.30}, "echo": {"features": features}, "model_version": "probe-1.0"}

@app.post("/retrain-models")
def retrain_models(payload: dict = Body(...)):
    return {"ok": True, "received": payload, "note": "dummy retrain ok"}
