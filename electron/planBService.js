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
const DEFAULT_SEMANTIC_TOP_K =
  Number(process.env.SMART_SEARCH_SEMANTIC_TOP_K || 30);

let workerProcess = null;
let workerReadyPromise = null;
let workerLineBuffer = "";
let workerRequestCounter = 0;
let workerStartupInfo = null;
const pendingRequests =
  new Map();

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

  const normalized = {
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

  const embedding =
    document.semanticEmbedding?.vector ||
    document.embedding?.vector ||
    document.embedding;

  if (
    Array.isArray(embedding) &&
    embedding.length > 0
  ) {
    normalized.embedding =
      embedding;
  }

  return normalized;
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

function failPendingRequests(error) {
  for (
    const pending
    of pendingRequests.values()
  ) {
    clearTimeout(
      pending.timer
    );
    pending.reject(
      error
    );
  }

  pendingRequests.clear();
}

function handleWorkerLine(line) {
  let message;

  try {
    message =
      JSON.parse(line);
  } catch (error) {
    log.warn(
      "planb.worker.invalid-json",
      {
        line:
          line.slice(0, 500),
        error:
          error.message
      }
    );
    return;
  }

  if (
    message.type === "ready"
  ) {
    workerStartupInfo =
      message;
    log.info(
      "planb.worker.ready",
      {
        capabilities:
          message.capabilities,
        startupTimingMs:
          message.startupTimingMs
      }
    );
    return;
  }

  if (
    message.type === "shutdown"
  ) {
    return;
  }

  const pending =
    pendingRequests.get(
      message.id
    );

  if (!pending) {
    log.warn(
      "planb.worker.unmatched-response",
      {
        id:
          message.id,
        type:
          message.type
      }
    );
    return;
  }

  pendingRequests.delete(
    message.id
  );
  clearTimeout(
    pending.timer
  );

  if (
    message.ok
  ) {
    pending.resolve(
      message.result || message
    );
    return;
  }

  pending.reject(
    new Error(
      message.error || "Plan B worker request failed"
    )
  );
}

function attachWorkerOutput(child) {
  child.stdout.on(
    "data",
    chunk => {
      workerLineBuffer +=
        chunk.toString();

      let newlineIndex =
        workerLineBuffer.indexOf("\n");

      while (
        newlineIndex !== -1
      ) {
        const line =
          workerLineBuffer
            .slice(0, newlineIndex)
            .trim();

        workerLineBuffer =
          workerLineBuffer.slice(
            newlineIndex + 1
          );

        if (line) {
          handleWorkerLine(
            line
          );
        }

        newlineIndex =
          workerLineBuffer.indexOf("\n");
      }
    }
  );

  child.stderr.on(
    "data",
    chunk => {
      const message =
        chunk.toString().trim();

      if (message) {
        log.warn(
          "planb.worker.stderr",
          {
            message:
              message.slice(0, 1000)
          }
        );
      }
    }
  );
}

function startPersistentWorker() {
  const availability =
    getPlanBAvailability();

  if (!availability.available) {
    return Promise.reject(
      new Error(
        availability.reason
      )
    );
  }

  if (
    workerProcess &&
    !workerProcess.killed
  ) {
    return workerReadyPromise ||
      Promise.resolve(
        workerStartupInfo
      );
  }

  workerLineBuffer = "";
  workerStartupInfo = null;

  const args = [
    PLAN_B_WORKER,
    "--server"
  ];

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

  workerProcess =
    child;
  attachWorkerOutput(
    child
  );

  workerReadyPromise =
    new Promise((resolve, reject) => {
      let settled = false;

      const readyListener =
        () => {
          if (
            settled ||
            !workerStartupInfo
          ) {
            return false;
          }

          settled = true;
          clearTimeout(timer);
          log.info(
            "planb.worker.started",
            {
              wallMs:
                Date.now() - started,
              startupTimingMs:
                workerStartupInfo.startupTimingMs
            }
          );
          resolve(
            workerStartupInfo
          );
          return true;
        };

      const interval =
        setInterval(
          () => {
            if (
              readyListener()
            ) {
              clearInterval(interval);
            }
          },
          50
        );

      const timer =
        setTimeout(
          () => {
            if (settled) {
              return;
            }

            settled = true;
            clearInterval(interval);
            child.kill("SIGTERM");
            reject(
              new Error(
                `Plan B worker startup timed out after ${DEFAULT_TIMEOUT_MS}ms`
              )
            );
          },
          DEFAULT_TIMEOUT_MS
        );

      child.once(
        "error",
        error => {
          if (settled) {
            return;
          }

          settled = true;
          clearInterval(interval);
          clearTimeout(timer);
          reject(error);
        }
      );

      child.once(
        "close",
        (code, signal) => {
          if (!settled) {
            settled = true;
            clearInterval(interval);
            clearTimeout(timer);
            reject(
              new Error(
                `Plan B worker exited before ready with code ${code ?? "null"} signal ${signal ?? "none"}`
              )
            );
          }
        }
      );
    });

  child.on(
    "close",
    (code, signal) => {
      log.warn(
        "planb.worker.closed",
        {
          code,
          signal
        }
      );

      if (
        workerProcess === child
      ) {
        workerProcess = null;
        workerReadyPromise = null;
        workerStartupInfo = null;
        workerLineBuffer = "";
      }

      failPendingRequests(
        new Error(
          `Plan B worker closed with code ${code ?? "null"} signal ${signal ?? "none"}`
        )
      );
    }
  );

  return workerReadyPromise;
}

async function sendPersistentRequest({
  documents,
  queries = [],
  embeddings = true,
  analyze = true,
  returnEmbeddings = false,
  topK = 5,
  timeoutMs = DEFAULT_TIMEOUT_MS
}) {
  await startPersistentWorker();

  if (
    !workerProcess ||
    workerProcess.killed
  ) {
    throw new Error(
      "Plan B worker is not running"
    );
  }

  const id =
    `req_${Date.now()}_${++workerRequestCounter}`;
  const started =
    Date.now();
  const payload = {
    documents:
      documents.map(
        normalizeWorkerDocument
      ),
    queries,
    analyze,
    returnEmbeddings,
    topK
  };

  return new Promise((resolve, reject) => {
    const timer =
      setTimeout(
        () => {
          pendingRequests.delete(
            id
          );
          reject(
            new Error(
              `Plan B request timed out after ${timeoutMs}ms`
            )
          );
        },
        timeoutMs
      );

    pendingRequests.set(
      id,
      {
        timer,
        resolve:
          result =>
            resolve({
              ...result,
              wallMs:
                Date.now() - started,
              persistent:
                true
            }),
        reject
      }
    );

    workerProcess.stdin.write(
      `${JSON.stringify({
        id,
        payload,
        noEmbeddings:
          !embeddings
      })}\n`
    );
  });
}

function runOneShotWorker({
  documents,
  queries = [],
  embeddings = true,
  analyze = true,
  returnEmbeddings = false,
  topK = 5,
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
    queries,
    analyze,
    returnEmbeddings,
    topK
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
              stderr.trim(),
            persistent:
              false
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

export function startPlanBWorker() {
  if (!isPlanBEnabled()) {
    log.info(
      "planb.worker.start.skipped",
      {
        reason:
          "disabled"
      }
    );
    return Promise.resolve(null);
  }

  log.info(
    "planb.worker.start.requested"
  );

  return startPersistentWorker();
}

export function stopPlanBWorker() {
  if (
    !workerProcess ||
    workerProcess.killed
  ) {
    return;
  }

  try {
    workerProcess.stdin.write(
      `${JSON.stringify({
        id:
          `shutdown_${Date.now()}`,
        command:
          "shutdown"
      })}\n`
    );
  } catch {
    workerProcess.kill("SIGTERM");
  }
}

export function runPlanBWorker(options) {
  if (
    process.env.SMART_SEARCH_PLAN_B_PERSISTENT === "0"
  ) {
    return runOneShotWorker(
      options
    );
  }

  return sendPersistentRequest(
    options
  );
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
        true,
      returnEmbeddings:
        true,
      topK:
        1
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
    embedding:
      planBDocument.embedding
        ? {
            model:
              planBDocument.embeddingModel ||
              output.vectorSearch?.model,
            dimensions:
              planBDocument.embeddingDimensions ||
              planBDocument.embedding.length,
            vector:
              planBDocument.embedding
          }
        : null,
    capabilities:
      output.capabilities,
    timingMs:
      output.timingMs,
    wallMs:
      output.wallMs
  };
}

export async function runPlanBSemanticSearch(
  query,
  documents,
  options = {}
) {
  const topK =
    Number(
      options.topK ||
      DEFAULT_SEMANTIC_TOP_K
    );
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

  const cachedCandidates =
    candidates.filter(document =>
      Array.isArray(
        document.semanticEmbedding?.vector
      ) &&
      document.semanticEmbedding.vector.length > 0 &&
      (
        !document.semanticEmbedding.textFingerprint ||
        document.semanticEmbedding.textFingerprint ===
          getPlanBTextFingerprint(
            document
          )
      )
    );
  const allCandidatesHaveFreshEmbeddings =
    cachedCandidates.length ===
    candidates.length;
  const searchCandidates =
    allCandidatesHaveFreshEmbeddings
      ? cachedCandidates
      : candidates.map(document =>
          cachedCandidates.includes(document)
            ? document
            : {
                ...document,
                semanticEmbedding:
                  null
              }
        );
  const usingCachedEmbeddings =
    allCandidatesHaveFreshEmbeddings;

  log.info(
    "planb.search.start",
    {
      query,
      documents:
        searchCandidates.length,
      cachedEmbeddings:
        cachedCandidates.length,
      mode:
        usingCachedEmbeddings
          ? "cached-embeddings"
          : cachedCandidates.length > 0
            ? "mixed-stale-embeddings"
            : "live-embeddings"
    }
  );

  const output =
    await runPlanBWorker({
      documents:
        searchCandidates,
      queries: [
        query
      ],
      embeddings:
        true,
      analyze:
        false,
      topK:
        Number.isFinite(topK) && topK > 0
          ? topK
          : DEFAULT_SEMANTIC_TOP_K
    });

  const results =
    output.vectorSearch?.queries?.[0]?.results || [];
  const byPath =
    new Map(
      searchCandidates.map(document => [
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
