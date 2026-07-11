import {
  hasPlausibleWordShape,
  isDictionaryWord,
  isDomainWord,
  isImportantIdentifier,
  isOcrNoiseWord,
  isStopWord
} from "./dictionary.js";

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
    isStopWord(word) ||
    isOcrNoiseWord(word)
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
    /\d/.test(word)
  ) {
    return true;
  }

  if (
    !isDictionaryWord(word) &&
    !hasPlausibleWordShape(word)
  ) {
    return true;
  }

  return false;
}

function hasGoodWordShape(word) {

  if (
    isDictionaryWord(word) ||
    isImportantIdentifier(word)
  ) {
    return true;
  }

  return hasPlausibleWordShape(word);
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
    isDomainWord(word)
  ) {
    return count * 4 + 12 - firstIndex * 0.001;
  }

  if (
    isDictionaryWord(word)
  ) {
    return count * 2 + 6 - firstIndex * 0.001;
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
      isDomainWord(word) &&
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
        isDomainWord(word)
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
