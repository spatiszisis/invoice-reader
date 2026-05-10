"""Invoice extractor — local LLM via LM Studio (OpenAI-compatible API).

Three paths, all using the same LM Studio server:

  PDF with text layer  → pdfplumber → text → LLM (text model)
  PDF without text     → pdf2image  → pages as images → LLM (vision model)
  Image upload         → LLM (vision model) directly

Both paths use LM Studio's OpenAI-compatible API. Load a text model for
the text path and a vision model for the image path. If you load a single
vision model that also handles text well (e.g. Qwen2-VL, Phi-3-Vision),
you can point both paths at the same model with EXTRACTION_MODEL and
VISION_MODEL set to the same value.

Vision requests use the `image_url` content block with a base64 data URL,
which LM Studio supports for any loaded vision model.
"""

from __future__ import annotations

import base64
import io
import json
import logging
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

import pdfplumber
from openai import APIConnectionError, OpenAI
from pdf2image import convert_from_path
from PIL import Image
from pydantic import ValidationError

from app.prompt import SYSTEM_PROMPT, USER_PROMPT_FOR_VISION, user_prompt_for_text
from app.schema import ExtractionResponse, Invoice

logger = logging.getLogger(__name__)

TEXT_SPARSITY_THRESHOLD_PER_PAGE = 50
RASTER_DPI = 300
MAX_VISION_PAGES = 10

IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".webp", ".bmp"}

# Max dimension for images sent to the vision model. Keeps token usage
# reasonable while preserving enough resolution for invoice text.
VISION_MAX_DIMENSION = 2000


class ExtractionError(Exception):
    """Raised for known-bad inputs that should surface a clear message."""


@dataclass
class ExtractorConfig:
    base_url: str = "http://localhost:1234/v1"
    api_key: str = "lm-studio"
    # Text model — used for PDFs with a readable text layer.
    model: str = "local-model"
    # Vision model — used for scanned PDFs and image uploads.
    # Set to the same value as `model` if your vision model handles text too.
    vision_model: str = "local-model"
    temperature: float = 0.1
    timeout_seconds: float = 300.0


def _build_response_schema() -> dict[str, Any]:
    schema = Invoice.model_json_schema()
    _harden_schema(schema)
    return {
        "type": "json_schema",
        "json_schema": {
            "name": "Invoice",
            "schema": schema,
            "strict": False,
        },
    }


def _harden_schema(node: Any) -> None:
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

            logger.info("PDF has no text layer; using vision path: %s", original_filename)
            pages = self._rasterize_pdf(file_path, warnings)
            invoice = self._extract_from_images(pages)
            return self._response(original_filename, "vision", invoice, warnings)

        if suffix in IMAGE_SUFFIXES:
            logger.info("Image upload; using vision path: %s", original_filename)
            img = Image.open(file_path)
            invoice = self._extract_from_images([img])
            return self._response(original_filename, "vision", invoice, warnings)

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

    # ----------------------------------------------------------- vision path

    def _rasterize_pdf(self, file_path: Path, warnings: list[str]) -> list[Image.Image]:
        pages = convert_from_path(str(file_path), dpi=RASTER_DPI)
        if len(pages) > MAX_VISION_PAGES:
            warnings.append(
                f"Document has {len(pages)} pages; only the first "
                f"{MAX_VISION_PAGES} were processed."
            )
            pages = pages[:MAX_VISION_PAGES]
        return pages

    def _extract_from_images(self, pages: list[Image.Image]) -> Invoice:
        content: list[dict[str, Any]] = []
        for page in pages:
            resized = self._resize_for_vision(page)
            buf = io.BytesIO()
            resized.convert("RGB").save(buf, format="JPEG", quality=90)
            b64 = base64.standard_b64encode(buf.getvalue()).decode()
            content.append({
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{b64}"},
            })
        content.append({"type": "text", "text": USER_PROMPT_FOR_VISION})

        try:
            response = self._client.chat.completions.create(
                model=self._config.vision_model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": content},
                ],
                response_format=RESPONSE_FORMAT,
                temperature=self._config.temperature,
            )
        except APIConnectionError as exc:
            raise ExtractionError(
                f"Could not reach the LLM server at {self._config.base_url}. "
                f"Check that LM Studio is running and a vision model is loaded. "
                f"Original error: {exc}"
            ) from exc

        raw = response.choices[0].message.content or ""
        return self._parse(raw.strip())

    @staticmethod
    def _resize_for_vision(img: Image.Image) -> Image.Image:
        w, h = img.size
        if max(w, h) <= VISION_MAX_DIMENSION:
            return img
        scale = VISION_MAX_DIMENSION / max(w, h)
        return img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

    # ------------------------------------------------------------ llm step (text)

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
        method: Literal["text", "ocr", "vision"],
        invoice: Invoice,
        warnings: list[str],
    ) -> ExtractionResponse:
        return ExtractionResponse(
            filename=filename,
            extraction_method=method,
            invoice=invoice,
            warnings=warnings,
        )
