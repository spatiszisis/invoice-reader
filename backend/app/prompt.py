"""Extraction prompts for Claude — loaded from prompts/*.md at import time.

Design choices, in order of impact:

1. **Strict JSON schema in the system prompt.** The model performs
   noticeably better when the schema is in `system` rather than user
   content — it's treated as a hard constraint, not a suggestion.

2. **Anti-hallucination rules are explicit.** "If you can't read it,
   return null. Never guess." This is the #1 source of bad extractions.

3. **Number normalization is its own section.** European invoices use
   `1.234,56`; the model sometimes faithfully copies that into JSON,
   producing invalid numbers. We tell it the output format directly.

4. **One worked example.** Few-shot examples are the cheapest way to
   pin down output format. One is enough; more crowds the context.

5. **Confidence is sparse.** Only emit confidence for fields you're
   uncertain about. Asking for confidence on every field bloats output
   and dilutes the signal.

6. **Greek field names are listed.** The model handles Greek invoices
   well but giving it the common labels (ΑΦΜ, Επωνυμία, Σύνολο, etc.)
   reduces near-misses on field mapping.
"""

from __future__ import annotations

from pathlib import Path

_PROMPTS_DIR = Path(__file__).parent / "prompts"


def _load(filename: str) -> str:
    return (_PROMPTS_DIR / filename).read_text(encoding="utf-8")


SYSTEM_PROMPT = _load("system.md")

USER_PROMPT_FOR_VISION = _load("user_vision.md").strip()

_USER_TEXT_TEMPLATE = _load("user_text.md")


def user_prompt_for_text(extracted_text: str) -> str:
    """Prompt body when we have plain text from pdfplumber."""
    return _USER_TEXT_TEMPLATE.format(extracted_text=extracted_text)
