# Smart File Organiser

Smart File Organiser is a private, offline-first desktop app for searching and organizing messy local files by the content inside them, not only by file name.

It scans files and folders, extracts text from common formats, OCRs images and scanned PDFs locally, stores the index in SQLite, detects duplicate uploads by file hash, generates tags/metadata, supports semantic search, and shows virtual smart folders without moving the original files.

This project is being built for the OSDHack 2026 theme: **On Device AI**. The core AI/search/OCR/organization workflow should run locally on the user's machine.

## For Claude Code

If you are Claude Code or another coding agent, read [CLAUDE.md](CLAUDE.md) before editing.

That file contains the project architecture, safety rules, important commands, current implementation details, and the known decisions that should not be accidentally reversed.

## Product Goal

The app should help a user with thousands of mixed files:

- find files even when file names are bad
- search inside PDFs, screenshots, notes, documents, presentations, spreadsheets, text, and code
- understand what each file is about using local extraction and local AI
- organize files virtually inside the app
- eventually suggest safe physical organization plans

The app must not silently move, rename, delete, or rewrite original user files.

Preferred organization flow:

```text
scan locally -> understand content -> suggest folders/tags -> explain why -> user approves -> optionally apply moves later
```

## Current Feature Set

- Electron desktop app with React/Vite UI.
- Upload individual files or whole folders.
- Extract text from:
  - PDF files with embedded text
  - scanned/image-only PDFs
  - PNG, JPG, JPEG, WebP, BMP, GIF, TIFF
  - DOCX, PPTX, XLSX
  - OpenDocument containers
  - Markdown, plain text, and common code files
- Local OCR with Tesseract.js.
- PDF page rendering through PDF.js and `@napi-rs/canvas`.
- Duplicate detection using SHA-256 file hashes.
- SQLite source of truth for documents, paths, pages, jobs, tags, folders, FTS, and embeddings.
- Optional JSON debug snapshot when explicitly enabled.
- OCR queue for remaining pages of larger PDFs.
- Thumbnail generation during upload for faster previews.
- Persistent Python Plan B worker for YAKE/spaCy keywords and sentence-transformer embeddings.
- Fast search and semantic search modes.
- Top 30 semantic results by default.
- Virtual smart folders inside the app.
- User-added file tags.
- User-created virtual folders.
- Dark mode.
- Console logging for extraction, duplicate hits, queue events, thumbnails, Plan B enrichment, and failures.

## Architecture Overview

```text
User selects files/folder
  -> Electron main process validates paths
  -> file hash generated with SHA-256
  -> duplicate hash check
  -> textExtractor extracts/OCRs local content
  -> database stores document, paths, pages, jobs, FTS data
  -> Plan B worker enriches keywords + embeddings
  -> organizer suggests virtual folders
  -> React UI renders search, folders, previews, tags, and details
```

## Important Files

| Area | Files |
| --- | --- |
| Electron entry + IPC | `electron/main.js`, `electron/preload.cjs` |
| SQLite database and search APIs | `electron/database.js` |
| Extraction and OCR | `electron/textExtractor.js` |
| File hash/document identity | `electron/fileIdentity.js` |
| Fast JS search ranker | `electron/searchEngine.js` |
| Plan B Python worker bridge | `electron/planBService.js` |
| Plan B worker | `python/plan_b_worker.py` |
| Organizer logic | `src/utils/organizer.js` |
| Tag/metadata/classifier utilities | `src/utils/tagGenerator.js`, `src/utils/extractMetadata.js`, `src/utils/classifier.js`, `src/utils/dictionary.js` |
| React app | `src/App.jsx`, `src/App.css`, `src/main.jsx` |
| Regression/benchmark scripts | `test/*.mjs`, `test/*.py` |
| Agent handoff notes | `CLAUDE.md` |

## Storage

SQLite is the source of truth.

Default development database:

```text
electron/data/documents.sqlite
```

Local generated database files are ignored by git.

Important data concepts:

- `documents`: one logical document per unique file hash
- `document_paths`: all known paths for the same hash
- `pages`: extracted/OCR text for page-based documents
- `ocr_jobs`: background OCR jobs for remaining pages
- `document_fts`: SQLite FTS search index
- virtual folder tables: app-only folder organization
- tag/override tables: user edits
- embedding fields: semantic search vectors and metadata

`electron/data/documents.json` is not the source of truth. It is only a development/debug snapshot and is disabled by default. Enable it only when needed:

```bash
SMART_SEARCH_WRITE_JSON_SNAPSHOT=1 npm run electron
```

## Search

There are two search paths:

1. **Fast search**
   - SQLite FTS first
   - JavaScript OCR-tolerant fuzzy ranker fallback
   - scores file name, title tags, keyword tags, metadata, category, and extracted text

2. **Semantic search**
   - Uses Plan B embeddings generated during upload/enrichment
   - Uses cached vectors when available
   - Returns up to 30 results by default

Useful environment variable:

```bash
SMART_SEARCH_SEMANTIC_TOP_K=30
```

## Plan B Local AI

Plan B improves keyword extraction and semantic search using a persistent Python worker.

It uses:

- YAKE
- spaCy
- Sentence Transformers
- FAISS when available

Create/install the Python environment:

```bash
python3 -m venv .venv-planb
.venv-planb/bin/python -m pip install -r python/requirements-planb.txt
```

Plan B defaults:

- Python path: `.venv-planb/bin/python`
- worker path: `python/plan_b_worker.py`
- model: `sentence-transformers/all-MiniLM-L6-v2`

Useful environment variables:

```bash
SMART_SEARCH_PLAN_B=0                  # disable Plan B
SMART_SEARCH_PLAN_B_PERSISTENT=0       # disable persistent worker
SMART_SEARCH_PLAN_B_TIMEOUT_MS=360000  # worker timeout
SMART_SEARCH_PLAN_B_PYTHON=/path/to/python
SMART_SEARCH_PLAN_B_WORKER=/path/to/plan_b_worker.py
SMART_SEARCH_SEMANTIC_TOP_K=30
```

## OCR Behavior

Current OCR philosophy:

- Use one OCR pass per image.
- For PDFs, prefer embedded text when available.
- For image-only PDFs, render pages and OCR locally.
- Do not repeatedly OCR the same image at multiple zoom levels by default.
- For large PDFs, index initial useful content first and queue remaining page work.
- Handwritten OCR is expected to be imperfect; the app should extract enough signal for search/organization and mark weak files for review.

## Running The App

Install dependencies:

```bash
npm install
```

Run the browser dev server:

```bash
npm run dev
```

Run the Electron app:

```bash
npm run electron
```

Build frontend:

```bash
npm run build
```

Build desktop release:

```bash
npm run dist
```

## Tests And Checks

Lint:

```bash
npm run lint
```

Main regression test:

```bash
npm test
```

Folder extraction smoke test:

```bash
npm run test:folder -- test1
```

Plan B benchmark:

```bash
node test/plan-b-benchmark.mjs test1
```

Hackathon feature benchmark:

```bash
node test/hackathon-feature-benchmark.mjs test1
```

Semantic threshold benchmark:

```bash
.venv-planb/bin/python test/semantic_threshold_benchmark.py
```

## Reset Local Index Data

Quit the Electron app first, then remove local generated database files:

```bash
rm electron/data/documents.sqlite
rm electron/data/documents.sqlite-wal
rm electron/data/documents.sqlite-shm
rm electron/data/documents.json
```

The app will recreate an empty local index on the next launch.

## Safety Rules

- Never silently move, rename, delete, or rewrite original user files.
- Virtual folders are app metadata only.
- User tags and folder edits should update SQLite, not source files.
- Duplicate uploads should reuse the same document hash/document identity and add paths, not duplicate content.
- Keep all core OCR/search/AI behavior local for the hackathon theme.
- Treat `electron/data/*` and test datasets as local/generated unless the user explicitly says otherwise.

## Current Roadmap

- Improve folder organization quality with better keyword signals and user feedback.
- Add clearer confidence/review workflows.
- Add safe organization preview before physical moves.
- Add undo/history if physical move support is introduced.
- Continue improving previews without making list rendering laggy.
- Improve offline OCR preprocessing only where it gives measurable benefit.
- Package a polished desktop release.

## License

Licensed under the [Apache License 2.0](LICENSE).
