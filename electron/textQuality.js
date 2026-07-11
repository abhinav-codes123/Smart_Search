function normalizeWhitespace(text) {

  return String(text ?? "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeSearchLine(line) {

  return line
    .normalize("NFKC")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([([{])\s+/g, "$1")
    .replace(/\s+([)\]}])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function isSymbolOnlyLine(line) {

  const compact =
    line.replace(/\s+/g, "");

  return compact.length >= 3 &&
    !/[\p{L}\p{N}]/u.test(compact);
}

function tokenizeForQuality(text) {

  return String(text ?? "")
    .toLowerCase()
    .match(/[\p{L}\p{N}][\p{L}\p{N}._+#/-]*/gu) || [];
}

function isLikelyNoiseToken(token) {

  if (
    token.length <= 1 &&
    !/^\d$/.test(token)
  ) {
    return true;
  }

  if (
    token.length > 48
  ) {
    return true;
  }

  if (
    /^(.)\1{4,}$/.test(token)
  ) {
    return true;
  }

  const letters =
    (token.match(/\p{L}/gu) || []).length;
  const digits =
    (token.match(/\p{N}/gu) || []).length;

  if (
    letters === 0 &&
    digits === 0
  ) {
    return true;
  }

  const punctuation =
    token.length - letters - digits;

  return token.length >= 8 &&
    punctuation / token.length > 0.45;
}

export function analyzeTextQuality(text) {

  const tokens =
    tokenizeForQuality(
      normalizeWhitespace(text)
    );

  const wordCount =
    tokens.length;

  const noiseTokens =
    tokens.filter(isLikelyNoiseToken);

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
      .map(normalizeSearchLine)
      .filter(Boolean)
      .filter(line =>
        !isSymbolOnlyLine(line)
      )
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
    quality:
      cleanAnalysis.quality,
    rawWordCount:
      analysis.wordCount,
    cleanWordCount:
      cleanAnalysis.wordCount,
    noiseRatio:
      cleanAnalysis.noiseRatio
  };
}
