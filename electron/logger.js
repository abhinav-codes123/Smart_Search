let logTarget = null;

const pendingEntries = [];

function normalizeDetails(details) {

  if (
    details instanceof Error
  ) {
    return {
      message:
        details.message,
      stack:
        details.stack
    };
  }

  if (
    details &&
    typeof details === "object"
  ) {
    return details;
  }

  if (
    details === undefined
  ) {
    return {};
  }

  return {
    value:
      details
  };
}

function writeToMainConsole(entry) {

  const method =
    entry.level === "error"
      ? "error"
      : entry.level === "warn"
        ? "warn"
        : "log";

  console[method](
    `[SmartSearch:${entry.level}] ${entry.event}`,
    entry.details
  );
}

function writeToDevTools(entry) {

  if (
    !logTarget ||
    logTarget.isDestroyed() ||
    logTarget.isLoading()
  ) {
    pendingEntries.push(entry);

    if (
      pendingEntries.length > 500
    ) {
      pendingEntries.shift();
    }

    return;
  }

  logTarget.send(
    "smart-search-log",
    entry
  );
}

export function setLogTarget(webContents) {

  logTarget =
    webContents;

  const flush = () => {
    while (
      pendingEntries.length > 0
    ) {
      writeToDevTools(
        pendingEntries.shift()
      );
    }
  };

  if (
    webContents.isLoading()
  ) {
    webContents.once(
      "did-finish-load",
      flush
    );
  } else {
    flush();
  }
}

export function appLog(
  level,
  event,
  details
) {

  const entry = {
    level,
    event,
    details:
      normalizeDetails(
        details
      ),
    timestamp:
      new Date()
        .toISOString()
  };

  writeToMainConsole(
    entry
  );
  writeToDevTools(
    entry
  );
}

export const log = {
  info:
    (event, details) =>
      appLog(
        "info",
        event,
        details
      ),
  warn:
    (event, details) =>
      appLog(
        "warn",
        event,
        details
      ),
  error:
    (event, details) =>
      appLog(
        "error",
        event,
        details
      )
};
