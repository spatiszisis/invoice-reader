.PHONY: help setup setup-system setup-backend setup-frontend backend frontend clean

VENV := backend/.venv
PYTHON := $(VENV)/bin/python
PIP := $(VENV)/bin/pip

help:
	@echo "Invoice Reader (native — no Docker)"
	@echo ""
	@echo "Prereqs:"
	@echo "  - Homebrew (https://brew.sh)"
	@echo "  - LM Studio running with its server on (Developer tab → Server)"
	@echo "  - A model loaded in LM Studio"
	@echo ""
	@echo "First time:"
	@echo "  make setup       Install everything (system deps + Python + Node)"
	@echo ""
	@echo "Daily:"
	@echo "  make backend     Start the FastAPI backend on :8000"
	@echo "  make frontend    Start the Vite frontend on :5173"
	@echo "                   (run these in two separate terminals)"
	@echo ""
	@echo "  make clean       Remove venv and node_modules"

# ============================================================================
# setup
# ============================================================================

setup: setup-system setup-backend setup-frontend
	@echo ""
	@echo "✓ Setup complete. Next steps:"
	@echo "    1. cp .env.example .env    (if you haven't already)"
	@echo "    2. Open LM Studio, start its server, load a model"
	@echo "    3. make backend            (in one terminal)"
	@echo "    4. make frontend           (in another terminal)"

# Tesseract for OCR, Greek + English language packs, poppler for pdf2image.
# tesseract-lang installs every language Tesseract supports — large but
# avoids fiddly per-language installs.
setup-system:
	@command -v brew >/dev/null 2>&1 || { \
		echo "Homebrew not found. Install from https://brew.sh"; exit 1; }
	@echo "Installing system dependencies (tesseract, poppler)..."
	brew install tesseract tesseract-lang poppler
	@echo ""
	@tesseract --list-langs 2>&1 | grep -qE '^(ell|eng)$$' && echo "✓ Tesseract has Greek + English" || \
		echo "⚠ Tesseract is installed but missing 'ell' or 'eng' language pack."

setup-backend:
	@command -v python3 >/dev/null 2>&1 || { \
		echo "python3 not found. Install via brew: brew install python@3.11"; exit 1; }
	@echo "Creating Python virtualenv at $(VENV)..."
	test -d $(VENV) || python3 -m venv $(VENV)
	$(PIP) install --upgrade pip
	$(PIP) install -r backend/requirements.txt
	@echo "✓ Backend deps installed"

setup-frontend:
	@command -v npm >/dev/null 2>&1 || { \
		echo "npm not found. Install Node: brew install node"; exit 1; }
	cd frontend && npm install
	@echo "✓ Frontend deps installed"

# ============================================================================
# run
# ============================================================================

backend:
	@test -d $(VENV) || { echo "Backend not set up. Run 'make setup' first."; exit 1; }
	@test -f .env || { echo "No .env file. Run 'cp .env.example .env' first."; exit 1; }
	@echo "Starting backend on http://localhost:8000"
	@echo "Loading config from .env..."
	cd backend && set -a && . ../.env && set +a && \
		../$(VENV)/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

frontend:
	@test -d frontend/node_modules || { \
		echo "Frontend not set up. Run 'make setup' first."; exit 1; }
	cd frontend && npm run dev

# ============================================================================
# clean
# ============================================================================

clean:
	rm -rf $(VENV) frontend/node_modules
	@echo "Removed venv and node_modules. Run 'make setup' to reinstall."
