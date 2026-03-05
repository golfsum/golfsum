from fastapi import FastAPI, File, UploadFile, HTTPException, Query, Depends, Header
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from pathlib import Path
import logging
import os
import time

from app.models import ScorecardParseResponse
from app.pipeline import parse_scorecard_image
from fastapi.middleware.cors import CORSMiddleware
from collections import defaultdict
import httpx

load_dotenv()
repo_env = Path(__file__).resolve().parents[2] / ".env"
if repo_env.exists():
    load_dotenv(repo_env)

app = FastAPI(title="GolfSum Scorecard OCR", version="0.1.0")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("app.main")

_raw_origins = os.getenv("CORS_ALLOWED_ORIGIN", "")
ALLOWED_ORIGINS = [origin.strip() for origin in _raw_origins.split(",") if origin.strip()]
if not ALLOWED_ORIGINS:
    runtime_env = os.getenv("ENVIRONMENT", "development").lower()
    if runtime_env in {"development", "dev", "local", "test"}:
        ALLOWED_ORIGINS = [
            "http://localhost:3000",
            "http://localhost:5173",
        ]
        logger.warning("CORS_ALLOWED_ORIGIN not set; using localhost-only defaults for development")
    else:
        logger.warning("CORS_ALLOWED_ORIGIN not set; CORS disabled for non-local origins")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-API-Key", "X-GS-Timestamp", "X-GS-Signature"],
)

# API key authentication — skipped if OCR_API_KEY env var is not set (local dev)
OCR_API_KEY = os.getenv("OCR_API_KEY", "")

async def verify_api_key(x_api_key: str = Header(default="", alias="X-API-Key")):
    if OCR_API_KEY and x_api_key != OCR_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")

# Simple in-memory rate limiter (per IP, resets on cold start)
_rate_store: dict = defaultdict(lambda: {"count": 0, "reset": 0.0})
RATE_LIMIT_MAX = 60       # requests per window
RATE_LIMIT_WINDOW = 600   # 10 minutes in seconds
_last_rate_cleanup = 0.0

async def rate_limit(x_forwarded_for: str = Header(default="", alias="X-Forwarded-For")):
    global _last_rate_cleanup
    ip = x_forwarded_for.split(",")[0].strip() if x_forwarded_for else "unknown"
    now = time.time()
    if now - _last_rate_cleanup > RATE_LIMIT_WINDOW:
        stale_cutoff = now - (RATE_LIMIT_WINDOW * 2)
        stale_keys = [key for key, value in _rate_store.items() if value.get("reset", 0.0) < stale_cutoff]
        for key in stale_keys:
            _rate_store.pop(key, None)
        _last_rate_cleanup = now
    entry = _rate_store[ip]
    if now - entry["reset"] > RATE_LIMIT_WINDOW:
        entry["count"] = 0
        entry["reset"] = now
    entry["count"] += 1
    if entry["count"] > RATE_LIMIT_MAX:
        raise HTTPException(status_code=429, detail="Rate limit exceeded")


@app.get("/health")
def health_check() -> dict:
    return {"status": "ok"}

@app.get("/health/deep")
async def deep_health_check() -> dict:
    """
    Checks all downstream dependencies.
    Returns 200 if all healthy, 503 if any critical service is down.
    Each check has a 5-second timeout.
    """
    checks = {}
    all_ok = True

    # 1. Gemini API configuration (+ optional deep check)
    api_key = os.getenv("GEMINI_API_KEY", "")
    enable_live_gemini_probe = os.getenv("ENABLE_GEMINI_DEEP_CHECK", "").lower() == "true"
    if api_key:
        checks["gemini"] = {"status": "configured"}
        if enable_live_gemini_probe:
            try:
                health_key = os.getenv("GEMINI_HEALTHCHECK_KEY") or api_key
                async with httpx.AsyncClient(timeout=5.0) as client:
                    resp = await client.post(
                        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
                        headers={"x-goog-api-key": health_key},
                        json={
                            "contents": [{"parts": [{"text": "Reply with only the word OK"}]}],
                            "generationConfig": {"maxOutputTokens": 5},
                        },
                    )
                    checks["gemini"] = {
                        "status": "ok" if resp.status_code == 200 else "degraded",
                        "status_code": resp.status_code,
                        "latency_ms": round(resp.elapsed.total_seconds() * 1000),
                    }
                    if resp.status_code != 200:
                        all_ok = False
            except Exception as e:
                checks["gemini"] = {"status": "down", "error": str(e)}
                all_ok = False
    else:
        checks["gemini"] = {"status": "not_configured"}
        all_ok = False

    # 2. OpenCV — verify import works (would fail if system libs are missing)
    try:
        import cv2
        checks["opencv"] = {"status": "ok", "version": cv2.__version__}
    except Exception as e:
        checks["opencv"] = {"status": "down", "error": str(e)}
        all_ok = False

    # 3. Memory / disk
    import shutil
    disk = shutil.disk_usage("/")
    disk_free_mb = disk.free // (1024 * 1024)
    checks["disk"] = {
        "status": "ok" if disk_free_mb > 50 else "warning",
        "free_mb": disk_free_mb,
    }

    import resource
    mem_mb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss // 1024
    checks["memory"] = {
        "status": "ok",
        "rss_mb": mem_mb,
    }

    status_code = 200 if all_ok else 503
    return JSONResponse(
        status_code=status_code,
        content={
            "status": "healthy" if all_ok else "unhealthy",
            "checks": checks,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        },
    )

@app.post("/scorecard/parse", response_model=ScorecardParseResponse, dependencies=[Depends(verify_api_key), Depends(rate_limit)])
async def parse_scorecard(
    image: UploadFile = File(...),
    debug: bool = Query(False),
    mode: str = Query("course"),
) -> ScorecardParseResponse:
    if not image.content_type or "image" not in image.content_type:
        raise HTTPException(status_code=400, detail="File must be an image")

    content = await image.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty image payload")

    MAX_IMAGE_SIZE = 20 * 1024 * 1024  # 20MB
    if len(content) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=413, detail="Image too large. Maximum size is 20MB.")

    start = time.time()
    logger.info(
        "OCR request received filename=%s content_type=%s bytes=%s mode=%s debug=%s",
        image.filename,
        image.content_type,
        len(content),
        mode,
        debug,
    )
    result = parse_scorecard_image(content, debug=debug, mode=mode)
    elapsed = (time.time() - start) * 1000
    logger.info(
        "OCR response ready mode=%s confidence=%s flags=%s elapsed_ms=%.0f",
        mode,
        result.get("confidence"),
        result.get("flags"),
        elapsed,
    )
    return JSONResponse(content=result)
