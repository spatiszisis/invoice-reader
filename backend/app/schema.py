from __future__ import annotations

from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

ConfidenceLevel = Literal["low", "medium", "high"]


class LineItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    code: str | None = None
    description: str | None = None
    quantity: Decimal | None = None
    unit: str | None = None
    unit_price: Decimal | None = None
    discount: Decimal | None = Field(default=None, description="Discount percentage, e.g. 10 for 10%")
    vat_rate: Decimal | None = Field(default=None, description="VAT rate as a percentage, e.g. 24 for 24%")
    line_net_total: Decimal | None = None


class Invoice(BaseModel):
    model_config = ConfigDict(extra="ignore")

    supplier_name: str | None = None
    supplier_vat_id: str | None = None

    invoice_number: str | None = None
    invoice_date: str | None = Field(default=None, description="ISO 8601 date (YYYY-MM-DD)")
    payment_method: str | None = None

    line_items: list[LineItem] = Field(default_factory=list)

    total_price: Decimal | None = None
    previous_balance: Decimal | None = None
    new_balance: Decimal | None = None

    confidence: dict[str, ConfidenceLevel] = Field(default_factory=dict)


class ExtractionResponse(BaseModel):
    filename: str
    extraction_method: Literal["text", "ocr", "vision"]
    invoice: Invoice
    warnings: list[str] = Field(default_factory=list)
