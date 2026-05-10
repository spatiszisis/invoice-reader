"""Invoice schema.

This is the shape we ask Claude to produce, the shape we hand back to
the frontend, and the shape the form on the frontend mirrors. Keeping
all three in sync starts here.

Money is Decimal end-to-end. Dates are ISO date strings (the model
returns them as strings; we don't try to parse to date objects in
Python because partial extractions are common — "due_date": null is a
valid response).

`confidence` is a free-form dict keyed by field path so the frontend
can highlight low-confidence values without us having to enumerate
every field twice.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

ConfidenceLevel = Literal["low", "medium", "high"]
InvoiceType = Literal["standard", "credit_note", "proforma"]


class LineItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    description: str | None = None
    quantity: Decimal | None = None
    unit_price: Decimal | None = None
    discount: Decimal | None = None
    vat_rate: Decimal | None = Field(
        default=None, description="VAT rate as a percentage, e.g. 24 for 24%"
    )
    line_net_total: Decimal | None = None
    line_gross_total: Decimal | None = None


class VatBreakdownEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")

    vat_rate: Decimal
    taxable_amount: Decimal
    vat_amount: Decimal


class Invoice(BaseModel):
    """Full invoice payload returned by the extractor."""

    model_config = ConfigDict(extra="ignore")

    # Supplier
    supplier_name: str | None = None
    supplier_vat_id: str | None = None
    supplier_address: str | None = None
    supplier_email: str | None = None
    supplier_phone: str | None = None

    # Invoice metadata
    invoice_number: str | None = None
    invoice_date: str | None = Field(default=None, description="ISO 8601 date (YYYY-MM-DD)")
    due_date: str | None = Field(default=None, description="ISO 8601 date (YYYY-MM-DD)")
    payment_terms: str | None = None
    currency: str | None = Field(default=None, description="ISO 4217 currency code")
    invoice_type: InvoiceType | None = None

    # Customer
    customer_name: str | None = None
    customer_vat_id: str | None = None
    customer_address: str | None = None

    # Lines + totals
    line_items: list[LineItem] = Field(default_factory=list)
    vat_breakdown: list[VatBreakdownEntry] = Field(default_factory=list)
    subtotal: Decimal | None = None
    total_vat: Decimal | None = None
    discount_total: Decimal | None = None
    grand_total: Decimal | None = None

    # Payment / misc
    payment_method: str | None = None
    bank_iban: str | None = None
    notes: str | None = None
    reference_number: str | None = None

    # Per-field confidence; keys are field paths like "supplier_name" or
    # "line_items[0].quantity". Sparse — only populated for fields the
    # model is uncertain about.
    confidence: dict[str, ConfidenceLevel] = Field(default_factory=dict)


class ExtractionResponse(BaseModel):
    """Wrapper returned by /extract — one per uploaded file."""

    filename: str
    extraction_method: Literal["text", "ocr"]
    invoice: Invoice
    warnings: list[str] = Field(default_factory=list)
