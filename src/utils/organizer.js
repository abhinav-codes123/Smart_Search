const FILE_TYPE_FOLDERS = {
  ".bmp": "images",
  ".csv": "spreadsheets",
  ".doc": "documents",
  ".docx": "documents",
  ".gif": "images",
  ".jpeg": "images",
  ".jpg": "images",
  ".md": "documents",
  ".odp": "presentations",
  ".ods": "spreadsheets",
  ".odt": "documents",
  ".pdf": "documents",
  ".png": "images",
  ".ppt": "presentations",
  ".pptx": "presentations",
  ".rtf": "documents",
  ".tif": "images",
  ".tiff": "images",
  ".txt": "documents",
  ".webp": "images",
  ".xls": "spreadsheets",
  ".xlsx": "spreadsheets"
};

export const VIRTUAL_FOLDER_TREE = [
  {
    id: "all-files",
    name: "All Files",
    source: "system"
  },
  {
    id: "review-needed",
    name: "Review Needed",
    source: "system"
  },
  {
    id: "computer-science",
    name: "Computer Science",
    source: "system",
    children: [
      {
        id: "cs-operating-systems",
        name: "Operating Systems",
        source: "system"
      },
      {
        id: "cs-theory-of-computation",
        name: "Theory of Computation",
        source: "system"
      },
      {
        id: "cs-algorithms",
        name: "Algorithms",
        source: "system"
      },
      {
        id: "cs-programming",
        name: "Programming",
        source: "system"
      },
      {
        id: "cs-cyber-security",
        name: "Cyber Security",
        source: "system"
      },
      {
        id: "cs-databases",
        name: "Databases",
        source: "system"
      }
    ]
  },
  {
    id: "mathematics",
    name: "Mathematics",
    source: "system",
    children: [
      {
        id: "math-statistics",
        name: "Statistics",
        source: "system"
      },
      {
        id: "math-discrete-mathematics",
        name: "Discrete Mathematics",
        source: "system"
      }
    ]
  },
  {
    id: "blockchain",
    name: "Blockchain",
    source: "system"
  },
  {
    id: "certificates",
    name: "Certificates",
    source: "system"
  },
  {
    id: "student-records",
    name: "Student Records",
    source: "system"
  },
  {
    id: "medical",
    name: "Medical",
    source: "system"
  },
  {
    id: "business-documents",
    name: "Business Documents",
    source: "system"
  },
  {
    id: "course-learning",
    name: "Course Learning",
    source: "system"
  },
  {
    id: "assignments",
    name: "Assignments",
    source: "system"
  },
  {
    id: "notes",
    name: "Notes",
    source: "system"
  },
  {
    id: "documents",
    name: "Documents",
    source: "system"
  },
  {
    id: "images",
    name: "Images",
    source: "system"
  },
  {
    id: "presentations",
    name: "Presentations",
    source: "system"
  },
  {
    id: "spreadsheets",
    name: "Spreadsheets",
    source: "system"
  },
  {
    id: "code",
    name: "Code",
    source: "system"
  },
  {
    id: "other",
    name: "Other",
    source: "system"
  }
];

const RULES = [
  {
    folderId: "certificates",
    label: "certificate evidence",
    baseWeight: 5,
    minSignalWeight: 4,
    terms: [
      ["certificate", 4],
      ["certificate of completion", 6],
      ["certification", 4],
      ["awarded", 2],
      ["completion", 2],
      ["participation", 2],
      ["participant", 1],
      ["congratulations", 3],
      ["verify certificate", 4],
      ["certificate id", 4]
    ]
  },
  {
    folderId: "student-records",
    label: "student record evidence",
    baseWeight: 4,
    minSignalWeight: 6,
    terms: [
      ["student", 3],
      ["class", 2],
      ["section", 2],
      ["subject", 2],
      ["teacher", 2],
      ["report", 3],
      ["report card", 5],
      ["term", 2],
      ["marks", 3],
      ["grade", 3],
      ["satisfactory", 2],
      ["outstanding", 2],
      ["mathematics", 1],
      ["computer", 1]
    ]
  },
  {
    folderId: "medical",
    label: "medical document evidence",
    baseWeight: 5,
    minSignalWeight: 5,
    terms: [
      ["patient", 4],
      ["prescription", 5],
      ["dosage", 4],
      ["dose", 3],
      ["tablet", 4],
      ["medicine", 4],
      ["route", 2],
      ["duration", 2],
      ["meals", 2],
      ["daily", 1],
      ["days", 1],
      ["hemoglobin", 5]
    ]
  },
  {
    folderId: "business-documents",
    label: "business document evidence",
    baseWeight: 4,
    minSignalWeight: 6,
    terms: [
      ["business", 3],
      ["techsolutions", 5],
      ["development", 2],
      ["module", 2],
      ["description", 2],
      ["address", 2],
      ["client", 3],
      ["invoice", 5],
      ["proposal", 4],
      ["technical point", 3],
      ["state condition", 3]
    ]
  },
  {
    folderId: "course-learning",
    label: "course or learning evidence",
    baseWeight: 3,
    minSignalWeight: 5,
    terms: [
      ["course", 2],
      ["learning", 3],
      ["completed", 2],
      ["completion", 2],
      ["activity", 2],
      ["lesson", 3],
      ["training", 3],
      ["workshop", 3]
    ]
  },
  {
    folderId: "blockchain",
    label: "blockchain topic",
    baseWeight: 4,
    minSignalWeight: 3,
    terms: [
      ["blockchain", 4],
      ["ethereum", 4],
      ["smart contract", 4],
      ["solidity", 4],
      ["web3", 3],
      ["crypto", 2],
      ["ledger", 2]
    ]
  },
  {
    folderId: "cs-operating-systems",
    label: "operating system concepts",
    baseWeight: 5,
    minSignalWeight: 5,
    terms: [
      ["operating system", 5],
      ["operating systems", 5],
      ["deadlock", 4],
      ["banker algorithm", 5],
      ["safe state", 3],
      ["memory hierarchy", 4],
      ["cache memory", 4],
      ["cpu cache", 4],
      ["paging", 3],
      ["segmentation", 3],
      ["semaphore", 3],
      ["process scheduling", 4],
      ["page replacement", 4],
      ["allocation matrix", 4],
      ["available vector", 3],
      ["cs4411", 5]
    ]
  },
  {
    folderId: "cs-theory-of-computation",
    label: "automata and turing machine concepts",
    baseWeight: 5,
    minSignalWeight: 5,
    terms: [
      ["turing", 3],
      ["turing machine", 6],
      ["finite control", 4],
      ["automata", 4],
      ["automaton", 4],
      ["grammar", 3],
      ["regular language", 4],
      ["context free", 4],
      ["pushdown automata", 5],
      ["tape", 2],
      ["read write head", 5]
    ]
  },
  {
    folderId: "cs-algorithms",
    label: "algorithm and data structure concepts",
    baseWeight: 4,
    minSignalWeight: 5,
    terms: [
      ["algorithm", 3],
      ["data structure", 5],
      ["postfix", 5],
      ["infix", 4],
      ["expression evaluation", 5],
      ["stack", 3],
      ["queue", 2],
      ["tree traversal", 4],
      ["graph", 2],
      ["sorting", 3],
      ["complexity", 3],
      ["recursion", 3]
    ]
  },
  {
    folderId: "cs-programming",
    label: "programming identifiers",
    baseWeight: 4,
    minSignalWeight: 5,
    terms: [
      ["stdio.h", 5],
      ["ctype.h", 5],
      ["#include", 5],
      ["printf", 4],
      ["scanf", 4],
      ["function", 2],
      ["program", 2],
      ["source code", 5],
      ["compiler", 3],
      ["javascript", 4],
      ["python", 4],
      ["java program", 4],
      ["c program", 4]
    ]
  },
  {
    folderId: "cs-cyber-security",
    label: "security and vulnerability concepts",
    baseWeight: 5,
    minSignalWeight: 5,
    terms: [
      ["file inclusion", 6],
      ["dvwa", 5],
      ["vulnerability", 4],
      ["path traversal", 5],
      ["sql injection", 5],
      ["xss", 4],
      ["csrf", 4],
      ["burp", 4],
      ["payload", 3],
      ["exploit", 4],
      ["authentication bypass", 5],
      ["upload vulnerability", 5]
    ]
  },
  {
    folderId: "cs-databases",
    label: "database concepts",
    baseWeight: 4,
    minSignalWeight: 5,
    terms: [
      ["database", 3],
      ["dbms", 5],
      ["sql", 3],
      ["normalization", 4],
      ["transaction", 3],
      ["query", 2],
      ["primary key", 4],
      ["foreign key", 4],
      ["relational model", 4],
      ["schema", 3]
    ]
  },
  {
    folderId: "math-statistics",
    label: "statistics concepts",
    baseWeight: 5,
    minSignalWeight: 5,
    terms: [
      ["statistics", 4],
      ["statistical", 4],
      ["sampling theory", 5],
      ["test of significance", 5],
      ["t-test", 5],
      ["standard deviation", 4],
      ["population mean", 4],
      ["sample mean", 4],
      ["hypothesis", 3],
      ["confidence interval", 4],
      ["n < 30", 4],
      ["chi square", 4]
    ]
  },
  {
    folderId: "math-discrete-mathematics",
    label: "discrete mathematics concepts",
    baseWeight: 4,
    minSignalWeight: 5,
    terms: [
      ["discrete mathematics", 5],
      ["graph theory", 4],
      ["set theory", 4],
      ["relation", 2],
      ["function", 1],
      ["truth table", 4],
      ["proposition", 3],
      ["combinatorics", 4],
      ["permutation", 3],
      ["recurrence", 3]
    ]
  },
  {
    folderId: "assignments",
    label: "assignment or question paper signals",
    baseWeight: 4,
    minSignalWeight: 5,
    terms: [
      ["assignment", 4],
      ["homework", 4],
      ["question paper", 5],
      ["lab manual", 4],
      ["practical", 3],
      ["submit", 2],
      ["deadline", 3],
      ["marks", 2],
      ["rubric", 3],
      ["bcs303", 5],
      ["bas302", 5],
      ["assignment04", 5]
    ]
  },
  {
    folderId: "notes",
    label: "notes or chapter signals",
    baseWeight: 3,
    minSignalWeight: 5,
    terms: [
      ["notes", 5],
      ["chapter", 3],
      ["unit", 1],
      ["unit 1", 3],
      ["unit 2", 3],
      ["unit 3", 3],
      ["unit 4", 3],
      ["unit 5", 3],
      ["lecture", 4],
      ["topic", 2],
      ["definition", 3],
      ["advantages", 2],
      ["features", 2]
    ]
  }
];

const CODE_EXTENSIONS =
  new Set([
    ".c",
    ".cpp",
    ".cs",
    ".css",
    ".go",
    ".h",
    ".hpp",
    ".html",
    ".java",
    ".js",
    ".jsx",
    ".kt",
    ".php",
    ".py",
    ".rb",
    ".rs",
    ".sql",
    ".swift",
    ".ts",
    ".tsx"
  ]);

const FLAT_FOLDERS =
  flattenVirtualFolders(
    VIRTUAL_FOLDER_TREE
  );

const FOLDER_BY_ID =
  new Map(
    FLAT_FOLDERS.map(folder => [
      folder.id,
      folder
    ])
  );

function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[#/\\_-]+/g, " ")
    .replace(/[^a-z0-9.<>\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactText(value) {
  return normalizeText(value)
    .replace(/\s+/g, "");
}

function getExtension(filePath = "") {
  const match =
    String(filePath)
      .toLowerCase()
      .match(/\.[^.]+$/);

  return match?.[0] || "";
}

function collectDocumentText(document) {
  return [
    document?.fileName,
    document?.filePath,
    document?.category,
    document?.titleTags?.join(" "),
    document?.keywordTags?.join(" "),
    JSON.stringify(
      document?.metadata || {}
    ),
    document?.cleanText,
    document?.text,
    document?.ocrText,
    ...(document?.pages || []).flatMap(page => [
      page.cleanText,
      page.text
    ])
  ]
    .filter(Boolean)
    .join("\n");
}

function hasTerm(normalized, compact, term) {
  const normalizedTerm =
    normalizeText(term);

  if (!normalizedTerm) {
    return false;
  }

  if (
    normalized.includes(
      normalizedTerm
    )
  ) {
    return true;
  }

  if (
    /^[a-z]+\d+$/i.test(term)
  ) {
    return compact.includes(
      normalizedTerm.replace(/\s+/g, "")
    );
  }

  return false;
}

function addScore(scores, folderId, amount, reason) {
  const current =
    scores.get(folderId) || {
      score: 0,
      reasons: []
    };

  current.score += amount;

  if (
    reason &&
    !current.reasons.includes(reason)
  ) {
    current.reasons.push(reason);
  }

  scores.set(
    folderId,
    current
  );
}

function getTermValue(term) {
  if (
    Array.isArray(term)
  ) {
    return {
      text:
        term[0],
      weight:
        term[1] ?? 1
    };
  }

  return {
    text:
      term,
    weight:
      1
  };
}

function getConfidence(topScore, secondScore, document) {
  if (topScore <= 0) {
    return 0.2;
  }

  let confidence =
    0.35 +
    Math.min(
      topScore,
      18
    ) / 28;

  if (
    secondScore > 0
  ) {
    confidence -=
      Math.min(
        0.18,
        secondScore /
          (topScore + secondScore) *
          0.25
      );
  }

  if (
    Number(document?.textQuality ?? 100) < 45
  ) {
    confidence -= 0.08;
  }

  return Math.max(
    0.15,
    Math.min(
      0.98,
      confidence
    )
  );
}

function isReviewNeeded(document, confidence, topScore) {
  const textQuality =
    Number(document?.textQuality ?? 100);
  const wordCount =
    Number(
      document?.cleanWordCount ??
      document?.rawWordCount ??
      0
    );

  return Boolean(
    document?.status === "failed" ||
    confidence < 0.58 ||
    topScore < 8 ||
    (
      textQuality < 35 &&
      topScore < 18
    ) ||
    (
      wordCount > 0 &&
      wordCount < 12 &&
      topScore < 12
    )
  );
}

function unique(values) {
  return [
    ...new Set(
      values.filter(Boolean)
    )
  ];
}

export function flattenVirtualFolders(
  folders = VIRTUAL_FOLDER_TREE,
  parent = null,
  parentPath = [],
  depth = 0,
  startOrder = 0
) {
  const flattened = [];
  let order =
    startOrder;

  for (
    const folder
    of folders
  ) {
    const pathParts = [
      ...parentPath,
      folder.name
    ];

    flattened.push({
      id:
        folder.id,
      name:
        folder.name,
      parentId:
        parent?.id || null,
      path:
        pathParts.join(" / "),
      source:
        folder.source || "system",
      depth,
      sortOrder:
        order
    });

    order += 1;

    if (
      folder.children?.length
    ) {
      const childFolders =
        flattenVirtualFolders(
          folder.children,
          folder,
          pathParts,
          depth + 1,
          order
        );

      flattened.push(
        ...childFolders
      );

      order +=
        childFolders.length;
    }
  }

  return flattened;
}

export function getVirtualFolderById(folderId) {
  return FOLDER_BY_ID.get(folderId) || null;
}

export function getVirtualFolderAncestors(folderId) {
  const ancestors = [];
  let folder =
    getVirtualFolderById(
      folderId
    );

  while (
    folder?.parentId
  ) {
    folder =
      getVirtualFolderById(
        folder.parentId
      );

    if (folder) {
      ancestors.push(
        folder.id
      );
    }
  }

  return ancestors;
}

export function getDefaultVirtualFolders() {
  return FLAT_FOLDERS.map(folder => ({
    ...folder
  }));
}

export function suggestOrganization(document = {}) {
  const scores =
    new Map();
  const sourceText =
    collectDocumentText(
      document
    );
  const normalized =
    normalizeText(
      sourceText
    );
  const compact =
    compactText(
      sourceText
    );
  const extension =
    getExtension(
      document.filePath ||
      document.fileName
    );

  for (
    const rule
    of RULES
  ) {
    let matched = 0;
    let signalWeight = 0;

    for (
      const term
      of rule.terms
    ) {
      const termValue =
        getTermValue(
          term
        );

      if (
        hasTerm(
          normalized,
          compact,
          termValue.text
        )
      ) {
        matched += 1;
        signalWeight +=
          termValue.weight;
      }
    }

    if (
      matched > 0 &&
      signalWeight >=
        (rule.minSignalWeight || 1)
    ) {
      addScore(
        scores,
        rule.folderId,
        (rule.baseWeight || 0) +
          signalWeight,
        `${rule.label}: ${matched} signal${matched === 1 ? "" : "s"}, weight ${signalWeight}`
      );
    }
  }

  if (
    CODE_EXTENSIONS.has(extension)
  ) {
    addScore(
      scores,
      "code",
      7,
      "source code file extension"
    );
  } else if (
    FILE_TYPE_FOLDERS[extension]
  ) {
    addScore(
      scores,
      FILE_TYPE_FOLDERS[extension],
      1.5,
      `${extension} file type`
    );
  }

  if (
    document.category &&
    document.category !== "Unknown"
  ) {
    const categoryMap = {
      Certificate: "certificates",
      Identity: "documents",
      Medical: "medical",
      Resume: "documents",
      Technical: "business-documents"
    };

    if (
      categoryMap[document.category]
    ) {
      addScore(
        scores,
        categoryMap[document.category],
        document.category === "Certificate"
          ? 3
          : 1.5,
        `${document.category} classifier result`
      );
    }
  }

  const ranked =
    [...scores.entries()]
      .map(([folderId, value]) => ({
        folderId,
        folder:
          getVirtualFolderById(
            folderId
          ),
        score:
          value.score,
        reasons:
          value.reasons
      }))
      .filter(item =>
        item.folder &&
        item.folderId !== "all-files"
      )
      .sort(
        (a, b) =>
          b.score - a.score
      );

  const top =
    ranked[0] || {
      folderId: "other",
      folder:
        getVirtualFolderById("other"),
      score: 0,
      reasons: [
        "no strong content signal"
      ]
    };
  const second =
    ranked[1];
  const confidence =
    getConfidence(
      top.score,
      second?.score || 0,
      document
    );
  const needsReview =
    isReviewNeeded(
      document,
      confidence,
      top.score
    );
  const primary =
    needsReview
      ? {
          folderId:
            "review-needed",
          folder:
            getVirtualFolderById(
              "review-needed"
            ),
          score:
            top.score,
          reasons:
            [
              `needs review: ${top.reasons[0] || "weak or ambiguous evidence"}`
            ]
        }
      : top;

  const secondaryFolderIds =
    ranked
      .filter(item =>
        item.folderId !== primary.folderId
      )
      .filter(item =>
        item.score >= 8
      )
      .slice(0, 5)
      .map(item =>
        item.folderId
      );

  const folderIds =
    unique([
      primary.folderId,
      ...getVirtualFolderAncestors(
        primary.folderId
      ),
      needsReview
        ? top.folderId
        : null,
      ...(
        needsReview
          ? getVirtualFolderAncestors(
              top.folderId
            )
          : []
      ),
      ...secondaryFolderIds,
      ...secondaryFolderIds.flatMap(
        getVirtualFolderAncestors
      ),
      needsReview
        ? "review-needed"
        : null
    ]);

  return {
    primaryFolderId:
      primary.folderId,
    primaryFolderPath:
      primary.folder?.path ||
      primary.folder?.name ||
      "Other",
    secondaryFolderIds,
    secondaryFolderPaths:
      secondaryFolderIds
        .map(folderId =>
          getVirtualFolderById(folderId)?.path
        )
        .filter(Boolean),
    folderIds,
    confidence:
      Math.round(
        confidence * 100
      ) / 100,
    needsReview,
    reason:
      primary.reasons.slice(0, 3),
    alternatives:
      ranked
        .filter(item =>
          item.folderId !== primary.folderId
        )
        .slice(0, 3)
        .map(item => ({
          folderId:
            item.folderId,
          folderPath:
            item.folder.path,
          score:
            Math.round(
              item.score * 10
            ) / 10,
          reason:
            item.reasons[0] || ""
        }))
  };
}

export function getDocumentFolderIds(document = {}) {
  const organization =
    document.organization ||
    suggestOrganization(
      document
    );

  return unique([
    "all-files",
    ...(organization.folderIds || []),
    organization.primaryFolderId,
    ...getVirtualFolderAncestors(
      organization.primaryFolderId
    ),
    ...(organization.secondaryFolderIds || []),
    ...(organization.secondaryFolderIds || [])
      .flatMap(
        getVirtualFolderAncestors
      ),
    organization.needsReview
      ? "review-needed"
      : null
  ]);
}

export function getOrganizationSearchText(document = {}) {
  const organization =
    document.organization ||
    suggestOrganization(
      document
    );

  return [
    organization.primaryFolderPath,
    ...(organization.secondaryFolderPaths || []),
    ...(organization.folderIds || [])
      .map(folderId =>
        getVirtualFolderById(folderId)?.path
      )
  ]
    .filter(Boolean)
    .join(" ");
}
