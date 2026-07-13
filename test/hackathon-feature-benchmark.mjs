import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { extractFileForIndex, SUPPORTED_EXTENSIONS } from "../electron/textExtractor.js";
import { runPlanBSemanticSearch, startPlanBWorker, stopPlanBWorker } from "../electron/planBService.js";
import { searchDocumentsInDocs } from "../electron/searchEngine.js";
import { classifyDocument } from "../src/utils/classifier.js";
import { extractMetadata } from "../src/utils/extractMetadata.js";
import { suggestOrganization } from "../src/utils/organizer.js";
import { generateKeywordTags, generateTitleTags } from "../src/utils/tagGenerator.js";

const DATASET_ROOTS =
  process.argv.slice(2).length
    ? process.argv.slice(2)
    : [
        "test1",
        "test1/test2",
        "test1/test3"
      ];

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

const SEARCH_TESTS = [
  {
    query:
      "web security path traversal file inclusion vulnerability",
    expected:
      [
        "file inclusion",
        "path traversal",
        "vulnerability"
      ]
  },
  {
    query:
      "operating system deadlock banker algorithm safe state",
    expected:
      [
        "deadlock",
        "banker",
        "operating system"
      ]
  },
  {
    query:
      "statistics sampling theory t test significance",
    expected:
      [
        "statistics",
        "sampling theory",
        "t-test"
      ]
  },
  {
    query:
      "blockchain certificate course completion",
    expected:
      [
        "blockchain",
        "certificate"
      ]
  },
  {
    query:
      "postfix expression stack algorithm",
    expected:
      [
        "postfix",
        "stack"
      ]
  },
  {
    query:
      "turing machine finite control tape memory",
    expected:
      [
        "turing",
        "machine",
        "finite control"
      ]
  }
];

const PDF_SEARCH_TESTS = [
  {
    query:
      "postfix expression stack algorithm",
    expected:
      [
        "postfix",
        "stack"
      ]
  },
  {
    query:
      "python programming assignment list function",
    expected:
      [
        "python",
        "assignment",
        "list"
      ]
  },
  {
    query:
      "automata dfa nfa turing machine assignment",
    expected:
      [
        "dfa",
        "nfa",
        "turing",
        "assignment"
      ]
  },
  {
    query:
      "mathematics probability poisson distribution assignment",
    expected:
      [
        "probability",
        "poisson",
        "mathematics",
        "assignment"
      ]
  },
  {
    query:
      "computer organization architecture lab manual",
    expected:
      [
        "computer organization",
        "architecture",
        "lab"
      ]
  },
  {
    query:
      "sensor instrumentation previous year questions",
    expected:
      [
        "sensor",
        "instrumentation"
      ]
  },
  {
    query:
      "internal marks student bcs303 bve301",
    expected:
      [
        "student",
        "bcs303",
        "bve301"
      ]
  },
  {
    query:
      "universal human values professional ethics assignment",
    expected:
      [
        "human",
        "ethics",
        "assignment"
      ]
  }
];

const originalConsole = {
  log:
    console.log.bind(console),
  warn:
    console.warn.bind(console),
  error:
    console.error.bind(console)
};

if (
  process.env.SMART_SEARCH_BENCHMARK_QUIET !== "0"
) {
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
}

function walkFiles(root) {
  const files = [];

  if (!fs.existsSync(root)) {
    return files;
  }

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

function round(value, digits = 2) {
  if (
    value == null ||
    !Number.isFinite(value)
  ) {
    return null;
  }

  const factor =
    10 ** digits;

  return Math.round(value * factor) / factor;
}

function average(values) {
  const numeric =
    values.filter(value =>
      Number.isFinite(value)
    );

  if (!numeric.length) {
    return null;
  }

  return numeric.reduce(
    (sum, value) =>
      sum + value,
    0
  ) / numeric.length;
}

function sum(values) {
  return values.reduce(
    (total, value) =>
      total + Number(value || 0),
    0
  );
}

function expectedTermsForText(text) {
  const normalized =
    normalize(text);

  return GOLD_TERMS.filter(term =>
    normalized.includes(term)
  );
}

function keywordStats(tags, expectedTerms) {
  if (!expectedTerms.length) {
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

function dedupeTags(tags, limit) {
  const selected = [];
  const seen =
    new Set();

  for (
    const tag
    of tags
  ) {
    const normalized =
      normalize(tag);

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

function mergePlanBTags(document, enrichment) {
  const planBYake =
    dedupeTags(
      enrichment?.yakeKeywords || [],
      20
    );
  const planBNounPhrases =
    dedupeTags(
      enrichment?.spacy?.nounPhrases || [],
      8
    );

  return {
    ...document,
    titleTags:
      dedupeTags(
        [
          ...document.titleTags,
          ...planBYake.slice(0, 4)
        ],
        14
      ),
    keywordTags:
      dedupeTags(
        [
          ...planBYake,
          ...document.keywordTags,
          ...planBNounPhrases
        ],
        32
      ),
    metadata: {
      ...document.metadata,
      planB: {
        yakeKeywords:
          planBYake,
        nounPhrases:
          planBNounPhrases,
        entities:
          enrichment?.spacy?.entities || [],
        timingMs:
          enrichment?.timingMs || {},
        wallMs:
          enrichment?.wallMs
      }
    },
    semanticEmbedding:
      enrichment?.embedding?.vector
        ? {
            ...enrichment.embedding,
            textFingerprint:
              enrichment.fingerprint,
            updatedAt:
              new Date()
                .toISOString()
          }
        : null
  };
}

function hasExpectedMatch(document, expectedTerms) {
  const haystack =
    normalize(
      [
        document.fileName,
        document.titleTags?.join(" "),
        document.keywordTags?.join(" "),
        JSON.stringify(document.metadata || {}),
        document.cleanText,
        document.text
      ].join(" ")
    );

  return expectedTerms.some(term =>
    haystack.includes(
      normalize(term)
    )
  );
}

function evaluateSearch(searchResults, tests) {
  const byQuery = [];

  for (
    const test
    of tests
  ) {
    const results =
      searchResults(
        test.query
      );
    const top1 =
      results[0] || null;
    const top3 =
      results.slice(0, 3);

    byQuery.push({
      query:
        test.query,
      top1File:
        top1?.fileName || null,
      top1Score:
        top1?.score ?? top1?.planBScore ?? null,
      top1Hit:
        top1
          ? hasExpectedMatch(
              top1,
              test.expected
            )
          : false,
      top3Hit:
        top3.some(document =>
          hasExpectedMatch(
            document,
            test.expected
          )
        )
    });
  }

  return {
    top1Accuracy:
      round(
        byQuery.filter(result =>
          result.top1Hit
        ).length / byQuery.length,
        3
      ),
    top3Accuracy:
      round(
        byQuery.filter(result =>
          result.top3Hit
        ).length / byQuery.length,
        3
      ),
    byQuery
  };
}

async function benchmarkRoot(root) {
  const rootStarted =
    performance.now();
  const files =
    walkFiles(root);

  await startPlanBWorker();

  const documents = [];
  const planBDocuments = [];
  const samples = [];

  for (
    const filePath
    of files
  ) {
    const fileName =
      path.basename(filePath);
    const extractionStarted =
      performance.now();
    const extracted =
      await extractFileForIndex(filePath);
    const extractionMs =
      performance.now() - extractionStarted;
    const cleanText =
      extracted.cleanText ||
      extracted.text ||
      "";

    const planAStarted =
      performance.now();
    const titleTags =
      generateTitleTags(cleanText);
    const keywordTags =
      generateKeywordTags(cleanText);
    const planAKeywordMs =
      performance.now() - planAStarted;

    const baseDocument = {
      documentId:
        filePath,
      filePath,
      fileName,
      titleTags,
      keywordTags,
      category:
        classifyDocument(cleanText),
      metadata:
        extractMetadata(cleanText),
      text:
        extracted.text,
      cleanText,
      textQuality:
        extracted.textQuality,
      rawWordCount:
        extracted.rawWordCount,
      cleanWordCount:
        extracted.cleanWordCount,
      noiseRatio:
        extracted.noiseRatio,
      totalPages:
        extracted.totalPages,
      indexedPages:
        extracted.pages?.length || null,
      queuedJobs:
        extracted.jobs?.length || 0,
      status:
        extracted.status,
      timingMs: {
        extraction:
          extractionMs,
        planAKeywords:
          planAKeywordMs
      }
    };

    baseDocument.organization =
      suggestOrganization(
        baseDocument
      );

    const planBStarted =
      performance.now();
    const planBOutput =
      await import("../electron/planBService.js")
        .then(module =>
          module.enrichDocumentWithPlanB(
            baseDocument
          )
        );
    const planBMs =
      performance.now() - planBStarted;
    const planBDocument =
      mergePlanBTags(
        baseDocument,
        planBOutput
      );

    planBDocument.organization =
      suggestOrganization(
        planBDocument
      );
    planBDocument.timingMs = {
      ...baseDocument.timingMs,
      planB:
        planBMs,
      planBWorker:
        planBOutput?.wallMs
    };

    documents.push(
      baseDocument
    );
    planBDocuments.push(
      planBDocument
    );

    const expectedTerms =
      expectedTermsForText(
        cleanText
      );

    if (
      expectedTerms.length &&
      samples.length < 8
    ) {
      samples.push({
        file:
          filePath,
        expectedTerms,
        planA:
          keywordTags.slice(0, 10),
        planB:
          planBDocument.keywordTags.slice(0, 10),
        folderA:
          baseDocument.organization?.primaryFolderId,
        folderB:
          planBDocument.organization?.primaryFolderId,
        quality:
          extracted.textQuality,
        extractionMs:
          round(extractionMs),
        planBMs:
          round(planBMs)
      });
    }
  }

  const planAKeywordStats =
    documents.map(document =>
      keywordStats(
        document.keywordTags,
        expectedTermsForText(
          document.cleanText
        )
      )
    );
  const planBKeywordStats =
    planBDocuments.map(document =>
      keywordStats(
        document.keywordTags,
        expectedTermsForText(
          document.cleanText
        )
      )
    );

  const searchTests =
    root.toLowerCase()
      .includes("pdf")
      ? PDF_SEARCH_TESTS
      : SEARCH_TESTS;

  const fastSearch =
    evaluateSearch(
      query =>
        searchDocumentsInDocs(
          planBDocuments,
          query
        ),
      searchTests
    );
  const semanticSearchResults = {};
  const semanticStarted =
    performance.now();

  for (
    const test
    of searchTests
  ) {
    const results =
      await runPlanBSemanticSearch(
        test.query,
        planBDocuments
      );

    semanticSearchResults[test.query] =
      results.map(result => ({
        ...result.document,
        score:
          result.planBScore,
        planBScore:
          result.planBScore
      }));
  }

  const semanticSearchMs =
    performance.now() - semanticStarted;
  const planBSearch =
    evaluateSearch(
      query =>
        semanticSearchResults[query] || [],
      searchTests
    );

  return {
    root,
    files:
      files.length,
    totalMs:
      round(
        performance.now() - rootStarted
      ),
    extractionMs:
      round(
        sum(
          documents.map(document =>
            document.timingMs.extraction
          )
        )
      ),
    planAKeywordMs:
      round(
        sum(
          documents.map(document =>
            document.timingMs.planAKeywords
          )
        )
      ),
    planBEnrichmentMs:
      round(
        sum(
          planBDocuments.map(document =>
            document.timingMs.planB
          )
        )
      ),
    planBWorkerMs:
      round(
        sum(
          planBDocuments.map(document =>
            document.timingMs.planBWorker
          )
        )
      ),
    semanticSearchMs:
      round(
        semanticSearchMs
      ),
    avgTextQuality:
      round(
        average(
          documents.map(document =>
            document.textQuality
          )
        )
      ),
    avgCleanWords:
      round(
        average(
          documents.map(document =>
            document.cleanWordCount
          )
        )
      ),
    pdfs:
      documents.filter(document =>
        document.totalPages
      ).map(document => ({
        file:
          document.filePath,
        totalPages:
          document.totalPages,
        indexedPages:
          document.indexedPages,
        queuedJobs:
          document.queuedJobs,
        status:
          document.status
      })),
    keywordMetrics: {
      planAPrecision:
        round(
          average(
            planAKeywordStats.map(stats =>
              stats.precision
            )
          ),
          3
        ),
      planARecall:
        round(
          average(
            planAKeywordStats.map(stats =>
              stats.recall
            )
          ),
          3
        ),
      planBPrecision:
        round(
          average(
            planBKeywordStats.map(stats =>
              stats.precision
            )
          ),
          3
        ),
      planBRecall:
        round(
          average(
            planBKeywordStats.map(stats =>
              stats.recall
            )
          ),
          3
        )
    },
    search: {
      tests:
        searchTests.length,
      fast:
        fastSearch,
      planBSemantic:
        planBSearch
    },
    folders: {
      planA:
        Object.fromEntries(
          [...new Set(
            documents.map(document =>
              document.organization?.primaryFolderId || "none"
            )
          )].sort().map(folder => [
            folder,
            documents.filter(document =>
              (document.organization?.primaryFolderId || "none") === folder
            ).length
          ])
        ),
      planB:
        Object.fromEntries(
          [...new Set(
            planBDocuments.map(document =>
              document.organization?.primaryFolderId || "none"
            )
          )].sort().map(folder => [
            folder,
            planBDocuments.filter(document =>
              (document.organization?.primaryFolderId || "none") === folder
            ).length
          ])
        )
    },
    samples
  };
}

const allStarted =
  performance.now();
const results = [];

try {
  for (
    const root
    of DATASET_ROOTS
  ) {
    results.push(
      await benchmarkRoot(root)
    );
  }
} finally {
  stopPlanBWorker();
}

originalConsole.log(
  JSON.stringify(
    {
      totalMs:
        round(
          performance.now() - allStarted
        ),
      results
    },
    null,
    2
  )
);
