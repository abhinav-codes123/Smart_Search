import fs from "node:fs";
import path from "node:path";
import {
  extractTextFromFile,
  SUPPORTED_EXTENSIONS
} from "../electron/textExtractor.js";

const folderPath =
  process.argv[2];

if (!folderPath) {
  console.error(
    "Usage: node test/extract-folder.mjs <folder-path>"
  );
  process.exit(1);
}

function collectFiles(rootPath) {

  const files = [];
  const entries =
    fs.readdirSync(
      rootPath,
      {
        withFileTypes: true
      }
    );

  for (
    const entry
    of entries
  ) {
    const entryPath =
      path.join(
        rootPath,
        entry.name
      );

    if (
      entry.isDirectory()
    ) {
      files.push(
        ...collectFiles(entryPath)
      );
      continue;
    }

    if (
      !entry.isFile()
    ) {
      continue;
    }

    const extension =
      path
        .extname(entry.name)
        .toLowerCase();

    if (
      SUPPORTED_EXTENSIONS.has(
        extension
      )
    ) {
      files.push(entryPath);
    }
  }

  return files;
}

function preview(text) {

  return text
    .replace(
      /\s+/g,
      " "
    )
    .trim()
    .slice(
      0,
      160
    );
}

let files;

try {
  files =
    collectFiles(folderPath);
} catch (error) {
  console.error(
    `Unable to read ${folderPath}: ${error.message}`
  );
  process.exit(1);
}

if (
  files.length === 0
) {
  console.error(
    `No supported files found in ${folderPath}`
  );
  process.exit(1);
}

let failures = 0;

for (
  const filePath
  of files
) {
  try {
    const text =
      await extractTextFromFile(
        filePath
      );

    if (
      !text.trim()
    ) {
      failures++;
      console.error(
        `FAIL ${filePath} -> extracted 0 characters`
      );
      continue;
    }

    console.log(
      `PASS ${filePath} -> ${text.length} chars -> ${preview(text)}`
    );
  } catch (error) {
    failures++;
    console.error(
      `FAIL ${filePath} -> ${error.message}`
    );
  }
}

if (
  failures > 0
) {
  process.exit(1);
}
