import { useState } from "react";
import { CheckCircle2, AlertCircle, Loader2, FileText, Send, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PdfViewer } from "@/components/PdfViewer";
import { InvoiceForm } from "@/components/InvoiceForm";
import { submitInvoices } from "@/lib/api";
import type { Invoice, InvoiceEntry } from "@/types/invoice";

interface Props {
  entries: InvoiceEntry[];
  onUpdate: (id: string, invoice: Invoice) => void;
  onReset: () => void;
}

export function InvoiceReview({ entries, onUpdate, onReset }: Props) {
  const [activeId, setActiveId] = useState(
    entries.find((e) => e.status === "ready")?.id ?? entries[0]?.id,
  );
  const [submitting, setSubmitting] = useState(false);

  const active = entries.find((e) => e.id === activeId);

  const readyCount = entries.filter((e) => e.status === "ready").length;
  const allReady = entries.length > 0 && entries.every((e) => e.status === "ready");

  const handleSubmit = async () => {
    const invoices = entries
      .filter((e) => e.status === "ready" && e.invoice)
      .map((e) => e.invoice as Invoice);
    if (!invoices.length) return;

    setSubmitting(true);
    try {
      const result = await submitInvoices(invoices);
      toast.success(`Submitted ${result.received} invoices`, {
        description: "External service will receive this payload (currently stubbed).",
      });
    } catch (err) {
      toast.error("Submit failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5" />
          <h1 className="font-semibold">Ανάγνωση Τιμολογίων</h1>
          <span className="text-sm text-muted-foreground">
            {readyCount} από {entries.length} έτοιμα
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onReset}>
            <RotateCcw className="h-4 w-4" /> Νέα αναζήτηση
          </Button>
          <Button onClick={handleSubmit} disabled={!allReady || submitting}>
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Υποβολή {readyCount > 0 && `(${readyCount})`}
          </Button>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-[260px_1fr_1fr] min-h-0">
        {/* Sidebar */}
        <aside className="border-r overflow-y-auto">
          <ul className="p-2 space-y-1">
            {entries.map((e) => (
              <li key={e.id}>
                <button
                  onClick={() => setActiveId(e.id)}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-md text-sm flex items-start gap-2 transition-colors",
                    e.id === activeId ? "bg-accent" : "hover:bg-accent/50",
                  )}
                >
                  <StatusIcon status={e.status} />
                  <span className="flex-1 min-w-0">
                    <span className="block truncate font-medium">{e.filename}</span>
                    {e.status === "ready" && e.invoice?.invoice_number && (
                      <span className="block text-xs text-muted-foreground truncate">
                        {e.invoice.invoice_number}
                        {e.invoice.total_price != null && ` · ${e.invoice.total_price} €`}
                      </span>
                    )}
                    {e.status === "error" && (
                      <span className="block text-xs text-destructive truncate">
                        {e.errorMessage}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* PDF preview */}
        <section className="border-r p-4 min-h-0">
          {active ? (
            <PdfViewer fileUrl={active.fileUrl} filename={active.filename} />
          ) : (
            <Empty />
          )}
        </section>

        {/* Form */}
        <section className="p-6 overflow-y-auto min-h-0">
          {active?.status === "ready" && active.invoice ? (
            <>
              {active.warnings.length > 0 && (
                <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  {active.warnings.map((w, i) => (
                    <div key={i}>⚠ {w}</div>
                  ))}
                </div>
              )}
              {active.extractionMethod === "ocr" && (
                <p className="mb-4 text-xs text-muted-foreground">
                  Εξαγωγή μέσω OCR (Tesseract). Επαληθεύστε προσεκτικά — το OCR είναι πιο επιρρεπές σε σφάλματα.
                </p>
              )}
              <InvoiceForm
                invoice={active.invoice}
                onChange={(inv) => onUpdate(active.id, inv)}
              />
            </>
          ) : active?.status === "extracting" ? (
            <Centered>
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground mt-2">Εξαγωγή δεδομένων…</p>
            </Centered>
          ) : active?.status === "error" ? (
            <Centered>
              <AlertCircle className="h-6 w-6 text-destructive" />
              <p className="text-sm font-medium mt-2">Αποτυχία εξαγωγής</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm text-center">
                {active.errorMessage}
              </p>
            </Centered>
          ) : (
            <Empty />
          )}
        </section>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: InvoiceEntry["status"] }) {
  if (status === "ready") return <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5" />;
  if (status === "error") return <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />;
  if (status === "extracting") return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mt-0.5" />;
  return <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full flex flex-col items-center justify-center">{children}</div>
  );
}

function Empty() {
  return (
    <Centered>
      <p className="text-sm text-muted-foreground">Επιλέξτε αρχείο από την αριστερή λίστα</p>
    </Centered>
  );
}
