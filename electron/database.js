import electron from "electron";
import fs from "fs";
import path from "path";
import {
  DatabaseSync
} from "node:sqlite";
import {
  searchDocumentsInDocs
} from "./searchEngine.js";
import {
  createDocumentId,
  createJobId,
  createPageId
} from "./fileIdentity.js";
import {
  log
} from "./logger.js";

const {
  app
} = electron;

const DATA_DIR =
  app?.isPackaged
    ? path.join(
        app.getPath(
          "userData"
        ),
        "data"
      )
    : path.join(
        process.cwd(),
        "electron",
        "data"
      );

const JSON_DB_PATH =
  process.env.SMART_SEARCH_JSON_DB_PATH ||
  (
    process.env.SMART_SEARCH_DB_PATH &&
      path.extname(
        process.env.SMART_SEARCH_DB_PATH
      ) === ".json"
      ? process.env.SMART_SEARCH_DB_PATH
      : path.join(
          DATA_DIR,
          "documents.json"
        )
  );

const SQLITE_DB_PATH =
  process.env.SMART_SEARCH_SQLITE_DB_PATH ||
  (
    process.env.SMART_SEARCH_DB_PATH &&
      [
        ".sqlite",
        ".sqlite3",
        ".db"
      ].includes(
        path.extname(
          process.env.SMART_SEARCH_DB_PATH
        )
      )
      ? process.env.SMART_SEARCH_DB_PATH
      : JSON_DB_PATH.replace(
          /\.json$/i,
          ".sqlite"
        )
  );

const EMPTY_JSON_DB = {
  version: 2,
  documents: [],
  pages: [],
  jobs: []
};

let db;

function now() {

  return new Date()
    .toISOString();
}

function normalizeStoredPath(filePath) {

  if (
    !filePath
  ) {
    return "";
  }

  return path.normalize(
    path.isAbsolute(filePath)
      ? filePath
      : path.resolve(filePath)
  );
}

function toJson(value, fallback) {

  return JSON.stringify(
    value ?? fallback
  );
}

function fromJson(value, fallback) {

  if (
    value == null ||
    value === ""
  ) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function ensureDir(filePath) {

  fs.mkdirSync(
    path.dirname(filePath),
    {
      recursive: true
    }
  );
}

function getDb() {

  if (db) {
    return db;
  }

  ensureDir(
    SQLITE_DB_PATH
  );

  db =
    new DatabaseSync(
      SQLITE_DB_PATH
    );

  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA synchronous = NORMAL");

  createSchema(db);
  migrateJsonIfNeeded(db);
  writeJsonSnapshotSafely(db);

  return db;
}

function createSchema(database) {

  database.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      document_id TEXT PRIMARY KEY,
      file_hash TEXT UNIQUE,
      file_name TEXT NOT NULL,
      primary_path TEXT NOT NULL,
      title_tags_json TEXT NOT NULL DEFAULT '[]',
      keyword_tags_json TEXT NOT NULL DEFAULT '[]',
      category TEXT NOT NULL DEFAULT 'Unknown',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      text TEXT,
      total_pages INTEGER,
      indexed_pages INTEGER,
      status TEXT NOT NULL DEFAULT 'done',
      scanned_at TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS document_paths (
      document_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      PRIMARY KEY (document_id, file_path),
      FOREIGN KEY (document_id)
        REFERENCES documents(document_id)
        ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS pages (
      page_id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      file_hash TEXT,
      file_path TEXT NOT NULL,
      page_number INTEGER NOT NULL,
      text TEXT NOT NULL DEFAULT '',
      has_image INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'done',
      processed_at TEXT NOT NULL,
      UNIQUE (document_id, page_number),
      FOREIGN KEY (document_id)
        REFERENCES documents(document_id)
        ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ocr_jobs (
      job_id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      file_hash TEXT,
      file_path TEXT NOT NULL,
      page_number INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (document_id, page_number),
      FOREIGN KEY (document_id)
        REFERENCES documents(document_id)
        ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tags (
      document_id TEXT NOT NULL,
      tag_type TEXT NOT NULL,
      tag TEXT NOT NULL,
      PRIMARY KEY (document_id, tag_type, tag),
      FOREIGN KEY (document_id)
        REFERENCES documents(document_id)
        ON DELETE CASCADE
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS document_fts
      USING fts5(
        document_id UNINDEXED,
        file_name,
        title_tags,
        keyword_tags,
        metadata,
        category,
        text
      );

    CREATE INDEX IF NOT EXISTS idx_pages_document
      ON pages(document_id, page_number);

    CREATE INDEX IF NOT EXISTS idx_ocr_jobs_status
      ON ocr_jobs(status, attempts, created_at);
  `);
}

function withTransaction(callback) {

  const database =
    getDb();

  database.exec("BEGIN IMMEDIATE");

  try {
    const result =
      callback(database);

    database.exec("COMMIT");

    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function legacyDocumentToRecord(document) {

  const record = {
    ...document
  };

  delete record.pages;
  delete record.jobs;

  const fileHash =
    record.fileHash ||
    `legacy_${Buffer.from(
      record.filePath ||
        record.fileName ||
        Math.random().toString()
    )
      .toString("hex")
      .slice(0, 48)}`;

  const documentId =
    record.documentId ||
    createDocumentId(
      fileHash
    );

  const primaryPath =
    normalizeStoredPath(
      record.primaryPath ||
        record.filePath
    );

  const filePath =
    normalizeStoredPath(
      record.filePath ||
        record.primaryPath
    );

  return {
    ...record,
    documentId,
    fileHash,
    primaryPath,
    filePath,
    paths:
      [
        ...new Set(
          [
            ...(record.paths || []),
            primaryPath,
            filePath
          ]
            .filter(Boolean)
            .map(
              normalizeStoredPath
            )
        )
      ],
    totalPages:
      record.totalPages ?? null,
    indexedPages:
      record.indexedPages ?? null,
    status:
      record.status || "done",
    updatedAt:
      record.updatedAt ||
      record.scannedAt ||
      now()
  };
}

function normalizePageRecord(page) {

  const text =
    page.text ||
    [
      page.embeddedText,
      page.ocrText
    ]
      .filter(Boolean)
      .join("\n\n");

  return {
    ...page,
    text,
    filePath:
      normalizeStoredPath(
        page.filePath
      )
  };
}

function normalizeJsonDB(raw) {

  let jsonDb;

  if (
    Array.isArray(raw)
  ) {
    jsonDb = {
      ...EMPTY_JSON_DB,
      documents:
        raw.map(
          legacyDocumentToRecord
        )
    };
  } else if (
    raw &&
    typeof raw === "object"
  ) {
    jsonDb = {
      ...EMPTY_JSON_DB,
      ...raw,
      version: 2,
      documents:
        (raw.documents || [])
          .map(
            legacyDocumentToRecord
          ),
      pages:
        (raw.pages || [])
          .map(
            normalizePageRecord
          ),
      jobs:
        (raw.jobs || [])
          .filter(job =>
            job.status !== "done"
          )
    };
  } else {
    jsonDb = {
      ...EMPTY_JSON_DB
    };
  }

  for (
    const document
    of jsonDb.documents
  ) {
    delete document.pages;
    delete document.jobs;

    if (
      jsonDb.pages.some(page =>
        page.documentId === document.documentId
      )
    ) {
      delete document.text;
      delete document.ocrText;
    }
  }

  return jsonDb;
}

function readJsonDB(filePath) {

  try {
    if (
      !fs.existsSync(filePath)
    ) {
      return {
        ...EMPTY_JSON_DB
      };
    }

    const data =
      fs.readFileSync(
        filePath,
        "utf8"
      );

    if (
      !data.trim()
    ) {
      return {
        ...EMPTY_JSON_DB
      };
    }

    return normalizeJsonDB(
      JSON.parse(data)
    );
  } catch (error) {
    log.error(
      "database.json.read.failed",
      {
        filePath,
        error:
          error.message
      }
    );

    return {
      ...EMPTY_JSON_DB
    };
  }
}

function migrateJsonIfNeeded(database) {

  const row =
    database
      .prepare(
        "SELECT COUNT(*) AS count FROM documents"
      )
      .get();

  if (
    Number(row.count) > 0 ||
    !fs.existsSync(
      JSON_DB_PATH
    )
  ) {
    return;
  }

  const jsonDb =
    readJsonDB(
      JSON_DB_PATH
    );

  if (
    jsonDb.documents.length === 0 &&
    jsonDb.pages.length === 0 &&
    jsonDb.jobs.length === 0
  ) {
    return;
  }

  log.info(
    "database.sqlite.migration.start",
    {
      jsonPath:
        JSON_DB_PATH,
      sqlitePath:
        SQLITE_DB_PATH,
      documents:
        jsonDb.documents.length,
      pages:
        jsonDb.pages.length,
      jobs:
        jsonDb.jobs.length
    }
  );

  database.exec("BEGIN IMMEDIATE");

  try {
    for (
      const document
      of jsonDb.documents
    ) {
      upsertDocumentRecord(
        database,
        document
      );
    }

    for (
      const page
      of jsonDb.pages
    ) {
      upsertPageRecord(
        database,
        page
      );
    }

    for (
      const job
      of jsonDb.jobs
    ) {
      upsertJobRecord(
        database,
        job
      );
    }

    for (
      const document
      of jsonDb.documents
    ) {
      syncDocumentStatus(
        database,
        document.documentId
      );
      refreshSearchIndex(
        database,
        document.documentId
      );
    }

    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  log.info(
    "database.sqlite.migration.completed",
    {
      sqlitePath:
        SQLITE_DB_PATH
    }
  );
}

function rowToDocument(row) {

  if (!row) {
    return null;
  }

  return {
    documentId:
      row.document_id,
    fileHash:
      row.file_hash,
    filePath:
      row.primary_path,
    fileName:
      row.file_name,
    titleTags:
      fromJson(
        row.title_tags_json,
        []
      ),
    keywordTags:
      fromJson(
        row.keyword_tags_json,
        []
      ),
    category:
      row.category || "Unknown",
    metadata:
      fromJson(
        row.metadata_json,
        {}
      ),
    text:
      row.text || "",
    totalPages:
      row.total_pages,
    indexedPages:
      row.indexed_pages,
    status:
      row.status || "done",
    scannedAt:
      row.scanned_at,
    primaryPath:
      row.primary_path,
    updatedAt:
      row.updated_at
  };
}

function rowToPage(row) {

  return {
    pageId:
      row.page_id,
    documentId:
      row.document_id,
    fileHash:
      row.file_hash,
    filePath:
      row.file_path,
    pageNumber:
      row.page_number,
    text:
      row.text || "",
    hasImage:
      Boolean(row.has_image),
    status:
      row.status || "done",
    processedAt:
      row.processed_at
  };
}

function rowToJob(row) {

  if (!row) {
    return null;
  }

  return {
    jobId:
      row.job_id,
    documentId:
      row.document_id,
    fileHash:
      row.file_hash,
    filePath:
      row.file_path,
    pageNumber:
      row.page_number,
    status:
      row.status,
    attempts:
      row.attempts,
    error:
      row.error,
    createdAt:
      row.created_at,
    updatedAt:
      row.updated_at
  };
}

function getDocumentRow(database, documentId) {

  return database
    .prepare(
      "SELECT * FROM documents WHERE document_id = ?"
    )
    .get(
      documentId
    );
}

function getPathsForDocument(database, documentId) {

  return database
    .prepare(
      "SELECT file_path FROM document_paths WHERE document_id = ? ORDER BY file_path"
    )
    .all(
      documentId
    )
    .map(row =>
      row.file_path
    );
}

function getPagesForDocument(database, documentId) {

  return database
    .prepare(
      "SELECT * FROM pages WHERE document_id = ? AND status != 'failed' ORDER BY page_number"
    )
    .all(
      documentId
    )
    .map(
      rowToPage
    );
}

function getJobsForSnapshot(database) {

  return database
    .prepare(
      "SELECT * FROM ocr_jobs ORDER BY created_at ASC, page_number ASC"
    )
    .all()
    .map(
      rowToJob
    );
}

function aggregateDocumentText(document, pages) {

  const pageText =
    pages
      .map(page =>
        page.text
      )
      .filter(Boolean)
      .join("\n\n");

  return pageText ||
    document.text ||
    document.ocrText ||
    "";
}

function flattenDocument(
  database,
  row
) {

  const document =
    rowToDocument(
      row
    );

  if (!document) {
    return null;
  }

  const pages =
    getPagesForDocument(
      database,
      document.documentId
    );

  const paths =
    getPathsForDocument(
      database,
      document.documentId
    );

  const text =
    aggregateDocumentText(
      document,
      pages
    );

  return {
    ...document,
    filePath:
      document.primaryPath ||
      document.filePath,
    paths,
    indexedPages:
      pages.length ||
      document.indexedPages ||
      null,
    text,
    pages:
      pages.map(page => ({
        pageNumber:
          page.pageNumber,
        text:
          page.text,
        status:
          page.status
      }))
  };
}

function createJsonSnapshot(database) {

  const rows =
    database
      .prepare(
        "SELECT * FROM documents ORDER BY updated_at DESC, file_name ASC"
      )
      .all();

  const documents = [];
  const pages = [];

  for (
    const row
    of rows
  ) {
    const document =
      rowToDocument(
        row
      );

    if (!document) {
      continue;
    }

    const documentPages =
      getPagesForDocument(
        database,
        document.documentId
      );

    const paths =
      getPathsForDocument(
        database,
        document.documentId
      );

    const snapshotDocument = {
      documentId:
        document.documentId,
      fileHash:
        document.fileHash,
      filePath:
        document.primaryPath ||
        document.filePath,
      fileName:
        document.fileName,
      primaryPath:
        document.primaryPath ||
        document.filePath,
      paths,
      titleTags:
        document.titleTags || [],
      keywordTags:
        document.keywordTags || [],
      category:
        document.category || "Unknown",
      metadata:
        document.metadata || {},
      totalPages:
        document.totalPages,
      indexedPages:
        documentPages.length ||
        document.indexedPages ||
        null,
      status:
        document.status || "done",
      scannedAt:
        document.scannedAt,
      updatedAt:
        document.updatedAt
    };

    if (
      documentPages.length === 0
    ) {
      snapshotDocument.text =
        document.text || "";
    }

    documents.push(
      snapshotDocument
    );

    for (
      const page
      of documentPages
    ) {
      pages.push({
        pageId:
          page.pageId ||
          createPageId(
            document.documentId,
            page.pageNumber
          ),
        documentId:
          document.documentId,
        fileHash:
          page.fileHash ||
          document.fileHash,
        filePath:
          page.filePath ||
          snapshotDocument.filePath,
        pageNumber:
          page.pageNumber,
        text:
          page.text || "",
        hasImage:
          page.hasImage,
        status:
          page.status || "done",
        processedAt:
          page.processedAt
      });
    }
  }

  return {
    version: 2,
    source:
      "sqlite-snapshot",
    generatedAt:
      now(),
    documents,
    pages,
    jobs:
      getJobsForSnapshot(
        database
      )
  };
}

function writeJsonSnapshot(database) {

  ensureDir(
    JSON_DB_PATH
  );

  const snapshot =
    createJsonSnapshot(
      database
    );

  fs.writeFileSync(
    JSON_DB_PATH,
    `${JSON.stringify(
      snapshot,
      null,
      2
    )}\n`
  );

  log.info(
    "database.json.snapshot.updated",
    {
      jsonPath:
        JSON_DB_PATH,
      documents:
        snapshot.documents.length,
      pages:
        snapshot.pages.length,
      jobs:
        snapshot.jobs.length
    }
  );
}

function writeJsonSnapshotSafely(database) {

  try {
    writeJsonSnapshot(
      database
    );
  } catch (error) {
    log.error(
      "database.json.snapshot.failed",
      {
        jsonPath:
          JSON_DB_PATH,
        error:
          error.message
      }
    );
  }
}

function upsertDocumentRecord(
  database,
  document
) {

  const normalized =
    legacyDocumentToRecord(
      document
    );

  const hasPages =
    (document.pages || []).length > 0 ||
    database
      .prepare(
        "SELECT 1 FROM pages WHERE document_id = ? LIMIT 1"
      )
      .get(
        normalized.documentId
      );

  const storedText =
    hasPages
      ? null
      : normalized.text ||
          normalized.ocrText ||
          "";

  database
    .prepare(`
      INSERT INTO documents (
        document_id,
        file_hash,
        file_name,
        primary_path,
        title_tags_json,
        keyword_tags_json,
        category,
        metadata_json,
        text,
        total_pages,
        indexed_pages,
        status,
        scanned_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(document_id) DO UPDATE SET
        file_hash = excluded.file_hash,
        file_name = excluded.file_name,
        primary_path = excluded.primary_path,
        title_tags_json = excluded.title_tags_json,
        keyword_tags_json = excluded.keyword_tags_json,
        category = excluded.category,
        metadata_json = excluded.metadata_json,
        text = excluded.text,
        total_pages = excluded.total_pages,
        indexed_pages = excluded.indexed_pages,
        status = excluded.status,
        scanned_at = excluded.scanned_at,
        updated_at = excluded.updated_at
    `)
    .run(
      normalized.documentId,
      normalized.fileHash,
      normalized.fileName ||
        path.basename(
          normalized.primaryPath
        ),
      normalized.primaryPath,
      toJson(
        normalized.titleTags,
        []
      ),
      toJson(
        normalized.keywordTags,
        []
      ),
      normalized.category || "Unknown",
      toJson(
        normalized.metadata,
        {}
      ),
      storedText,
      normalized.totalPages,
      normalized.indexedPages,
      normalized.status || "done",
      normalized.scannedAt || null,
      normalized.updatedAt || now()
    );

  for (
    const filePath
    of normalized.paths
  ) {
    database
      .prepare(
        "INSERT OR IGNORE INTO document_paths (document_id, file_path) VALUES (?, ?)"
      )
      .run(
        normalized.documentId,
        filePath
      );
  }

  return normalized;
}

function upsertPageRecord(
  database,
  page
) {

  const normalized =
    normalizePageRecord(
      page
    );

  const pageNumber =
    Number(
      normalized.pageNumber
    );

  const pageId =
    normalized.pageId ||
    createPageId(
      normalized.documentId,
      pageNumber
    );

  database
    .prepare(`
      INSERT INTO pages (
        page_id,
        document_id,
        file_hash,
        file_path,
        page_number,
        text,
        has_image,
        status,
        processed_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(document_id, page_number) DO UPDATE SET
        page_id = excluded.page_id,
        file_hash = excluded.file_hash,
        file_path = excluded.file_path,
        text = excluded.text,
        has_image = excluded.has_image,
        status = excluded.status,
        processed_at = excluded.processed_at
    `)
    .run(
      pageId,
      normalized.documentId,
      normalized.fileHash || null,
      normalizeStoredPath(
        normalized.filePath
      ),
      pageNumber,
      normalized.text || "",
      normalized.hasImage
        ? 1
        : 0,
      normalized.status || "done",
      normalized.processedAt || now()
    );
}

function upsertJobRecord(
  database,
  job
) {

  if (
    job.status === "done"
  ) {
    return;
  }

  const pageNumber =
    Number(
      job.pageNumber
    );

  const jobId =
    job.jobId ||
    createJobId(
      job.documentId,
      pageNumber
    );

  database
    .prepare(`
      INSERT INTO ocr_jobs (
        job_id,
        document_id,
        file_hash,
        file_path,
        page_number,
        status,
        attempts,
        error,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(document_id, page_number) DO UPDATE SET
        job_id = excluded.job_id,
        file_hash = excluded.file_hash,
        file_path = excluded.file_path,
        status = CASE
          WHEN ocr_jobs.status = 'done' THEN ocr_jobs.status
          ELSE excluded.status
        END,
        attempts = excluded.attempts,
        error = excluded.error,
        updated_at = excluded.updated_at
    `)
    .run(
      jobId,
      job.documentId,
      job.fileHash || null,
      normalizeStoredPath(
        job.filePath
      ),
      pageNumber,
      job.status || "pending",
      job.attempts ?? 0,
      job.error || null,
      job.createdAt || now(),
      job.updatedAt || now()
    );
}

function syncDocumentStatus(
  database,
  documentId
) {

  const indexedPages =
    database
      .prepare(
        "SELECT COUNT(*) AS count FROM pages WHERE document_id = ? AND status != 'failed'"
      )
      .get(
        documentId
      )
      .count;

  const pendingJobs =
    database
      .prepare(
        "SELECT COUNT(*) AS count FROM ocr_jobs WHERE document_id = ? AND status IN ('pending', 'processing')"
      )
      .get(
        documentId
      )
      .count;

  database
    .prepare(`
      UPDATE documents
      SET indexed_pages = ?,
          status = ?,
          updated_at = ?
      WHERE document_id = ?
    `)
    .run(
      Number(indexedPages),
      Number(pendingJobs) > 0
        ? "indexing"
        : "done",
      now(),
      documentId
    );
}

function refreshSearchIndex(
  database,
  documentId
) {

  const row =
    getDocumentRow(
      database,
      documentId
    );

  if (!row) {
    return;
  }

  const document =
    flattenDocument(
      database,
      row
    );

  database
    .prepare(
      "DELETE FROM document_fts WHERE document_id = ?"
    )
    .run(
      documentId
    );

  database
    .prepare(
      "DELETE FROM tags WHERE document_id = ?"
    )
    .run(
      documentId
    );

  database
    .prepare(`
      INSERT INTO document_fts (
        document_id,
        file_name,
        title_tags,
        keyword_tags,
        metadata,
        category,
        text
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      document.documentId,
      document.fileName || "",
      document.titleTags?.join(" ") || "",
      document.keywordTags?.join(" ") || "",
      JSON.stringify(
        document.metadata || {}
      ),
      document.category || "",
      document.text || ""
    );

  for (
    const tag
    of document.titleTags || []
  ) {
    database
      .prepare(
        "INSERT OR IGNORE INTO tags (document_id, tag_type, tag) VALUES (?, 'title', ?)"
      )
      .run(
        documentId,
        tag
      );
  }

  for (
    const tag
    of document.keywordTags || []
  ) {
    database
      .prepare(
        "INSERT OR IGNORE INTO tags (document_id, tag_type, tag) VALUES (?, 'keyword', ?)"
      )
      .run(
        documentId,
        tag
      );
  }
}

function findExistingDocument(
  database,
  document
) {

  if (
    document.fileHash
  ) {
    const byHash =
      database
        .prepare(
          "SELECT * FROM documents WHERE file_hash = ?"
        )
        .get(
          document.fileHash
        );

    if (byHash) {
      return byHash;
    }
  }

  const filePath =
    normalizeStoredPath(
      document.filePath ||
        document.primaryPath
    );

  if (!filePath) {
    return null;
  }

  return database
    .prepare(`
      SELECT documents.*
      FROM documents
      JOIN document_paths
        ON document_paths.document_id = documents.document_id
      WHERE document_paths.file_path = ?
      LIMIT 1
    `)
    .get(
      filePath
    ) || null;
}

export function insertDocument(document) {

  const savedDocument =
    withTransaction(database => {
    const existing =
      findExistingDocument(
        database,
        document
      );

    if (
      existing &&
      document.fileHash
    ) {
      log.info(
        "database.document.duplicate-hit",
        {
          documentId:
            existing.document_id,
          fileHash:
            document.fileHash,
          existingPath:
            existing.primary_path,
          incomingPath:
            document.filePath
        }
      );
    }

    const documentId =
      existing?.document_id ||
      document.documentId ||
      (
        document.fileHash
          ? createDocumentId(
              document.fileHash
            )
          : null
      );

    const primaryPath =
      normalizeStoredPath(
        document.filePath ||
          document.primaryPath ||
          existing?.primary_path
      );

    const nextDocument =
      upsertDocumentRecord(
        database,
        {
          ...rowToDocument(
            existing
          ),
          ...document,
          documentId,
          primaryPath,
          filePath:
            primaryPath,
          paths:
            [
              ...new Set(
                [
                  ...(
                    existing
                      ? getPathsForDocument(
                          database,
                          existing.document_id
                        )
                      : []
                  ),
                  ...(document.paths || []),
                  existing?.primary_path,
                  document.filePath,
                  document.primaryPath,
                  primaryPath
                ]
                  .filter(Boolean)
                  .map(
                    normalizeStoredPath
                  )
              )
            ],
          updatedAt:
            now()
        }
      );

    for (
      const page
      of document.pages || []
    ) {
      upsertPageRecord(
        database,
        {
          ...page,
          documentId:
            nextDocument.documentId,
          fileHash:
            nextDocument.fileHash,
          filePath:
            primaryPath
        }
      );
    }

    for (
      const job
      of document.jobs || []
    ) {
      upsertJobRecord(
        database,
        {
          ...job,
          documentId:
            nextDocument.documentId,
          fileHash:
            nextDocument.fileHash,
          filePath:
            primaryPath
        }
      );

      log.info(
        "database.job.queued",
        {
          jobId:
            job.jobId ||
            createJobId(
              nextDocument.documentId,
              job.pageNumber
            ),
          documentId:
            nextDocument.documentId,
          pageNumber:
            job.pageNumber,
          filePath:
            primaryPath
        }
      );
    }

    syncDocumentStatus(
      database,
      nextDocument.documentId
    );
    refreshSearchIndex(
      database,
      nextDocument.documentId
    );

    const savedRow =
      getDocumentRow(
        database,
        nextDocument.documentId
      );

    log.info(
      existing
        ? "database.document.updated"
        : "database.document.created",
      {
        documentId:
          nextDocument.documentId,
        fileHash:
          nextDocument.fileHash,
        pathCount:
          getPathsForDocument(
            database,
            nextDocument.documentId
          ).length,
        filePath:
          primaryPath
      }
    );

    return flattenDocument(
      database,
      savedRow
    );
  });

  writeJsonSnapshotSafely(
    getDb()
  );

  return savedDocument;
}

export function getAllDocuments() {

  const database =
    getDb();

  return database
    .prepare(
      "SELECT * FROM documents ORDER BY updated_at DESC, file_name ASC"
    )
    .all()
    .map(row =>
      flattenDocument(
        database,
        row
      )
    )
    .filter(Boolean);
}

export function searchDocuments(query) {

  // FTS is maintained for scale and future ranking, while the existing
  // JavaScript scorer keeps current fuzzy OCR-tolerant behavior.
  return searchDocumentsInDocs(
    getAllDocuments(),
    query
  );
}

export function claimNextOcrJob() {

  const claimedJob =
    withTransaction(database => {
    const row =
      database
        .prepare(`
          SELECT *
          FROM ocr_jobs
          WHERE status = 'pending'
            AND attempts < 3
          ORDER BY created_at ASC, page_number ASC
          LIMIT 1
        `)
        .get();

    if (!row) {
      log.info(
        "database.job.none-pending"
      );
      return null;
    }

    const attempts =
      Number(row.attempts || 0) + 1;

    database
      .prepare(`
        UPDATE ocr_jobs
        SET status = 'processing',
            attempts = ?,
            updated_at = ?
        WHERE job_id = ?
      `)
      .run(
        attempts,
        now(),
        row.job_id
      );

    const updated =
      rowToJob({
        ...row,
        status:
          "processing",
        attempts
      });

    log.info(
      "database.job.claimed",
      {
        jobId:
          updated.jobId,
        documentId:
          updated.documentId,
        pageNumber:
          updated.pageNumber,
        attempts:
          updated.attempts
      }
    );

    return updated;
  });

  if (claimedJob) {
    writeJsonSnapshotSafely(
      getDb()
    );
  }

  return claimedJob;
}

export function completeOcrJob(job, pageResult) {

  withTransaction(database => {
    upsertPageRecord(
      database,
      {
        documentId:
          job.documentId,
        fileHash:
          job.fileHash,
        filePath:
          job.filePath,
        pageNumber:
          job.pageNumber,
        text:
          pageResult.text,
        embeddedText:
          pageResult.embeddedText,
        ocrText:
          pageResult.ocrText,
        hasImage:
          pageResult.hasImage,
        status:
          "done"
      }
    );

    database
      .prepare(
        "DELETE FROM ocr_jobs WHERE job_id = ?"
      )
      .run(
        job.jobId
      );

    syncDocumentStatus(
      database,
      job.documentId
    );
    refreshSearchIndex(
      database,
      job.documentId
    );
  });

  writeJsonSnapshotSafely(
    getDb()
  );

  log.info(
    "database.job.completed",
    {
      jobId:
        job.jobId,
      documentId:
        job.documentId,
      pageNumber:
        job.pageNumber,
      chars:
        pageResult.text?.length ?? 0
    }
  );
}

export function failOcrJob(job, error) {

  withTransaction(database => {
    const savedJob =
      database
        .prepare(
          "SELECT * FROM ocr_jobs WHERE job_id = ?"
        )
        .get(
          job.jobId
        );

    if (savedJob) {
      const nextStatus =
        Number(savedJob.attempts) >= 3
          ? "failed"
          : "pending";

      database
        .prepare(`
          UPDATE ocr_jobs
          SET status = ?,
              error = ?,
              updated_at = ?
          WHERE job_id = ?
        `)
        .run(
          nextStatus,
          error?.message ||
            String(error),
          now(),
          job.jobId
        );
    }

    syncDocumentStatus(
      database,
      job.documentId
    );
  });

  writeJsonSnapshotSafely(
    getDb()
  );

  log.warn(
    "database.job.failed",
    {
      jobId:
        job.jobId,
      documentId:
        job.documentId,
      pageNumber:
        job.pageNumber,
      attempts:
        job.attempts,
      error:
        error?.message ||
        String(error)
    }
  );
}

export function getOcrQueueStatus() {

  const database =
    getDb();

  const rows =
    database
      .prepare(
        "SELECT status, COUNT(*) AS count FROM ocr_jobs GROUP BY status"
      )
      .all();

  return rows.reduce(
    (status, row) => {
      status[row.status] =
        Number(row.count);

      return status;
    },
    {}
  );
}

export function getDatabaseInfo() {

  const database =
    getDb();

  return {
    engine:
      "sqlite",
    sqlitePath:
      SQLITE_DB_PATH,
    jsonPath:
      JSON_DB_PATH,
    documents:
      Number(
        database
          .prepare(
            "SELECT COUNT(*) AS count FROM documents"
          )
          .get()
          .count
      ),
    pages:
      Number(
        database
          .prepare(
            "SELECT COUNT(*) AS count FROM pages"
          )
          .get()
          .count
      ),
    jobs:
      Number(
        database
          .prepare(
            "SELECT COUNT(*) AS count FROM ocr_jobs"
          )
          .get()
          .count
      )
  };
}

getDb();
