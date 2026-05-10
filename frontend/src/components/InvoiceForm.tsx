import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Invoice, InvoiceType, LineItem } from "@/types/invoice";

// The form uses string state for every field so empty/null/0 stay
// distinguishable. We convert to numbers/null only at submit time.

type StringLineItem = {
  description: string;
  quantity: string;
  unit_price: string;
  discount: string;
  vat_rate: string;
  line_net_total: string;
  line_gross_total: string;
};

type FormState = {
  supplier_name: string;
  supplier_vat_id: string;
  supplier_address: string;
  supplier_email: string;
  supplier_phone: string;

  invoice_number: string;
  invoice_date: string;
  due_date: string;
  payment_terms: string;
  currency: string;
  invoice_type: string;

  customer_name: string;
  customer_vat_id: string;
  customer_address: string;

  line_items: StringLineItem[];

  subtotal: string;
  total_vat: string;
  discount_total: string;
  grand_total: string;

  payment_method: string;
  bank_iban: string;
  notes: string;
  reference_number: string;
};

const s = (v: string | null | undefined) => v ?? "";
const n = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));

function toFormState(inv: Invoice): FormState {
  return {
    supplier_name: s(inv.supplier_name),
    supplier_vat_id: s(inv.supplier_vat_id),
    supplier_address: s(inv.supplier_address),
    supplier_email: s(inv.supplier_email),
    supplier_phone: s(inv.supplier_phone),
    invoice_number: s(inv.invoice_number),
    invoice_date: s(inv.invoice_date),
    due_date: s(inv.due_date),
    payment_terms: s(inv.payment_terms),
    currency: s(inv.currency),
    invoice_type: s(inv.invoice_type),
    customer_name: s(inv.customer_name),
    customer_vat_id: s(inv.customer_vat_id),
    customer_address: s(inv.customer_address),
    line_items: inv.line_items.map((li) => ({
      description: s(li.description),
      quantity: n(li.quantity),
      unit_price: n(li.unit_price),
      discount: n(li.discount),
      vat_rate: n(li.vat_rate),
      line_net_total: n(li.line_net_total),
      line_gross_total: n(li.line_gross_total),
    })),
    subtotal: n(inv.subtotal),
    total_vat: n(inv.total_vat),
    discount_total: n(inv.discount_total),
    grand_total: n(inv.grand_total),
    payment_method: s(inv.payment_method),
    bank_iban: s(inv.bank_iban),
    notes: s(inv.notes),
    reference_number: s(inv.reference_number),
  };
}

const numOrNull = (v: string): number | null => {
  if (v.trim() === "") return null;
  const parsed = Number(v.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};
const strOrNull = (v: string): string | null => (v.trim() === "" ? null : v);

function fromFormState(f: FormState, original: Invoice): Invoice {
  const lineItems: LineItem[] = f.line_items.map((li) => ({
    description: strOrNull(li.description),
    quantity: numOrNull(li.quantity),
    unit_price: numOrNull(li.unit_price),
    discount: numOrNull(li.discount),
    vat_rate: numOrNull(li.vat_rate),
    line_net_total: numOrNull(li.line_net_total),
    line_gross_total: numOrNull(li.line_gross_total),
  }));

  return {
    supplier_name: strOrNull(f.supplier_name),
    supplier_vat_id: strOrNull(f.supplier_vat_id),
    supplier_address: strOrNull(f.supplier_address),
    supplier_email: strOrNull(f.supplier_email),
    supplier_phone: strOrNull(f.supplier_phone),
    invoice_number: strOrNull(f.invoice_number),
    invoice_date: strOrNull(f.invoice_date),
    due_date: strOrNull(f.due_date),
    payment_terms: strOrNull(f.payment_terms),
    currency: strOrNull(f.currency),
    invoice_type: (strOrNull(f.invoice_type) as InvoiceType | null),
    customer_name: strOrNull(f.customer_name),
    customer_vat_id: strOrNull(f.customer_vat_id),
    customer_address: strOrNull(f.customer_address),
    line_items: lineItems,
    vat_breakdown: original.vat_breakdown, // not edited here; passed through
    subtotal: numOrNull(f.subtotal),
    total_vat: numOrNull(f.total_vat),
    discount_total: numOrNull(f.discount_total),
    grand_total: numOrNull(f.grand_total),
    payment_method: strOrNull(f.payment_method),
    bank_iban: strOrNull(f.bank_iban),
    notes: strOrNull(f.notes),
    reference_number: strOrNull(f.reference_number),
    confidence: original.confidence,
  };
}

interface Props {
  invoice: Invoice;
  onChange: (next: Invoice) => void;
}

export function InvoiceForm({ invoice, onChange }: Props) {
  const [form, setForm] = useState<FormState>(() => toFormState(invoice));

  // When the parent swaps to a different invoice (different file),
  // reset our local form state to match.
  useEffect(() => {
    setForm(toFormState(invoice));
  }, [invoice]);

  // Push every change up so the "submit all" button always has fresh data.
  // Debouncing isn't worth it for this tool — submit isn't on a hot path.
  useEffect(() => {
    onChange(fromFormState(form, invoice));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const setLine = (idx: number, key: keyof StringLineItem, value: string) =>
    setForm((prev) => ({
      ...prev,
      line_items: prev.line_items.map((li, i) =>
        i === idx ? { ...li, [key]: value } : li,
      ),
    }));

  const addLine = () =>
    setForm((prev) => ({
      ...prev,
      line_items: [
        ...prev.line_items,
        {
          description: "",
          quantity: "",
          unit_price: "",
          discount: "",
          vat_rate: "",
          line_net_total: "",
          line_gross_total: "",
        },
      ],
    }));

  const removeLine = (idx: number) =>
    setForm((prev) => ({
      ...prev,
      line_items: prev.line_items.filter((_, i) => i !== idx),
    }));

  const conf = invoice.confidence ?? {};

  const computedNet = useMemo(
    () =>
      form.line_items.reduce((acc, li) => {
        const v = Number(li.line_net_total.replace(",", "."));
        return acc + (Number.isFinite(v) ? v : 0);
      }, 0),
    [form.line_items],
  );

  const computedGross = useMemo(
    () =>
      form.line_items.reduce((acc, li) => {
        const v = Number(li.line_gross_total.replace(",", "."));
        return acc + (Number.isFinite(v) ? v : 0);
      }, 0),
    [form.line_items],
  );

  return (
    <div className="space-y-6">
      <Section title="Supplier">
        <Field label="Name" path="supplier_name" conf={conf}>
          <Input value={form.supplier_name} onChange={(e) => set("supplier_name", e.target.value)} />
        </Field>
        <Field label="VAT ID" path="supplier_vat_id" conf={conf}>
          <Input value={form.supplier_vat_id} onChange={(e) => set("supplier_vat_id", e.target.value)} />
        </Field>
        <Field label="Address" path="supplier_address" conf={conf} full>
          <Textarea
            rows={2}
            value={form.supplier_address}
            onChange={(e) => set("supplier_address", e.target.value)}
          />
        </Field>
        <Field label="Email" path="supplier_email" conf={conf}>
          <Input value={form.supplier_email} onChange={(e) => set("supplier_email", e.target.value)} />
        </Field>
        <Field label="Phone" path="supplier_phone" conf={conf}>
          <Input value={form.supplier_phone} onChange={(e) => set("supplier_phone", e.target.value)} />
        </Field>
      </Section>

      <Section title="Invoice metadata">
        <Field label="Invoice number" path="invoice_number" conf={conf}>
          <Input value={form.invoice_number} onChange={(e) => set("invoice_number", e.target.value)} />
        </Field>
        <Field label="Type" path="invoice_type" conf={conf}>
          <Input
            placeholder="standard / credit_note / proforma"
            value={form.invoice_type}
            onChange={(e) => set("invoice_type", e.target.value)}
          />
        </Field>
        <Field label="Issue date" path="invoice_date" conf={conf}>
          <Input
            type="date"
            value={form.invoice_date}
            onChange={(e) => set("invoice_date", e.target.value)}
          />
        </Field>
        <Field label="Due date" path="due_date" conf={conf}>
          <Input
            type="date"
            value={form.due_date}
            onChange={(e) => set("due_date", e.target.value)}
          />
        </Field>
        <Field label="Payment terms" path="payment_terms" conf={conf}>
          <Input value={form.payment_terms} onChange={(e) => set("payment_terms", e.target.value)} />
        </Field>
        <Field label="Currency" path="currency" conf={conf}>
          <Input
            placeholder="EUR"
            value={form.currency}
            onChange={(e) => set("currency", e.target.value.toUpperCase())}
          />
        </Field>
      </Section>

      <Section title="Customer">
        <Field label="Name" path="customer_name" conf={conf}>
          <Input value={form.customer_name} onChange={(e) => set("customer_name", e.target.value)} />
        </Field>
        <Field label="VAT ID" path="customer_vat_id" conf={conf}>
          <Input value={form.customer_vat_id} onChange={(e) => set("customer_vat_id", e.target.value)} />
        </Field>
        <Field label="Address" path="customer_address" conf={conf} full>
          <Textarea
            rows={2}
            value={form.customer_address}
            onChange={(e) => set("customer_address", e.target.value)}
          />
        </Field>
      </Section>

      <Section title="Line items">
        <div className="col-span-2 -mx-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b">
              <tr>
                <th className="text-left py-2 px-2 min-w-[200px]">Description</th>
                <th className="text-right py-2 px-2">Qty</th>
                <th className="text-right py-2 px-2">Unit</th>
                <th className="text-right py-2 px-2">Disc.</th>
                <th className="text-right py-2 px-2">VAT %</th>
                <th className="text-right py-2 px-2">Net</th>
                <th className="text-right py-2 px-2">Gross</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {form.line_items.map((li, idx) => (
                <tr key={idx} className="border-b last:border-b-0">
                  <td className="py-1 px-2">
                    <Input
                      className="h-8"
                      value={li.description}
                      onChange={(e) => setLine(idx, "description", e.target.value)}
                    />
                  </td>
                  {(["quantity", "unit_price", "discount", "vat_rate", "line_net_total", "line_gross_total"] as const).map((k) => (
                    <td key={k} className="py-1 px-2">
                      <Input
                        className={cn(
                          "h-8 text-right tabular-nums",
                          conf[`line_items[${idx}].${k}`] === "low" && "ring-2 ring-amber-400",
                        )}
                        inputMode="decimal"
                        value={li[k]}
                        onChange={(e) => setLine(idx, k, e.target.value)}
                      />
                    </td>
                  ))}
                  <td className="py-1 px-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeLine(idx)}
                      title="Remove line"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-between items-center mt-2 px-2">
            <Button variant="outline" size="sm" onClick={addLine}>
              <Plus className="h-4 w-4" /> Add line
            </Button>
            <div className="text-xs text-muted-foreground tabular-nums">
              Sum of lines — net: {computedNet.toFixed(2)} · gross: {computedGross.toFixed(2)}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Totals">
        <Field label="Subtotal (net)" path="subtotal" conf={conf}>
          <Input
            inputMode="decimal"
            className="text-right tabular-nums"
            value={form.subtotal}
            onChange={(e) => set("subtotal", e.target.value)}
          />
        </Field>
        <Field label="Total VAT" path="total_vat" conf={conf}>
          <Input
            inputMode="decimal"
            className="text-right tabular-nums"
            value={form.total_vat}
            onChange={(e) => set("total_vat", e.target.value)}
          />
        </Field>
        <Field label="Total discount" path="discount_total" conf={conf}>
          <Input
            inputMode="decimal"
            className="text-right tabular-nums"
            value={form.discount_total}
            onChange={(e) => set("discount_total", e.target.value)}
          />
        </Field>
        <Field label="Grand total (gross)" path="grand_total" conf={conf}>
          <Input
            inputMode="decimal"
            className="text-right tabular-nums font-semibold"
            value={form.grand_total}
            onChange={(e) => set("grand_total", e.target.value)}
          />
        </Field>
      </Section>

      <Section title="Other">
        <Field label="Payment method" path="payment_method" conf={conf}>
          <Input value={form.payment_method} onChange={(e) => set("payment_method", e.target.value)} />
        </Field>
        <Field label="IBAN" path="bank_iban" conf={conf}>
          <Input value={form.bank_iban} onChange={(e) => set("bank_iban", e.target.value)} />
        </Field>
        <Field label="Reference number" path="reference_number" conf={conf}>
          <Input value={form.reference_number} onChange={(e) => set("reference_number", e.target.value)} />
        </Field>
        <Field label="Notes" path="notes" conf={conf} full>
          <Textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold mb-3 uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">{children}</div>
    </div>
  );
}

function Field({
  label,
  path,
  conf,
  children,
  full,
}: {
  label: string;
  path: string;
  conf: Record<string, string>;
  children: React.ReactNode;
  full?: boolean;
}) {
  const lowConfidence = conf[path] === "low";
  return (
    <div className={cn(full && "col-span-2", "space-y-1.5")}>
      <div className="flex items-center gap-1.5">
        <Label>{label}</Label>
        {lowConfidence && (
          <span title="Low extraction confidence — please verify">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
          </span>
        )}
      </div>
      <div className={cn(lowConfidence && "[&>*]:ring-2 [&>*]:ring-amber-400")}>
        {children}
      </div>
    </div>
  );
}
