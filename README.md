# Invoice Reader

Upload PDF or image invoices, extract structured data with a local LLM
running in **LM Studio**, review and edit the values in a side-by-side
form, then submit to an external service.

No database. No external API. No Docker. Files held in memory; refresh
the page to start over. Runs entirely offline.

## Stack

- **Frontend** — React + Vite + TypeScript + Tailwind + shadcn-style components
- **Backend** — FastAPI + Pydantic (uvicorn on host)
- **LLM** — [LM Studio](https://lmstudio.ai/) on the host (Apple Silicon: uses Metal)
- **OCR** — Tesseract (Greek + English)
- **PDF/text extraction** — pdfplumber for digital PDFs, pdf2image + Tesseract for scans

Any OpenAI-compatible local server works as a drop-in for LM Studio
(Ollama in OpenAI mode, vLLM, llama.cpp's server, etc.) — change one
env var.

## What it can and can't do

✅ Digital PDFs with a real text layer (typical e-invoices)
✅ Scanned PDFs and photos (PNG, JPG, TIFF, WEBP, BMP) — OCR'd via Tesseract
✅ Greek and English (and freely mixed)
✅ Editable confirmation form with low-confidence highlighting
✅ Batch upload (up to 20 files per request)
✅ Fully offline once a model is loaded in LM Studio

⚠ OCR accuracy depends on image quality:
   - Clean flatbed scans: ~95%
   - Phone photos in good light: ~85%
   - Sideways or heavily skewed photos: rotate manually before upload
     (the deskew is conservative and only handles up to 15°)

## One-time setup

### 1. LM Studio

1. Download and install [LM Studio](https://lmstudio.ai/).
2. In the **Discover** tab, download a model. **Recommended:**
   - **Llama 3.1 8B Instruct** (Q4_K_M, ~5 GB) — best for invoices
   - **Qwen 2.5 7B Instruct** — strong alternative, often better on JSON

   ⚠ **Avoid Llama 3.2 3B for this app on real-world inputs.** It's faster
   on clean text, but on messy phone-photo OCR + the complex JSON Schema
   constraint we use, it ends up *slower* in practice (the constrained
   sampler keeps backing up to find valid tokens). 8B converges faster.
3. Click the **Developer** tab → **Server** → **Start** (default port 1234).
4. Load your model from the dropdown at the top of the server panel.
5. **Important: disable Just-in-Time Model Unloading** so the model stays
   warm between requests. Look in Settings → Developer, or in the model's
   load configuration → set TTL to 0 / "never unload". Otherwise every
   idle minute or two costs you 5–10 seconds of cold-load on the next
   extraction.

### 2. Project

```bash
make setup       # installs tesseract, poppler, Python deps, npm deps
cp .env.example .env
```

`make setup` will:
- `brew install tesseract tesseract-lang poppler`
- Create a Python virtualenv at `backend/.venv` and install requirements
- `npm install` for the frontend

If you don't have Homebrew, install it first: https://brew.sh

## Daily use

Two terminals:

```bash
# Terminal 1
make backend       # http://localhost:8000

# Terminal 2
make frontend      # http://localhost:5173
```

Open http://localhost:5173 and upload some invoices.

## How it works

```
upload (PDFs + images)  →  POST /extract
                                │
                                ▼
                    ┌────────── route by file type ──────────┐
                    │                                          │
            PDF with text                            PDF without text  /
                    │                                  image upload
                    ▼                                          │
             pdfplumber                                        ▼
                    │                       pdf2image (rasterize at 300 DPI)
                    │                                          │
                    │                                          ▼
                    │                          opencv preprocessing
                    │                          (resize, grayscale, deskew)
                    │                                          │
                    │                                          ▼
                    │                              Tesseract (ell+eng)
                    │                                          │
                    └──────────────► plain text ◄──────────────┘
                                          │
                                          ▼
                              LM Studio (OpenAI API)
                              + JSON Schema response_format
                              + system prompt
                                          │
                                          ▼
                                JSON  →  Pydantic Invoice
```

The OCR path is a strict superset of the text path — same prompt, same
LLM call, same form. Only the way text gets to the LLM changes.

## Why JSON Schema mode matters

The extractor sends LM Studio the **full Pydantic schema as a constraint**
(via OpenAI's `response_format: { type: "json_schema", ... }`). The model's
sampler is constrained to produce output matching that exact schema —
field names, types, enums, nested arrays, all of it.

This is strictly stronger than asking for "valid JSON" with a schema in the
prompt. Small models otherwise:

- Invent field names (`"supplier"` instead of `"supplier_name"`)
- Return numbers as strings (`"1234.56"` instead of `1234.56`)
- Skip required structure (`"vat_breakdown": null` when an array is required)

The schema is auto-derived from `app/schema.py:Invoice` at import time, so
changes to the Pydantic model automatically flow through to the LLM
constraint. No second source of truth.

## API

| Method | Path        | Description                                                 |
| ------ | ----------- | ----------------------------------------------------------- |
| GET    | `/healthz`  | Liveness + LM Studio reachability + which models are loaded |
| POST   | `/extract`  | Multipart upload; returns `ExtractionResponse[]`            |
| POST   | `/submit`   | JSON `{ invoices: [...] }`; stub that echoes the payload    |

## Layout

```
backend/
├── app/
│   ├── main.py        FastAPI — /extract, /submit, /healthz
│   ├── extractor.py   Routes: pdfplumber / OCR / image → LLM
│   ├── ocr.py         Tesseract + opencv preprocessing
│   ├── prompt.py      The extraction prompt (model-agnostic)
│   └── schema.py      Pydantic Invoice model — also drives the JSON Schema
├── requirements.txt
└── .venv/             (created by `make setup`)

frontend/
├── src/
│   ├── App.tsx                 upload → review screens
│   ├── components/             upload, review, form, PDF viewer
│   ├── lib/api.ts              backend client
│   └── types/invoice.ts        types mirroring backend schema
└── node_modules/      (created by `make setup`)

Makefile          setup / backend / frontend / clean
.env.example
```

## Config

| Env var                    | Default                       | Notes                              |
| -------------------------- | ----------------------------- | ---------------------------------- |
| `LMSTUDIO_BASE_URL`        | `http://localhost:1234/v1`    | Where to find the LLM server       |
| `EXTRACTION_MODEL`         | `local-model`                 | Decorative — LM Studio uses what's loaded |
| `LMSTUDIO_TIMEOUT_SECONDS` | `300`                         | Per-request timeout                |
| `MAX_UPLOAD_MB`            | `10`                          | Per-file size limit                |
| `MAX_BATCH`                | `20`                          | Files per request                  |

## Troubleshooting

**`/healthz` shows `llm_status: "unreachable"`**
LM Studio's server isn't running. Open LM Studio → Developer → Server → Start.
Confirm the port (default 1234) matches `LMSTUDIO_BASE_URL`.

**`available_models` is empty in `/healthz`**
The server is running but no model is loaded. Click the model dropdown at
the top of LM Studio's server panel and pick one.

**Extraction returns `"Extraction did not match schema"`**
The model produced JSON that didn't validate. Check LM Studio's log panel
to see the raw output. Possible causes:
- The model is too small for the task — try Llama 3.1 8B or larger
- The prompt confused the model — adding a worked example for that
  invoice format usually fixes it (`backend/app/prompt.py`)

**Extraction is slow**
On Apple Silicon, LM Studio uses the M-series GPU via Metal — typical
extraction is 3–8 seconds. If you're seeing more like 30–60 seconds:
- Check the Performance pane in LM Studio — should show GPU acceleration
- A 14B+ model is probably too big; try 7–8B
- Make sure the model is already loaded (Just-in-Time loading delays the
  first request by 10–30s)

**OCR result is poor**
Image quality matters. Quick wins: better lighting, hold the camera
parallel to the page, avoid shadows. If the photo is rotated more than
15° the deskew won't fix it — rotate manually before upload.

**`tesseract: command not found` or "no language pack" on macOS**
Run `make setup` again, or directly: `brew install tesseract tesseract-lang`.
Verify Greek is available: `tesseract --list-langs` should include `ell`.

**Want to use Ollama instead of LM Studio**
Set `LMSTUDIO_BASE_URL=http://localhost:11434/v1` in `.env`. Ollama exposes
an OpenAI-compatible endpoint at that path. The rest of the code is
unchanged.
