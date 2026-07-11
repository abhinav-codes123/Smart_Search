import {
  hasPlausibleWordShape,
  isDictionaryWord,
  isImportantIdentifier,
  isOcrNoiseWord,
  isStopWord
} from "../src/utils/dictionary.js";

const OCR_CORRECTIONS = [
  [
    /^(tusing|tuving|toving|taving|tuning|tsing|trig|tring|tung|tiving|taxing)$/,
    "turing"
  ],
  [
    /^(maching|moching|macking|mackie|mochine|wachine|wockine|mocking|moche|mache|mockine)$/,
    "machine"
  ],
  [
    /^(mamory|momewy|wemoy|memoy|memy|wemowy|wemory|wmomewy)$/,
    "memory"
  ],
  [
    /^(inpud|imput|inpat|inputl|inbut|imped)$/,
    "input"
  ],
  [
    /^(outpd|oudpd|audpd|ausput|oulpd|ouput|oulput|gulped|solped)$/,
    "output"
  ],
  [
    /^(tepe|jape|dope|dape)$/,
    "tape"
  ],
  [
    /^(firite|frite|finile|fihite|firide|fide)$/,
    "finite"
  ],
  [
    /^(conbvol|corbvol|contvol|corthol|cortvol|conhval)$/,
    "control"
  ],
  [
    /^(copability|copabili|capabili|capabily|capabisity|cpobility)$/,
    "capability"
  ],
  [
    /^(conputing|compicting|conpucting|compting|oonplcting)$/,
    "computing"
  ],
  [
    /^(hadher|fother|fathar)$/,
    "father"
  ],
  [
    /^(procuce|producee|prodice)$/,
    "produce"
  ]
];

function normalizeWhitespace(text) {

  return String(text ?? "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeToken(token) {

  const lower =
    token.toLowerCase();

  for (
    const [
      pattern,
      replacement
    ]
    of OCR_CORRECTIONS
  ) {
    if (pattern.test(lower)) {
      return replacement;
    }
  }

  return lower;
}

function isLikelyNoiseToken(token) {

  if (
    isImportantIdentifier(token)
  ) {
    return false;
  }

  if (
    token.length < 3 ||
    token.length > 24
  ) {
    return true;
  }

  if (
    isStopWord(token)
  ) {
    return false;
  }

  if (
    isOcrNoiseWord(token)
  ) {
    return true;
  }

  if (/^\d+$/.test(token)) {
    return token.length > 4;
  }

  if (/^(.)\1{2,}$/.test(token)) {
    return true;
  }

  if (/\d/.test(token)) {
    return true;
  }

  if (
    isDictionaryWord(token)
  ) {
    return false;
  }

  if (
    !hasPlausibleWordShape(token)
  ) {
    return true;
  }

  return false;
}

function cleanLine(line) {

  const tokens =
    line
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .split(/\s+/)
      .filter(Boolean)
      .map(normalizeToken);

  const useful =
    tokens.filter(token =>
      !isLikelyNoiseToken(token) ||
      isStopWord(token)
    );

  if (
    tokens.length >= 4 &&
    useful.length / tokens.length < 0.35
  ) {
    return "";
  }

  return useful.join(" ");
}

export function analyzeTextQuality(text) {

  const normalized =
    normalizeWhitespace(text);

  const tokens =
    normalized
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .split(/\s+/)
      .filter(Boolean)
      .map(normalizeToken);

  const wordTokens =
    tokens.filter(token =>
      /[a-z]/.test(token)
    );

  const noiseTokens =
    wordTokens.filter(isLikelyNoiseToken);

  const wordCount =
    wordTokens.length;

  const noiseRatio =
    wordCount === 0
      ? 1
      : noiseTokens.length / wordCount;

  return {
    wordCount,
    noiseRatio:
      Math.round(noiseRatio * 1000) / 1000,
    quality:
      Math.max(
        0,
        Math.min(
          100,
          Math.round((1 - noiseRatio) * 100)
        )
      )
  };
}

export function cleanExtractedText(text) {

  const normalized =
    normalizeWhitespace(text);

  if (!normalized) {
    return "";
  }

  const seen =
    new Set();

  const lines =
    normalized
      .split("\n")
      .map(cleanLine)
      .map(line =>
        normalizeWhitespace(line)
      )
      .filter(Boolean)
      .filter(line => {
        const key =
          line.toLowerCase();

        if (seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      });

  return normalizeWhitespace(
    lines.join("\n")
  );
}

export function buildTextQuality(text) {

  const cleanText =
    cleanExtractedText(text);
  const analysis =
    analyzeTextQuality(text);
  const cleanAnalysis =
    analyzeTextQuality(cleanText);

  return {
    cleanText,
    rawWordCount:
      analysis.wordCount,
    cleanWordCount:
      cleanAnalysis.wordCount,
    noiseRatio:
      analysis.noiseRatio,
    quality:
      cleanAnalysis.quality
  };
}
