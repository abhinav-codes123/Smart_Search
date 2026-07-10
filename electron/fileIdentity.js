import crypto from "crypto";
import fs from "fs";
import path from "path";

export async function generateFileHash(filePath) {

  return new Promise((resolve, reject) => {
    const hash =
      crypto.createHash("sha256");

    const stream =
      fs.createReadStream(filePath);

    stream.on(
      "data",
      chunk => hash.update(chunk)
    );

    stream.on(
      "error",
      reject
    );

    stream.on(
      "end",
      () =>
        resolve(
          hash.digest("hex")
        )
    );
  });
}

export function createDocumentId(fileHash) {

  return `doc_${fileHash.slice(0, 24)}`;
}

export function createPageId(documentId, pageNumber) {

  return `${documentId}_page_${String(pageNumber).padStart(5, "0")}`;
}

export function createJobId(documentId, pageNumber) {

  return `${documentId}_ocr_${String(pageNumber).padStart(5, "0")}`;
}

export function getFileIdentity(filePath, fileHash) {

  const hash =
    fileHash;

  const documentId =
    createDocumentId(hash);

  return {
    documentId,
    fileHash:
      hash,
    fileName:
      path.basename(filePath),
    extension:
      path.extname(filePath)
        .toLowerCase()
  };
}
