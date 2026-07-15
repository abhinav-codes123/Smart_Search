# Claude Code Guide: Smart File Organiser

Use this file as the working context before editing this repo.

## Mission

Smart File Organiser is an offline-first Electron desktop app for searching and virtually organizing local files by their content. It is being built for OSDHack 2026, so the main AI/OCR/search/organization behavior should run on-device.

The product started as automatic file organization, then became smart local search, and is now both:

```text
local extraction + OCR + tags + semantic search + virtual smart folders
```

The app should help users with 5,000 to 10,000 messy files on a laptop.

## Non-Negotiable Safety Rule

Do not silently move, rename, delete, or rewrite original user files.

Current folder organization is virtual/app-only. Clicking a file opens or reveals the original file path, but the app should not physically organize files unless a future explicit reviewed workflow is implemented.

## Current Source Of Truth

SQLite is the source of truth.

Default dev DB:

```text
electron/data/documents.sqlite
```

`electron/data/documents.json` is only an optional debug snapshot. It is disabled unless:

```bash
SMART_SEARCH_WRITE_JSON_SNAPSHOT=1
```

Do not build new behavior around `documents.json`.

## Code Map

- `electron/main.js`
  - Electron app lifecycle
  - IPC handlers
  - upload/extract/save orchestration
  - OCR queue startup
  - thumbnail scheduling
  - Plan B enrichment coordination

- `electron/preload.cjs`
  - safe renderer API exposed as `window.electronAPI`

- `electron/database.js`
  - SQLite schema and migrations
  - document insertion/dedupe
  - pages/jobs/tags/folders
  - FTS index
  - search document APIs
  - semantic embedding storage

- `electron/textExtractor.js`
  - text extraction from PDFs, images, Office/OpenDocument files, text/code files
  - PDF render + Tesseract OCR
  - OCR queue page extraction helpers

- `electron/fileIdentity.js`
  - SHA-256 file hashing
  - deterministic document/page/job IDs

- `electron/searchEngine.js`
  - JavaScript OCR-tolerant/fuzzy ranker
  - fallback after SQLite FTS

- `electron/planBService.js`
  - persistent Python worker lifecycle
  - YAKE/spaCy/embedding enrichment
  - semantic search bridge

- `python/plan_b_worker.py`
  - Plan B keyword extraction and embeddings
  - optional FAISS vector search

- `src/utils/organizer.js`
  - default virtual folder tree
  - organization scoring
  - folder suggestions and reasons

- `src/App.jsx`
  - React UI
  - uploads
  - search controls
  - virtual folders
  - detail inspector
  - tags
  - dark mode

- `src/App.css`
  - app layout and UI styling

## Current Upload Flow

1. Renderer sends selected file paths to Electron.
2. Main process computes SHA-256 hash.
3. Existing hash means duplicate hit:
   - keep same logical document
   - add/keep path
   - do not duplicate extracted content
4. New file is passed to `extractFileForIndex`.
5. Extraction returns text, pages, quality, jobs, and status.
6. `insertDocument` stores data in SQLite and updates FTS.
7. PDF preview thumbnail is scheduled.
8. Plan B enrichment runs and stores better keywords/embeddings when available.
9. If OCR jobs exist, the background OCR queue starts.

## Search Behavior

Fast search:

- `database.searchDocuments(query)`
- tries SQLite FTS first
- then uses `searchDocumentsInDocs` fuzzy OCR-tolerant scoring

Semantic search:

- exposed through `searchDocumentsPlanB`
- uses cached embeddings when possible
- default top K is `SMART_SEARCH_SEMANTIC_TOP_K || 30`

Keep broad category search and exact code search in mind:

- broad examples: `paper`, `assignment`, `certificate`
- exact examples: `BCS303`, `BAS202`, `JEE`

## Plan B

Plan B is local AI enrichment, not a cloud dependency.

Dependencies live in:

```text
python/requirements-planb.txt
```

Expected venv:

```text
.venv-planb/bin/python
```

Important env vars:

```bash
SMART_SEARCH_PLAN_B=0
SMART_SEARCH_PLAN_B_PERSISTENT=0
SMART_SEARCH_PLAN_B_TIMEOUT_MS=360000
SMART_SEARCH_PLAN_B_PYTHON=/path/to/python
SMART_SEARCH_PLAN_B_WORKER=/path/to/python/plan_b_worker.py
SMART_SEARCH_SEMANTIC_TOP_K=30
```

The persistent worker exists because importing spaCy, sentence-transformers, torch, and FAISS per file was too slow.

## OCR Decisions

Current accepted behavior:

- one OCR pass per image
- no repeated OCR at different zoom levels by default
- PDF embedded text is preferred
- image-only PDFs are rendered and OCRed locally
- handwritten OCR will be noisy, so search/organization should rely on keywords, tags, fuzzy matching, and review flags

Do not reintroduce expensive multi-pass OCR unless there is measured quality gain on the test data.

## UI Decisions

The user wants a clean desktop utility, not a marketing page.

Current UI direction:

- compact/list file views
- first-page preview where performance allows
- right detail panel should stay simple:
  - preview
  - file name
  - open/reveal buttons
  - tags
  - add tag
- virtual folders in left sidebar
- user can add/delete file tags
- user can add/delete virtual folders
- `All Files` is protected because it is the root view
- default/pre-created folders may be deleted from the app by marking them hidden with `deleted_at`
- confirm before deleting tags or folders
- dark mode must keep controls visible

Avoid adding large dashboard/stat sections that waste vertical space.

## Development Commands

Install Node dependencies:

```bash
npm install
```

Install Plan B Python dependencies:

```bash
python3 -m venv .venv-planb
.venv-planb/bin/python -m pip install -r python/requirements-planb.txt
```

Run Electron:

```bash
npm run electron
```

Run Vite:

```bash
npm run dev
```

Build:

```bash
npm run build
```

Lint:

```bash
npm run lint
```

Regression:

```bash
npm test
```

Folder extraction smoke test:

```bash
npm run test:folder -- test1
```

## Useful Benchmarks

```bash
node test/plan-b-benchmark.mjs test1
node test/hackathon-feature-benchmark.mjs test1
.venv-planb/bin/python test/semantic_threshold_benchmark.py
```

Some local datasets like `test1/` are intentionally ignored by git and may exist only on the user's machine.

## Reset Local Data

Only do this when explicitly asked or when running an isolated experiment:

```bash
rm electron/data/documents.sqlite
rm electron/data/documents.sqlite-wal
rm electron/data/documents.sqlite-shm
rm electron/data/documents.json
```

Quit Electron first.

## Implementation Rules For Future Agents

- Prefer small, focused changes.
- Read the existing flow before refactoring.
- Do not treat `documents.json` as authoritative.
- Do not commit generated DBs, thumbnails, datasets, venvs, or build outputs.
- Keep local privacy guarantees.
- Keep upload responsive; avoid blocking it with expensive model loads or full-document OCR for huge files.
- If adding physical organization later, require preview, confirmation, and undo/history.
- Test with lint/build at minimum after UI or Electron changes.
- For database behavior, run a small smoke test against `electron/database.js`.
- For OCR/search changes, run relevant scripts under `test/`.

## Known Current Product Bias

The fastest useful path for the hackathon is:

1. reliable upload/indexing
2. good keywords/tags
3. fast search + semantic search
4. believable virtual folders
5. clear UI explaining what is happening locally

Perfect handwritten OCR is not realistic with Tesseract alone. The app should compensate with fuzzy search, tags, keywords, confidence/review states, and user correction.
