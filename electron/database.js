import electron from "electron";
import fs from "fs";
import path from "path";
import {
  DatabaseSync
} from "node:sqlite";
import {
  searchDocumentsInDocs,
  tokenize
} from "./searchEngine.js";
import {
  createDocumentId,
  createJobId,
  createPageId
} from "./fileIdentity.js";
import {
  log
} from "./logger.js";
import {
  buildTextQuality
} from "./textQuality.js";
import {
  ORGANIZER_VERSION,
  getDefaultVirtualFolders,
  getOrganizationSearchText,
  getVirtualFolderAncestors,
  getVirtualFolderById,
  suggestOrganization
} from "../src/utils/organizer.js";
import {
  generateKeywordTags,
  generateTitleTags
} from "../src/utils/tagGenerator.js";

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
  version: 3,
  documents: [],
  pages: [],
  virtual_folders: [],
  document_virtual_folders: [],
  folder_keyword_overrides: [],
  document_folder_overrides: [],
  jobs: []
};
const CLEAN_TEXT_VERSION = 8;
const JSON_SNAPSHOT_ENABLED =
  process.env.SMART_SEARCH_WRITE_JSON_SNAPSHOT === "1";

let db;
let jsonSnapshotSkipLogged = false;

function getFileSize(filePath) {
  return fs.existsSync(filePath)
    ? fs.statSync(filePath).size
    : 0;
}

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

function normalizeEmbeddingVector(vector) {

  if (
    !Array.isArray(vector) ||
    vector.length === 0
  ) {
    return null;
  }

  const normalized =
    vector
      .map(value =>
        Number(value)
      )
      .filter(value =>
        Number.isFinite(value)
      );

  if (
    normalized.length !== vector.length
  ) {
    return null;
  }

  return normalized.map(value =>
    Math.round(value * 1000000) / 1000000
  );
}

function rowToSemanticEmbedding(row) {

  if (
    !row?.embedding_json
  ) {
    return null;
  }

  const vector =
    normalizeEmbeddingVector(
      fromJson(
        row.embedding_json,
        []
      )
    );

  if (!vector) {
    return null;
  }

  return {
    model:
      row.embedding_model || null,
    textFingerprint:
      row.embedding_fingerprint || null,
    dimensions:
      row.embedding_dimensions ||
      vector.length,
    updatedAt:
      row.embedding_updated_at || null,
    vector
  };
}

function normalizeEmbeddingForStorage(enrichment) {

  const vector =
    normalizeEmbeddingVector(
      enrichment?.embedding?.vector ||
      enrichment?.embedding
    );

  if (!vector) {
    return null;
  }

  return {
    model:
      enrichment.embedding?.model ||
      enrichment.model ||
      "sentence-transformers/all-MiniLM-L6-v2",
    textFingerprint:
      enrichment.fingerprint || null,
    dimensions:
      enrichment.embedding?.dimensions ||
      vector.length,
    updatedAt:
      now(),
    vector
  };
}

function summarizeSemanticEmbedding(embedding) {

  if (!embedding) {
    return null;
  }

  return {
    model:
      embedding.model,
    textFingerprint:
      embedding.textFingerprint,
    dimensions:
      embedding.dimensions,
    updatedAt:
      embedding.updatedAt,
    hasVector:
      Array.isArray(
        embedding.vector
      ) &&
      embedding.vector.length > 0
  };
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
  backfillMissingCleanText(db);
  backfillOrganizerVersion(db);
  writeJsonSnapshotSafely(db);

  return db;
}

function createSchema(database) {

  database.exec(`
    CREATE TABLE IF NOT EXISTS app_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

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
      clean_text TEXT,
      text_quality INTEGER,
      raw_word_count INTEGER,
      clean_word_count INTEGER,
      noise_ratio REAL,
      embedding_json TEXT,
      embedding_model TEXT,
      embedding_fingerprint TEXT,
      embedding_dimensions INTEGER,
      embedding_updated_at TEXT,
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
      clean_text TEXT NOT NULL DEFAULT '',
      text_quality INTEGER,
      raw_word_count INTEGER,
      clean_word_count INTEGER,
      noise_ratio REAL,
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

    CREATE TABLE IF NOT EXISTS virtual_folders (
      folder_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id TEXT,
      display_path TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'system',
      sort_order INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS document_virtual_folders (
      document_id TEXT NOT NULL,
      folder_id TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0,
      reason_json TEXT NOT NULL DEFAULT '[]',
      document_type TEXT,
      subject TEXT,
      is_primary INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'auto',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (document_id, folder_id),
      FOREIGN KEY (document_id)
        REFERENCES documents(document_id)
        ON DELETE CASCADE,
      FOREIGN KEY (folder_id)
        REFERENCES virtual_folders(folder_id)
        ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS folder_keyword_overrides (
      folder_id TEXT NOT NULL,
      keyword TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'positive',
      weight REAL NOT NULL DEFAULT 1,
      source TEXT NOT NULL DEFAULT 'user',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (folder_id, keyword),
      FOREIGN KEY (folder_id)
        REFERENCES virtual_folders(folder_id)
        ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS document_folder_overrides (
      document_id TEXT NOT NULL,
      folder_id TEXT NOT NULL,
      action TEXT NOT NULL DEFAULT 'add',
      source TEXT NOT NULL DEFAULT 'user',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (document_id, folder_id),
      FOREIGN KEY (document_id)
        REFERENCES documents(document_id)
        ON DELETE CASCADE,
      FOREIGN KEY (folder_id)
        REFERENCES virtual_folders(folder_id)
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

    CREATE INDEX IF NOT EXISTS idx_document_virtual_folders_folder
      ON document_virtual_folders(folder_id, is_primary, confidence);

    CREATE INDEX IF NOT EXISTS idx_folder_keyword_overrides_folder
      ON folder_keyword_overrides(folder_id, role);

    CREATE INDEX IF NOT EXISTS idx_document_folder_overrides_document
      ON document_folder_overrides(document_id, action);
  `);

  ensureColumn(
    database,
    "documents",
    "clean_text",
    "TEXT"
  );
  ensureColumn(
    database,
    "documents",
    "text_quality",
    "INTEGER"
  );
  ensureColumn(
    database,
    "documents",
    "raw_word_count",
    "INTEGER"
  );
  ensureColumn(
    database,
    "documents",
    "clean_word_count",
    "INTEGER"
  );
  ensureColumn(
    database,
    "documents",
    "noise_ratio",
    "REAL"
  );
  ensureColumn(
    database,
    "documents",
    "embedding_json",
    "TEXT"
  );
  ensureColumn(
    database,
    "documents",
    "embedding_model",
    "TEXT"
  );
  ensureColumn(
    database,
    "documents",
    "embedding_fingerprint",
    "TEXT"
  );
  ensureColumn(
    database,
    "documents",
    "embedding_dimensions",
    "INTEGER"
  );
  ensureColumn(
    database,
    "documents",
    "embedding_updated_at",
    "TEXT"
  );
  ensureColumn(
    database,
    "pages",
    "clean_text",
    "TEXT NOT NULL DEFAULT ''"
  );
  ensureColumn(
    database,
    "pages",
    "text_quality",
    "INTEGER"
  );
  ensureColumn(
    database,
    "pages",
    "raw_word_count",
    "INTEGER"
  );
  ensureColumn(
    database,
    "pages",
    "clean_word_count",
    "INTEGER"
  );
  ensureColumn(
    database,
    "pages",
    "noise_ratio",
    "REAL"
  );
  ensureColumn(
    database,
    "document_virtual_folders",
    "document_type",
    "TEXT"
  );
  ensureColumn(
    database,
    "document_virtual_folders",
    "subject",
    "TEXT"
  );
  ensureColumn(
    database,
    "virtual_folders",
    "deleted_at",
    "TEXT"
  );

  ensureDefaultVirtualFolders(
    database
  );
}

function ensureColumn(
  database,
  table,
  column,
  definition
) {

  const exists =
    database
      .prepare(
        `PRAGMA table_info(${table})`
      )
      .all()
      .some(row =>
        row.name === column
      );

  if (exists) {
    return;
  }

  database.exec(
    `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`
  );
}

function ensureDefaultVirtualFolders(database) {

  const timestamp =
    now();

  for (
    const folder
    of getDefaultVirtualFolders()
  ) {
    database
      .prepare(`
        INSERT INTO virtual_folders (
          folder_id,
          name,
          parent_id,
          display_path,
          source,
          sort_order,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(folder_id) DO UPDATE SET
          name = excluded.name,
          parent_id = excluded.parent_id,
          display_path = excluded.display_path,
          source = excluded.source,
          sort_order = excluded.sort_order,
          updated_at = excluded.updated_at
        WHERE virtual_folders.deleted_at IS NULL
      `)
      .run(
        folder.id,
        folder.name,
        folder.parentId,
        folder.path,
        folder.source || "system",
        folder.sortOrder,
        timestamp
      );
  }
}

function slugifyFolderName(name) {

  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "folder";
}

function getVirtualFolderRow(database, folderId) {

  return database
    .prepare(
      "SELECT * FROM virtual_folders WHERE folder_id = ? AND deleted_at IS NULL"
    )
    .get(
      folderId
    ) || null;
}

function getAnyVirtualFolderRow(database, folderId) {

  return database
    .prepare(
      "SELECT * FROM virtual_folders WHERE folder_id = ?"
    )
    .get(
      folderId
    ) || null;
}

function getVirtualFolderDisplayPath(database, folderId, name = "") {

  const parent =
    folderId
      ? getVirtualFolderRow(
          database,
          folderId
        )
      : null;

  return [
    parent?.display_path,
    name
  ]
    .filter(Boolean)
    .join(" / ");
}

function getDatabaseVirtualFolderAncestors(database, folderId) {

  const ancestors = [];
  let folder =
    getVirtualFolderRow(
      database,
      folderId
    );

  while (
    folder?.parent_id
  ) {
    folder =
      getVirtualFolderRow(
        database,
        folder.parent_id
      );

    if (folder) {
      ancestors.push(
        folder.folder_id
      );
    }
  }

  return ancestors;
}

function getDatabaseVirtualFolderDescendants(database, folderId) {

  const descendants = [];
  const pending = [
    folderId
  ];

  while (pending.length > 0) {
    const currentId =
      pending.shift();
    const rows =
      database
        .prepare(
          "SELECT folder_id FROM virtual_folders WHERE parent_id = ?"
        )
        .all(
          currentId
        );

    for (
      const row
      of rows
    ) {
      descendants.push(
        row.folder_id
      );
      pending.push(
        row.folder_id
      );
    }
  }

  return descendants;
}

function backfillMissingCleanText(database) {

  const versionRow =
    database
      .prepare(
        "SELECT value FROM app_metadata WHERE key = 'clean_text_version'"
      )
      .get();
  const shouldRebuild =
    Number(versionRow?.value || 0) !==
    CLEAN_TEXT_VERSION;

  const pages =
    database
      .prepare(
        shouldRebuild
          ? "SELECT page_id, text FROM pages"
          : "SELECT page_id, text FROM pages WHERE clean_text IS NULL OR clean_text = ''"
      )
      .all();

  for (
    const page
    of pages
  ) {
    const quality =
      buildTextQuality(
        page.text || ""
      );

    database
      .prepare(`
        UPDATE pages
        SET clean_text = ?,
            text_quality = ?,
            raw_word_count = ?,
            clean_word_count = ?,
            noise_ratio = ?
        WHERE page_id = ?
      `)
      .run(
        quality.cleanText,
        quality.quality,
        quality.rawWordCount,
        quality.cleanWordCount,
        quality.noiseRatio,
        page.page_id
      );
  }

  const documents =
    database
      .prepare(
        shouldRebuild
          ? "SELECT document_id, text FROM documents WHERE text IS NOT NULL AND text != ''"
          : "SELECT document_id, text FROM documents WHERE text IS NOT NULL AND text != '' AND (clean_text IS NULL OR clean_text = '')"
      )
      .all();

  for (
    const document
    of documents
  ) {
    const quality =
      buildTextQuality(
        document.text || ""
      );

    database
      .prepare(`
        UPDATE documents
        SET clean_text = ?,
            text_quality = ?,
            raw_word_count = ?,
            clean_word_count = ?,
            noise_ratio = ?
        WHERE document_id = ?
      `)
      .run(
        quality.cleanText,
        quality.quality,
        quality.rawWordCount,
        quality.cleanWordCount,
        quality.noiseRatio,
        document.document_id
      );
  }

  const rows =
    database
      .prepare(
        "SELECT document_id FROM documents"
      )
      .all();

  for (
    const row
    of rows
  ) {
    syncDocumentStatus(
      database,
      row.document_id
    );
    syncDocumentOrganization(
      database,
      row.document_id
    );
    refreshSearchIndex(
      database,
      row.document_id
    );
  }

  if (
    pages.length > 0 ||
    documents.length > 0 ||
    shouldRebuild
  ) {
    database
      .prepare(`
        INSERT INTO app_metadata (key, value)
        VALUES ('clean_text_version', ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value
      `)
      .run(
        String(CLEAN_TEXT_VERSION)
      );

    log.info(
      "database.clean-text.backfilled",
      {
        pages:
          pages.length,
        documents:
          documents.length,
        cleanTextVersion:
          CLEAN_TEXT_VERSION
      }
    );
  }
}

function backfillOrganizerVersion(database) {

  const versionRow =
    database
      .prepare(
        "SELECT value FROM app_metadata WHERE key = 'organizer_version'"
      )
      .get();

  if (
    Number(versionRow?.value || 0) ===
    ORGANIZER_VERSION
  ) {
    return;
  }

  const rows =
    database
      .prepare(
        "SELECT document_id FROM documents ORDER BY updated_at DESC, file_name ASC"
      )
      .all();

  database.exec("BEGIN IMMEDIATE");

  try {
    for (
      const row
      of rows
    ) {
      syncDocumentOrganization(
        database,
        row.document_id
      );
      refreshSearchIndex(
        database,
        row.document_id
      );
    }

    database
      .prepare(`
        INSERT INTO app_metadata (key, value)
        VALUES ('organizer_version', ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value
      `)
      .run(
        String(ORGANIZER_VERSION)
      );

    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  log.info(
    "organizer.version.backfilled",
    {
      organizerVersion:
        ORGANIZER_VERSION,
      documents:
        rows.length
    }
  );
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
  const text =
    record.text ||
    record.ocrText ||
    "";
  const quality =
    buildTextQuality(
      text
    );

  return {
    ...record,
    documentId,
    fileHash,
    primaryPath,
    filePath,
    cleanText:
      record.cleanText ||
      record.clean_text ||
      quality.cleanText,
    textQuality:
      record.textQuality ??
      record.text_quality ??
      quality.quality,
    rawWordCount:
      record.rawWordCount ??
      record.raw_word_count ??
      quality.rawWordCount,
    cleanWordCount:
      record.cleanWordCount ??
      record.clean_word_count ??
      quality.cleanWordCount,
    noiseRatio:
      record.noiseRatio ??
      record.noise_ratio ??
      quality.noiseRatio,
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
  const quality =
    buildTextQuality(
      text
    );

  return {
    ...page,
    text,
    cleanText:
      page.cleanText ||
      page.clean_text ||
      quality.cleanText,
    textQuality:
      page.textQuality ??
      page.text_quality ??
      quality.quality,
    rawWordCount:
      page.rawWordCount ??
      page.raw_word_count ??
      quality.rawWordCount,
    cleanWordCount:
      page.cleanWordCount ??
      page.clean_word_count ??
      quality.cleanWordCount,
    noiseRatio:
      page.noiseRatio ??
      page.noise_ratio ??
      quality.noiseRatio,
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
      version: 3,
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
      const override
      of jsonDb.folder_keyword_overrides || []
    ) {
      if (
        !getVirtualFolderById(
          override.folderId
        ) ||
        !normalizeFolderKeyword(
          override.keyword
        )
      ) {
        continue;
      }

      database
        .prepare(`
          INSERT INTO folder_keyword_overrides (
            folder_id,
            keyword,
            role,
            weight,
            source,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(folder_id, keyword) DO UPDATE SET
            role = excluded.role,
            weight = excluded.weight,
            source = excluded.source,
            updated_at = excluded.updated_at
        `)
        .run(
          override.folderId,
          normalizeFolderKeyword(
            override.keyword
          ),
          override.role || "positive",
          Number(override.weight || 1),
          override.source || "user",
          override.updatedAt || now()
        );
    }

    for (
      const override
      of jsonDb.document_folder_overrides || []
    ) {
      if (
        !override.documentId ||
        !getVirtualFolderById(
          override.folderId
        )
      ) {
        continue;
      }

      database
        .prepare(`
          INSERT INTO document_folder_overrides (
            document_id,
            folder_id,
            action,
            source,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(document_id, folder_id) DO UPDATE SET
            action = excluded.action,
            source = excluded.source,
            updated_at = excluded.updated_at
        `)
        .run(
          override.documentId,
          override.folderId,
          override.action === "remove"
            ? "remove"
            : "add",
          override.source || "user",
          override.updatedAt || now()
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
      syncDocumentOrganization(
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
    cleanText:
      row.clean_text || "",
    textQuality:
      row.text_quality,
    rawWordCount:
      row.raw_word_count,
    cleanWordCount:
      row.clean_word_count,
    noiseRatio:
      row.noise_ratio,
    semanticEmbedding:
      rowToSemanticEmbedding(
        row
      ),
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
    cleanText:
      row.clean_text || "",
    textQuality:
      row.text_quality,
    rawWordCount:
      row.raw_word_count,
    cleanWordCount:
      row.clean_word_count,
    noiseRatio:
      row.noise_ratio,
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

function getPathsForSnapshot(database) {

  return database
    .prepare(
      "SELECT document_id, file_path FROM document_paths ORDER BY document_id, file_path"
    )
    .all()
    .map(row => ({
      documentId:
        row.document_id,
      filePath:
        row.file_path
    }));
}

function getAppMetadataForSnapshot(database) {

  return database
    .prepare(
      "SELECT key, value FROM app_metadata ORDER BY key"
    )
    .all();
}

function getTagsForSnapshot(database) {

  return database
    .prepare(
      "SELECT document_id, tag_type, tag FROM tags ORDER BY document_id, tag_type, tag"
    )
    .all()
    .map(row => ({
      documentId:
        row.document_id,
      tagType:
        row.tag_type,
      tag:
        row.tag
    }));
}

function getVirtualFoldersForSnapshot(database) {

  return database
    .prepare(
      "SELECT * FROM virtual_folders WHERE deleted_at IS NULL ORDER BY sort_order ASC, display_path ASC"
    )
    .all()
    .map(row => ({
      folderId:
        row.folder_id,
      name:
        row.name,
      parentId:
        row.parent_id,
      path:
        row.display_path,
      source:
        row.source,
      sortOrder:
        row.sort_order,
      updatedAt:
        row.updated_at,
      deletedAt:
        row.deleted_at || null
    }));
}

function getDocumentVirtualFoldersForSnapshot(database) {

  return database
    .prepare(`
      SELECT
        document_id,
        folder_id,
        confidence,
        reason_json,
        document_type,
        subject,
        is_primary,
        source,
        updated_at
      FROM document_virtual_folders
      ORDER BY document_id, is_primary DESC, confidence DESC, folder_id
    `)
    .all()
    .map(row => ({
      documentId:
        row.document_id,
      folderId:
        row.folder_id,
      confidence:
        row.confidence,
      reason:
        fromJson(
          row.reason_json,
          []
        ),
      documentType:
        row.document_type || null,
      subject:
        row.subject || null,
      isPrimary:
        Boolean(row.is_primary),
      source:
        row.source,
      updatedAt:
        row.updated_at
    }));
}

function rowToFolderKeywordOverride(row) {

  if (!row) {
    return null;
  }

  return {
    folderId:
      row.folder_id,
    keyword:
      row.keyword,
    role:
      row.role,
    weight:
      row.weight,
    source:
      row.source,
    updatedAt:
      row.updated_at
  };
}

function getFolderKeywordOverridesForSnapshot(database) {

  return database
    .prepare(`
      SELECT *
      FROM folder_keyword_overrides
      ORDER BY folder_id, role, keyword
    `)
    .all()
    .map(
      rowToFolderKeywordOverride
    )
    .filter(Boolean);
}

function rowToDocumentFolderOverride(row) {

  if (!row) {
    return null;
  }

  return {
    documentId:
      row.document_id,
    folderId:
      row.folder_id,
    action:
      row.action,
    source:
      row.source,
    updatedAt:
      row.updated_at
  };
}

function getDocumentFolderOverridesForSnapshot(database) {

  return database
    .prepare(`
      SELECT *
      FROM document_folder_overrides
      ORDER BY document_id, action, folder_id
    `)
    .all()
    .map(
      rowToDocumentFolderOverride
    )
    .filter(Boolean);
}

function getAllFolderKeywordOverrides(database) {

  return getFolderKeywordOverridesForSnapshot(
    database
  );
}

function getOrganizationForDocument(database, documentId) {

  const rows =
    database
      .prepare(`
        SELECT
          document_virtual_folders.document_id,
          document_virtual_folders.folder_id,
          document_virtual_folders.confidence,
          document_virtual_folders.reason_json,
          document_virtual_folders.document_type,
          document_virtual_folders.subject,
          document_virtual_folders.is_primary,
          document_virtual_folders.source,
          virtual_folders.name,
          virtual_folders.display_path,
          virtual_folders.parent_id
        FROM document_virtual_folders
        JOIN virtual_folders
          ON virtual_folders.folder_id = document_virtual_folders.folder_id
        WHERE document_virtual_folders.document_id = ?
          AND virtual_folders.deleted_at IS NULL
        ORDER BY
          document_virtual_folders.is_primary DESC,
          document_virtual_folders.confidence DESC,
          virtual_folders.sort_order ASC,
          virtual_folders.display_path ASC
      `)
      .all(
        documentId
      );

  if (
    rows.length === 0
  ) {
    return null;
  }

  const primary =
    rows.find(row =>
      row.is_primary
    ) ||
    rows[0];

  const folderIds =
    rows.map(row =>
      row.folder_id
    );
  const inheritedFolderIds =
    new Set(
      getVirtualFolderAncestors(
        primary.folder_id
      )
    );
  const secondaryRows =
    rows.filter(row =>
      row.folder_id !== primary.folder_id &&
      row.folder_id !== "review-needed" &&
      !inheritedFolderIds.has(
        row.folder_id
      )
    );

  return {
    primaryFolderId:
      primary.folder_id,
    primaryFolderPath:
      primary.display_path,
    secondaryFolderIds:
      secondaryRows.map(row =>
        row.folder_id
      ),
    secondaryFolderPaths:
      secondaryRows.map(row =>
        row.display_path
      ),
    folderIds,
    confidence:
      Math.round(
        Number(primary.confidence || 0) * 100
      ) / 100,
    documentType:
      primary.document_type || null,
    subject:
      primary.subject || null,
    needsReview:
      folderIds.includes(
        "review-needed"
      ),
    reason:
      fromJson(
        primary.reason_json,
        []
      ),
    folders:
      rows.map(row => ({
        folderId:
          row.folder_id,
        name:
          row.name,
        path:
          row.display_path,
        isPrimary:
          Boolean(row.is_primary),
        confidence:
          row.confidence,
        documentType:
          row.document_type || null,
        subject:
          row.subject || null,
        source:
          row.source
      }))
  };
}

function normalizeOrganizationForStorage(organization) {

  const primaryFolderId =
    getVirtualFolderById(
      organization?.primaryFolderId
    )
      ? organization.primaryFolderId
      : "other";
  const secondaryFolderIds =
    (organization?.secondaryFolderIds || [])
      .filter(folderId =>
        getVirtualFolderById(folderId)
      );
  const folderIds =
    [
      primaryFolderId,
      ...getVirtualFolderAncestors(
        primaryFolderId
      ),
      ...secondaryFolderIds,
      ...secondaryFolderIds.flatMap(
        getVirtualFolderAncestors
      ),
      ...(organization?.folderIds || [])
        .filter(folderId =>
          getVirtualFolderById(folderId)
        ),
      organization?.needsReview
        ? "review-needed"
        : null
    ]
      .filter(
        (folderId, index, all) =>
          folderId &&
          folderId !== "all-files" &&
          all.indexOf(folderId) === index
      );

  return {
    primaryFolderId,
    folderIds,
    confidence:
      Number(
        organization?.confidence || 0
      ),
    documentType:
      organization?.documentType || null,
    subject:
      organization?.subject || null,
    reason:
      Array.isArray(
        organization?.reason
      )
        ? organization.reason
        : []
  };
}

function upsertDocumentOrganization(
  database,
  documentId,
  organization
) {

  const normalized =
    normalizeOrganizationForStorage(
      organization
    );
  const timestamp =
    now();

  database
    .prepare(
      "DELETE FROM document_virtual_folders WHERE document_id = ?"
    )
    .run(
      documentId
    );

  const activeFolderIds =
    normalized.folderIds.filter(folderId =>
      getVirtualFolderRow(
        database,
        folderId
      )
    );
  const activePrimaryFolderId =
    activeFolderIds.includes(
      normalized.primaryFolderId
    )
      ? normalized.primaryFolderId
      : activeFolderIds[0] || null;

  for (
    const folderId
    of activeFolderIds
  ) {
    database
      .prepare(`
        INSERT INTO document_virtual_folders (
          document_id,
          folder_id,
          confidence,
          reason_json,
          document_type,
          subject,
          is_primary,
          source,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        documentId,
        folderId,
        folderId === activePrimaryFolderId
          ? normalized.confidence
          : 0,
        toJson(
          normalized.reason,
          []
        ),
        folderId === activePrimaryFolderId
          ? normalized.documentType
          : null,
        folderId === activePrimaryFolderId
          ? normalized.subject
          : null,
        folderId === activePrimaryFolderId
          ? 1
          : 0,
        "auto",
        timestamp
      );
  }

  return normalized;
}

function applyDocumentFolderOverrides(
  database,
  documentId
) {

  const overrides =
    database
      .prepare(`
        SELECT *
        FROM document_folder_overrides
        WHERE document_id = ?
      `)
      .all(
        documentId
      );
  const timestamp =
    now();

  for (
    const override
    of overrides
  ) {
    if (
      !getVirtualFolderRow(
        database,
        override.folder_id
      )
    ) {
      continue;
    }

    if (
      override.action === "remove"
    ) {
      database
        .prepare(`
          DELETE FROM document_virtual_folders
          WHERE document_id = ?
            AND folder_id = ?
        `)
        .run(
          documentId,
          override.folder_id
        );
      continue;
    }

    if (
      override.action === "add"
    ) {
      const folderIds = [
        override.folder_id,
        ...getDatabaseVirtualFolderAncestors(
          database,
          override.folder_id
        )
      ];

      for (
        const folderId
        of folderIds
      ) {
        database
          .prepare(`
            INSERT INTO document_virtual_folders (
              document_id,
              folder_id,
              confidence,
              reason_json,
              document_type,
              subject,
              is_primary,
              source,
              updated_at
            )
            VALUES (?, ?, 1, ?, NULL, NULL, 0, 'manual', ?)
            ON CONFLICT(document_id, folder_id) DO UPDATE SET
              confidence = 1,
              reason_json = excluded.reason_json,
              source = excluded.source,
              updated_at = excluded.updated_at
          `)
          .run(
            documentId,
            folderId,
            toJson(
              [
                folderId === override.folder_id
                  ? "manually added by user"
                  : `ancestor of manual folder: ${override.folder_id}`
              ],
              []
            ),
            timestamp
          );
      }
    }
  }
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

function aggregateDocumentCleanText(document, pages) {

  const pageText =
    pages
      .map(page =>
        page.cleanText ||
        page.text
      )
      .filter(Boolean)
      .join("\n\n");

  if (pageText) {
    return pageText;
  }

  return document.cleanText ||
    buildTextQuality(
      document.text ||
      document.ocrText ||
      ""
    ).cleanText;
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
  const cleanText =
    aggregateDocumentCleanText(
      document,
      pages
    );
  const quality =
    buildTextQuality(
      text
    );
  const organization =
    getOrganizationForDocument(
      database,
      document.documentId
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
    cleanText,
    textQuality:
      document.textQuality ??
      quality.quality,
    rawWordCount:
      document.rawWordCount ??
      quality.rawWordCount,
    cleanWordCount:
      document.cleanWordCount ??
      quality.cleanWordCount,
    noiseRatio:
      document.noiseRatio ??
      quality.noiseRatio,
    organization,
    pages:
      pages.map(page => ({
        pageNumber:
          page.pageNumber,
        text:
          page.text,
        cleanText:
          page.cleanText,
        textQuality:
          page.textQuality,
        noiseRatio:
          page.noiseRatio,
        status:
          page.status
      }))
  };
}

function summarizeDocument(
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

  const organization =
    getOrganizationForDocument(
      database,
      document.documentId
    );
  const previewText =
    document.cleanText ||
    document.text ||
    "";

  return {
    documentId:
      document.documentId,
    fileHash:
      document.fileHash,
    filePath:
      document.primaryPath ||
      document.filePath,
    fileName:
      document.fileName,
    titleTags:
      document.titleTags || [],
    keywordTags:
      document.keywordTags || [],
    category:
      document.category || "Unknown",
    metadata:
      document.metadata || {},
    semanticEmbedding:
      summarizeSemanticEmbedding(
        document.semanticEmbedding
      ),
    textQuality:
      document.textQuality,
    rawWordCount:
      document.rawWordCount,
    cleanWordCount:
      document.cleanWordCount,
    noiseRatio:
      document.noiseRatio,
    totalPages:
      document.totalPages,
    indexedPages:
      document.indexedPages,
    status:
      document.status || "done",
    scannedAt:
      document.scannedAt,
    updatedAt:
      document.updatedAt,
    organization,
    preview:
      previewText.slice(
        0,
        320
      ),
    hasFullText:
      Boolean(
        document.text ||
        document.cleanText
      )
  };
}

function summarizeSearchResult(document) {

  return {
    documentId:
      document.documentId,
    fileHash:
      document.fileHash,
    filePath:
      document.filePath ||
      document.primaryPath,
    fileName:
      document.fileName,
    titleTags:
      document.titleTags || [],
    keywordTags:
      document.keywordTags || [],
    category:
      document.category || "Unknown",
    metadata:
      document.metadata || {},
    semanticEmbedding:
      summarizeSemanticEmbedding(
        document.semanticEmbedding
      ),
    textQuality:
      document.textQuality,
    rawWordCount:
      document.rawWordCount,
    cleanWordCount:
      document.cleanWordCount,
    noiseRatio:
      document.noiseRatio,
    totalPages:
      document.totalPages,
    indexedPages:
      document.indexedPages,
    status:
      document.status || "done",
    scannedAt:
      document.scannedAt,
    updatedAt:
      document.updatedAt,
    organization:
      document.organization || null,
    preview:
      document.preview ||
      document.cleanText?.slice(
        0,
        320
      ) ||
      document.text?.slice(
        0,
        320
      ) ||
      "",
    score:
      document.score,
    hasFullText:
      Boolean(
        document.text ||
        document.cleanText
      )
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
    const aggregateText =
      aggregateDocumentText(
        document,
        documentPages
      );
    const aggregateCleanText =
      aggregateDocumentCleanText(
        document,
        documentPages
      );
    const aggregateQuality =
      buildTextQuality(
        aggregateText
      );
    const organization =
      getOrganizationForDocument(
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
      titleTags:
        document.titleTags || [],
      keywordTags:
        document.keywordTags || [],
      category:
        document.category || "Unknown",
      metadata:
        document.metadata || {},
      semanticEmbedding:
        summarizeSemanticEmbedding(
          document.semanticEmbedding
        ),
      cleanText:
        documentPages.length === 0
          ? aggregateCleanText
          : undefined,
      textQuality:
        document.textQuality ??
        aggregateQuality.quality,
      rawWordCount:
        document.rawWordCount ??
        aggregateQuality.rawWordCount,
      cleanWordCount:
        document.cleanWordCount ??
        aggregateQuality.cleanWordCount,
      noiseRatio:
        document.noiseRatio ??
        aggregateQuality.noiseRatio,
      organization,
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
        aggregateText;
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
        cleanText:
          page.cleanText || "",
        textQuality:
          page.textQuality,
        rawWordCount:
          page.rawWordCount,
        cleanWordCount:
          page.cleanWordCount,
        noiseRatio:
          page.noiseRatio,
        hasImage:
          page.hasImage,
        status:
          page.status || "done",
        processedAt:
          page.processedAt
      });
    }
  }

  const ocrJobs =
    getJobsForSnapshot(
      database
    );

  return {
    version: 3,
    source:
      "sqlite-snapshot",
    generatedAt:
      now(),
    app_metadata:
      getAppMetadataForSnapshot(
        database
      ),
    documents,
    document_paths:
      getPathsForSnapshot(
        database
      ),
    virtual_folders:
      getVirtualFoldersForSnapshot(
        database
      ),
    document_virtual_folders:
      getDocumentVirtualFoldersForSnapshot(
        database
      ),
    folder_keyword_overrides:
      getFolderKeywordOverridesForSnapshot(
        database
      ),
    document_folder_overrides:
      getDocumentFolderOverridesForSnapshot(
        database
      ),
    pages,
    ocr_jobs:
      ocrJobs,
    tags:
      getTagsForSnapshot(
        database
      ),
    jobs:
      ocrJobs
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
      virtualFolders:
        snapshot.virtual_folders.length,
      jobs:
        snapshot.jobs.length
    }
  );
}

function writeJsonSnapshotSafely(database) {

  if (
    !JSON_SNAPSHOT_ENABLED
  ) {
    if (
      !jsonSnapshotSkipLogged
    ) {
      jsonSnapshotSkipLogged = true;
      log.info(
        "database.json.snapshot.disabled",
        {
          enableWith:
            "SMART_SEARCH_WRITE_JSON_SNAPSHOT=1"
        }
      );
    }

    return;
  }

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
  const quality =
    buildTextQuality(
      storedText
    );
  const storedCleanText =
    hasPages
      ? null
      : normalized.cleanText ||
          quality.cleanText;

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
        clean_text,
        text_quality,
        raw_word_count,
        clean_word_count,
        noise_ratio,
        total_pages,
        indexed_pages,
        status,
        scanned_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(document_id) DO UPDATE SET
        file_hash = excluded.file_hash,
        file_name = excluded.file_name,
        primary_path = excluded.primary_path,
        title_tags_json = excluded.title_tags_json,
        keyword_tags_json = excluded.keyword_tags_json,
        category = excluded.category,
        metadata_json = excluded.metadata_json,
        text = excluded.text,
        clean_text = excluded.clean_text,
        text_quality = excluded.text_quality,
        raw_word_count = excluded.raw_word_count,
        clean_word_count = excluded.clean_word_count,
        noise_ratio = excluded.noise_ratio,
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
      storedCleanText,
      normalized.textQuality ??
        quality.quality,
      normalized.rawWordCount ??
        quality.rawWordCount,
      normalized.cleanWordCount ??
        quality.cleanWordCount,
      normalized.noiseRatio ??
        quality.noiseRatio,
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
        clean_text,
        text_quality,
        raw_word_count,
        clean_word_count,
        noise_ratio,
        has_image,
        status,
        processed_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(document_id, page_number) DO UPDATE SET
        page_id = excluded.page_id,
        file_hash = excluded.file_hash,
        file_path = excluded.file_path,
        text = excluded.text,
        clean_text = excluded.clean_text,
        text_quality = excluded.text_quality,
        raw_word_count = excluded.raw_word_count,
        clean_word_count = excluded.clean_word_count,
        noise_ratio = excluded.noise_ratio,
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
      normalized.cleanText || "",
      normalized.textQuality ?? null,
      normalized.rawWordCount ?? null,
      normalized.cleanWordCount ?? null,
      normalized.noiseRatio ?? null,
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
  const row =
    getDocumentRow(
      database,
      documentId
    );
  const pages =
    getPagesForDocument(
      database,
      documentId
    );
  const document =
    rowToDocument(
      row
    );
  const aggregateText =
    document
      ? aggregateDocumentText(
          document,
          pages
        )
      : "";
  const aggregateCleanText =
    document
      ? aggregateDocumentCleanText(
          document,
          pages
        )
      : "";
  const quality =
    buildTextQuality(
      aggregateText
    );
  const nextTitleTags =
    generateTitleTags(
      aggregateCleanText
    );
  const nextKeywordTags =
    generateKeywordTags(
      aggregateCleanText
    );

  database
    .prepare(`
      UPDATE documents
      SET indexed_pages = ?,
          title_tags_json = ?,
          keyword_tags_json = ?,
          clean_text = COALESCE(NULLIF(clean_text, ''), ?),
          text_quality = ?,
          raw_word_count = ?,
          clean_word_count = ?,
          noise_ratio = ?,
          status = ?,
          updated_at = ?
      WHERE document_id = ?
    `)
    .run(
      Number(indexedPages),
      toJson(
        nextTitleTags,
        []
      ),
      toJson(
        nextKeywordTags,
        []
      ),
      aggregateCleanText,
      quality.quality,
      quality.rawWordCount,
      quality.cleanWordCount,
      quality.noiseRatio,
      Number(pendingJobs) > 0
        ? "indexing"
        : "done",
      now(),
      documentId
    );
}

function syncDocumentOrganization(
  database,
  documentId
) {

  const row =
    getDocumentRow(
      database,
      documentId
    );

  if (!row) {
    return null;
  }

  const previous =
    getOrganizationForDocument(
      database,
      documentId
    );
  const document =
    flattenDocument(
      database,
      row
    );
  const organization =
    suggestOrganization(
      {
        ...document,
        organization:
          undefined
      },
      {
        folderKeywordOverrides:
          getAllFolderKeywordOverrides(
            database
          )
      }
    );
  const saved =
    upsertDocumentOrganization(
      database,
      documentId,
      organization
    );
  applyDocumentFolderOverrides(
    database,
    documentId
  );

  if (
    previous?.primaryFolderId !==
    saved.primaryFolderId
  ) {
    log.info(
      "organizer.document.assigned",
      {
        documentId,
        previousFolder:
          previous?.primaryFolderPath || null,
        folder:
          getVirtualFolderById(
            saved.primaryFolderId
          )?.path,
        confidence:
          saved.confidence,
        reason:
          saved.reason
      }
    );
  }

  return saved;
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
  const organizationText =
    getOrganizationSearchText(
      document
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
      [
        document.category || "",
        organizationText
      ]
        .filter(Boolean)
        .join(" "),
      document.cleanText ||
        buildTextQuality(
          document.text || ""
        ).cleanText
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

function cleanPlanBTag(value) {

  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\s\-_:;,.()[\]{}]+|[\s\-_:;,.()[\]{}]+$/g, "");
}

function dedupePlanBTags(tags, limit) {

  const selected = [];
  const seen =
    new Set();

  for (
    const tag
    of tags
  ) {
    const normalized =
      cleanPlanBTag(
        tag
      );

    if (
      !normalized ||
      seen.has(normalized)
    ) {
      continue;
    }

    seen.add(
      normalized
    );
    selected.push(
      normalized
    );

    if (
      selected.length >= limit
    ) {
      break;
    }
  }

  return selected;
}

export function applyPlanBEnrichment(
  documentId,
  enrichment
) {

  if (
    !documentId ||
    !enrichment
  ) {
    return null;
  }

  const savedDocument =
    withTransaction(database => {
      const row =
        getDocumentRow(
          database,
          documentId
        );

      const document =
        flattenDocument(
          database,
          row
        );

      if (!document) {
        return null;
      }

      const planBYake =
        dedupePlanBTags(
          enrichment.yakeKeywords || [],
          20
        );
      const planBCombined =
        dedupePlanBTags(
          enrichment.combinedKeywords || [],
          24
        );
      const planBNounPhrases =
        dedupePlanBTags(
          enrichment.spacy?.nounPhrases || [],
          16
        );
      const planBEntities =
        (enrichment.spacy?.entities || [])
          .map(entity => ({
            text:
              cleanPlanBTag(
                entity.text
              ),
            label:
              entity.label
          }))
          .filter(entity =>
            entity.text
          )
          .slice(0, 20);
      const semanticEmbedding =
        normalizeEmbeddingForStorage(
          enrichment
        );

      const nextTitleTags =
        dedupePlanBTags(
          [
            ...(document.titleTags || []),
            ...planBYake.slice(0, 4)
          ],
          14
        );
      const nextKeywordTags =
        dedupePlanBTags(
          [
            ...planBYake,
            ...(document.keywordTags || []),
            ...planBNounPhrases.slice(0, 6)
          ],
          32
        );
      const nextMetadata = {
        ...(document.metadata || {}),
        planB: {
          version:
            1,
          enrichedAt:
            now(),
          textFingerprint:
            enrichment.fingerprint,
          model:
            enrichment.model ||
            "yake-spacy",
          keywordSource:
            "yake",
          yakeKeywords:
            planBYake,
          combinedKeywords:
            planBCombined,
          nounPhrases:
            planBNounPhrases,
          entities:
            planBEntities,
          capabilities:
            enrichment.capabilities || {},
          timingMs:
            enrichment.timingMs || {},
          wallMs:
            enrichment.wallMs,
          embedding:
            summarizeSemanticEmbedding(
              semanticEmbedding
            )
        }
      };

      if (semanticEmbedding) {
        database
          .prepare(`
            UPDATE documents
            SET title_tags_json = ?,
                keyword_tags_json = ?,
                metadata_json = ?,
                embedding_json = ?,
                embedding_model = ?,
                embedding_fingerprint = ?,
                embedding_dimensions = ?,
                embedding_updated_at = ?,
                updated_at = ?
            WHERE document_id = ?
          `)
          .run(
            toJson(
              nextTitleTags,
              []
            ),
            toJson(
              nextKeywordTags,
              []
            ),
            toJson(
              nextMetadata,
              {}
            ),
            toJson(
              semanticEmbedding.vector,
              []
            ),
            semanticEmbedding.model,
            semanticEmbedding.textFingerprint,
            semanticEmbedding.dimensions,
            semanticEmbedding.updatedAt,
            now(),
            documentId
          );
      } else {
        database
          .prepare(`
            UPDATE documents
            SET title_tags_json = ?,
                keyword_tags_json = ?,
                metadata_json = ?,
                updated_at = ?
            WHERE document_id = ?
          `)
          .run(
            toJson(
              nextTitleTags,
              []
            ),
            toJson(
              nextKeywordTags,
              []
            ),
            toJson(
              nextMetadata,
              {}
            ),
            now(),
            documentId
          );
      }

      syncDocumentOrganization(
        database,
        documentId
      );
      refreshSearchIndex(
        database,
        documentId
      );

      return flattenDocument(
        database,
        getDocumentRow(
          database,
          documentId
        )
      );
    });

  writeJsonSnapshotSafely(
    getDb()
  );

  if (savedDocument) {
    log.info(
      "planb.enrich.saved",
      {
        documentId,
        titleTags:
          savedDocument.titleTags?.slice(0, 6),
        keywordTags:
          savedDocument.keywordTags?.slice(0, 8),
        wallMs:
          enrichment.wallMs
      }
    );
  }

  return savedDocument;
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
    syncDocumentOrganization(
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

export function getDocumentSummaries() {

  const database =
    getDb();

  return database
    .prepare(
      "SELECT * FROM documents ORDER BY updated_at DESC, file_name ASC"
    )
    .all()
    .map(row =>
      summarizeDocument(
        database,
        row
      )
    )
    .filter(Boolean);
}

export function getDocumentDetail(documentId) {

  if (!documentId) {
    return null;
  }

  const database =
    getDb();
  const row =
    getDocumentRow(
      database,
      documentId
    );

  return flattenDocument(
    database,
    row
  );
}

export function getDocumentByFileHash(fileHash) {

  if (!fileHash) {
    return null;
  }

  const database =
    getDb();
  const row =
    database
      .prepare(
        "SELECT * FROM documents WHERE file_hash = ?"
      )
      .get(
        fileHash
      );

  return flattenDocument(
    database,
    row
  );
}

export function refreshAllDocumentOrganizations() {

  const database =
    getDb();
  const rows =
    database
      .prepare(
        "SELECT document_id FROM documents ORDER BY updated_at DESC, file_name ASC"
      )
      .all();

  const refreshed =
    withTransaction(transactionDatabase =>
      rows.map(row =>
        syncDocumentOrganization(
          transactionDatabase,
          row.document_id
        )
      )
    )
      .filter(Boolean);

  writeJsonSnapshotSafely(
    database
  );

  log.info(
    "organizer.refresh-all.completed",
    {
      documents:
        refreshed.length
    }
  );

  return {
    documents:
      refreshed.length
  };
}

function normalizeFolderKeyword(keyword) {

  return String(keyword || "")
    .toLowerCase()
    .replace(/[#/\\_-]+/g, " ")
    .replace(/[^a-z0-9.<>\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeLikePattern(value) {

  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

function refreshOrganizationsForKeyword(database, keyword) {

  const normalizedKeyword =
    normalizeFolderKeyword(
      keyword
    );

  if (
    !normalizedKeyword
  ) {
    return {
      documents: 0
    };
  }

  const likePattern =
    `%${escapeLikePattern(normalizedKeyword)}%`;
  const rows =
    database
      .prepare(`
        SELECT document_id
        FROM documents
        WHERE lower(file_name) LIKE ? ESCAPE '\\'
           OR lower(primary_path) LIKE ? ESCAPE '\\'
           OR lower(title_tags_json) LIKE ? ESCAPE '\\'
           OR lower(keyword_tags_json) LIKE ? ESCAPE '\\'
           OR lower(metadata_json) LIKE ? ESCAPE '\\'
           OR lower(clean_text) LIKE ? ESCAPE '\\'
           OR lower(text) LIKE ? ESCAPE '\\'
      `)
      .all(
        likePattern,
        likePattern,
        likePattern,
        likePattern,
        likePattern,
        likePattern,
        likePattern
      );

  for (
    const row
    of rows
  ) {
    syncDocumentOrganization(
      database,
      row.document_id
    );
    refreshSearchIndex(
      database,
      row.document_id
    );
  }

  return {
    documents:
      rows.length
  };
}

function refreshOrganizationsForFolder(database, folderId) {

  if (
    !getVirtualFolderRow(
      database,
      folderId
    )
  ) {
    return {
      documents: 0
    };
  }

  const rows =
    database
      .prepare(`
        SELECT DISTINCT document_id
        FROM document_virtual_folders
        WHERE folder_id = ?
      `)
      .all(
        folderId
      );

  for (
    const row
    of rows
  ) {
    syncDocumentOrganization(
      database,
      row.document_id
    );
    refreshSearchIndex(
      database,
      row.document_id
    );
  }

  return {
    documents:
      rows.length
  };
}

export function getFolderKeywordOverrides(folderId = null) {

  const database =
    getDb();
  const rows =
    folderId
      ? database
          .prepare(`
            SELECT *
            FROM folder_keyword_overrides
            WHERE folder_id = ?
            ORDER BY role, keyword
          `)
          .all(
            folderId
          )
      : database
          .prepare(`
            SELECT *
            FROM folder_keyword_overrides
            ORDER BY folder_id, role, keyword
          `)
          .all();

  return rows
    .map(
      rowToFolderKeywordOverride
    )
    .filter(Boolean);
}

export function getVirtualFolders() {

  return getVirtualFoldersForSnapshot(
    getDb()
  );
}

export function saveVirtualFolder({
  folderId = null,
  name,
  parentId = null
} = {}) {

  const database =
    getDb();
  const trimmedName =
    String(name || "")
      .trim();

  if (!trimmedName) {
    throw new Error(
      "Folder name is required"
    );
  }

  if (
    parentId === "all-files"
  ) {
    parentId = null;
  }

  if (
    parentId &&
    !getVirtualFolderRow(
      database,
      parentId
    )
  ) {
    throw new Error(
      "Unknown parent folder"
    );
  }

  const existing =
    folderId
      ? getVirtualFolderRow(
          database,
          folderId
        )
      : null;

  if (
    existing &&
    existing.source !== "user"
  ) {
    throw new Error(
      "System folders cannot be renamed"
    );
  }

  const id =
    existing?.folder_id ||
    `user-${slugifyFolderName(trimmedName)}-${Date.now().toString(36)}`;
  const timestamp =
    now();
  const displayPath =
    getVirtualFolderDisplayPath(
      database,
      parentId,
      trimmedName
    );
  const maxSort =
    database
      .prepare(
        "SELECT MAX(sort_order) AS max_sort FROM virtual_folders"
      )
      .get();

  withTransaction(dbInstance => {
    dbInstance
      .prepare(`
        INSERT INTO virtual_folders (
          folder_id,
          name,
          parent_id,
          display_path,
          source,
          sort_order,
          updated_at
        )
        VALUES (?, ?, ?, ?, 'user', ?, ?)
        ON CONFLICT(folder_id) DO UPDATE SET
          name = excluded.name,
          parent_id = excluded.parent_id,
          display_path = excluded.display_path,
          updated_at = excluded.updated_at
      `)
      .run(
        id,
        trimmedName,
        parentId,
        displayPath,
        existing?.sort_order ??
          Number(maxSort?.max_sort || 0) + 1,
        timestamp
      );
  });

  log.info(
    "organizer.virtual-folder.saved",
    {
      folderId:
        id,
      name:
        trimmedName,
      parentId
    }
  );

  return {
    folder:
      getVirtualFolders().find(folder =>
        folder.folderId === id
      ),
    folders:
      getVirtualFolders()
  };
}

export function deleteVirtualFolder(folderId) {

  const database =
    getDb();
  const folder =
    getAnyVirtualFolderRow(
      database,
      folderId
    );

  if (!folder) {
    throw new Error(
      "Unknown folder"
    );
  }

  if (
    folderId === "all-files"
  ) {
    throw new Error(
      "All Files cannot be deleted"
    );
  }

  const folderIds = [
    folderId,
    ...getDatabaseVirtualFolderDescendants(
      database,
      folderId
    )
  ];
  const affectedRows =
    database
      .prepare(`
        SELECT DISTINCT document_id
        FROM document_virtual_folders
        WHERE folder_id IN (${folderIds.map(() => "?").join(",")})
      `)
      .all(
        ...folderIds
      );

  withTransaction(dbInstance => {
    const timestamp =
      now();

    dbInstance
      .prepare(`
        DELETE FROM document_virtual_folders
        WHERE folder_id IN (${folderIds.map(() => "?").join(",")})
      `)
      .run(
        ...folderIds
      );

    dbInstance
      .prepare(`
        DELETE FROM document_folder_overrides
        WHERE folder_id IN (${folderIds.map(() => "?").join(",")})
      `)
      .run(
        ...folderIds
      );

    dbInstance
      .prepare(`
        DELETE FROM folder_keyword_overrides
        WHERE folder_id IN (${folderIds.map(() => "?").join(",")})
      `)
      .run(
        ...folderIds
      );

    for (
      const id
      of folderIds.reverse()
    ) {
      dbInstance
        .prepare(`
          UPDATE virtual_folders
          SET deleted_at = ?,
              updated_at = ?
          WHERE folder_id = ?
            AND source != 'user'
        `)
        .run(
          timestamp,
          timestamp,
          id
        );

      dbInstance
        .prepare(
          "DELETE FROM virtual_folders WHERE folder_id = ? AND source = 'user'"
        )
        .run(
          id
        );
    }

    for (
      const row
      of affectedRows
    ) {
      syncDocumentOrganization(
        dbInstance,
        row.document_id
      );
      refreshSearchIndex(
        dbInstance,
        row.document_id
      );
    }
  });

  log.info(
    "organizer.virtual-folder.deleted",
    {
      folderId
    }
  );

  return {
    folders:
      getVirtualFolders()
  };
}

export function saveFolderKeywordOverride({
  folderId,
  keyword,
  role = "positive",
  weight = 1
} = {}) {

  const normalizedKeyword =
    normalizeFolderKeyword(
      keyword
    );
  const normalizedRole =
    [
      "positive",
      "negative",
      "ignored"
    ].includes(role)
      ? role
      : "positive";

  if (
    !getVirtualFolderRow(
      getDb(),
      folderId
    )
  ) {
    throw new Error(
      "Unknown folder"
    );
  }

  if (
    !normalizedKeyword
  ) {
    throw new Error(
      "Keyword is required"
    );
  }

  const refreshed =
    withTransaction(database => {
    database
      .prepare(`
        INSERT INTO folder_keyword_overrides (
          folder_id,
          keyword,
          role,
          weight,
          source,
          updated_at
        )
        VALUES (?, ?, ?, ?, 'user', ?)
        ON CONFLICT(folder_id, keyword) DO UPDATE SET
          role = excluded.role,
          weight = excluded.weight,
          source = excluded.source,
          updated_at = excluded.updated_at
      `)
      .run(
        folderId,
        normalizedKeyword,
        normalizedRole,
        Math.max(
          0.5,
          Math.min(
            3,
            Number(weight || 1)
          )
        ),
        now()
      );

    const keywordRefresh =
      refreshOrganizationsForKeyword(
      database,
      normalizedKeyword
    );
    const folderRefresh =
      refreshOrganizationsForFolder(
        database,
        folderId
      );

    return {
      documents:
        keywordRefresh.documents +
        folderRefresh.documents
    };
  });

  log.info(
    "organizer.folder-keyword.saved",
    {
      folderId,
      keyword:
        normalizedKeyword,
      role:
        normalizedRole,
      refreshed:
        refreshed.documents
    }
  );

  return {
    overrides:
      getFolderKeywordOverrides(
        folderId
      ),
    refreshed
  };
}

export function deleteFolderKeywordOverride(folderId, keyword) {

  const normalizedKeyword =
    normalizeFolderKeyword(
      keyword
    );

  if (
    !folderId ||
    !normalizedKeyword
  ) {
    return {
      overrides:
        getFolderKeywordOverrides(
          folderId
        ),
      refreshed:
        {
          documents: 0
        }
    };
  }

  const refreshed =
    withTransaction(database => {
    database
      .prepare(`
        DELETE FROM folder_keyword_overrides
        WHERE folder_id = ?
          AND keyword = ?
      `)
      .run(
        folderId,
        normalizedKeyword
      );

    const keywordRefresh =
      refreshOrganizationsForKeyword(
      database,
      normalizedKeyword
    );
    const folderRefresh =
      refreshOrganizationsForFolder(
        database,
        folderId
      );

    return {
      documents:
        keywordRefresh.documents +
        folderRefresh.documents
    };
  });

  log.info(
    "organizer.folder-keyword.deleted",
    {
      folderId,
      keyword:
        normalizedKeyword,
      refreshed:
        refreshed.documents
    }
  );

  return {
    overrides:
      getFolderKeywordOverrides(
        folderId
      ),
    refreshed
  };
}

export function saveDocumentFolderOverride({
  documentId,
  folderId,
  action = "add"
} = {}) {

  const normalizedAction =
    action === "remove"
      ? "remove"
      : "add";
  const database =
    getDb();

  if (
    !documentId ||
    !getDocumentRow(
      database,
      documentId
    )
  ) {
    throw new Error(
      "Unknown document"
    );
  }

  if (
    !getVirtualFolderRow(
      database,
      folderId
    ) ||
    folderId === "all-files"
  ) {
    throw new Error(
      "Unknown folder"
    );
  }

  const refreshed =
    withTransaction(database => {
      database
        .prepare(`
          INSERT INTO document_folder_overrides (
            document_id,
            folder_id,
            action,
            source,
            updated_at
          )
          VALUES (?, ?, ?, 'user', ?)
          ON CONFLICT(document_id, folder_id) DO UPDATE SET
            action = excluded.action,
            source = excluded.source,
            updated_at = excluded.updated_at
        `)
        .run(
          documentId,
          folderId,
          normalizedAction,
          now()
        );

      syncDocumentOrganization(
        database,
        documentId
      );
      refreshSearchIndex(
        database,
        documentId
      );

      return {
        documents: 1
      };
    });

  log.info(
    "organizer.document-folder.override-saved",
    {
      documentId,
      folderId,
      action:
        normalizedAction
    }
  );

  return {
    overrides:
      getDocumentFolderOverrides(
        documentId
      ),
    refreshed
  };
}

export function deleteDocumentFolderOverride(documentId, folderId) {

  if (
    !documentId ||
    !folderId
  ) {
    return {
      overrides:
        [],
      refreshed:
        {
          documents: 0
        }
    };
  }

  const refreshed =
    withTransaction(database => {
      database
        .prepare(`
          DELETE FROM document_folder_overrides
          WHERE document_id = ?
            AND folder_id = ?
        `)
        .run(
          documentId,
          folderId
        );

      syncDocumentOrganization(
        database,
        documentId
      );
      refreshSearchIndex(
        database,
        documentId
      );

      return {
        documents: 1
      };
    });

  log.info(
    "organizer.document-folder.override-deleted",
    {
      documentId,
      folderId
    }
  );

  return {
    overrides:
      getDocumentFolderOverrides(
        documentId
      ),
    refreshed
  };
}

export function addDocumentKeywordTag(documentId, tag) {

  const normalizedTag =
    String(tag || "")
      .toLowerCase()
      .replace(/[#/\\_-]+/g, " ")
      .replace(/[^a-z0-9.+\s]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  if (!normalizedTag) {
    throw new Error(
      "Tag is required"
    );
  }

  const updatedDocument =
    withTransaction(database => {
      const row =
        getDocumentRow(
          database,
          documentId
        );

      if (!row) {
        throw new Error(
          "Unknown document"
        );
      }

      const keywordTags =
        fromJson(
          row.keyword_tags_json,
          []
        );
      const nextTags =
        [
          ...keywordTags,
          normalizedTag
        ]
          .filter(
            (item, index, all) =>
              item &&
              all.indexOf(item) === index
          )
          .slice(0, 40);

      database
        .prepare(`
          UPDATE documents
          SET keyword_tags_json = ?,
              updated_at = ?
          WHERE document_id = ?
        `)
        .run(
          toJson(
            nextTags,
            []
          ),
          now(),
          documentId
        );

      syncDocumentOrganization(
        database,
        documentId
      );
      refreshSearchIndex(
        database,
        documentId
      );

      return flattenDocument(
        database,
        getDocumentRow(
          database,
          documentId
        )
      );
    });

  log.info(
    "document.keyword-tag.added",
    {
      documentId,
      tag:
        normalizedTag
    }
  );

  return {
    document:
      updatedDocument
  };
}

export function deleteDocumentKeywordTag(documentId, tag) {

  const normalizeTag =
    value =>
      String(value || "")
        .toLowerCase()
        .replace(/[#/\\_-]+/g, " ")
        .replace(/[^a-z0-9.+\s]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
  const normalizedTag =
    normalizeTag(
      tag
    );

  if (!normalizedTag) {
    throw new Error(
      "Tag is required"
    );
  }

  const updatedDocument =
    withTransaction(database => {
      const row =
        getDocumentRow(
          database,
          documentId
        );

      if (!row) {
        throw new Error(
          "Unknown document"
        );
      }

      const keywordTags =
        fromJson(
          row.keyword_tags_json,
          []
        );
      const titleTags =
        fromJson(
          row.title_tags_json,
          []
        );
      const nextKeywordTags =
        keywordTags.filter(item =>
          normalizeTag(item) !== normalizedTag
        );
      const nextTitleTags =
        titleTags.filter(item =>
          normalizeTag(item) !== normalizedTag
        );

      database
        .prepare(`
          UPDATE documents
          SET title_tags_json = ?,
              keyword_tags_json = ?,
              updated_at = ?
          WHERE document_id = ?
        `)
        .run(
          toJson(
            nextTitleTags,
            []
          ),
          toJson(
            nextKeywordTags,
            []
          ),
          now(),
          documentId
        );

      syncDocumentOrganization(
        database,
        documentId
      );
      refreshSearchIndex(
        database,
        documentId
      );

      return flattenDocument(
        database,
        getDocumentRow(
          database,
          documentId
        )
      );
    });

  log.info(
    "document.keyword-tag.deleted",
    {
      documentId,
      tag:
        normalizedTag
    }
  );

  return {
    document:
      updatedDocument
  };
}

export function getDocumentFolderOverrides(documentId = null) {

  const database =
    getDb();
  const rows =
    documentId
      ? database
          .prepare(`
            SELECT *
            FROM document_folder_overrides
            WHERE document_id = ?
            ORDER BY action, folder_id
          `)
          .all(
            documentId
          )
      : database
          .prepare(`
            SELECT *
            FROM document_folder_overrides
            ORDER BY document_id, action, folder_id
          `)
          .all();

  return rows
    .map(
      rowToDocumentFolderOverride
    )
    .filter(Boolean);
}

export function searchDocuments(query) {

  const ftsDocs =
    searchDocumentsWithFts(
      query
    );

  if (ftsDocs.length > 0) {
    return searchDocumentsInDocs(
      ftsDocs,
      query
    );
  }

  // Fallback keeps OCR-tolerant fuzzy behavior for misspellings/noisy text
  // that SQLite FTS cannot match directly.
  return searchDocumentsInDocs(
    getAllDocuments(),
    query
  );
}

export function searchDocumentSummaries(query) {

  return searchDocuments(
    query
  ).map(
    summarizeSearchResult
  );
}

function buildFtsQuery(query) {

  const tokens =
    tokenize(query)
      .filter(token =>
        /^[a-z0-9]+$/.test(token)
      )
      .slice(0, 8);

  if (tokens.length === 0) {
    return "";
  }

  return tokens
    .map(token =>
      `"${token.replace(/"/g, "\"\"")}"`
    )
    .join(" AND ");
}

function searchDocumentsWithFts(query) {

  const ftsQuery =
    buildFtsQuery(
      query
    );

  if (!ftsQuery) {
    return [];
  }

  const database =
    getDb();

  try {
    const rows =
      database
        .prepare(`
          SELECT documents.*
          FROM document_fts
          JOIN documents
            ON documents.document_id = document_fts.document_id
          WHERE document_fts MATCH ?
          ORDER BY bm25(document_fts)
          LIMIT 100
        `)
        .all(
          ftsQuery
        );

    return rows
      .map(row =>
        flattenDocument(
          database,
          row
        )
      )
      .filter(Boolean);
  } catch (error) {
    log.warn(
      "database.search.fts.failed",
      {
        query,
        ftsQuery,
        error:
          error.message
      }
    );

    return [];
  }
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
    syncDocumentOrganization(
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
    syncDocumentOrganization(
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
  const mainSize =
    getFileSize(
      SQLITE_DB_PATH
    );
  const walSize =
    getFileSize(
      `${SQLITE_DB_PATH}-wal`
    );
  const shmSize =
    getFileSize(
      `${SQLITE_DB_PATH}-shm`
    );
  const sqliteStats =
    fs.existsSync(
      SQLITE_DB_PATH
    )
      ? fs.statSync(
          SQLITE_DB_PATH
        )
      : null;

  return {
    engine:
      "sqlite",
    sqlitePath:
      SQLITE_DB_PATH,
    jsonPath:
      JSON_DB_PATH,
    sizeBytes:
      mainSize +
      walSize +
      shmSize,
    mainSizeBytes:
      mainSize,
    walSizeBytes:
      walSize,
    shmSizeBytes:
      shmSize,
    updatedAt:
      sqliteStats?.mtime?.toISOString?.() || null,
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
