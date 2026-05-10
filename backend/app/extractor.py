"""Invoice extractor (LM Studio / local LLM via OpenAI-compatible API).

Three paths, all converging on the same text-LLM step:

  PDF with text layer  → pdfplumber → text → LLM
  PDF without text     → pdf2image  → OCR  → text → LLM
  Image upload         → OCR        → text → LLM

The LLM stage uses LM Studio's OpenAI-compatible server (default at
http://localhost:1234/v1). LM Studio supports JSON Schema constrained
output via the same `response_format` field as OpenAI's API — this is
strictly better than "any valid JSON" mode because it forces the model
to match our exact field names and types, which keeps small models from
inventing fields or returning numbers as strings.

Same OpenAI-compatible endpoint pattern works against any other tool
(Ollama in OpenAI-compat mode, vLLM, llama.cpp's server, etc.) by just
changing LMSTUDIO_BASE_URL.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

import pdfplumber
from openai import APIConnectionError, OpenAI
from pdf2image import convert_from_path
from pydantic import ValidationError

from app.ocr import ocr_image_file, ocr_pdf_pages
from app.prompt import SYSTEM_PROMPT, user_prompt_for_text
from app.schema import ExtractionResponse, Invoice

logger = logging.getLogger(__name__)

# A page with fewer than this many characters of pdfplumber text is
# treated as "no real text layer" — fall back to OCR.
TEXT_SPARSITY_THRESHOLD_PER_PAGE = 50

# DPI for rasterizing scanned PDFs before OCR. 300 is the Tesseract
# sweet spot — higher gains little, lower starts dropping accuracy.
RASTER_DPI = 300

# Cap on pages we OCR per document. Multi-page invoices are normal;
# multi-hundred-page "invoices" are almost always statements.
MAX_OCR_PAGES = 10

IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".webp", ".bmp"}


class ExtractionError(Exception):
    """Raised for known-bad inputs that should surface a clear message."""


@dataclass
class ExtractorConfig:
    base_url: str = "http://localhost:1234/v1"
    # LM Studio doesn't validate the API key, but the OpenAI SDK requires
    # the param to exist. Any non-empty string works.
    api_key: str = "lm-studio"
    # Model identifier — for LM Studio, this is whatever's loaded in the
    # server, but the field is required by the API. The string is largely
    # decorative; "local-model" is a common convention.
    model: str = "local-model"
    temperature: float = 0.1
    # Generous timeout — local CPU inference can take 30–90s per request.
    timeout_seconds: float = 300.0


# Build the JSON Schema once at import time. Pydantic v2's
# `model_json_schema()` produces a draft-2020-12 schema; LM Studio /
# OpenAI structured outputs accept a slightly trimmed subset. We strip
# the title noise and force `additionalProperties: false` everywhere
# (small models love to invent fields when given the chance).
def _build_response_schema() -> dict[str, Any]:
    schema = Invoice.model_json_schema()
    _harden_schema(schema)
    # Wrap in OpenAI's response_format envelope.
    return {
        "type": "json_schema",
        "json_schema": {
            "name": "Invoice",
            "schema": schema,
            "strict": False,
        },
    }


def _harden_schema(node: Any) -> None:
    """Walk the schema and disallow extra fields, normalize for local servers.

    LM Studio's grammar-constrained sampling enforces this strictly. Without
    `additionalProperties: false`, a small model will sometimes emit
    `"foo": "bar"` keys that don't exist in our Pydantic model, and the
    sampler is happy to oblige.
    """
    if isinstance(node, dict):
        if node.get("type") == "object" and "properties" in node:
            node.setdefault("additionalProperties", False)
        for value in node.values():
            _harden_schema(value)
    elif isinstance(node, list):
        for item in node:
            _harden_schema(item)


RESPONSE_FORMAT = _build_response_schema()


class InvoiceExtractor:
    def __init__(self, config: ExtractorConfig) -> None:
        self._config = config
        self._client = OpenAI(
            base_url=config.base_url,
            api_key=config.api_key,
            timeout=config.timeout_seconds,
            # No retries: a connection error on a local server is a config
            # problem, not a transient blip. Retrying just delays the error
            # message the user needs to see.
            max_retries=0,
        )

    # -------------------------------------------------------------- public API

    def extract(self, file_path: Path, original_filename: str) -> ExtractionResponse:
        suffix = file_path.suffix.lower()
        warnings: list[str] = []

        if suffix == ".pdf":
            text = self._read_pdf_text(file_path)
            if self._has_usable_text(text, file_path):
                logger.info("PDF text layer present; using text path: %s", original_filename)
                invoice = self._extract_from_text(text)
                return self._response(original_filename, "text", invoice, warnings)

            logger.info("PDF text layer sparse; routing through OCR: %s", original_filename)
            text = self._ocr_pdf(file_path, warnings)
            invoice = self._extract_from_text(text)
            return self._response(original_filename, "ocr", invoice, warnings)

        if suffix in IMAGE_SUFFIXES:
            logger.info("Image upload; routing through OCR: %s", original_filename)
            text = ocr_image_file(file_path)
            if not text.strip():
                raise ExtractionError(
                    "OCR produced no text. The image may be too blurry, "
                    "rotated 90°/180°, or contain no readable invoice."
                )
            invoice = self._extract_from_text(text)
            return self._response(original_filename, "ocr", invoice, warnings)

        raise ExtractionError(f"Unsupported file type: {suffix or '(none)'}")

    # ------------------------------------------------------------- text path

    def _read_pdf_text(self, file_path: Path) -> str:
        with pdfplumber.open(file_path) as pdf:
            parts = [page.extract_text() or "" for page in pdf.pages]
        return "\n\n".join(parts)

    def _has_usable_text(self, text: str, file_path: Path) -> bool:
        clean = re.sub(r"\s+", "", text)
        if not clean:
            return False
        with pdfplumber.open(file_path) as pdf:
            page_count = len(pdf.pages)
        return len(clean) / max(page_count, 1) >= TEXT_SPARSITY_THRESHOLD_PER_PAGE

    # -------------------------------------------------------------- ocr path

    def _ocr_pdf(self, file_path: Path, warnings: list[str]) -> str:
        pages = convert_from_path(str(file_path), dpi=RASTER_DPI)
        if len(pages) > MAX_OCR_PAGES:
            warnings.append(
                f"Document has {len(pages)} pages; only the first "
                f"{MAX_OCR_PAGES} were OCR'd."
            )
            pages = pages[:MAX_OCR_PAGES]
        text = ocr_pdf_pages(pages)
        if not text.strip():
            raise ExtractionError(
                "OCR produced no text from this scanned PDF. The pages "
                "may be blank or too low quality."
            )
        return text

    # ------------------------------------------------------------ llm step

    def _extract_from_text(self, text: str) -> Invoice:
        try:
            response = self._client.chat.completions.create(
                model=self._config.model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt_for_text(text)},
                ],
                response_format=RESPONSE_FORMAT,
                temperature=self._config.temperature,
            )
        except APIConnectionError as exc:
            # Most common operational failure: LM Studio isn't running, or
            # is bound to localhost-only and we're calling from a container.
            # Surface a clear, actionable message instead of a stack trace.
            raise ExtractionError(
                f"Could not reach the LLM server at {self._config.base_url}. "
                f"Check that LM Studio is running with its server started "
                f"(Developer tab → Server) and that 'Serve on Local Network' "
                f"is enabled if calling from Docker. Original error: {exc}"
            ) from exc
        raw = response.choices[0].message.content or ""
        return self._parse(raw.strip())

    # ----------------------------------------------------------- response

    def _parse(self, raw_text: str) -> Invoice:
        cleaned = self._strip_code_fences(raw_text)
        try:
            data = json.loads(cleaned)
        except json.JSONDecodeError as exc:
            logger.error("Model returned non-JSON: %s", raw_text[:500])
            raise ExtractionError(f"Extractor returned invalid JSON: {exc}") from exc

        try:
            return Invoice.model_validate(data)
        except ValidationError as exc:
            logger.error("Extraction failed schema validation: %s", exc)
            raise ExtractionError(f"Extraction did not match schema: {exc}") from exc

    @staticmethod
    def _strip_code_fences(text: str) -> str:
        match = re.search(r"```(?:json)?\s*(.*?)\s*```", text, flags=re.DOTALL)
        return match.group(1) if match else text

    @staticmethod
    def _response(
        filename: str,
        method: Literal["text", "ocr"],
        invoice: Invoice,
        warnings: list[str],
    ) -> ExtractionResponse:
        return ExtractionResponse(
            filename=filename,
            extraction_method=method,
            invoice=invoice,
            warnings=warnings,
        )
