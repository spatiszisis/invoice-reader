// Mirror of backend/app/schema.py. Numbers are kept as `string | null` on
// the form side (numeric inputs are strings) and converted at submit time.
// Backend sends them as `number | null`.

export type ConfidenceLevel = "low" | "medium" | "high";
export type InvoiceType = "standard" | "credit_note" | "proforma";

export interface LineItem {
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  discount: number | null;
  vat_rate: number | null;
  line_net_total: number | null;
  line_gross_total: number | null;
}

export interface VatBreakdownEntry {
  vat_rate: number;
  taxable_amount: number;
  vat_amount: number;
}

export interface Invoice {
  supplier_name: string | null;
  supplier_vat_id: string | null;
  supplier_address: string | null;
  supplier_email: string | null;
  supplier_phone: string | null;

  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  payment_terms: string | null;
  currency: string | null;
  invoice_type: InvoiceType | null;

  customer_name: string | null;
  customer_vat_id: string | null;
  customer_address: string | null;

  line_items: LineItem[];
  vat_breakdown: VatBreakdownEntry[];

  subtotal: number | null;
  total_vat: number | null;
  discount_total: number | null;
  grand_total: number | null;

  payment_method: string | null;
  bank_iban: string | null;
  notes: string | null;
  reference_number: string | null;

  confidence: Record<string, ConfidenceLevel>;
}

export interface ExtractionResponse {
  filename: string;
  extraction_method: "text" | "ocr";
  invoice: Invoice;
  warnings: string[];
}

// Local-only — the file the user uploaded, kept in memory for the PDF preview.
export interface InvoiceEntry {
  id: string;
  file: File;
  fileUrl: string; // blob: URL for the PDF viewer
  filename: string;
  status: "pending" | "extracting" | "ready" | "error";
  invoice: Invoice | null;
  warnings: string[];
  extractionMethod: "text" | "ocr" | null;
  errorMessage: string | null;
}
