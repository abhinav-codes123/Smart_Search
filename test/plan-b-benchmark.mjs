import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { extractTextFromFile } from "../electron/textExtractor.js";
import { generateKeywordTags } from "../src/utils/tagGenerator.js";

const DATASET_ROOT =
  process.argv[2] ||
  "test1";
const PLAN_B_PYTHON =
  process.env.PLAN_B_PYTHON ||
  path.resolve(
    ".venv-planb/bin/python"
  );

const SUPPORTED_EXTENSIONS =
  new Set([
    ".pdf",
    ".png",
    ".jpg",
    ".jpeg",
    ".docx",
    ".pptx"
  ]);

const GOLD_TERMS = [
  "assignment",
  "banker algorithm",
  "blockchain",
  "certificate",
  "certificate of completion",
  "cyber security",
  "deadlock",
  "dosage",
  "file inclusion",
  "finite control",
  "hemoglobin",
  "infix",
  "operating system",
  "path traversal",
  "patient",
  "postfix",
  "prescription",
  "sampling theory",
  "statistics",
  "student",
  "turing machine",
  "vulnerability"
];

const SEMANTIC_QUERIES = [
  "web security path traversal file inclusion vulnerability",
  "operating system deadlock banker algorithm safe state",
  "statistics sampling theory t test significance",
  "blockchain certificate course completion",
  "postfix expression stack algorithm",
  "student college certificate identity"
];

function walkFiles(root) {
  const files = [];

  for (
    const entry
    of fs.readdirSync(root, {
      withFileTypes:
        true
    })
  ) {
    const fullPath =
      path.join(
        root,
        entry.name
      );

    if (entry.isDirectory()) {
      files.push(
        ...walkFiles(fullPath)
      );
    } else if (
      SUPPORTED_EXTENSIONS.has(
        path.extname(entry.name)
          .toLowerCase()
      )
    ) {
      files.push(fullPath);
    }
  }

  return files.sort();
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function expectedTermsForText(text) {
  const normalized =
    normalize(text);

  return GOLD_TERMS.filter(term =>
    normalized.includes(term)
  );
}

function keywordStats(tags, expectedTerms) {
  if (expectedTerms.length === 0) {
    return {
      precision:
        null,
      recall:
        null,
      hits:
        []
    };
  }

  const normalizedTags =
    tags.map(normalize);
  const hits =
    expectedTerms.filter(term =>
      normalizedTags.some(tag =>
        tag.includes(term) ||
        term.includes(tag)
      )
    );

  return {
    precision:
      hits.length / Math.max(tags.length, 1),
    recall:
      hits.length / expectedTerms.length,
    hits
  };
}

function average(values) {
  const numeric =
    values.filter(value =>
      typeof value === "number" &&
      Number.isFinite(value)
    );

  if (numeric.length === 0) {
    return null;
  }

  return numeric.reduce(
    (sum, value) =>
      sum + value,
    0
  ) / numeric.length;
}

function round(value) {
  if (value === null || value === undefined) {
    return null;
  }

  return Math.round(value * 1000) / 1000;
}

function summarizeSamples(results) {
  return results
    .filter(result =>
      result.expectedTerms.length > 0
    )
    .slice(0, 8)
    .map(result => ({
      file:
        result.file,
      expectedTerms:
        result.expectedTerms,
      current:
        result.current.tags.slice(0, 10),
      planBYake:
        result.planB.yakeKeywords.slice(0, 10),
      planBCombined:
        result.planB.combinedKeywords.slice(0, 10),
      entities:
        result.planB.spacy.entities.slice(0, 8)
    }));
}

const started =
  performance.now();
const files =
  walkFiles(DATASET_ROOT);
const documents = [];

for (
  const file
  of files
) {
  const extractStarted =
    performance.now();
  const text =
    await extractTextFromFile(file);
  const currentStarted =
    performance.now();
  const currentTags =
    generateKeywordTags(text);

  documents.push({
    file,
    title:
      path.basename(file),
    text,
    chars:
      text.length,
    expectedTerms:
      expectedTermsForText(text),
    currentTags,
    timingMs: {
      extraction:
        Math.round(
          performance.now() - extractStarted
        ),
      currentKeywords:
        round(
          performance.now() - currentStarted
        )
    }
  });
}

const planBStarted =
  performance.now();
const worker =
  spawnSync(
    PLAN_B_PYTHON,
    [
      "python/plan_b_worker.py"
    ],
    {
      input:
        JSON.stringify({
          documents:
            documents.map(document => ({
              file:
                document.file,
              title:
                document.title,
              text:
                document.text
            })),
          queries:
            SEMANTIC_QUERIES
        }),
      encoding:
        "utf8",
      maxBuffer:
        1024 * 1024 * 80,
      env: {
        ...process.env,
        HF_HUB_OFFLINE:
          "1",
        TRANSFORMERS_OFFLINE:
          "1",
        HF_HUB_DISABLE_TELEMETRY:
          "1",
        OMP_NUM_THREADS:
          "1",
        MKL_NUM_THREADS:
          "1",
        VECLIB_MAXIMUM_THREADS:
          "1",
        NUMEXPR_NUM_THREADS:
          "1",
        TOKENIZERS_PARALLELISM:
          "false"
      },
      timeout:
        1000 * 60 * 12
    }
  );

if (worker.error) {
  throw worker.error;
}

if (worker.status !== 0) {
  console.error({
    status:
      worker.status,
    signal:
      worker.signal,
    stderr:
      worker.stderr,
    stdoutPreview:
      worker.stdout?.slice(0, 1000)
  });
  throw new Error(
    `Plan B worker exited with status ${worker.status}`
  );
}

const planBOutput =
  JSON.parse(
    worker.stdout
  );
const planBDocumentsByFile =
  new Map(
    planBOutput.documents.map(document => [
      document.file,
      document
    ])
  );

const results =
  documents.map(document => {
    const planB =
      planBDocumentsByFile.get(
        document.file
      ) || {
        yakeKeywords: [],
        combinedKeywords: [],
        spacy: {
          entities: [],
          nounPhrases: []
        },
        timingMs: {}
      };

    return {
      file:
        document.file,
      chars:
        document.chars,
      expectedTerms:
        document.expectedTerms,
      timingMs:
        document.timingMs,
      current: {
        tags:
          document.currentTags,
        stats:
          keywordStats(
            document.currentTags,
            document.expectedTerms
          )
      },
      planB: {
        yakeKeywords:
          planB.yakeKeywords,
        combinedKeywords:
          planB.combinedKeywords,
        spacy:
          planB.spacy,
        timingMs:
          planB.timingMs,
        yakeStats:
          keywordStats(
            planB.yakeKeywords,
            document.expectedTerms
          ),
        combinedStats:
          keywordStats(
            planB.combinedKeywords,
            document.expectedTerms
          )
      }
    };
  });

const currentPrecision =
  average(
    results.map(result =>
      result.current.stats.precision
    )
  );
const currentRecall =
  average(
    results.map(result =>
      result.current.stats.recall
    )
  );
const yakePrecision =
  average(
    results.map(result =>
      result.planB.yakeStats.precision
    )
  );
const yakeRecall =
  average(
    results.map(result =>
      result.planB.yakeStats.recall
    )
  );
const combinedPrecision =
  average(
    results.map(result =>
      result.planB.combinedStats.precision
    )
  );
const combinedRecall =
  average(
    results.map(result =>
      result.planB.combinedStats.recall
    )
  );

const summary = {
  datasetRoot:
    DATASET_ROOT,
  files:
    files.length,
  totalMs:
    Math.round(
      performance.now() - started
    ),
  extractionMs:
    documents.reduce(
      (sum, document) =>
        sum + document.timingMs.extraction,
      0
    ),
  currentKeywordMs:
    round(
      documents.reduce(
        (sum, document) =>
          sum + document.timingMs.currentKeywords,
        0
      )
    ),
  planBWorkerWallMs:
    Math.round(
      performance.now() - planBStarted
    ),
  planBTimingMs:
    planBOutput.timingMs,
  capabilities:
    planBOutput.capabilities,
  vectorSearch:
    {
      enabled:
        planBOutput.vectorSearch.enabled,
      backend:
        planBOutput.vectorSearch.backend,
      model:
        planBOutput.vectorSearch.model,
      error:
        planBOutput.vectorSearch.error,
      queries:
        planBOutput.vectorSearch.queries
    },
  metrics: {
    currentPrecision:
      round(currentPrecision),
    currentRecall:
      round(currentRecall),
    planBYakePrecision:
      round(yakePrecision),
    planBYakeRecall:
      round(yakeRecall),
    planBCombinedPrecision:
      round(combinedPrecision),
    planBCombinedRecall:
      round(combinedRecall)
  }
};

console.log(
  JSON.stringify(
    {
      summary,
      samples:
        summarizeSamples(
          results
        )
    },
    null,
    2
  )
);
