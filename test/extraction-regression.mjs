import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createCanvas,
  loadImage,
  PDFDocument
} from "@napi-rs/canvas";
import JSZip from "jszip";
import {
  extractFileForIndex,
  extractPdfPageText,
  extractTextFromFile
} from "../electron/textExtractor.js";
import {
  buildTextQuality,
  cleanExtractedText
} from "../electron/textQuality.js";
import rawDocs from "../electron/data/documents.json" with { type: "json" };
import {
  createDocumentId,
  generateFileHash
} from "../electron/fileIdentity.js";
import { searchDocumentsInDocs } from "../electron/searchEngine.js";
import { classifyDocument } from "../src/utils/classifier.js";
import { scanFiles } from "../src/utils/scanner.js";
import {
  generateKeywordTags,
  generateTitleTags
} from "../src/utils/tagGenerator.js";

const require =
  createRequire(import.meta.url);

const pdfParse =
  require("pdf-parse");

const docs =
  Array.isArray(rawDocs)
    ? rawDocs
    : rawDocs.documents || [];

const tempDir =
  fs.mkdtempSync(
    path.join(
      os.tmpdir(),
      "smart-search-test-"
    )
  );

async function writeZipFixture(
  fileName,
  entries
) {

  const zip =
    new JSZip();

  for (
    const [
      name,
      content
    ]
    of Object.entries(entries)
  ) {
    zip.file(
      name,
      content
    );
  }

  const filePath =
    path.join(
      tempDir,
      fileName
    );

  fs.writeFileSync(
    filePath,
    await zip.generateAsync({
      type: "nodebuffer"
    })
  );

  return filePath;
}

function writeTextFixture(
  fileName,
  content
) {

  const filePath =
    path.join(
      tempDir,
      fileName
    );

  fs.writeFileSync(
    filePath,
    content
  );

  return filePath;
}

async function writeOcrImageFixture(
  fileName,
  text
) {

  const canvas =
    createCanvas(
      1400,
      420
    );

  const context =
    canvas.getContext("2d");

  context.fillStyle =
    "white";
  context.fillRect(
    0,
    0,
    1400,
    420
  );
  context.fillStyle =
    "black";
  context.font =
    "88px Arial";
  context.fillText(
    text,
    70,
    220
  );

  const buffer =
    await canvas.encode("jpeg");

  const filePath =
    path.join(
      tempDir,
      fileName
    );

  fs.writeFileSync(
    filePath,
    buffer
  );

  return {
    filePath,
    buffer
  };
}

async function writeImagePdfFixture(
  fileName,
  imageBuffer
) {

  const image =
    await loadImage(
      imageBuffer
    );

  const pdf =
    new PDFDocument();

  const page =
    pdf.beginPage(
      image.width,
      image.height
    );

  page.drawImage(
    image,
    0,
    0
  );
  pdf.endPage();

  const buffer =
    pdf.close();

  const filePath =
    path.join(
      tempDir,
      fileName
    );

  fs.writeFileSync(
    filePath,
    buffer
  );

  return {
    filePath,
    buffer
  };
}

function writeImageOnlyPdf() {

  const image =
    createCanvas(
      1200,
      400
    );

  const imageContext =
    image.getContext("2d");

  imageContext.fillStyle =
    "white";
  imageContext.fillRect(
    0,
    0,
    1200,
    400
  );
  imageContext.fillStyle =
    "black";
  imageContext.font =
    "72px Arial";
  imageContext.fillText(
    "IMAGE PDF OCR SIGNAL",
    60,
    180
  );

  const pdf =
    new PDFDocument();

  const page =
    pdf.beginPage(
      1200,
      400
    );

  page.drawImage(
    image,
    0,
    0
  );
  pdf.endPage();

  const buffer =
    pdf.close();

  const filePath =
    path.join(
      tempDir,
      "image-only.pdf"
    );

  fs.writeFileSync(
    filePath,
    buffer
  );

  return {
    filePath,
    buffer
  };
}

function writeMixedPdf() {

  const pdf =
    new PDFDocument();

  const textPage =
    pdf.beginPage(
      1200,
      400
    );

  textPage.font =
    "48px Arial";
  textPage.fillText(
    "EMBEDDED TEXT PAGE",
    60,
    180
  );
  pdf.endPage();

  const image =
    createCanvas(
      1200,
      400
    );

  const imageContext =
    image.getContext("2d");

  imageContext.fillStyle =
    "white";
  imageContext.fillRect(
    0,
    0,
    1200,
    400
  );
  imageContext.fillStyle =
    "black";
  imageContext.font =
    "72px Arial";
  imageContext.fillText(
    "MIXED PDF OCR SIGNAL",
    60,
    180
  );

  const imagePage =
    pdf.beginPage(
      1200,
      400
    );

  imagePage.drawImage(
    image,
    0,
    0
  );
  pdf.endPage();

  const buffer =
    pdf.close();

  const filePath =
    path.join(
      tempDir,
      "mixed.pdf"
    );

  fs.writeFileSync(
    filePath,
    buffer
  );

  return {
    filePath,
    buffer
  };
}

async function writeLatePageImagePdf(
  fileName,
  imageBuffer
) {

  const pdf =
    new PDFDocument();

  for (
    let pageNumber = 1;
    pageNumber <= 5;
    pageNumber++
  ) {
    const page =
      pdf.beginPage(
        1200,
        400
      );

    page.font =
      "48px Arial";
    page.fillText(
      `TEXT ONLY PAGE ${pageNumber} WITH ENOUGH CONTENT`,
      60,
      180
    );
    pdf.endPage();
  }

  const image =
    await loadImage(
      imageBuffer
    );

  const imagePage =
    pdf.beginPage(
      image.width,
      image.height
    );

  imagePage.drawImage(
    image,
    0,
    0
  );
  pdf.endPage();

  const buffer =
    pdf.close();

  const filePath =
    path.join(
      tempDir,
      fileName
    );

  fs.writeFileSync(
    filePath,
    buffer
  );

  return {
    filePath,
    buffer
  };
}

async function assertExtracts(
  filePath,
  expected
) {

  const text =
    await extractTextFromFile(
      filePath
    );

  assert.match(
    text,
    expected,
    `${path.basename(filePath)} should include ${expected}`
  );

  console.log(
    `PASS ${path.basename(filePath)}`
  );
}

try {
  const docx =
    await writeZipFixture(
      "sample.docx",
      {
        "word/document.xml":
          "<w:document><w:body><w:p><w:r><w:t>Meta quality document search</w:t></w:r></w:p></w:body></w:document>"
      }
    );

  const pptx =
    await writeZipFixture(
      "slides.pptx",
      {
        "ppt/slides/slide1.xml":
          "<p:sld><a:t>Quarterly roadmap presentation</a:t><a:t>Smart Search OCR</a:t></p:sld>"
      }
    );

  const xlsx =
    await writeZipFixture(
      "sheet.xlsx",
      {
        "xl/sharedStrings.xml":
          "<sst><si><t>Student Marks Workbook</t></si><si><t>BCS303</t></si></sst>",
        "xl/worksheets/sheet1.xml":
          "<worksheet><sheetData><row><c><v>42</v></c></row></sheetData></worksheet>"
      }
    );

  const odt =
    await writeZipFixture(
      "open.odt",
      {
        "content.xml":
          "<office:document><text:p>OpenDocument lecture notes</text:p></office:document>"
      }
    );

  const markdown =
    writeTextFixture(
      "notes.md",
      "Senior developer test notes for common text files"
    );

  const {
    filePath: parityJpeg,
    buffer: parityImageBuffer
  } = await writeOcrImageFixture(
    "parity.jpeg",
    "PARITY OCR TEXT"
  );

  const {
    filePath: parityPdf,
    buffer: parityPdfBuffer
  } = await writeImagePdfFixture(
    "parity.pdf",
    parityImageBuffer
  );

  const parityDocx =
    await writeZipFixture(
      "parity.docx",
      {
        "word/document.xml":
          "<w:document><w:body><w:p><w:r><w:t>Container document</w:t></w:r></w:p></w:body></w:document>",
        "word/media/image1.jpeg":
          parityImageBuffer
      }
    );

  const parityPptx =
    await writeZipFixture(
      "parity.pptx",
      {
        "ppt/slides/slide1.xml":
          "<p:sld><a:t>Container presentation</a:t></p:sld>",
        "ppt/media/image1.jpeg":
          parityImageBuffer
      }
    );

  const parityXlsx =
    await writeZipFixture(
      "parity.xlsx",
      {
        "xl/sharedStrings.xml":
          "<sst><si><t>Container workbook</t></si></sst>",
        "xl/media/image1.jpeg":
          parityImageBuffer
      }
    );

  const parityOdt =
    await writeZipFixture(
      "parity.odt",
      {
        "content.xml":
          "<office:document><text:p>Container odt</text:p></office:document>",
        "Pictures/image1.jpeg":
          parityImageBuffer
      }
    );

  const {
    filePath: latePagePdf,
    buffer: latePagePdfBuffer
  } = await writeLatePageImagePdf(
    "late-page.pdf",
    parityImageBuffer
  );

  await assertExtracts(
    docx,
    /quality document search/
  );
  await assertExtracts(
    pptx,
    /roadmap presentation/
  );
  await assertExtracts(
    xlsx,
    /Student Marks Workbook/
  );
  await assertExtracts(
    odt,
    /OpenDocument lecture notes/
  );
  await assertExtracts(
    markdown,
    /common text files/
  );

  const noisyOcrText =
    "EE er\n" +
    "Man Tusing 18 hadher of Such 0 model Which\n" +
    "Te wockine Cow procuce outpd\n" +
    "Tiving M/e Mocks! Taving ym aching finite control tape input memory";

  const noisyKeywords =
    generateKeywordTags(
      noisyOcrText
    );

  assert.ok(
    noisyKeywords.includes("turing")
  );
  assert.ok(
    noisyKeywords.includes("machine")
  );
  assert.ok(
    noisyKeywords.includes("output")
  );
  assert.ok(
    !noisyKeywords.includes("fhe")
  );
  assert.ok(
    generateTitleTags(
      noisyOcrText
    ).some(tag =>
      /turing/i.test(tag)
    )
  );
  const cleanNoisyText =
    cleanExtractedText(
      noisyOcrText
    );

  assert.match(
    cleanNoisyText,
    /turing/
  );
  assert.match(
    cleanNoisyText,
    /machine/
  );
  assert.match(
    cleanNoisyText,
    /output/
  );
  assert.doesNotMatch(
    cleanNoisyText,
    /\bwockine\b/
  );
  assert.ok(
    buildTextQuality(noisyOcrText).cleanWordCount > 0
  );

  const identifierText =
    "Question Paper BCS303 BAS302 Unit5 Assignment04 MATHS4 " +
    "qonevade golpd veevnbeys mackie rio ving uniks5 unwixa5";
  const identifierKeywords =
    generateKeywordTags(
      identifierText
    );

  assert.ok(
    identifierKeywords.includes("bcs303")
  );
  assert.ok(
    identifierKeywords.includes("bas302")
  );
  assert.ok(
    identifierKeywords.includes("unit5")
  );
  assert.ok(
    identifierKeywords.includes("assignment04")
  );
  assert.ok(
    identifierKeywords.includes("maths4")
  );
  assert.ok(
    !identifierKeywords.includes("qonevade")
  );
  assert.ok(
    !identifierKeywords.includes("golpd")
  );
  assert.ok(
    !identifierKeywords.includes("mackie")
  );
  assert.ok(
    !identifierKeywords.includes("rio")
  );
  assert.ok(
    !identifierKeywords.includes("uniks5")
  );
  assert.ok(
    !identifierKeywords.includes("unwixa5")
  );

  const identifierTitleTags =
    generateTitleTags(
      identifierText
    );

  assert.match(
    identifierTitleTags[0],
    /BCS303/
  );
  assert.match(
    cleanExtractedText(identifierText),
    /\bbcs303\b/
  );
  console.log("PASS OCR-safe tag generation");

  await assertExtracts(
    parityJpeg,
    /PARITY OCR TEXT/
  );

  const parsedParityPdf =
    await pdfParse(
      parityPdfBuffer
    );

  assert.equal(
    parsedParityPdf.text.trim(),
    "",
    "parity PDF fixture should not contain embedded text"
  );

  await assertExtracts(
    parityPdf,
    /PARITY OCR TEXT/
  );
  await assertExtracts(
    parityDocx,
    /PARITY OCR TEXT/
  );
  await assertExtracts(
    parityPptx,
    /PARITY OCR TEXT/
  );
  await assertExtracts(
    parityXlsx,
    /PARITY OCR TEXT/
  );
  await assertExtracts(
    parityOdt,
    /PARITY OCR TEXT/
  );

  const parsedLatePagePdf =
    await pdfParse(
      latePagePdfBuffer
    );

  assert.doesNotMatch(
    parsedLatePagePdf.text,
    /PARITY OCR TEXT/
  );

  await assertExtracts(
    latePagePdf,
    /PARITY OCR TEXT/
  );

  const quickIndex =
    await extractFileForIndex(
      latePagePdf,
      {
        initialPdfPages: 2
      }
    );

  assert.equal(
    quickIndex.totalPages,
    6
  );
  assert.equal(
    quickIndex.pages.length,
    2
  );
  assert.equal(
    quickIndex.jobs.length,
    4
  );
  assert.equal(
    quickIndex.status,
    "indexing"
  );

  const latePageResult =
    await extractPdfPageText(
      latePagePdf,
      6
    );

  assert.match(
    latePageResult.text,
    /PARITY OCR TEXT/
  );
  console.log("PASS pdf page queue extraction");

  const hashA =
    await generateFileHash(
      parityPdf
    );
  const hashB =
    await generateFileHash(
      parityPdf
    );

  assert.equal(
    hashA,
    hashB
  );
  assert.equal(
    createDocumentId(hashA),
    createDocumentId(hashB)
  );
  console.log("PASS stable file hash identity");

  process.env.SMART_SEARCH_DB_PATH =
    path.join(
      tempDir,
      "documents-test.json"
    );

  const {
    claimNextOcrJob,
    completeOcrJob,
    getAllDocuments,
    insertDocument,
    searchDocuments
  } =
    await import(
      "../electron/database.js"
    );

  const lateHash =
    await generateFileHash(
      latePagePdf
    );
  const lateDocumentId =
    createDocumentId(
      lateHash
    );

  insertDocument({
    documentId:
      lateDocumentId,
    fileHash:
      lateHash,
    filePath:
      latePagePdf,
    fileName:
      "late-page.pdf",
    text:
      quickIndex.text,
    cleanText:
      quickIndex.cleanText,
    textQuality:
      quickIndex.textQuality,
    pages:
      quickIndex.pages,
    jobs:
      quickIndex.jobs,
    totalPages:
      quickIndex.totalPages,
    status:
      quickIndex.status
  });

  insertDocument({
    documentId:
      lateDocumentId,
    fileHash:
      lateHash,
    filePath:
      "/duplicate/upload/late-page.pdf",
    fileName:
      "late-page.pdf",
    text:
      quickIndex.text,
    totalPages:
      quickIndex.totalPages,
    status:
      quickIndex.status
  });

  let indexedDocs =
    getAllDocuments();

  assert.equal(
    indexedDocs.length,
    1
  );
  assert.ok(
    indexedDocs[0].paths.includes(
      "/duplicate/upload/late-page.pdf"
    )
  );

  const claimedJob =
    claimNextOcrJob();

  assert.equal(
    claimedJob.documentId,
    lateDocumentId
  );

  completeOcrJob(
    claimedJob,
    {
      pageNumber:
        claimedJob.pageNumber,
      text:
        "BACKGROUND PAGE DONE",
      embeddedText:
        "",
      ocrText:
        "BACKGROUND PAGE DONE",
      hasImage:
        true
    }
  );

  indexedDocs =
    getAllDocuments();

  assert.match(
    indexedDocs[0].text,
    /BACKGROUND PAGE DONE/
  );
  assert.match(
    indexedDocs[0].cleanText,
    /background page done/i
  );
  assert.ok(
    indexedDocs[0].pages.every(page =>
      "cleanText" in page
    )
  );
  assert.ok(
    searchDocuments("background page done")
      .some(doc =>
        doc.documentId === lateDocumentId
      )
  );
  console.log("PASS database hash dedupe and page queue");

  const {
    filePath: imagePdf,
    buffer: imagePdfBuffer
  } = writeImageOnlyPdf();

  const parsedPdf =
    await pdfParse(
      imagePdfBuffer
    );

  assert.equal(
    parsedPdf.text.trim(),
    "",
    "image-only PDF fixture should not contain embedded text"
  );

  await assertExtracts(
    imagePdf,
    /IMAGE PDF OCR SIGNAL/
  );

  const {
    filePath: mixedPdf,
    buffer: mixedPdfBuffer
  } = writeMixedPdf();

  const parsedMixedPdf =
    await pdfParse(
      mixedPdfBuffer
    );

  assert.match(
    parsedMixedPdf.text,
    /EMBEDDED TEXT PAGE/
  );
  assert.doesNotMatch(
    parsedMixedPdf.text,
    /MIXED PDF OCR SIGNAL/
  );

  await assertExtracts(
    mixedPdf,
    /MIXED PDF OCR SIGNAL/
  );

  const scanned =
    await scanFiles(
      [
        {
          path: docx,
          name: "sample.docx",
          extension: ".docx"
        }
      ],
      async filePath => ({
        success: true,
        text:
          await extractTextFromFile(
            filePath
          )
      }),
      classifyDocument
    );

  assert.equal(
    scanned[0].fileName,
    "sample.docx"
  );
  assert.match(
    scanned[0].text,
    /Meta quality document search/
  );
  console.log("PASS scanner integration");

  const expectations = [
    [
      "BCS 303",
      "Assignment-04 DSTL BCS303.pdf"
    ],
    [
      "postfix evaluation",
      "Algorithm for Postfix Expression Evaluation.pdf"
    ],
    [
      "assignment 4",
      "ASSIGNMENT-4 BVE301.pdf"
    ],
    [
      "student marks",
      "consolidated internal marks -2A.pdf"
    ]
  ];

  for (
    const [
      query,
      expected
    ]
    of expectations
  ) {
    if (
      !docs.some(doc =>
        doc.fileName === expected
      )
    ) {
      console.log(
        `SKIP search ${query} fixture ${expected} not present`
      );
      continue;
    }

    const top =
      searchDocumentsInDocs(
        docs,
        query
      )[0]
        ?.fileName;

    assert.equal(
      top,
      expected,
      `${query} should rank ${expected} first`
    );
    console.log(
      `PASS search ${query}`
    );
  }

  const cProgramTop =
    searchDocumentsInDocs(
      docs,
      "c program"
    )[0];

  if (
    docs.some(doc =>
      /#include|C Program/i.test(
        doc.text ?? ""
      )
    )
  ) {
    assert.match(
      cProgramTop?.text ?? "",
      /#include|C Program/i,
      "c program should return a document containing C code"
    );
    console.log("PASS search c program");
  } else {
    console.log(
      "SKIP search c program fixture not present"
    );
  }
} finally {
  fs.rmSync(
    tempDir,
    {
      recursive: true,
      force: true
    }
  );
}
