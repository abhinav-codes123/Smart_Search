import crypto from "crypto";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { log } from "./logger.js";

const DEFAULT_TIMEOUT_MS =
  Number(process.env.SMART_SEARCH_PLAN_B_TIMEOUT_MS || 1000 * 60 * 6);

const PLAN_B_PYTHON =
  process.env.SMART_SEARCH_PLAN_B_PYTHON ||
  path.join(
    process.cwd(),
    ".venv-planb",
    "bin",
    "python"
  );

const PLAN_B_WORKER =
  process.env.SMART_SEARCH_PLAN_B_WORKER ||
  path.join(
    process.cwd(),
    "python",
    "plan_b_worker.py"
  );

export function isPlanBEnabled() {
  return process.env.SMART_SEARCH_PLAN_B !== "0";
}

export function getPlanBText(document) {
  return String(
    document?.cleanText ||
      document?.text ||
      ""
  ).trim();
}

export function getPlanBTextFingerprint(document) {
  return crypto
    .createHash("sha256")
    .update(
      getPlanBText(document)
    )
    .digest("hex")
    .slice(0, 24);
}

function getPlanBAvailability() {
  if (!isPlanBEnabled()) {
    return {
      available: false,
      reason: "disabled by SMART_SEARCH_PLAN_B=0"
    };
  }

  if (!fs.existsSync(PLAN_B_PYTHON)) {
    return {
      available: false,
      reason: `python not found: ${PLAN_B_PYTHON}`
    };
  }

  if (!fs.existsSync(PLAN_B_WORKER)) {
    return {
      available: false,
      reason: `worker not found: ${PLAN_B_WORKER}`
    };
  }

  return {
    available: true
  };
}

function normalizeWorkerDocument(document) {
  const file =
    document.filePath ||
    document.primaryPath ||
    document.fileName ||
    document.documentId;

  return {
    id:
      document.documentId,
    file,
    title:
      document.fileName ||
      path.basename(
        file || ""
      ),
    text:
      getPlanBText(document)
  };
}

function buildWorkerEnv() {
  return {
    ...process.env,
    HF_HUB_OFFLINE:
      process.env.HF_HUB_OFFLINE || "1",
    TRANSFORMERS_OFFLINE:
      process.env.TRANSFORMERS_OFFLINE || "1",
    HF_HUB_DISABLE_TELEMETRY:
      process.env.HF_HUB_DISABLE_TELEMETRY || "1",
    OMP_NUM_THREADS:
      process.env.OMP_NUM_THREADS || "1",
    MKL_NUM_THREADS:
      process.env.MKL_NUM_THREADS || "1",
    VECLIB_MAXIMUM_THREADS:
      process.env.VECLIB_MAXIMUM_THREADS || "1",
    NUMEXPR_NUM_THREADS:
      process.env.NUMEXPR_NUM_THREADS || "1",
    TOKENIZERS_PARALLELISM:
      process.env.TOKENIZERS_PARALLELISM || "false"
  };
}

export function runPlanBWorker({
  documents,
  queries = [],
  embeddings = true,
  timeoutMs = DEFAULT_TIMEOUT_MS
}) {
  const availability =
    getPlanBAvailability();

  if (!availability.available) {
    return Promise.reject(
      new Error(
        availability.reason
      )
    );
  }

  const payload = {
    documents:
      documents.map(
        normalizeWorkerDocument
      ),
    queries
  };

  const args = [
    PLAN_B_WORKER
  ];

  if (!embeddings) {
    args.push(
      "--no-embeddings"
    );
  }

  return new Promise((resolve, reject) => {
    const started =
      Date.now();
    const child =
      spawn(
        PLAN_B_PYTHON,
        args,
        {
          cwd:
            process.cwd(),
          env:
            buildWorkerEnv(),
          stdio:
            [
              "pipe",
              "pipe",
              "pipe"
            ]
        }
      );

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer =
      setTimeout(
        () => {
          if (settled) {
            return;
          }

          settled = true;
          child.kill("SIGTERM");
          reject(
            new Error(
              `Plan B worker timed out after ${timeoutMs}ms`
            )
          );
        },
        timeoutMs
      );

    child.stdout.on(
      "data",
      chunk => {
        stdout +=
          chunk.toString();
      }
    );

    child.stderr.on(
      "data",
      chunk => {
        stderr +=
          chunk.toString();
      }
    );

    child.on(
      "error",
      error => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    );

    child.on(
      "close",
      (code, signal) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timer);

        if (code !== 0) {
          reject(
            new Error(
              `Plan B worker failed with code ${code ?? "null"} signal ${signal ?? "none"}: ${stderr}`
            )
          );
          return;
        }

        try {
          const parsed =
            JSON.parse(stdout);

          resolve({
            ...parsed,
            wallMs:
              Date.now() - started,
            stderr:
              stderr.trim()
          });
        } catch (error) {
          reject(
            new Error(
              `Plan B worker returned invalid JSON: ${error.message}`
            )
          );
        }
      }
    );

    child.stdin.end(
      JSON.stringify(payload)
    );
  });
}

export async function enrichDocumentWithPlanB(document) {
  const text =
    getPlanBText(document);

  if (!text) {
    return null;
  }

  const fingerprint =
    getPlanBTextFingerprint(
      document
    );

  log.info(
    "planb.enrich.start",
    {
      documentId:
        document.documentId,
      filePath:
        document.filePath,
      chars:
        text.length,
      fingerprint
    }
  );

  const output =
    await runPlanBWorker({
      documents: [
        document
      ],
      embeddings:
        false
    });
  const planBDocument =
    output.documents?.[0];

  if (!planBDocument) {
    throw new Error(
      "Plan B worker returned no document"
    );
  }

  return {
    ...planBDocument,
    fingerprint,
    capabilities:
      output.capabilities,
    timingMs:
      output.timingMs,
    wallMs:
      output.wallMs
  };
}

export async function runPlanBSemanticSearch(query, documents) {
  const candidates =
    documents.filter(document =>
      getPlanBText(document)
    );

  if (
    !query.trim() ||
    candidates.length === 0
  ) {
    return [];
  }

  log.info(
    "planb.search.start",
    {
      query,
      documents:
        candidates.length
    }
  );

  const output =
    await runPlanBWorker({
      documents:
        candidates,
      queries: [
        query
      ],
      embeddings:
        true
    });

  const results =
    output.vectorSearch?.queries?.[0]?.results || [];
  const byPath =
    new Map(
      candidates.map(document => [
        path.normalize(
          document.filePath ||
            document.primaryPath ||
            ""
        ),
        document
      ])
    );

  log.info(
    "planb.search.completed",
    {
      query,
      backend:
        output.vectorSearch?.backend,
      results:
        results.length,
      wallMs:
        output.wallMs,
      timingMs:
        output.timingMs
    }
  );

  return results
    .map(result => {
      const document =
        byPath.get(
          path.normalize(
            result.file || ""
          )
        );

      if (!document) {
        return null;
      }

      return {
        document,
        planBScore:
          result.score,
        planBBackend:
          output.vectorSearch?.backend || "none",
        planBTimingMs:
          output.timingMs
      };
    })
    .filter(Boolean);
}
