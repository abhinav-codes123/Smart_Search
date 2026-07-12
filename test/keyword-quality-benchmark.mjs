import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { extractTextFromFile } from "../electron/textExtractor.js";
import { generateKeywordTags } from "../src/utils/tagGenerator.js";
import {
  hasPlausibleWordShape,
  isDictionaryWord,
  isDomainWord,
  isImportantIdentifier,
  isOcrNoiseWord,
  isStopWord
} from "../src/utils/dictionary.js";

const DATASET_ROOT =
  process.argv[2] ||
  "test1";

const SUPPORTED_EXTENSIONS =
  new Set([
    ".pdf",
    ".png",
    ".jpg",
    ".jpeg",
    ".docx",
    ".pptx"
  ]);

const STOP_WORDS =
  new Set([
    "about",
    "above",
    "after",
    "again",
    "against",
    "also",
    "because",
    "before",
    "being",
    "below",
    "between",
    "could",
    "document",
    "during",
    "every",
    "files",
    "from",
    "have",
    "into",
    "more",
    "most",
    "only",
    "other",
    "page",
    "same",
    "should",
    "some",
    "such",
    "than",
    "that",
    "their",
    "them",
    "then",
    "there",
    "these",
    "this",
    "those",
    "through",
    "under",
    "using",
    "very",
    "when",
    "where",
    "which",
    "while",
    "with",
    "would",
    "your"
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

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text) {
  return normalize(text)
    .split(/\s+/)
    .filter(isUsefulToken);
}

function isUsefulToken(word) {
  if (
    word.length < 3 ||
    word.length > 24 ||
    STOP_WORDS.has(word) ||
    isStopWord(word) ||
    isOcrNoiseWord(word) ||
    /^\d+$/.test(word)
  ) {
    return false;
  }

  if (
    isImportantIdentifier(word) ||
    isDomainWord(word) ||
    isDictionaryWord(word)
  ) {
    return true;
  }

  return hasPlausibleWordShape(word);
}

function makeNgrams(tokens, currentKeywordSet) {
  const phrases = [];

  for (const size of [3, 2]) {
    for (
      let index = 0;
      index <= tokens.length - size;
      index++
    ) {
      const words =
        tokens.slice(
          index,
          index + size
        );

      if (
        words.some(word =>
          !isUsefulToken(word)
        )
      ) {
        continue;
      }

      if (
        !words.some(word =>
          currentKeywordSet.has(word) ||
          isDomainWord(word) ||
          isImportantIdentifier(word)
        )
      ) {
        continue;
      }

      phrases.push(
        words.join(" ")
      );
    }
  }

  return phrases;
}

function generateYakeLikeTags(text, currentTags = []) {
  const tokens =
    tokenize(text);
  const currentKeywordSet =
    new Set(
      currentTags.map(normalize)
    );
  const counts =
    new Map();
  const firstSeen =
    new Map();
  const candidates = [
    ...makeNgrams(
      tokens,
      currentKeywordSet
    ),
    ...tokens
  ];

  candidates.forEach((candidate, index) => {
    counts.set(
      candidate,
      (counts.get(candidate) || 0) + 1
    );

    if (!firstSeen.has(candidate)) {
      firstSeen.set(
        candidate,
        index
      );
    }
  });

  const scored =
    [...counts.entries()]
      .map(([candidate, count]) => {
        const wordCount =
          candidate.split(" ").length;
        const earlyBonus =
          1 /
          (1 + firstSeen.get(candidate) / 80);
        const phraseBonus =
          wordCount > 1
            ? wordCount * 3
            : 1;
        const domainBonus =
          candidate
            .split(" ")
            .filter(word =>
              isDomainWord(word) ||
              isImportantIdentifier(word) ||
              currentKeywordSet.has(word)
            )
            .length * 2;

        return {
          candidate,
          score:
            count * phraseBonus +
            earlyBonus * 2 +
            domainBonus
        };
      })
      .filter(item =>
        item.candidate.length <= 60
      )
      .sort((a, b) =>
        b.score - a.score
      );

  const selected = [];

  for (
    const item
    of scored
  ) {
    if (
      selected.some(existing =>
        existing.includes(item.candidate) ||
        item.candidate.includes(existing)
      )
    ) {
      continue;
    }

    selected.push(
      item.candidate
    );

    if (selected.length >= 20) {
      break;
    }
  }

  return selected;
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
  if (value === null) {
    return null;
  }

  return Math.round(value * 1000) / 1000;
}

const files =
  walkFiles(DATASET_ROOT);
const results = [];
const started =
  performance.now();

for (
  const filePath
  of files
) {
  const extractStarted =
    performance.now();
  const text =
    await extractTextFromFile(filePath);
  const extractMs =
    performance.now() -
    extractStarted;

  const currentStarted =
    performance.now();
  const currentTags =
    generateKeywordTags(text);
  const currentMs =
    performance.now() -
    currentStarted;

  const yakeStarted =
    performance.now();
  const yakeLikeTags =
    generateYakeLikeTags(
      text,
      currentTags
    );
  const yakeLikeMs =
    performance.now() -
    yakeStarted;

  const expectedTerms =
    expectedTermsForText(text);

  results.push({
    file:
      filePath,
    chars:
      text.length,
    expectedTerms,
    timingMs: {
      extraction:
        Math.round(extractMs),
      currentKeywords:
        round(currentMs),
      yakeLikeKeywords:
        round(yakeLikeMs)
    },
    current: {
      tags:
        currentTags,
      stats:
        keywordStats(
          currentTags,
          expectedTerms
        )
    },
    yakeLike: {
      tags:
        yakeLikeTags,
      stats:
        keywordStats(
          yakeLikeTags,
          expectedTerms
        )
    }
  });
}

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
    results.reduce(
      (sum, result) =>
        sum + result.timingMs.extraction,
      0
    ),
  currentKeywordMs:
    round(
      results.reduce(
        (sum, result) =>
          sum + result.timingMs.currentKeywords,
        0
      )
    ),
  yakeLikeKeywordMs:
    round(
      results.reduce(
        (sum, result) =>
          sum + result.timingMs.yakeLikeKeywords,
        0
      )
    ),
  currentPrecision:
    round(
      average(
        results.map(result =>
          result.current.stats.precision
        )
      )
    ),
  currentRecall:
    round(
      average(
        results.map(result =>
          result.current.stats.recall
        )
      )
    ),
  yakeLikePrecision:
    round(
      average(
        results.map(result =>
          result.yakeLike.stats.precision
        )
      )
    ),
  yakeLikeRecall:
    round(
      average(
        results.map(result =>
          result.yakeLike.stats.recall
        )
      )
    )
};

console.log(
  JSON.stringify(
    {
      summary,
      results
    },
    null,
    2
  )
);
