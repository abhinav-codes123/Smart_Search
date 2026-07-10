const STOP_WORDS =
  new Set([
    "the",
    "and",
    "for",
    "with",
    "this",
    "that",
    "from",
    "are",
    "was",
    "you",
    "your",
    "have",
    "has",
    "will",
    "into",
    "during",
    "then",
    "than",
    "there",
    "their",
    "which",
    "while",
    "where",
    "when",
    "what",
    "were",
    "been",
    "being",
    "also",
    "only",
    "some",
    "same",
    "such",
    "known",
    "one",
    "can",
    "con",
    "cow",
    "man",
    "fhe",
    "fre",
    "hhe",
    "hos",
    "hoy",
    "bay",
    "boyd",
    "fov",
    "foy",
    "mle",
    "ym",
    "th",
    "te",
    "tk",
    "ha",
    "ho",
    "oh",
    "ov",
    "ut",
    "yo",
    "dy",
    "pd",
    "op",
    "onto",
    "over",
    "under",
    "page",
    "fig",
    "figure",
    "source",
    "image",
    "file",
    "from",
    "of",
    "to",
    "in",
    "on"
  ]);

const DOMAIN_WORDS =
  new Set([
    "assignment",
    "basics",
    "blockchain",
    "capability",
    "certificate",
    "college",
    "completion",
    "computer",
    "control",
    "course",
    "database",
    "document",
    "engineering",
    "finite",
    "input",
    "machine",
    "mathematics",
    "memory",
    "model",
    "notes",
    "output",
    "presentation",
    "project",
    "read",
    "search",
    "student",
    "summit",
    "system",
    "tape",
    "technical",
    "turing",
    "unit",
    "write"
  ]);

const OCR_CORRECTIONS = [
  [
    /^(tusing|tuving|toving|taving|tuning|tsing|trig|tung|tiving|taxing)$/,
    "turing"
  ],
  [
    /^(maching|moching|macking|mochine|wachine|wockine|mocking|mocked|mocks|mache)$/,
    "machine"
  ],
  [
    /^(mamory|momewy|wemoy|memoy|memy|wemowy|wemory)$/,
    "memory"
  ],
  [
    /^(inpud|imput|inpat|imput|inputl|inbut)$/,
    "input"
  ],
  [
    /^(outpd|oudpd|ausput|oulpd|ouput|oulput|gulped|solped)$/,
    "output"
  ],
  [
    /^(tepe|jape|dope|dape)$|^(tape)$/,
    "tape"
  ],
  [
    /^(firite|frite|finile|fihite|firide|fide|finite)$/,
    "finite"
  ],
  [
    /^(conbvol|corbvol|contvol|corthol|cortvol|conhval|control)$/,
    "control"
  ],
  [
    /^(copability|copabili|capabili|capabily|capabisity|cpobility)$/,
    "capability"
  ],
  [
    /^(computing|conputing|compicting|conpucting|compting)$/,
    "computing"
  ]
];

function tokenizeLine(line) {

  return line
    .toLowerCase()
    .replace(
      /[^a-z0-9\s]/g,
      " "
    )
    .split(/\s+/)
    .filter(Boolean);
}

function normalizeKeyword(word) {

  for (
    const [
      pattern,
      replacement
    ]
    of OCR_CORRECTIONS
  ) {
    if (
      pattern.test(word)
    ) {
      return replacement;
    }
  }

  return word;
}

function hasVowel(word) {

  return /[aeiou]/.test(word);
}

function isNoisyWord(word) {

  if (
    word.length < 3 ||
    word.length > 22
  ) {
    return true;
  }

  if (
    STOP_WORDS.has(word)
  ) {
    return true;
  }

  if (
    /^\d+$/.test(word)
  ) {
    return true;
  }

  if (
    /^(.)\1{2,}$/.test(word)
  ) {
    return true;
  }

  if (
    !hasVowel(word) &&
    !DOMAIN_WORDS.has(word)
  ) {
    return true;
  }

  return false;
}

function cleanTitleLine(line) {

  return line
    .split(/\b/)
    .map(part => {
      const lower =
        part.toLowerCase();
      const corrected =
        normalizeKeyword(lower);

      if (
        corrected === lower
      ) {
        return part;
      }

      return /^[A-Z]/.test(part)
        ? corrected.charAt(0).toUpperCase() +
            corrected.slice(1)
        : corrected;
    })
    .join("")
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

function scoreTitleLine(line, index) {

  const trimmed =
    line.trim();

  if (
    trimmed.length < 4 ||
    trimmed.length > 80
  ) {
    return -Infinity;
  }

  const alphaNumeric =
    (trimmed.match(/[a-z0-9]/gi) || [])
      .length;
  const symbolCount =
    (trimmed.match(/[^a-z0-9\s]/gi) || [])
      .length;
  const alphaRatio =
    alphaNumeric / Math.max(
      trimmed.length,
      1
    );
  const symbolRatio =
    symbolCount / Math.max(
      trimmed.length,
      1
    );

  if (
    alphaRatio < 0.45 ||
    symbolRatio > 0.35
  ) {
    return -Infinity;
  }

  const words =
    tokenizeLine(trimmed)
      .map(normalizeKeyword);

  const usefulWords =
    words.filter(
      word =>
        !isNoisyWord(word)
    );

  if (
    usefulWords.length === 0
  ) {
    return -Infinity;
  }

  const domainHits =
    usefulWords.filter(
      word =>
        DOMAIN_WORDS.has(word)
    )
      .length;
  const noiseCount =
    words.length -
    usefulWords.length;

  return usefulWords.length * 2 +
    domainHits * 3 +
    alphaRatio * 2 -
    symbolRatio * 3 -
    noiseCount -
    index * 0.08;
}

export function generateTitleTags(text) {

  const candidates =
    text
      .split("\n")
      .map((line, index) => ({
        index,
        original:
          line.trim()
      }))
      .filter(candidate =>
        candidate.original
      )
      .slice(0, 40)
      .map(candidate => ({
        ...candidate,
        cleaned:
          cleanTitleLine(
            candidate.original
          ),
        score:
          scoreTitleLine(
            candidate.original,
            candidate.index
          )
      }))
      .filter(candidate =>
        Number.isFinite(
          candidate.score
        )
      )
      .sort(
        (a, b) =>
          b.score - a.score
      );

  return candidates
    .slice(0, 5)
    .sort(
      (a, b) =>
        a.index - b.index
    )
    .map(candidate =>
      candidate.cleaned
    );
}

export function generateKeywordTags(text) {

  const counts =
    new Map();
  const firstSeen =
    new Map();

  tokenizeLine(text)
    .map(normalizeKeyword)
    .forEach((word, index) => {
      if (
        isNoisyWord(word)
      ) {
        return;
      }

      counts.set(
        word,
        (counts.get(word) || 0) + 1
      );

      if (
        !firstSeen.has(word)
      ) {
        firstSeen.set(
          word,
          index
        );
      }
    });

  return [
    ...counts.entries()
  ]
    .sort((a, b) => {
      const [
        wordA,
        countA
      ] = a;
      const [
        wordB,
        countB
      ] = b;
      const scoreA =
        countA +
        (
          DOMAIN_WORDS.has(wordA)
            ? 2
            : 0
        );
      const scoreB =
        countB +
        (
          DOMAIN_WORDS.has(wordB)
            ? 2
            : 0
        );

      if (
        scoreA !== scoreB
      ) {
        return scoreB - scoreA;
      }

      return firstSeen.get(wordA) -
        firstSeen.get(wordB);
    })
    .map(([word]) => word)
    .slice(0, 20);
}
