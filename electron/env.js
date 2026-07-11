import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename =
  fileURLToPath(import.meta.url);
const __dirname =
  path.dirname(__filename);

const PROJECT_ROOT =
  path.resolve(
    __dirname,
    ".."
  );
const ORIGINAL_ENV_KEYS =
  new Set(
    Object.keys(process.env)
  );
const FILE_ENV_KEYS =
  new Set();

function parseEnvLine(line) {

  const trimmed =
    line.trim();

  if (
    !trimmed ||
    trimmed.startsWith("#")
  ) {
    return null;
  }

  const normalized =
    trimmed.startsWith("export ")
      ? trimmed.slice(7).trim()
      : trimmed;
  const separatorIndex =
    normalized.indexOf("=");

  if (separatorIndex <= 0) {
    return null;
  }

  const key =
    normalized
      .slice(
        0,
        separatorIndex
      )
      .trim();

  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
    return null;
  }

  let value =
    normalized
      .slice(separatorIndex + 1)
      .trim();

  if (
    (
      value.startsWith("\"") &&
      value.endsWith("\"")
    ) ||
    (
      value.startsWith("'") &&
      value.endsWith("'")
    )
  ) {
    value =
      value.slice(
        1,
        -1
      );
  }

  return {
    key,
    value:
      value
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
  };
}

function loadEnvFile(
  filePath,
  {
    overrideFileValues = false
  } = {}
) {

  if (
    !fs.existsSync(filePath)
  ) {
    return [];
  }

  const loaded = [];
  const content =
    fs.readFileSync(
      filePath,
      "utf8"
    );

  for (
    const line
    of content.split(/\r?\n/)
  ) {
    const entry =
      parseEnvLine(line);

    if (!entry) {
      continue;
    }

    if (
      !ORIGINAL_ENV_KEYS.has(entry.key) &&
      (
        process.env[entry.key] === undefined ||
        (
          overrideFileValues &&
          FILE_ENV_KEYS.has(entry.key)
        )
      )
    ) {
      process.env[entry.key] =
        entry.value;
      FILE_ENV_KEYS.add(entry.key);
      loaded.push(entry.key);
    }
  }

  return loaded;
}

export function loadSmartSearchEnv() {

  const explicitPath =
    process.env.SMART_SEARCH_ENV_PATH;
  const envPaths =
    explicitPath
      ? [path.resolve(explicitPath)]
      : [
          path.join(
            PROJECT_ROOT,
            ".env"
          ),
          path.join(
            PROJECT_ROOT,
            ".env.local"
          )
        ];

  const loaded = [];

  for (
    let index = 0;
    index < envPaths.length;
    index++
  ) {
    const envPath =
      envPaths[index];

    loaded.push(
      ...loadEnvFile(
        envPath,
        {
          overrideFileValues:
            !explicitPath &&
            index > 0
        }
      )
    );
  }

  return loaded;
}

loadSmartSearchEnv();
