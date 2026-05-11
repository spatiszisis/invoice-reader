The attached image(s) show a Greek invoice. Multiple images represent consecutive pages of the same invoice.

Follow this reading strategy:

1. **Full scan first.** Before extracting any field, visually scan the entire image — top to bottom, left to right. Do not stop at the first occurrence of a value; the same label may appear in a header and again in a summary row.

2. **Typical Greek invoice layout:**
   - **Top section** (header): supplier name, ΑΦΜ, invoice number, date, payment method.
   - **Middle section** (line items table): columns for code, description, quantity, unit, unit price, discount %, VAT %, net total. Rows may be tightly spaced or have thin separators — read every row.
   - **Bottom section** (totals): Αξία Τιμολογίου, Προηγούμενο Υπόλοιπο, Νέο Υπόλοιπο.

3. **Tables.** For each row in the line items table, extract all columns even if some cells are empty. A blank cell means `null`, not that the column doesn't exist. Columns may be unlabeled if headers appear only on the first page.

4. **Partial or cut-off text.** If a word is partially cut off at the edge, try to read what is visible. If illegible, return `null` — never guess.

5. **Rotated or skewed content.** If text appears at a slight angle, still attempt to read it. If a stamp or watermark overlaps a field, try to read through it.

6. **Handwritten annotations.** Some invoices have handwritten corrections or additions. Read them if legible.

7. **Small or faint text.** Totals at the bottom and column headers are sometimes printed in a lighter weight — pay special attention to these areas.

Return JSON only. No explanation, no markdown fences.
