"""OCR pipeline for image-based invoices.

Used when:
- A PDF has no text layer (scan)
- The user uploaded a JPG/PNG/HEIC/etc.

Pipeline: image bytes → PIL → opencv preprocessing → Tesseract → text.
The text feeds the same LLM extractor the PDF text path uses.

Preprocessing is photo-aware:
  - Clean rendered documents (PDF rasterizations, screenshots): light touch.
    Resize + grayscale + small-angle deskew only. Tesseract's internal
    binarization handles these well; adaptive thresholding hurts.
  - Photos with uneven lighting (phone camera): full pipeline including
    adaptive threshold. Without it, shadow patches and paper texture get
    picked up as character noise — the kind of garbage that produces
    things like `νσεων — —s | Επ. = |` in the OCR output.

We detect "photo vs. clean" by looking at the grayscale histogram. Clean
documents are bimodal (deep blacks + bright whites, little midtone);
photos have substantial midtone mass from lighting variation.

Languages: Tesseract takes a `+`-separated list. Greek invoices freely
mix Greek and English (Latin SKUs alongside Greek descriptions), so we
always pass both. The overhead is negligible vs. the LLM call.
"""

from __future__ import annotations

import io
import logging
from pathlib import Path

import cv2
import numpy as np
import pytesseract
from PIL import Image

logger = logging.getLogger(__name__)

# Tesseract language pack identifier. Requires `tesseract-ocr-ell` and
# `tesseract-ocr-eng` to be installed (handled by `make setup` via brew).
TESSERACT_LANGS = "ell+eng"

# --psm 6   Single uniform block of text. Good default for invoices.
# preserve_interword_spaces=1
#           Keeps multiple spaces between columns intact, which helps the
#           LLM see line item table structure (qty | unit | total) rather
#           than collapsing everything into a soup of single spaces.
TESSERACT_CONFIG = "--psm 6 -c preserve_interword_spaces=1"

# Tesseract performs best around 300 DPI equivalent. Phone photos are
# usually too big (memory-hungry, slow); tiny screenshots benefit from
# upscaling. We aim the longest dimension into [1500, 3500] px.
TARGET_MIN_DIMENSION = 1500
TARGET_MAX_DIMENSION = 3500

# Maximum skew we'll attempt to correct. Larger detected angles are
# almost always misdetections (minAreaRect on text pixels is direction-
# ambiguous on whitespace-heavy pages). Sideways photos belong to the
# user to rotate before upload.
MAX_DESKEW_ANGLE_DEGREES = 15.0


# --- public API --------------------------------------------------------------


def ocr_image_bytes(image_bytes: bytes) -> str:
    """Run OCR on a single image (any format PIL can open). Returns plain text."""
    with Image.open(io.BytesIO(image_bytes)) as img:
        img = img.convert("RGB")
        np_img = np.array(img)
    return _ocr_array(cv2.cvtColor(np_img, cv2.COLOR_RGB2BGR))


def ocr_image_file(path: Path) -> str:
    return ocr_image_bytes(path.read_bytes())


def ocr_pdf_pages(pages: list[Image.Image]) -> str:
    """Run OCR on each page image and join with page-marker separators.

    The markers help the LLM see page boundaries — useful for multi-page
    invoices where totals on the last page reference line items earlier.
    """
    texts: list[str] = []
    for i, page in enumerate(pages):
        np_img = cv2.cvtColor(np.array(page.convert("RGB")), cv2.COLOR_RGB2BGR)
        text = _ocr_array(np_img)
        texts.append(f"----- PAGE {i + 1} -----\n{text}")
    return "\n\n".join(texts)


# --- preprocessing -----------------------------------------------------------


def _ocr_array(img_bgr: np.ndarray) -> str:
    prepared = _preprocess(img_bgr)
    return pytesseract.image_to_string(
        prepared, lang=TESSERACT_LANGS, config=TESSERACT_CONFIG
    )


def _preprocess(img_bgr: np.ndarray) -> np.ndarray:
    """Photo-aware preprocessing.

    Always: resize, grayscale, deskew (when the angle is small enough to
    trust). Conditionally: adaptive threshold for inputs that look like
    real photos rather than clean rendered documents.
    """
    img = _resize_for_ocr(img_bgr)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    deskewed = _deskew(gray)

    if _looks_like_photo(deskewed):
        logger.debug("Detected photo-like input; applying adaptive threshold")
        return _binarize_for_photo(deskewed)
    logger.debug("Detected clean-rendered input; skipping threshold step")
    return deskewed


# --- photo vs. clean-document detection --------------------------------------


def _looks_like_photo(gray: np.ndarray) -> bool:
    """Heuristic: do we appear to have a photo, not a clean rendered doc?

    Clean rendered documents have a very bimodal histogram — most pixels
    are either near 0 (text) or near 255 (background paper). Photos have
    substantial midtone mass from lighting gradients, paper texture,
    shadows under fingers, etc.

    We measure "midtone mass" as the share of pixels in the [80, 200]
    intensity band. Clean documents typically score under 15%; phone
    photos run 30%+. The 25% threshold is conservative but reliable.

    This isn't ML — it's a one-pass histogram. Cost: <5ms even on big
    images. Failure modes are gentle: a misdetected photo just gets the
    "clean" path (slightly worse OCR), and vice versa (slightly slower
    but usually not worse).
    """
    hist = cv2.calcHist([gray], [0], None, [256], [0, 256]).flatten()
    total = hist.sum()
    if total <= 0:
        return False
    midtone_share = hist[80:200].sum() / total
    return midtone_share > 0.25


def _binarize_for_photo(gray: np.ndarray) -> np.ndarray:
    """Adaptive threshold tuned for photographed documents.

    Block size and C constant chosen empirically:
    - blockSize=31 captures enough local context to handle gradient
      lighting without smudging individual characters.
    - C=15 favors keeping fine detail (Greek diacritics, decimal commas)
      at the cost of occasionally letting noise through. Higher C drops
      noise but loses thin strokes.
    """
    return cv2.adaptiveThreshold(
        gray,
        maxValue=255,
        adaptiveMethod=cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        thresholdType=cv2.THRESH_BINARY,
        blockSize=31,
        C=15,
    )


# --- geometry ---------------------------------------------------------------


def _resize_for_ocr(img: np.ndarray) -> np.ndarray:
    h, w = img.shape[:2]
    longest = max(h, w)
    if longest < TARGET_MIN_DIMENSION:
        scale = TARGET_MIN_DIMENSION / longest
    elif longest > TARGET_MAX_DIMENSION:
        scale = TARGET_MAX_DIMENSION / longest
    else:
        return img
    new_size = (int(w * scale), int(h * scale))
    interp = cv2.INTER_CUBIC if scale > 1 else cv2.INTER_AREA
    return cv2.resize(img, new_size, interpolation=interp)


def _deskew(gray: np.ndarray) -> np.ndarray:
    """Estimate page skew via image-moments and rotate to correct it.

    Only attempts correction up to MAX_DESKEW_ANGLE_DEGREES. Larger
    detected angles are treated as misdetections (which they almost
    always are on whitespace-dominated documents).
    """
    inverted = cv2.bitwise_not(gray)
    _, binary = cv2.threshold(inverted, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)

    coords = np.column_stack(np.where(binary > 0))
    if coords.size == 0:
        return gray

    angle = cv2.minAreaRect(coords)[-1]
    if angle < -45:
        angle = -(90 + angle)
    else:
        angle = -angle

    if abs(angle) < 0.5:
        return gray
    if abs(angle) > MAX_DESKEW_ANGLE_DEGREES:
        logger.debug("Refusing to deskew by %.2f° (> %.0f° limit)",
                     angle, MAX_DESKEW_ANGLE_DEGREES)
        return gray

    h, w = gray.shape
    center = (w // 2, h // 2)
    matrix = cv2.getRotationMatrix2D(center, angle, scale=1.0)
    rotated = cv2.warpAffine(
        gray, matrix, (w, h),
        flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE,
    )
    logger.debug("Deskewed by %.2f°", angle)
    return rotated
