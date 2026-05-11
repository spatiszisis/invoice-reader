import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Invoice, LineItem } from "@/types/invoice";

type StringLineItem = {
  code: string;
  description: string;
  quantity: string;
  unit: string;
  unit_price: string;
  discount: string;
  vat_rate: string;
  line_net_total: string;
};

type FormState = {
  supplier_name: string;
  supplier_vat_id: string;
  invoice_number: string;
  invoice_date: string;
  payment_method: string;
  line_items: StringLineItem[];
  total_price: string;
  previous_balance: string;
  new_balance: string;
};

const s = (v: string | null | undefined) => v ?? "";
const n = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));

function toFormState(inv: Invoice): FormState {
  return {
    supplier_name: s(inv.supplier_name),
    supplier_vat_id: s(inv.supplier_vat_id),
    invoice_number: s(inv.invoice_number),
    invoice_date: s(inv.invoice_date),
    payment_method: s(inv.payment_method),
    line_items: inv.line_items.map((li) => ({
      code: s(li.code),
      description: s(li.description),
      quantity: n(li.quantity),
      unit: s(li.unit),
      unit_price: n(li.unit_price),
      discount: n(li.discount),
      vat_rate: n(li.vat_rate),
      line_net_total: n(li.line_net_total),
    })),
    total_price: n(inv.total_price),
    previous_balance: n(inv.previous_balance),
    new_balance: n(inv.new_balance),
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
    code: strOrNull(li.code),
    description: strOrNull(li.description),
    quantity: numOrNull(li.quantity),
    unit: strOrNull(li.unit),
    unit_price: numOrNull(li.unit_price),
    discount: numOrNull(li.discount),
    vat_rate: numOrNull(li.vat_rate),
    line_net_total: numOrNull(li.line_net_total),
  }));

  return {
    supplier_name: strOrNull(f.supplier_name),
    supplier_vat_id: strOrNull(f.supplier_vat_id),
    invoice_number: strOrNull(f.invoice_number),
    invoice_date: strOrNull(f.invoice_date),
    payment_method: strOrNull(f.payment_method),
    line_items: lineItems,
    total_price: numOrNull(f.total_price),
    previous_balance: numOrNull(f.previous_balance),
    new_balance: numOrNull(f.new_balance),
    confidence: original.confidence,
  };
}

interface Props {
  invoice: Invoice;
  onChange: (next: Invoice) => void;
}

export function InvoiceForm({ invoice, onChange }: Props) {
  const [form, setForm] = useState<FormState>(() => toFormState(invoice));

  useEffect(() => {
    setForm(toFormState(invoice));
  }, [invoice]);

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
        { code: "", description: "", quantity: "", unit: "", unit_price: "", discount: "", vat_rate: "", line_net_total: "" },
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

  return (
    <div className="space-y-6">
      <Section title="Προμηθευτής">
        <Field label="Επωνυμία" path="supplier_name" conf={conf}>
          <Input value={form.supplier_name} onChange={(e) => set("supplier_name", e.target.value)} />
        </Field>
        <Field label="ΑΦΜ" path="supplier_vat_id" conf={conf}>
          <Input value={form.supplier_vat_id} onChange={(e) => set("supplier_vat_id", e.target.value)} />
        </Field>
      </Section>

      <Section title="Στοιχεία Τιμολογίου">
        <Field label="Αριθμός Τιμολογίου" path="invoice_number" conf={conf}>
          <Input value={form.invoice_number} onChange={(e) => set("invoice_number", e.target.value)} />
        </Field>
        <Field label="Ημερομηνία" path="invoice_date" conf={conf}>
          <Input
            type="date"
            value={form.invoice_date}
            onChange={(e) => set("invoice_date", e.target.value)}
          />
        </Field>
        <Field label="Τρόπος Πληρωμής" path="payment_method" conf={conf} full>
          <Input value={form.payment_method} onChange={(e) => set("payment_method", e.target.value)} />
        </Field>
      </Section>

      <Section title="Είδη">
        <div className="col-span-2 -mx-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b">
              <tr>
                <th className="text-left py-2 px-2 min-w-[90px]">Κωδικός</th>
                <th className="text-left py-2 px-2 min-w-[180px]">Περιγραφή</th>
                <th className="text-right py-2 px-2">Ποσ.</th>
                <th className="text-right py-2 px-2">Μον.</th>
                <th className="text-right py-2 px-2">Τιμή</th>
                <th className="text-right py-2 px-2">Εκπτ.%</th>
                <th className="text-right py-2 px-2">ΦΠΑ%</th>
                <th className="text-right py-2 px-2">Καθ. Αξία</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {form.line_items.map((li, idx) => (
                <tr key={idx} className="border-b last:border-b-0">
                  <td className="py-1 px-2">
                    <Input className="h-8" value={li.code} onChange={(e) => setLine(idx, "code", e.target.value)} />
                  </td>
                  <td className="py-1 px-2">
                    <Input className="h-8" value={li.description} onChange={(e) => setLine(idx, "description", e.target.value)} />
                  </td>
                  <td className="py-1 px-2">
                    <Input
                      className={cn("h-8 text-right tabular-nums", conf[`line_items[${idx}].quantity`] === "low" && "ring-2 ring-amber-400")}
                      inputMode="decimal"
                      value={li.quantity}
                      onChange={(e) => setLine(idx, "quantity", e.target.value)}
                    />
                  </td>
                  <td className="py-1 px-2">
                    <Input className="h-8" value={li.unit} onChange={(e) => setLine(idx, "unit", e.target.value)} />
                  </td>
                  {(["unit_price", "discount", "vat_rate", "line_net_total"] as const).map((k) => (
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
                    <Button variant="ghost" size="icon" onClick={() => removeLine(idx)} title="Διαγραφή γραμμής">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-between items-center mt-2 px-2">
            <Button variant="outline" size="sm" onClick={addLine}>
              <Plus className="h-4 w-4" /> Προσθήκη γραμμής
            </Button>
            <div className="text-xs text-muted-foreground tabular-nums">
              Σύνολο καθαρής αξίας: {computedNet.toFixed(2)}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Σύνολα">
        <Field label="Αξία Τιμολογίου" path="total_price" conf={conf}>
          <Input
            inputMode="decimal"
            className="text-right tabular-nums font-semibold"
            value={form.total_price}
            onChange={(e) => set("total_price", e.target.value)}
          />
        </Field>
        <Field label="Προηγούμενο Υπόλοιπο" path="previous_balance" conf={conf}>
          <Input
            inputMode="decimal"
            className="text-right tabular-nums"
            value={form.previous_balance}
            onChange={(e) => set("previous_balance", e.target.value)}
          />
        </Field>
        <Field label="Νέο Υπόλοιπο" path="new_balance" conf={conf}>
          <Input
            inputMode="decimal"
            className="text-right tabular-nums font-semibold"
            value={form.new_balance}
            onChange={(e) => set("new_balance", e.target.value)}
          />
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
          <span title="Χαμηλή αξιοπιστία εξαγωγής — παρακαλώ επαληθεύστε">
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
