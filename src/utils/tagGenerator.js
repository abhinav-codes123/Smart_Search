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
    "how",
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
    "ahi",
    "bre",
    "bid",
    "chine",
    "ction",
    "diph",
    "diphin",
    "facilis",
    "fof",
    "hay",
    "ithe",
    "mookel",
    "ote",
    "ore",
    "ting",
    "veevnbeys",
    "wnemy",
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
    "each",
    "hence",
    "pd",
    "op",
    "thing",
    "ving",
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
    "paper",
    "presentation",
    "project",
    "question",
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

const IMPORTANT_IDENTIFIER_PATTERNS = [
  /^[a-z]{2,6}\d{2,4}$/,
  /^(unit|chapter|module|lesson|assignment|lab|practical)\d{1,3}$/,
  /^(math|maths)\d{1,4}$/
];

const OCR_CORRECTIONS = [
  [
    /^(tusing|tuving|toving|taving|tuning|tsing|trig|tung|tiving|taxing)$/,
    "turing"
  ],
  [
    /^(maching|moching|macking|mackie|mochine|wachine|wockine|mocking|mocked|mocks|mache)$/,
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

function isImportantIdentifier(word) {

  if (
    word.length < 4 ||
    word.length > 12
  ) {
    return false;
  }

  if (
    !/[a-z]/.test(word) ||
    !/\d/.test(word)
  ) {
    return false;
  }

  if (
    /(.)\1{3,}/.test(word)
  ) {
    return false;
  }

  return IMPORTANT_IDENTIFIER_PATTERNS.some(pattern =>
    pattern.test(word)
  );
}

function hasVowel(word) {

  return /[aeiou]/.test(word);
}

function isNoisyWord(word) {

  if (
    isImportantIdentifier(word)
  ) {
    return false;
  }

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

function hasGoodWordShape(word) {

  if (
    DOMAIN_WORDS.has(word) ||
    isImportantIdentifier(word)
  ) {
    return true;
  }

  if (
    word.length < 4 ||
    word.length > 18
  ) {
    return false;
  }

  if (
    /\d/.test(word)
  ) {
    return false;
  }

  if (
    !hasVowel(word)
  ) {
    return false;
  }

  if (
    /[bcdfghjklmnpqrstvwxyz]{5,}/.test(word)
  ) {
    return false;
  }

  if (
    /[aeiou]{4,}/.test(word)
  ) {
    return false;
  }

  return true;
}

function scoreKeywordCandidate(
  word,
  count,
  firstIndex
) {

  if (
    isImportantIdentifier(word)
  ) {
    return 100 - firstIndex * 0.001;
  }

  if (
    DOMAIN_WORDS.has(word)
  ) {
    return count * 4 + 12 - firstIndex * 0.001;
  }

  if (
    count >= 3 &&
    hasGoodWordShape(word)
  ) {
    return count * 2 - firstIndex * 0.001;
  }

  return -Infinity;
}

function formatTitleWord(word) {

  if (
    isImportantIdentifier(word)
  ) {
    return word.toUpperCase();
  }

  return word.charAt(0).toUpperCase() +
    word.slice(1);
}

function buildGeneratedTitle(keywords) {

  const identifiers =
    keywords.filter(isImportantIdentifier);
  const topicWords =
    keywords.filter(word =>
      DOMAIN_WORDS.has(word) &&
      ![
        "document",
        "file",
        "notes",
        "page",
        "paper",
        "question",
        "unit"
      ].includes(word)
    );

  if (
    identifiers.length > 0
  ) {
    const pieces =
      [identifiers[0]];

    if (
      keywords.includes("question") &&
      keywords.includes("paper")
    ) {
      pieces.push(
        "question",
        "paper"
      );
    } else if (
      keywords.includes("assignment")
    ) {
      pieces.push("assignment");
    } else {
      pieces.push(
        ...topicWords.slice(0, 2)
      );
    }

    if (
      pieces.length === 1
    ) {
      pieces.push("notes");
    }

    return pieces
      .map(formatTitleWord)
      .join(" ");
  }

  if (
    keywords.includes("turing") &&
    keywords.includes("machine")
  ) {
    return "Turing Machine Notes";
  }

  if (
    topicWords.length >= 2
  ) {
    return [
      ...topicWords.slice(0, 3),
      "notes"
    ]
      .map(formatTitleWord)
      .join(" ");
  }

  return "";
}

function cleanTitleLine(
  line,
  keywordSet
) {

  const seen =
    new Set();
  const words =
    tokenizeLine(line)
      .map(normalizeKeyword)
      .filter(word =>
        keywordSet.has(word) ||
        isImportantIdentifier(word)
      )
      .filter(word => {
        if (
          seen.has(word)
        ) {
          return false;
        }

        seen.add(word);
        return true;
      });

  return words
    .map(formatTitleWord)
    .join(" ");
}

function scoreTitleLine(
  line,
  index,
  keywordSet
) {

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
        keywordSet.has(word) ||
        isImportantIdentifier(word)
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
  const identifierHits =
    usefulWords.filter(
      isImportantIdentifier
    )
      .length;
  const noiseCount =
    words.length -
    usefulWords.length;

  return usefulWords.length * 2 +
    domainHits * 3 +
    identifierHits * 6 +
    alphaRatio * 2 -
    symbolRatio * 3 -
    noiseCount -
    index * 0.08;
}

export function generateTitleTags(text) {

  const keywordTags =
    generateKeywordTags(text);
  const keywordSet =
    new Set(keywordTags);
  const generatedTitle =
    buildGeneratedTitle(keywordTags);

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
            candidate.original,
            keywordSet
          ),
        score:
          scoreTitleLine(
            candidate.original,
            candidate.index,
            keywordSet
          )
      }))
      .filter(candidate =>
        Number.isFinite(
          candidate.score
        ) &&
        candidate.cleaned
      )
      .sort(
        (a, b) =>
          b.score - a.score
      );

  const lineTitles =
    candidates
      .slice(0, 5)
      .sort(
        (a, b) =>
          a.index - b.index
      )
      .map(candidate =>
        candidate.cleaned
      );

  return [
    generatedTitle,
    ...lineTitles
  ]
    .filter(Boolean)
    .filter((tag, index, tags) =>
      tags.findIndex(candidate =>
        candidate.toLowerCase() === tag.toLowerCase()
      ) === index
    )
    .slice(0, 5);
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
    .map(([
      word,
      count
    ]) => ({
      word,
      count,
      score:
        scoreKeywordCandidate(
          word,
          count,
          firstSeen.get(word)
        )
    }))
    .filter(candidate =>
      Number.isFinite(
        candidate.score
      )
    )
    .sort((a, b) => {
      if (
        a.score !== b.score
      ) {
        return b.score - a.score;
      }

      return firstSeen.get(a.word) -
        firstSeen.get(b.word);
    })
    .map(candidate =>
      candidate.word
    )
    .slice(0, 20);
}
