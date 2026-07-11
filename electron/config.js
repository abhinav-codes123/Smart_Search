import "./env.js";
import path from "path";

function readString(
  key,
  fallback
) {

  const value =
    process.env[key];

  if (
    value == null ||
    value === ""
  ) {
    return fallback;
  }

  return value;
}

function readNumber(
  key,
  fallback,
  {
    min = -Infinity,
    max = Infinity
  } = {}
) {

  const value =
    Number(
      process.env[key]
    );

  if (
    !Number.isFinite(value)
  ) {
    return fallback;
  }

  return Math.max(
    min,
    Math.min(
      max,
      value
    )
  );
}

function readBoolean(
  key,
  fallback
) {

  const value =
    process.env[key];

  if (
    value == null ||
    value === ""
  ) {
    return fallback;
  }

  return [
    "1",
    "true",
    "yes",
    "on"
  ].includes(
    value.toLowerCase()
  );
}

function readOcrMode() {

  const mode =
    readString(
      "SMART_SEARCH_OCR_MODE",
      "fast"
    )
      .toLowerCase();

  if (
    [
      "fast",
      "balanced",
      "adaptive",
      "accurate"
    ].includes(mode)
  ) {
    return mode === "adaptive"
      ? "balanced"
      : mode;
  }

  return "fast";
}

export const config = {
  data: {
    get dbPath() {
      return readString(
        "SMART_SEARCH_DB_PATH",
        ""
      );
    },
    get jsonDbPath() {
      return readString(
        "SMART_SEARCH_JSON_DB_PATH",
        ""
      );
    },
    get sqliteDbPath() {
      return readString(
        "SMART_SEARCH_SQLITE_DB_PATH",
        ""
      );
    },
    get isJsonDbPath() {
      return this.dbPath &&
        path.extname(
          this.dbPath
        ) === ".json";
    },
    get isSqliteDbPath() {
      return this.dbPath &&
        [
          ".sqlite",
          ".sqlite3",
          ".db"
        ].includes(
          path.extname(
            this.dbPath
          )
        );
    }
  },
  ocr: {
    mode:
      readOcrMode(),
    pdfRenderScale:
      readNumber(
        "SMART_SEARCH_PDF_RENDER_SCALE",
        1,
        {
          min: 1,
          max: 6
        }
      ),
    initialPdfSyncPages:
      readNumber(
        "SMART_SEARCH_INITIAL_PDF_SYNC_PAGES",
        3,
        {
          min: 0
        }
      ),
    pdfOcrPageLimit:
      readNumber(
        "SMART_SEARCH_PDF_OCR_PAGE_LIMIT",
        0,
        {
          min: 0
        }
      ),
    officeImageOcrLimit:
      readNumber(
        "SMART_SEARCH_OFFICE_IMAGE_OCR_LIMIT",
        0,
        {
          min: 0
        }
      ),
    adaptiveMinConfidence:
      readNumber(
        "SMART_SEARCH_OCR_ADAPTIVE_MIN_CONFIDENCE",
        80,
        {
          min: 0,
          max: 100
        }
      ),
    adaptiveMinChars:
      readNumber(
        "SMART_SEARCH_OCR_ADAPTIVE_MIN_CHARS",
        100,
        {
          min: 0
        }
      ),
    skipDuplicateExtraction:
      readBoolean(
        "SMART_SEARCH_SKIP_DUPLICATE_EXTRACTION",
        true
      ),
    startQueueWhenNoJobs:
      readBoolean(
        "SMART_SEARCH_START_QUEUE_WHEN_NO_JOBS",
        false
      )
  }
};
