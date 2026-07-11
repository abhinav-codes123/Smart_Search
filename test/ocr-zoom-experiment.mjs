import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const nodeBin = process.execPath;
const repoRoot = process.cwd();
const testDir = path.join(repoRoot, "test1");
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "smart-search-ocr-exp-"));

const inputFiles = process.argv.slice(2);
const files = (
  inputFiles.length > 0
    ? inputFiles.map(filePath =>
        path.isAbsolute(filePath)
          ? filePath
          : path.resolve(repoRoot, filePath)
      )
    : fs
        .readdirSync(testDir)
        .filter(fileName => !fileName.startsWith("."))
        .map(fileName => path.join(testDir, fileName))
)
  .filter(filePath => fs.statSync(filePath).isFile());

const pdfScales = [1, 1.5, 2, 3, 4];
const imageModes = ["fast", "accurate"];
const pdfModes = ["fast", "accurate"];

function buildRuns() {
  const runs = [];

  for (const filePath of files) {
    const extension = path.extname(filePath).toLowerCase();

    if (extension === ".pdf") {
      for (const scale of pdfScales) {
        for (const mode of pdfModes) {
          runs.push({
            filePath,
            mode,
            scale
          });
        }
      }
    } else {
      for (const mode of imageModes) {
        runs.push({
          filePath,
          mode,
          scale: null
        });
      }
    }
  }

  return runs;
}

function extractResult(stdout) {
  const marker = "__SMART_SEARCH_EXPERIMENT_RESULT__";
  const line = stdout
    .split(/\r?\n/)
    .find(item => item.startsWith(marker));

  if (!line) {
    throw new Error(`Experiment result marker missing. Output:\n${stdout}`);
  }

  return JSON.parse(line.slice(marker.length));
}

function countHits(text, terms) {
  const lower = String(text || "").toLowerCase();

  return terms.filter(term => lower.includes(term)).length;
}

function summarizeText(text) {
  const words = String(text || "")
    .toLowerCase()
    .match(/[a-z0-9][a-z0-9.+#/-]{1,}/g) || [];
  const uniqueWords = new Set(words);
  const garbageWords = words.filter(word =>
    /[^a-z0-9.+#/-]/i.test(word) ||
    /[a-z]{7,}\d{2,}|\d{2,}[a-z]{7,}/i.test(word) ||
    /(.)\1{4,}/.test(word)
  );

  return {
    wordCount: words.length,
    uniqueWordCount: uniqueWords.size,
    garbageWordCount: garbageWords.length
  };
}

function getStoredText(storedDocument, pages, field) {
  return [
    storedDocument[field] || "",
    ...(pages || []).map(page => page[field] || "")
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function runOne(run, index) {
  const dbBase = path.join(outDir, `run-${String(index).padStart(3, "0")}`);
  const sqlitePath = `${dbBase}.sqlite`;
  const jsonPath = `${dbBase}.json`;
  const start = Date.now();

  const env = {
    ...process.env,
    SMART_SEARCH_SQLITE_DB_PATH: sqlitePath,
    SMART_SEARCH_JSON_DB_PATH: jsonPath,
    SMART_SEARCH_OCR_MODE: run.mode,
    SMART_SEARCH_INITIAL_PDF_SYNC_PAGES: "999",
    SMART_SEARCH_PDF_OCR_PAGE_LIMIT: "0",
    SMART_SEARCH_START_QUEUE_WHEN_NO_JOBS: "false"
  };

  if (run.scale != null) {
    env.SMART_SEARCH_PDF_RENDER_SCALE = String(run.scale);
  }

  const childCode = `
    import path from "node:path";
    import { extractFileForIndex } from "./electron/textExtractor.js";
    import { insertDocument } from "./electron/database.js";
    import { generateFileHash, createDocumentId } from "./electron/fileIdentity.js";
    import { generateKeywordTags, generateTitleTags } from "./src/utils/tagGenerator.js";

    const filePath = ${JSON.stringify(run.filePath)};
    const fileHash = await generateFileHash(filePath);
    const indexed = await extractFileForIndex(filePath, { initialPdfPages: 999 });
    const document = insertDocument({
      documentId: createDocumentId(fileHash),
      fileHash,
      fileName: path.basename(filePath),
      filePath,
      titleTags: generateTitleTags(indexed.cleanText || indexed.text),
      keywordTags: generateKeywordTags(indexed.cleanText || indexed.text),
      category: "Experiment",
      metadata: {},
      text: indexed.text,
      cleanText: indexed.cleanText,
      textQuality: indexed.textQuality,
      rawWordCount: indexed.rawWordCount,
      cleanWordCount: indexed.cleanWordCount,
      noiseRatio: indexed.noiseRatio,
      pages: indexed.pages,
      jobs: indexed.jobs,
      totalPages: indexed.totalPages,
      indexedPages: indexed.pages?.length ?? null,
      status: indexed.status,
      scannedAt: new Date().toISOString()
    });

    console.log("__SMART_SEARCH_EXPERIMENT_RESULT__" + JSON.stringify({
      document,
      pageCount: indexed.pages?.length ?? 0,
      queuedJobs: indexed.jobs?.length ?? 0
    }));
  `;

  const { stdout, stderr } = await execFileAsync(
    nodeBin,
    ["--input-type=module", "-e", childCode],
    {
      cwd: repoRoot,
      env,
      maxBuffer: 1024 * 1024 * 20
    }
  );

  const result = extractResult(stdout);
  const json = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const storedDocument = json.documents?.[0] || result.document;
  const pages = json.pages || [];
  const cleanText = getStoredText(storedDocument, pages, "cleanText");
  const rawText = getStoredText(storedDocument, pages, "text");
  const textStats = summarizeText(cleanText);
  const expectedHits = countHits(
    cleanText,
    [
      "turing",
      "machine",
      "memory",
      "input",
      "tape",
      "finite",
      "control",
      "certificate",
      "python",
      "course"
    ]
  );

  return {
    fileName: path.basename(run.filePath),
    mode: run.mode,
    scale: run.scale ?? "-",
    ms: Date.now() - start,
    rawChars: rawText.length,
    cleanChars: cleanText.length,
    textQuality: storedDocument.textQuality,
    rawWords: storedDocument.rawWordCount,
    cleanWords: storedDocument.cleanWordCount,
    noiseRatio: Number(storedDocument.noiseRatio ?? 0),
    titleTags: storedDocument.titleTags || [],
    keywordTags: storedDocument.keywordTags || [],
    pages: result.pageCount,
    queuedJobs: result.queuedJobs,
    expectedHits,
    ...textStats,
    stderr: stderr.trim()
  };
}

const runs = buildRuns();
const results = [];

for (let index = 0; index < runs.length; index++) {
  const run = runs[index];

  console.error(
    `[${index + 1}/${runs.length}] ${path.basename(run.filePath)} mode=${run.mode} scale=${run.scale ?? "-"}`
  );

  results.push(await runOne(run, index + 1));
}

const grouped = Object.groupBy(
  results,
  result => result.fileName
);

const bestByQuality = Object.fromEntries(
  Object.entries(grouped).map(([fileName, items]) => [
    fileName,
    items
      .toSorted((a, b) =>
        b.textQuality - a.textQuality ||
        b.expectedHits - a.expectedHits ||
        a.ms - b.ms
      )
      .slice(0, 3)
  ])
);

console.log(JSON.stringify({
  outDir,
  runs: results,
  bestByQuality
}, null, 2));
