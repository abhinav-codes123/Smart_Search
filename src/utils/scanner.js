import { extractMetadata } from "./extractMetadata.js";
import {
  generateTitleTags,
  generateKeywordTags
} from "./tagGenerator.js";

export async function scanFiles(
  files,
  extractDocumentText,
  classifyDocument,
  onProgress
) {

  console.log(
    "[SmartSearch:info] scanner.start",
    {
      count:
        files.length
    }
  );

  const results = [];

  for (
    let i = 0;
    i < files.length;
    i++
  ) {

    const file =
      files[i];

    console.log(
      "[SmartSearch:info] scanner.file.start",
      {
        index:
          i + 1,
        total:
          files.length,
        filePath:
          file.path
      }
    );

    const result =
      await extractDocumentText(
        file.path
      );

    if (!result.success) {
      console.error(
        "[SmartSearch:error] scanner.file.failed",
        {
          filePath:
            file.path,
          error:
            result.error
        }
      );
      continue;
    }

    const text =
      result.text || "";

    const titleTags =
      generateTitleTags(
        text
      );

    const keywordTags =
      generateKeywordTags(
        text
      );

    const category =
      classifyDocument(
        text
      );

    const metadata =
      extractMetadata(
        text
      );

    results.push({

      documentId:
        result.documentId,

      fileHash:
        result.fileHash,

      filePath:
        file.path,

      fileName:
        file.name,

      titleTags,

      keywordTags,

      category,

      metadata,

      text,

      pages:
        result.pages || [],

      jobs:
        result.jobs || [],

      totalPages:
        result.totalPages ?? null,

      status:
        result.status || "done",

      scannedAt:
        new Date()
          .toISOString()

    });

    console.log(
      "[SmartSearch:info] scanner.file.completed",
      {
        filePath:
          file.path,
        chars:
          text.length,
        fileHash:
          result.fileHash,
        queuedJobs:
          result.jobs?.length ?? 0,
        status:
          result.status
      }
    );

    // Progress Update
    if (onProgress) {

      const progress =
        Math.round(
          ((i + 1) /
            files.length) *
            100
        );

      onProgress(
        progress
      );
    }
  }

  console.log(
    "[SmartSearch:info] scanner.completed",
    {
      count:
        results.length
    }
  );

  return results;
}
