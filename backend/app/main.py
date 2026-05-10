"""FastAPI app — three endpoints, no database, no auth, local LLM via LM Studio.

POST /extract   multipart upload of files → list[ExtractionResponse]
POST /submit    list[Invoice] → echoes back. Stub for the future external service.
GET  /healthz   confirms backend is up and the LLM server is reachable.
"""

from __future__ import annotations

import logging
import os
import tempfile
from pathlib import Path

import httpx
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.extractor import ExtractionError, ExtractorConfig, InvoiceExtractor
from app.schema import ExtractionResponse, Invoice

logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

# --- Config from env ---------------------------------------------------------

# LM Studio's default OpenAI-compatible server. Same env var works against
# any other OpenAI-compatible local server (Ollama in OpenAI mode, vLLM,
# llama.cpp's server, LiteLLM, etc.) — change only the base URL.
LMSTUDIO_BASE_URL = os.environ.get("LMSTUDIO_BASE_URL", "http://localhost:1234/v1")
LMSTUDIO_API_KEY = os.environ.get("LMSTUDIO_API_KEY", "lm-studio")
EXTRACTION_MODEL = os.environ.get("EXTRACTION_MODEL", "local-model")
# Vision model loaded in LM Studio for scanned PDFs and image uploads.
# Must be a multimodal model (e.g. Qwen2-VL, Phi-3-Vision, LLaVA).
# Defaults to the same model as EXTRACTION_MODEL if not set separately.
VISION_MODEL = os.environ.get("VISION_MODEL", EXTRACTION_MODEL)
TIMEOUT_SECONDS = float(os.environ.get("LMSTUDIO_TIMEOUT_SECONDS", "300"))
MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "10"))
MAX_BATCH = int(os.environ.get("MAX_BATCH", "20"))
CORS_ORIGINS = [
    o.strip()
    for o in os.environ.get(
        "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",")
    if o.strip()
]

ALLOWED_SUFFIXES = {".pdf", ".png", ".jpg", ".jpeg", ".tif", ".tiff", ".webp", ".bmp"}

# --- App ---------------------------------------------------------------------

app = FastAPI(title="Invoice Reader (LM Studio)", version="0.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _build_extractor() -> InvoiceExtractor:
    return InvoiceExtractor(
        ExtractorConfig(
            base_url=LMSTUDIO_BASE_URL,
            api_key=LMSTUDIO_API_KEY,
            model=EXTRACTION_MODEL,
            vision_model=VISION_MODEL,
            timeout_seconds=TIMEOUT_SECONDS,
        )
    )


# --- Endpoints ---------------------------------------------------------------


@app.get("/healthz")
def healthz() -> dict:
    """Liveness + LLM server reachability + which models are loaded.

    The OpenAI-compatible `/v1/models` endpoint is the standard way to
    introspect what's available on a local server. LM Studio, Ollama
    (in OpenAI mode), and vLLM all support it.
    """
    server_status: str
    available_models: list[str] | None = None
    try:
        with httpx.Client(timeout=5.0) as client:
            r = client.get(f"{LMSTUDIO_BASE_URL}/models")
            r.raise_for_status()
            payload = r.json()
            available_models = [m.get("id") for m in payload.get("data", [])]
            server_status = "ok"
    except Exception as exc:  # noqa: BLE001 — health checks must not throw
        logger.warning("LLM server unreachable: %s", exc)
        server_status = f"unreachable: {exc}"

    return {
        "status": "ok",
        "llm_base_url": LMSTUDIO_BASE_URL,
        "llm_status": server_status,
        "configured_model": EXTRACTION_MODEL,
        "available_models": available_models,
    }


@app.post("/extract", response_model=list[ExtractionResponse])
async def extract(files: list[UploadFile] = File(...)) -> list[ExtractionResponse]:
    """Accept N files, return N extraction results in the same order."""
    if not files:
        raise HTTPException(status_code=400, detail="No files provided.")
    if len(files) > MAX_BATCH:
        raise HTTPException(
            status_code=400,
            detail=f"Too many files ({len(files)}); limit is {MAX_BATCH}.",
        )

    extractor = _build_extractor()
    max_bytes = MAX_UPLOAD_MB * 1024 * 1024
    results: list[ExtractionResponse] = []

    with tempfile.TemporaryDirectory(prefix="invoice-") as tmpdir:
        tmp_path = Path(tmpdir)

        for idx, upload in enumerate(files):
            filename = upload.filename or f"file_{idx}"
            suffix = Path(filename).suffix.lower()

            if suffix not in ALLOWED_SUFFIXES:
                results.append(
                    _error_result(
                        filename,
                        f"Unsupported file type: {suffix or '(none)'}. "
                        f"Supported: PDF, PNG, JPG, TIFF, WEBP, BMP.",
                    )
                )
                continue

            data = await upload.read()
            if len(data) > max_bytes:
                results.append(
                    _error_result(
                        filename,
                        f"File exceeds {MAX_UPLOAD_MB} MB limit "
                        f"({len(data) / 1024 / 1024:.1f} MB).",
                    )
                )
                continue
            if not data:
                results.append(_error_result(filename, "File is empty."))
                continue

            disk_path = tmp_path / f"{idx:03d}_{Path(filename).name}"
            disk_path.write_bytes(data)

            try:
                results.append(extractor.extract(disk_path, original_filename=filename))
            except ExtractionError as exc:
                results.append(_error_result(filename, str(exc)))
            except Exception as exc:  # noqa: BLE001 — surface unexpected per-file errors
                logger.exception("Extraction failed for %s", filename)
                results.append(_error_result(filename, f"Extraction failed: {exc}"))

    return results


def _error_result(filename: str, message: str) -> ExtractionResponse:
    return ExtractionResponse(
        filename=filename,
        extraction_method="text",  # arbitrary; the warning carries the truth
        invoice=Invoice(),
        warnings=[message],
    )


# --- Submit stub -------------------------------------------------------------


class SubmitPayload(BaseModel):
    invoices: list[Invoice]


class SubmitResult(BaseModel):
    received: int
    invoices: list[Invoice]


@app.post("/submit", response_model=SubmitResult)
def submit(payload: SubmitPayload) -> SubmitResult:
    """Stub for the future external service."""
    logger.info("Received %d invoices for submission (stub)", len(payload.invoices))
    return SubmitResult(received=len(payload.invoices), invoices=payload.invoices)
