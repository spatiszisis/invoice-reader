export type ConfidenceLevel = "low" | "medium" | "high";

export interface LineItem {
  code: string | null;
  description: string | null;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  discount: number | null;
  vat_rate: number | null;
  line_net_total: number | null;
}

export interface Invoice {
  supplier_name: string | null;
  supplier_vat_id: string | null;

  invoice_number: string | null;
  invoice_date: string | null;
  payment_method: string | null;

  line_items: LineItem[];

  total_price: number | null;
  previous_balance: number | null;
  new_balance: number | null;

  confidence: Record<string, ConfidenceLevel>;
}

export interface ExtractionResponse {
  filename: string;
  extraction_method: "text" | "ocr" | "vision";
  invoice: Invoice;
  warnings: string[];
}

export interface InvoiceEntry {
  id: string;
  file: File;
  fileUrl: string;
  filename: string;
  status: "pending" | "extracting" | "ready" | "error";
  invoice: Invoice | null;
  warnings: string[];
  extractionMethod: "text" | "ocr" | "vision" | null;
  errorMessage: string | null;
}
