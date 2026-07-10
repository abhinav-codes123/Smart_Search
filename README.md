# Smart File Organiser

An offline-first desktop app for finding and organizing messy local files by the content inside them, not just by file name.

Smart File Organiser scans folders, extracts text from common document formats, runs local OCR on images and scanned PDFs, stores the index locally in SQLite, detects duplicate files by hash, and provides OCR-tolerant smart search. The long-term goal is safe automatic organization: the app should suggest groups and folder plans, explain why, and move files only after user approval.

Built for the OSDHack 2026 theme: on-device AI. The core extraction, OCR, indexing, and search pipeline runs locally on the user's machine.

## Why

Most laptops eventually become a pile of mixed files:

- lecture notes
- screenshots
- handwritten PDFs
- assignments
- certificates
- spreadsheets
- presentations
- receipts
- duplicate downloads

Traditional search works only when file names are good. This app builds a local intelligence layer over your files so you can search and eventually organize by actual content.

## Current Features

- Scan individual files or whole folders.
- Extract text from:
  - PDF
  - image-only/scanned PDF
  - PNG, JPG, JPEG
  - DOCX
  - PPTX
  - XLSX
  - ODT and other OpenDocument containers
  - Markdown and plain text
  - common text/code-like files
- OCR image files and embedded images using Tesseract.js.
- Render image-based PDF pages and OCR them locally.
- Use embedded PDF text when available to avoid unnecessary OCR.
- Run multi-pass OCR preprocessing for difficult scans and handwritten notes.
- Queue remaining pages of large PDFs for background OCR.
- Generate title tags, keyword tags, metadata, and coarse categories.
- Detect duplicate files with SHA-256 file hashes.
- Store documents, paths, pages, OCR jobs, tags, and search index data in SQLite.
- Keep `electron/data/documents.json` as a development/debug snapshot.
- Log indexing, OCR, duplicate hits, queue events, and failures to the console and Electron DevTools.

## Privacy

- Files stay on the user's machine.
- OCR runs locally.
- Search runs locally.
- The database is local SQLite.
- No cloud OCR or cloud AI API is required for the core workflow.

## Current Search

The current search engine is a local JavaScript ranker. It scores:

- file name
- title tags
- keyword tags
- metadata
- category
- extracted/OCR text

It includes fuzzy matching to tolerate OCR mistakes. This is good for the current prototype, but the next search phase will move ranking toward SQLite FTS over cleaned text for better performance with 5,000 to 10,000 files.

## Planned Search Upgrade

The next architecture will separate raw extraction from clean search text:

```text
original file/page
  -> local extraction or OCR
  -> raw text
  -> cleaned text
  -> keywords, title tags, category
  -> SQLite FTS search index
```

Clean text will drive search and organization. Raw OCR text may be kept only for debugging, low-confidence pages, or reprocessing when cleanup rules improve.

## Storage

SQLite is the source of truth.

Main tables:

- `documents`
- `document_paths`
- `pages`
- `ocr_jobs`
- `tags`
- `document_fts`

`documents.json` is only a temporary readable snapshot for development. It can be deleted once the app is ready.

## Background OCR Queue

Large PDFs should not freeze the app.

Current flow:

1. Extract the first pages immediately.
2. Save the document with status `indexing`.
3. Queue remaining PDF pages.
4. Process one OCR job at a time in the background.
5. Update page text and search data as jobs finish.

This keeps the app usable while long handwritten or scanned PDFs continue indexing.

## Tech Stack

- Electron
- React
- Vite
- Node.js
- SQLite via `node:sqlite`
- PDF.js / `pdfjs-dist`
- Tesseract.js
- JSZip
- `@napi-rs/canvas`
- Tailwind CSS

## Getting Started

Install dependencies:

```bash
npm install
```

Run the Vite dev server:

```bash
npm run dev
```

Run the Electron app:

```bash
npm run electron
```

Build the frontend:

```bash
npm run build
```

Build a desktop release:

```bash
npm run dist
```

## Useful Scripts

Run lint:

```bash
npm run lint
```

Run regression tests:

```bash
npm test
```

Run folder extraction smoke test:

```bash
npm run test:folder -- test1
```

## Reset Local Index Data

For experiments, quit the Electron app and remove local generated index files:

```bash
rm electron/data/documents.sqlite
rm electron/data/documents.sqlite-wal
rm electron/data/documents.sqlite-shm
rm electron/data/documents.json
```

The app will recreate an empty local database on the next launch.

## Roadmap

- Add cleaned text storage and OCR quality scoring.
- Move search ranking to SQLite FTS over clean text.
- Add page-level result previews.
- Build virtual smart folders/groups.
- Generate "why this group?" explanations.
- Add safe file organization preview.
- Add user-approved move/apply flow.
- Add undo history for file moves.
- Improve offline OCR preprocessing for handwritten notes.
- Package polished macOS desktop release.

## Safety Principle

The app should never silently move, rename, delete, or rewrite user files.

Search can be aggressive. Organization must be conservative:

```text
scan locally -> understand content -> suggest groups -> explain -> user approves -> apply -> allow undo
```

## License

Licensed under the [Apache License 2.0](LICENSE).
