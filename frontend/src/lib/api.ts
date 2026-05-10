import type { ExtractionResponse, Invoice } from "@/types/invoice";

const BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  "http://localhost:8000";

export async function extractInvoices(
  files: File[],
): Promise<ExtractionResponse[]> {
  const form = new FormData();
  for (const f of files) form.append("files", f);

  const res = await fetch(`${BASE_URL}/extract`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`Extraction failed (${res.status}): ${detail}`);
  }

  return res.json();
}

export async function submitInvoices(invoices: Invoice[]): Promise<{
  received: number;
  invoices: Invoice[];
}> {
  const res = await fetch(`${BASE_URL}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invoices }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`Submit failed (${res.status}): ${detail}`);
  }

  return res.json();
}
