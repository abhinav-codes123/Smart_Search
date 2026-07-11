import { createRequire } from "module";
import childProcess from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import {
  createCanvas
} from "@napi-rs/canvas";
import JSZip from "jszip";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import Tesseract from "tesseract.js";
import {
  log
} from "./logger.js";
import {
  buildTextQuality
} from "./textQuality.js";

const require =
  createRequire(import.meta.url);

const pdfParse =
  require("pdf-parse");

const PDFJS_DIST_DIR =
  path.dirname(
    require.resolve(
      "pdfjs-dist/package.json"
    )
  );

const execFile =
  promisify(
    childProcess.execFile
  );

const PDF_OCR_PAGE_LIMIT = 0;
const OFFICE_IMAGE_OCR_LIMIT = 0;
const PDF_RENDER_SCALE = 1;
const INITIAL_PDF_SYNC_PAGES = 3;

const PDF_IMAGE_OPS =
  new Set([
    pdfjsLib.OPS.paintImageMaskXObject,
    pdfjsLib.OPS.paintImageMaskXObjectGroup,
    pdfjsLib.OPS.paintImageXObject,
    pdfjsLib.OPS.paintInlineImageXObject,
    pdfjsLib.OPS.paintInlineImageXObjectGroup,
    pdfjsLib.OPS.paintImageXObjectRepeat,
    pdfjsLib.OPS.paintImageMaskXObjectRepeat
  ]);

export const SUPPORTED_EXTENSIONS =
  new Set([
    ".pdf",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".bmp",
    ".gif",
    ".tif",
    ".tiff",
    ".doc",
    ".docx",
    ".pptx",
    ".xlsx",
    ".odt",
    ".odp",
    ".ods",
    ".txt",
    ".md",
    ".markdown",
    ".csv",
    ".tsv",
    ".json",
    ".xml",
    ".html",
    ".htm",
    ".css",
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".py",
    ".java",
    ".c",
    ".cpp",
    ".h",
    ".hpp",
    ".cs",
    ".go",
    ".rs",
    ".php",
    ".rb",
    ".swift",
    ".kt",
    ".sql",
    ".log",
    ".rtf"
  ]);

const TEXT_EXTENSIONS =
  new Set([
    ".txt",
    ".md",
    ".markdown",
    ".csv",
    ".tsv",
    ".json",
    ".xml",
    ".html",
    ".htm",
    ".css",
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".py",
    ".java",
    ".c",
    ".cpp",
    ".h",
    ".hpp",
    ".cs",
    ".go",
    ".rs",
    ".php",
    ".rb",
    ".swift",
    ".kt",
    ".sql",
    ".log"
  ]);

const IMAGE_EXTENSIONS =
  new Set([
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".bmp",
    ".gif",
    ".tif",
    ".tiff"
  ]);

function normalizeWhitespace(text) {

  return String(
    text ?? ""
  )
    .replace(
      /\r/g,
      "\n"
    )
    .replace(
      /[ \t]+\n/g,
      "\n"
    )
    .replace(
      /\n{3,}/g,
      "\n\n"
    )
    .trim();
}

function decodeXmlEntities(text) {

  return text
    .replace(
      /&amp;/g,
      "&"
    )
    .replace(
      /&lt;/g,
      "<"
    )
    .replace(
      /&gt;/g,
      ">"
    )
    .replace(
      /&quot;/g,
      "\""
    )
    .replace(
      /&apos;/g,
      "'"
    )
    .replace(
      /&#(\d+);/g,
      (_, code) =>
        String.fromCharCode(
          Number(code)
        )
    )
    .replace(
      /&#x([a-f0-9]+);/gi,
      (_, code) =>
        String.fromCharCode(
          parseInt(
            code,
            16
          )
        )
    );
}

function extractXmlText(xml) {

  return normalizeWhitespace(
    decodeXmlEntities(
      xml
        .replace(
          /<[^>]+>/g,
          " "
        )
    )
  );
}

async function readZipTextEntries(zip, pattern) {

  const names =
    Object.keys(
      zip.files
    )
      .filter(name =>
        pattern.test(name) &&
        !zip.files[name].dir
      )
      .sort(
        (a, b) =>
          a.localeCompare(
            b,
            undefined,
            {
              numeric: true
            }
          )
      );

  const chunks = [];

  for (
    const name
    of names
  ) {
    const xml =
      await zip.files[name]
        .async("string");

    const text =
      extractXmlText(xml);

    if (text) {
      chunks.push(text);
    }
  }

  return chunks;
}

async function extractZipImageText(zip) {

  const imageNames =
    Object.keys(
      zip.files
    )
      .filter(name =>
        !zip.files[name].dir &&
        IMAGE_EXTENSIONS.has(
          path
            .extname(name)
            .toLowerCase()
        )
      )
      .sort(
        (a, b) =>
          a.localeCompare(
            b,
            undefined,
            {
              numeric: true
            }
          )
      )
      .slice(
        0,
        OFFICE_IMAGE_OCR_LIMIT > 0
          ? OFFICE_IMAGE_OCR_LIMIT
          : undefined
      );

  if (
    imageNames.length === 0
  ) {
    return "";
  }

  const tempDir =
    fs.mkdtempSync(
      path.join(
        os.tmpdir(),
        "smart-search-office-images-"
      )
    );

  try {
    const chunks = [];

    for (
      let index = 0;
      index < imageNames.length;
      index++
    ) {
      const name =
        imageNames[index];

      const buffer =
        await zip.files[name]
          .async("nodebuffer");

      const imagePath =
        path.join(
          tempDir,
          `image-${index}${path.extname(name)}`
        );

      fs.writeFileSync(
        imagePath,
        buffer
      );

      try {
        const text =
          await extractImageText(
            imagePath
          );

        if (text) {
          chunks.push(text);
        }
      } catch (error) {
        log.warn(
          "office.embedded-image.ocr-failed",
          {
            name,
            error:
              error.message
          }
        );
      }
    }

    return normalizeWhitespace(
      chunks.join("\n\n")
    );
  } finally {
    fs.rmSync(
      tempDir,
      {
        recursive: true,
        force: true
      }
    );
  }
}

async function extractOfficeOpenXml(filePath, type) {

  const buffer =
    fs.readFileSync(filePath);

  const zip =
    await JSZip.loadAsync(buffer);

  if (type === ".docx") {
    const textChunks =
      await readZipTextEntries(
        zip,
        /^word\/(document|header\d*|footer\d*|footnotes|endnotes|comments)\.xml$/
      );

    const imageText =
      await extractZipImageText(
        zip
      );

    return normalizeWhitespace(
      [
        ...textChunks,
        imageText
      ]
        .filter(Boolean)
        .join("\n\n")
    );
  }

  if (type === ".pptx") {
    const textChunks =
      await readZipTextEntries(
        zip,
        /^ppt\/(slides|notesSlides)\/[^/]+\.xml$/
      );

    const imageText =
      await extractZipImageText(
        zip
      );

    return normalizeWhitespace(
      [
        ...textChunks,
        imageText
      ]
        .filter(Boolean)
        .join("\n\n")
    );
  }

  if (type === ".xlsx") {
    const chunks =
      await readZipTextEntries(
        zip,
        /^xl\/(sharedStrings|worksheets\/[^/]+)\.xml$/
      );

    const imageText =
      await extractZipImageText(
        zip
      );

    return normalizeWhitespace(
      [
        ...chunks,
        imageText
      ]
        .filter(Boolean)
        .join("\n\n")
    );
  }

  const chunks =
    await readZipTextEntries(
      zip,
      /^content\.xml$/
    );

  const imageText =
    await extractZipImageText(
      zip
    );

  return normalizeWhitespace(
    [
      ...chunks,
      imageText
    ]
      .filter(Boolean)
      .join("\n\n")
  );
}

async function extractImageText(filePath) {

  log.info(
    "ocr.image.start",
    {
      filePath
    }
  );

  const passes = [];

  const rawPass =
    await runTesseractPass(
      "raw",
      filePath
    );

  if (rawPass.text) {
    passes.push(rawPass);
  }

  log.info(
    "ocr.image.single-pass",
    {
      filePath,
      rawChars:
        rawPass.text.length,
      rawConfidence:
        rawPass.confidence
    }
  );

  const merged =
    mergeOcrText(
      passes
        .map(pass =>
          pass.text
        )
    );

  log.info(
    "ocr.image.completed",
    {
      filePath,
      chars:
        merged.length,
      passes:
        passes.map(pass => ({
          name:
            pass.name,
          chars:
            pass.text.length,
          confidence:
            pass.confidence
        }))
    }
  );

  return merged;
}

async function runTesseractPass(
  name,
  filePath,
  options = {}
) {

  const {
    data
  } = await Tesseract.recognize(
    filePath,
    "eng",
    options
  );

  const text =
    normalizeWhitespace(
      data.text || ""
    );

  log.info(
    "ocr.tesseract.pass-completed",
    {
      name,
      filePath,
      chars:
        text.length,
      confidence:
        data.confidence
    }
  );

  return {
    name,
    text,
    confidence:
      data.confidence ?? null
  };
}

function mergeOcrText(chunks) {

  const seen =
    new Set();

  const lines = [];

  for (
    const chunk
    of chunks
  ) {
    for (
      const line
      of normalizeWhitespace(chunk)
        .split("\n")
    ) {
      const normalized =
        line
          .replace(
            /\s+/g,
            " "
          )
          .trim();

      if (
        !normalized
      ) {
        continue;
      }

      const key =
        normalized.toLowerCase();

      if (
        seen.has(key)
      ) {
        continue;
      }

      seen.add(key);
      lines.push(normalized);
    }
  }

  return normalizeWhitespace(
    lines.join("\n")
  );
}

async function renderPdfPageToImage(
  page,
  outputPath
) {

  const viewport =
    page.getViewport({
      scale:
        PDF_RENDER_SCALE
    });

  const canvas =
    createCanvas(
      Math.ceil(
        viewport.width
      ),
      Math.ceil(
        viewport.height
      )
    );

  const context =
    canvas.getContext("2d");

  await page.render({
    canvasContext:
      context,
    viewport
  }).promise;

  fs.mkdirSync(
    path.dirname(outputPath),
    {
      recursive: true
    }
  );

  fs.writeFileSync(
    outputPath,
    await canvas.encode("png")
  );
}

async function loadPdfDocument(filePath) {

  const buffer =
    fs.readFileSync(filePath);

  return pdfjsLib
    .getDocument({
      data:
        new Uint8Array(buffer),
      cMapPacked:
        true,
      cMapUrl:
        `${path.join(
          PDFJS_DIST_DIR,
          "cmaps"
        )}${path.sep}`,
      standardFontDataUrl:
        `${path.join(
          PDFJS_DIST_DIR,
          "standard_fonts"
        )}${path.sep}`,
      wasmUrl:
        `${path.join(
          PDFJS_DIST_DIR,
          "wasm"
        )}${path.sep}`,
      verbosity:
        pdfjsLib.VerbosityLevel.ERRORS,
      disableWorker:
        true
    })
    .promise;
}

async function getPdfPageContent(page) {

  const textContent =
    await page.getTextContent();

  const embeddedText =
    normalizeWhitespace(
      textContent.items
        .map(item =>
          item.str ?? ""
        )
        .join(" ")
    );

  const operatorList =
    await page.getOperatorList();

  const hasImage =
    operatorList.fnArray
      .some(fnId =>
        PDF_IMAGE_OPS.has(fnId)
      );

  return {
    embeddedText,
    hasImage
  };
}

async function extractPdfPageTextFromPage(
  page,
  pageNumber,
  tempDir
) {

  const {
    embeddedText,
    hasImage
  } =
    await getPdfPageContent(page);

  let ocrText = "";

  if (
    embeddedText.length < 25 ||
    hasImage
  ) {
    log.info(
      "pdf.page.ocr-needed",
      {
        pageNumber,
        embeddedChars:
          embeddedText.length,
        hasImage
      }
    );

    const imagePath =
      path.join(
        tempDir,
        `page-${pageNumber}.png`
      );

    await renderPdfPageToImage(
      page,
      imagePath
    );

    ocrText =
      await extractImageText(
        imagePath
      );
  } else {
    log.info(
      "pdf.page.embedded-text-used",
      {
        pageNumber,
        embeddedChars:
          embeddedText.length
      }
    );
  }

  const text =
    normalizeWhitespace(
      [
        embeddedText,
        ocrText
      ]
      .filter(Boolean)
      .join("\n\n")
    );

  const quality =
    buildTextQuality(text);

  return {
    pageNumber,
    text,
    cleanText:
      quality.cleanText,
    textQuality:
      quality.quality,
    rawWordCount:
      quality.rawWordCount,
    cleanWordCount:
      quality.cleanWordCount,
    noiseRatio:
      quality.noiseRatio,
    embeddedText,
    ocrText,
    hasImage
  };
}

export async function extractPdfPageText(
  filePath,
  pageNumber
) {

  log.info(
    "pdf.page.extract.start",
    {
      filePath,
      pageNumber
    }
  );

  const tempDir =
    fs.mkdtempSync(
      path.join(
        os.tmpdir(),
        "smart-search-pdf-"
      )
    );

  try {
    const pdf =
      await loadPdfDocument(
        filePath
      );

    if (
      pageNumber < 1 ||
      pageNumber > pdf.numPages
    ) {
      throw new Error(
        `PDF page ${pageNumber} is outside 1-${pdf.numPages}`
      );
    }

    const page =
      await pdf.getPage(
        pageNumber
      );

    const result =
      await extractPdfPageTextFromPage(
        page,
        pageNumber,
        tempDir
      );

    log.info(
      "pdf.page.extract.completed",
      {
        filePath,
        pageNumber,
        chars:
          result.text.length,
        ocrChars:
          result.ocrText.length,
        embeddedChars:
          result.embeddedText.length,
        hasImage:
          result.hasImage
      }
    );

    return result;
  } finally {
    fs.rmSync(
      tempDir,
      {
        recursive: true,
        force: true
      }
    );
  }
}

async function extractPdfImageText(filePath) {

  log.info(
    "pdf.full-ocr.start",
    {
      filePath
    }
  );

  const tempDir =
    fs.mkdtempSync(
      path.join(
        os.tmpdir(),
        "smart-search-pdf-"
      )
    );

  try {
    const pdf =
      await loadPdfDocument(
        filePath
      );

    const chunks = [];
    const pageCount =
      PDF_OCR_PAGE_LIMIT > 0
        ? Math.min(
            pdf.numPages,
            PDF_OCR_PAGE_LIMIT
          )
        : pdf.numPages;

    for (
      let pageNumber = 1;
      pageNumber <= pageCount;
      pageNumber++
    ) {
      const page =
        await pdf.getPage(
          pageNumber
        );

      const result =
        await extractPdfPageTextFromPage(
          page,
          pageNumber,
          tempDir
        );

      if (result.ocrText) {
        chunks.push(
          result.ocrText
        );
      }

      log.info(
        "pdf.full-ocr.page-completed",
        {
          filePath,
          pageNumber,
          ocrChars:
            result.ocrText.length
        }
      );
    }

    const text =
      normalizeWhitespace(
        chunks.join("\n\n")
      );

    log.info(
      "pdf.full-ocr.completed",
      {
        filePath,
        chars:
          text.length,
        pageCount
      }
    );

    return text;
  } finally {
    fs.rmSync(
      tempDir,
      {
        recursive: true,
        force: true
      }
    );
  }
}

export async function extractFileForIndex(
  filePath,
  options = {}
) {

  log.info(
    "index.extract.start",
    {
      filePath
    }
  );

  const extension =
    path
      .extname(filePath)
      .toLowerCase();

  if (extension !== ".pdf") {
    const text =
      await extractTextFromFile(
        filePath
      );
    const quality =
      buildTextQuality(
        text
      );

    log.info(
      "index.extract.completed",
      {
        filePath,
        extension,
        chars:
          text.length,
        cleanChars:
          quality.cleanText.length,
        textQuality:
          quality.quality,
        status:
          "done"
      }
    );

    return {
      text,
      cleanText:
        quality.cleanText,
      textQuality:
        quality.quality,
      rawWordCount:
        quality.rawWordCount,
      cleanWordCount:
        quality.cleanWordCount,
      noiseRatio:
        quality.noiseRatio,
      pages: [],
      jobs: [],
      totalPages:
        null,
      status:
        "done"
    };
  }

  const initialPageCount =
    Math.max(
      1,
      Number(
        options.initialPdfPages ??
          INITIAL_PDF_SYNC_PAGES
      )
    );

  const tempDir =
    fs.mkdtempSync(
      path.join(
        os.tmpdir(),
        "smart-search-pdf-index-"
      )
    );

  try {
    const pdf =
      await loadPdfDocument(
        filePath
      );

    log.info(
      "index.pdf.loaded",
      {
        filePath,
        totalPages:
          pdf.numPages,
        initialPageCount
      }
    );

    const pageCount =
      Math.min(
        pdf.numPages,
        initialPageCount
      );

    const pages = [];

    for (
      let pageNumber = 1;
      pageNumber <= pageCount;
      pageNumber++
    ) {
      const page =
        await pdf.getPage(
          pageNumber
        );

      const result =
        await extractPdfPageTextFromPage(
          page,
          pageNumber,
          tempDir
        );

      pages.push(result);

      log.info(
        "index.pdf.initial-page.completed",
        {
          filePath,
          pageNumber,
          chars:
            result.text.length,
          ocrChars:
            result.ocrText.length
        }
      );
    }

    const jobs = [];

    for (
      let pageNumber = pageCount + 1;
      pageNumber <= pdf.numPages;
      pageNumber++
    ) {
      jobs.push({
        pageNumber
      });

      log.info(
        "index.pdf.page-queued",
        {
          filePath,
          pageNumber
        }
      );
    }

    const rawText =
      normalizeWhitespace(
        pages
          .map(page =>
            page.text
          )
          .filter(Boolean)
          .join("\n\n")
      );

    const cleanText =
      normalizeWhitespace(
        pages
          .map(page =>
            page.cleanText ||
            page.text
          )
          .filter(Boolean)
          .join("\n\n")
      );

    const quality =
      buildTextQuality(
        rawText
      );

    const indexed = {
      text:
        rawText,
      cleanText,
      textQuality:
        quality.quality,
      rawWordCount:
        quality.rawWordCount,
      cleanWordCount:
        quality.cleanWordCount,
      noiseRatio:
        quality.noiseRatio,
      pages,
      jobs,
      totalPages:
        pdf.numPages,
      status:
        jobs.length > 0
          ? "indexing"
          : "done"
    };

    log.info(
      "index.extract.completed",
      {
        filePath,
        extension,
        chars:
          indexed.text.length,
        cleanChars:
          indexed.cleanText.length,
        indexedPages:
          pages.length,
        queuedJobs:
          jobs.length,
        totalPages:
          pdf.numPages,
        status:
          indexed.status
      }
    );

    return indexed;
  } finally {
    fs.rmSync(
      tempDir,
      {
        recursive: true,
        force: true
      }
    );
  }
}

async function extractPdfText(filePath) {

  const buffer =
    fs.readFileSync(filePath);

  const data =
    await pdfParse(buffer);

  const text =
    normalizeWhitespace(
      data.text
    );

  if (
    data.numpages === 0
  ) {
    return text;
  }

  const ocrText =
    await extractPdfImageText(
      filePath
    );

  return normalizeWhitespace(
    [
      text,
      ocrText
    ]
      .filter(Boolean)
      .join("\n\n")
  );
}

async function extractTextWithTextutil(filePath) {

  const {
    stdout
  } = await execFile(
    "textutil",
    [
      "-convert",
      "txt",
      "-stdout",
      filePath
    ],
    {
      timeout: 30000,
      maxBuffer:
        10 * 1024 * 1024
    }
  );

  return normalizeWhitespace(
    stdout
  );
}

function extractPlainText(filePath) {

  const buffer =
    fs.readFileSync(filePath);

  if (
    buffer.includes(0)
  ) {
    return "";
  }

  return normalizeWhitespace(
    buffer.toString("utf8")
  );
}

export async function extractTextFromFile(filePath) {

  const extension =
    path
      .extname(filePath)
      .toLowerCase();

  if (
    IMAGE_EXTENSIONS.has(
      extension
    )
  ) {
    return extractImageText(
      filePath
    );
  }

  if (extension === ".pdf") {
    return extractPdfText(
      filePath
    );
  }

  if (
    [
      ".docx",
      ".pptx",
      ".xlsx",
      ".odt",
      ".odp",
      ".ods"
    ]
      .includes(extension)
  ) {
    return extractOfficeOpenXml(
      filePath,
      extension
    );
  }

  if (
    [".doc", ".rtf"]
      .includes(extension)
  ) {
    return extractTextWithTextutil(
      filePath
    );
  }

  if (
    TEXT_EXTENSIONS.has(
      extension
    )
  ) {
    return extractPlainText(
      filePath
    );
  }

  return "";
}
