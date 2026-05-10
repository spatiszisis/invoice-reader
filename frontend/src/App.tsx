import { useState } from "react";
import { Toaster } from "sonner";
import { FileText } from "lucide-react";
import { UploadZone } from "@/components/UploadZone";
import { InvoiceReview } from "@/components/InvoiceReview";
import { extractInvoices } from "@/lib/api";
import type { Invoice, InvoiceEntry } from "@/types/invoice";

let nextId = 1;
const newId = () => `entry-${nextId++}`;

export default function App() {
  const [entries, setEntries] = useState<InvoiceEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const startExtraction = async (files: File[]) => {
    setError(null);

    const newEntries: InvoiceEntry[] = files.map((f) => ({
      id: newId(),
      file: f,
      fileUrl: URL.createObjectURL(f),
      filename: f.name,
      status: "extracting",
      invoice: null,
      warnings: [],
      extractionMethod: null,
      errorMessage: null,
    }));
    setEntries((prev) => [...prev, ...newEntries]);

    try {
      const results = await extractInvoices(files);
      setEntries((prev) =>
        prev.map((entry) => {
          const matchIdx = newEntries.findIndex((n) => n.id === entry.id);
          if (matchIdx === -1) return entry;
          const r = results[matchIdx];
          if (!r) {
            return {
              ...entry,
              status: "error",
              errorMessage: "No response slot returned for this file.",
            };
          }
          // The backend returns warnings instead of throwing for per-file failures
          // — treat any warning that starts with "Extraction failed" or
          // "Unsupported" / "exceeds" as a hard error.
          const errLike = r.warnings.find((w) =>
            /^(Extraction failed|Unsupported|File exceeds|File is empty)/i.test(w),
          );
          if (errLike) {
            return { ...entry, status: "error", errorMessage: errLike };
          }
          return {
            ...entry,
            status: "ready",
            invoice: r.invoice,
            warnings: r.warnings,
            extractionMethod: r.extraction_method,
          };
        }),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setEntries((prev) =>
        prev.map((entry) =>
          newEntries.some((n) => n.id === entry.id)
            ? { ...entry, status: "error", errorMessage: msg }
            : entry,
        ),
      );
    }
  };

  const updateInvoice = (id: string, invoice: Invoice) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, invoice } : e)),
    );
  };

  const reset = () => {
    entries.forEach((e) => URL.revokeObjectURL(e.fileUrl));
    setEntries([]);
    setError(null);
  };

  if (entries.length === 0) {
    return (
      <>
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="w-full max-w-2xl space-y-6">
            <div className="flex items-center gap-3">
              <FileText className="h-6 w-6" />
              <div>
                <h1 className="text-xl font-semibold tracking-tight">Invoice Reader</h1>
                <p className="text-sm text-muted-foreground">
                  Upload invoices, review the extracted data, then submit.
                </p>
              </div>
            </div>
            <UploadZone onFiles={startExtraction} />
            {error && (
              <p className="text-sm text-destructive">Error: {error}</p>
            )}
          </div>
        </div>
        <Toaster richColors />
      </>
    );
  }

  return (
    <>
      <InvoiceReview entries={entries} onUpdate={updateInvoice} onReset={reset} />
      <Toaster richColors />
    </>
  );
}
