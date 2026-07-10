const QUERY_STOP_WORDS =
  new Set([
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "for",
    "from",
    "in",
    "is",
    "of",
    "on",
    "or",
    "the",
    "to",
    "with"
  ]);

export function normalizeText(value) {

  return String(
    value ?? ""
  )
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      " "
    )
    .trim();
}

function compactText(value) {

  return normalizeText(value)
    .replace(
      /\s+/g,
      ""
    );
}

function expandAlphaNumericToken(token) {

  const match =
    token.match(
      /^([a-z]+)(\d+)$/
    ) ||
    token.match(
      /^(\d+)([a-z]+)$/
    );

  if (!match)
    return [token];

  return [
    token,
    match[1],
    match[2]
  ];
}

function normalizeToken(token) {

  if (
    /^\d+$/.test(token)
  ) {
    return String(
      Number(token)
    );
  }

  return token;
}

export function tokenize(value) {

  const tokens =
    normalizeText(value)
      .split(/\s+/)
      .filter(Boolean)
      .flatMap(
        expandAlphaNumericToken
      )
      .map(
        normalizeToken
      )
      .filter(
        word =>
          word.length > 1 ||
          /^\d$/.test(word) ||
          /^[a-z]$/.test(word)
      )
      .filter(
        word =>
          !QUERY_STOP_WORDS.has(word)
      );

  return [
    ...new Set(tokens)
  ];
}

function editDistance(a, b) {

  if (a === b)
    return 0;

  if (!a.length)
    return b.length;

  if (!b.length)
    return a.length;

  const previous =
    Array.from(
      { length: b.length + 1 },
      (_, index) => index
    );

  const current =
    new Array(
      b.length + 1
    );

  for (
    let i = 1;
    i <= a.length;
    i++
  ) {

    current[0] = i;

    for (
      let j = 1;
      j <= b.length;
      j++
    ) {

      const cost =
        a[i - 1] === b[j - 1]
          ? 0
          : 1;

      current[j] =
        Math.min(
          current[j - 1] + 1,
          previous[j] + 1,
          previous[j - 1] + cost
        );
    }

    for (
      let j = 0;
      j <= b.length;
      j++
    ) {
      previous[j] =
        current[j];
    }
  }

  return previous[b.length];
}

function hasCloseTokenMatch(
  queryToken,
  fieldTokens,
  maxDistance
) {

  if (
    queryToken.length < 4 ||
    /^\d+$/.test(queryToken)
  ) {
    return false;
  }

  return fieldTokens.some(
    token => {

      if (
        Math.abs(
          token.length -
            queryToken.length
        ) > 1
      ) {
        return false;
      }

      return editDistance(
        queryToken,
        token
      ) <= maxDistance;
    }
  );
}

function getFuzzyDistance(
  queryToken,
  allowOcrTolerance
) {

  if (!allowOcrTolerance)
    return 1;

  if (
    queryToken.length >= 7
  ) {
    return 3;
  }

  if (
    queryToken.length >= 6
  ) {
    return 2;
  }

  return 1;
}

function countTokenOccurrences(fieldTokens, term) {

  return fieldTokens.filter(
    token =>
      token === term
  ).length;
}

function buildSearchText(doc) {

  return [
    doc.fileName,
    doc.titleTags
      ?.join(" "),
    doc.keywordTags
      ?.join(" "),
    JSON.stringify(
      doc.metadata ?? {}
    ),
    doc.category,
    doc.text ??
      doc.ocrText
  ]
    .filter(Boolean)
    .join(" ");
}

function calculateTokenIdf(docs, queryTokens) {

  const totalDocs =
    Math.max(
      docs.length,
      1
    );

  const frequencies =
    new Map();

  for (
    const token
    of queryTokens
  ) {
    frequencies.set(
      token,
      0
    );
  }

  for (
    const doc
    of docs
  ) {

    const text =
      normalizeText(
        buildSearchText(doc)
      );

    for (
      const token
      of queryTokens
    ) {

      if (
        text.includes(
          token
        )
      ) {
        frequencies.set(
          token,
          frequencies.get(token) + 1
        );
      }
    }
  }

  return new Map(
    queryTokens.map(
      token => {
        const frequency =
          frequencies.get(token) || 0;

        return [
          token,
          1 +
            Math.log(
              (totalDocs + 1) /
                (frequency + 1)
            )
        ];
      }
    )
  );
}

function scoreField(
  value,
  query,
  compactQuery,
  queryTokens,
  tokenIdf,
  weight,
  allowOcrTolerance = false
) {

  const normalized =
    normalizeText(value);

  if (!normalized)
    return {
      score: 0,
      matchedTokens: new Set()
    };

  const compact =
    compactText(value);

  const fieldTokens =
    tokenize(value);

  const matchedTokens =
    new Set();

  let score = 0;

  if (
    normalized === query
  ) {
    score += weight * 3;
  }

  if (
    normalized.includes(
      query
    )
  ) {
    score += weight * 2;
  }

  if (
    compactQuery &&
    compact.includes(
      compactQuery
    )
  ) {
    score += weight * 1.5;
  }

  for (
    const token
    of queryTokens
  ) {

    const idf =
      tokenIdf.get(token) ?? 1;

    const occurrences =
      countTokenOccurrences(
        fieldTokens,
        token
      );

    if (
      occurrences > 0
    ) {
      matchedTokens.add(token);
      score +=
        weight *
        idf *
        Math.min(
          occurrences,
          5
        );
    } else if (
      /^[a-z]+\d+$/.test(token) &&
      compact.includes(token)
    ) {
      matchedTokens.add(token);
      score +=
        weight *
        idf *
        0.8;
    } else if (
      hasCloseTokenMatch(
        token,
        fieldTokens,
        getFuzzyDistance(
          token,
          allowOcrTolerance
        )
      )
    ) {
      matchedTokens.add(token);
      score +=
        weight *
        idf *
        (
          allowOcrTolerance
            ? 0.25
            : 0.45
        );
    }
  }

  return {
    score,
    matchedTokens
  };
}

function mergeMatches(target, source) {

  for (
    const token
    of source
  ) {
    target.add(token);
  }
}

export function generatePreview(
  text,
  query
) {

  if (!text)
    return "";

  const lowerText =
    text.toLowerCase();

  const queryTerms = [
    query,
    ...tokenize(query)
  ]
    .map(term =>
      term.toLowerCase()
    )
    .filter(Boolean)
    .sort(
      (a, b) =>
        b.length - a.length
    );

  let index = -1;
  let matchedTerm = "";

  for (
    const term
    of queryTerms
  ) {

    index =
      lowerText.indexOf(
        term
      );

    if (
      index !== -1
    ) {
      matchedTerm = term;
      break;
    }
  }

  if (
    index === -1
  ) {
    return "";
  }

  const start =
    Math.max(
      0,
      index - 50
    );

  const end =
    Math.min(
      text.length,
      index +
        matchedTerm.length +
        100
    );

  return text.slice(
    start,
    end
  );
}

export function searchDocumentsInDocs(
  docs,
  query
) {

  const normalizedQuery =
    normalizeText(query);

  if (
    !normalizedQuery
  ) {
    return [];
  }

  const compactQuery =
    compactText(query);

  const queryTokens =
    tokenize(query);

  const tokenIdf =
    calculateTokenIdf(
      docs,
      queryTokens
    );

  return docs
    .map(doc => {

      let score = 0;
      const matchedTokens =
        new Set();

      const fields = [
        [
          doc.fileName,
          120,
          false
        ],
        [
          doc.titleTags
            ?.join(" "),
          70,
          false
        ],
        [
          doc.keywordTags
            ?.join(" "),
          45,
          false
        ],
        [
          JSON.stringify(
            doc.metadata ?? {}
          ),
          50,
          false
        ],
        [
          doc.category,
          25,
          false
        ],
        [
          doc.text ??
            doc.ocrText,
          10,
          true
        ]
      ];

      for (
        const [
          value,
          weight,
          allowOcrTolerance
        ]
        of fields
      ) {
        const fieldScore =
          scoreField(
            value,
            normalizedQuery,
            compactQuery,
            queryTokens,
            tokenIdf,
            weight,
            allowOcrTolerance
          );

        score +=
          fieldScore.score;

        mergeMatches(
          matchedTokens,
          fieldScore.matchedTokens
        );
      }

      if (
        queryTokens.length &&
        matchedTokens.size ===
          queryTokens.length
      ) {
        score += 150;
      }

      if (
        queryTokens.length > 1 &&
        matchedTokens.size === 1
      ) {
        score *= 0.35;
      }

      let preview =
        generatePreview(
          doc.text,
          normalizedQuery
        );

      if (!preview) {

        preview =
          doc.titleTags
            ?.join(" | ");
      }

      return {
        ...doc,
        score:
          Math.round(
            score * 100
          ) / 100,
        preview,
        __matchedTokenCount:
          matchedTokens.size
      };
    })
    .filter(
      doc =>
        doc.score > 0 &&
        (
          queryTokens.length <= 1 ||
          doc.__matchedTokenCount ===
            queryTokens.length
        )
    )
    .map(
      doc => {
        const {
          __matchedTokenCount,
          ...result
        } = doc;

        void __matchedTokenCount;

        return result;
      }
    )
    .sort(
      (a, b) =>
        b.score - a.score
    );
}
