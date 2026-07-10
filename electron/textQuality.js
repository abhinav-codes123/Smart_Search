const STOP_WORDS =
  new Set([
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "been",
    "being",
    "by",
    "for",
    "from",
    "has",
    "have",
    "in",
    "into",
    "is",
    "it",
    "of",
    "on",
    "or",
    "that",
    "the",
    "their",
    "then",
    "there",
    "this",
    "to",
    "was",
    "were",
    "which",
    "with"
  ]);

const OCR_NOISE_WORDS =
  new Set([
    "fhe",
    "fre",
    "hhe",
    "hos",
    "hoy",
    "hoo",
    "ahi",
    "bre",
    "bid",
    "chine",
    "ction",
    "diphin",
    "hay",
    "ithe",
    "lory",
    "mookel",
    "anpuk",
    "ote",
    "ore",
    "ting",
    "veevnbeys",
    "wnemy",
    "fov",
    "foy",
    "te",
    "tk",
    "th",
    "ym",
    "pd",
    "dy",
    "ov",
    "mle",
    "ving",
    "wih",
    "jod",
    "qnd",
    "gnd"
  ]);

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

const IMPORTANT_IDENTIFIER_PATTERNS = [
  /^[a-z]{2,6}\d{2,4}$/,
  /^(unit|chapter|module|lesson|assignment|lab|practical)\d{1,3}$/,
  /^(math|maths)\d{1,4}$/
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

function hasVowel(token) {

  return /[aeiou]/.test(token);
}

function isImportantIdentifier(token) {

  if (
    token.length < 4 ||
    token.length > 12
  ) {
    return false;
  }

  if (
    !/[a-z]/.test(token) ||
    !/\d/.test(token)
  ) {
    return false;
  }

  if (
    /(.)\1{3,}/.test(token)
  ) {
    return false;
  }

  return IMPORTANT_IDENTIFIER_PATTERNS.some(pattern =>
    pattern.test(token)
  );
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
    STOP_WORDS.has(token)
  ) {
    return false;
  }

  if (
    OCR_NOISE_WORDS.has(token)
  ) {
    return true;
  }

  if (/^\d+$/.test(token)) {
    return token.length > 4;
  }

  if (/^(.)\1{2,}$/.test(token)) {
    return true;
  }

  if (/[a-z]\d[a-z]/.test(token)) {
    return true;
  }

  if (
    !hasVowel(token) &&
    !/^\d+[a-z]?$/.test(token)
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
      STOP_WORDS.has(token)
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
