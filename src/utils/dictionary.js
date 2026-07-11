const STOP_WORD_LIST = [
  "a",
  "about",
  "after",
  "again",
  "also",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "been",
  "being",
  "by",
  "can",
  "could",
  "did",
  "do",
  "does",
  "during",
  "each",
  "for",
  "from",
  "had",
  "has",
  "have",
  "he",
  "hence",
  "her",
  "his",
  "how",
  "in",
  "into",
  "is",
  "it",
  "its",
  "may",
  "more",
  "most",
  "of",
  "on",
  "one",
  "only",
  "or",
  "our",
  "over",
  "same",
  "she",
  "should",
  "some",
  "such",
  "than",
  "that",
  "the",
  "their",
  "then",
  "there",
  "these",
  "they",
  "thing",
  "this",
  "those",
  "through",
  "to",
  "under",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "who",
  "will",
  "with",
  "would",
  "you",
  "your"
];

const OCR_NOISE_WORD_LIST = [
  "ahi",
  "anpuk",
  "bay",
  "bid",
  "boyd",
  "bre",
  "chine",
  "con",
  "cow",
  "ction",
  "diph",
  "diphin",
  "dy",
  "facilis",
  "fhe",
  "fof",
  "fov",
  "foy",
  "fre",
  "gnd",
  "golpd",
  "ha",
  "hay",
  "hhe",
  "ho",
  "hoo",
  "hos",
  "hoy",
  "ithe",
  "jod",
  "lory",
  "man",
  "mle",
  "mookel",
  "oh",
  "op",
  "ore",
  "ote",
  "ov",
  "pd",
  "qnd",
  "qonevade",
  "te",
  "th",
  "ting",
  "tk",
  "ut",
  "veevnbeys",
  "ving",
  "wih",
  "wnemy",
  "yo",
  "ym"
];

const DOMAIN_WORD_LIST = [
  "algorithm",
  "assignment",
  "automata",
  "basics",
  "blockchain",
  "capability",
  "certificate",
  "chapter",
  "college",
  "completion",
  "computer",
  "control",
  "course",
  "database",
  "document",
  "engineering",
  "exam",
  "finite",
  "input",
  "internal",
  "machine",
  "marks",
  "mathematics",
  "memory",
  "model",
  "module",
  "notes",
  "output",
  "paper",
  "presentation",
  "project",
  "question",
  "read",
  "search",
  "semester",
  "student",
  "summit",
  "syllabus",
  "system",
  "tape",
  "technical",
  "theory",
  "turing",
  "unit",
  "write"
];

const COMMON_WORD_LIST = [
  "ability",
  "abstract",
  "accepted",
  "access",
  "according",
  "account",
  "accuracy",
  "action",
  "activity",
  "addition",
  "address",
  "advanced",
  "advantage",
  "analysis",
  "answer",
  "application",
  "approach",
  "architecture",
  "array",
  "article",
  "assessment",
  "associated",
  "available",
  "award",
  "awarded",
  "basic",
  "basis",
  "block",
  "body",
  "book",
  "business",
  "case",
  "cell",
  "cells",
  "certain",
  "class",
  "code",
  "collection",
  "common",
  "communication",
  "complete",
  "completed",
  "concept",
  "condition",
  "connected",
  "consider",
  "constant",
  "content",
  "context",
  "created",
  "data",
  "date",
  "deadline",
  "defined",
  "definition",
  "degree",
  "department",
  "description",
  "design",
  "detail",
  "determine",
  "development",
  "diagram",
  "difference",
  "different",
  "differential",
  "digital",
  "discussion",
  "division",
  "education",
  "effect",
  "efficient",
  "element",
  "example",
  "examples",
  "evaluation",
  "exercise",
  "experience",
  "expires",
  "explain",
  "expression",
  "external",
  "feature",
  "field",
  "file",
  "final",
  "flow",
  "folder",
  "form",
  "format",
  "fourier",
  "function",
  "general",
  "generate",
  "given",
  "group",
  "head",
  "image",
  "important",
  "include",
  "individual",
  "information",
  "instruction",
  "integer",
  "introduction",
  "lecture",
  "lesson",
  "level",
  "list",
  "local",
  "logic",
  "management",
  "method",
  "network",
  "number",
  "numerical",
  "object",
  "operation",
  "order",
  "organise",
  "organiser",
  "organized",
  "original",
  "page",
  "partial",
  "path",
  "pattern",
  "personal",
  "point",
  "possible",
  "practical",
  "practice",
  "problem",
  "process",
  "produce",
  "program",
  "purpose",
  "quality",
  "reason",
  "record",
  "reference",
  "related",
  "report",
  "required",
  "research",
  "result",
  "review",
  "rubric",
  "rule",
  "sample",
  "section",
  "sequence",
  "service",
  "signal",
  "solution",
  "state",
  "statistical",
  "store",
  "structure",
  "subject",
  "success",
  "successful",
  "suggestion",
  "summary",
  "support",
  "table",
  "techniques",
  "term",
  "test",
  "text",
  "topic",
  "transform",
  "type",
  "value",
  "version",
  "work",
  "workflow"
];

const IMPORTANT_IDENTIFIER_PATTERNS = [
  /^[a-z]{2,6}\d{2,4}$/,
  /^(unit|chapter|module|lesson|assignment|lab|practical)\d{1,3}$/,
  /^(math|maths)\d{1,4}$/
];

export const STOP_WORDS =
  new Set(STOP_WORD_LIST);

export const OCR_NOISE_WORDS =
  new Set(OCR_NOISE_WORD_LIST);

export const DOMAIN_WORDS =
  new Set(DOMAIN_WORD_LIST);

export const COMMON_WORDS =
  new Set([
    ...COMMON_WORD_LIST,
    ...DOMAIN_WORD_LIST
  ]);

export function normalizeDictionaryToken(token) {

  return String(token ?? "")
    .toLowerCase()
    .replace(
      /[^a-z0-9]/g,
      ""
    );
}

export function hasVowel(word) {

  return /[aeiou]/.test(word);
}

export function isStopWord(word) {

  return STOP_WORDS.has(
    normalizeDictionaryToken(word)
  );
}

export function isOcrNoiseWord(word) {

  return OCR_NOISE_WORDS.has(
    normalizeDictionaryToken(word)
  );
}

export function isDomainWord(word) {

  return DOMAIN_WORDS.has(
    normalizeDictionaryToken(word)
  );
}

export function isDictionaryWord(word) {

  return COMMON_WORDS.has(
    normalizeDictionaryToken(word)
  );
}

export function isImportantIdentifier(word) {

  const token =
    normalizeDictionaryToken(word);

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

export function hasPlausibleWordShape(word) {

  const token =
    normalizeDictionaryToken(word);

  if (
    token.length < 4 ||
    token.length > 18
  ) {
    return false;
  }

  if (
    /\d/.test(token)
  ) {
    return false;
  }

  if (
    !hasVowel(token)
  ) {
    return false;
  }

  if (
    /[bcdfghjklmnpqrstvwxyz]{5,}/.test(token)
  ) {
    return false;
  }

  if (
    /[aeiou]{4,}/.test(token)
  ) {
    return false;
  }

  return true;
}

export function getDictionarySignal(word) {

  const token =
    normalizeDictionaryToken(word);

  if (!token) {
    return "empty";
  }

  if (
    isImportantIdentifier(token)
  ) {
    return "identifier";
  }

  if (
    isOcrNoiseWord(token)
  ) {
    return "noise";
  }

  if (
    isStopWord(token)
  ) {
    return "stop";
  }

  if (
    isDomainWord(token)
  ) {
    return "domain";
  }

  if (
    isDictionaryWord(token)
  ) {
    return "dictionary";
  }

  if (
    hasPlausibleWordShape(token)
  ) {
    return "unknown-plausible";
  }

  return "unknown-noisy";
}

export function getDictionaryStats() {

  return {
    commonWords:
      COMMON_WORDS.size,
    domainWords:
      DOMAIN_WORDS.size,
    stopWords:
      STOP_WORDS.size,
    ocrNoiseWords:
      OCR_NOISE_WORDS.size
  };
}
