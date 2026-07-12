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
    weight: 8,
    terms: [
      "certificate",
      "certification",
      "awarded",
      "completion",
      "participation",
      "participant",
      "congratulations",
      "verify certificate",
      "certificate id"
    ]
  },
  {
    folderId: "blockchain",
    label: "blockchain topic",
    weight: 7,
    terms: [
      "blockchain",
      "ethereum",
      "smart contract",
      "solidity",
      "web3",
      "crypto",
      "ledger"
    ]
  },
  {
    folderId: "cs-operating-systems",
    label: "operating system concepts",
    weight: 8,
    terms: [
      "operating system",
      "operating systems",
      "deadlock",
      "banker algorithm",
      "safe state",
      "memory hierarchy",
      "cache memory",
      "cpu cache",
      "paging",
      "segmentation",
      "semaphore",
      "process scheduling",
      "page replacement",
      "allocation matrix",
      "available vector",
      "cs4411"
    ]
  },
  {
    folderId: "cs-theory-of-computation",
    label: "automata and turing machine concepts",
    weight: 8,
    terms: [
      "turing",
      "turing machine",
      "finite control",
      "automata",
      "automaton",
      "grammar",
      "regular language",
      "context free",
      "pushdown automata",
      "tape",
      "read write head"
    ]
  },
  {
    folderId: "cs-algorithms",
    label: "algorithm and data structure concepts",
    weight: 7,
    terms: [
      "algorithm",
      "data structure",
      "postfix",
      "infix",
      "expression evaluation",
      "stack",
      "queue",
      "tree traversal",
      "graph",
      "sorting",
      "complexity",
      "recursion"
    ]
  },
  {
    folderId: "cs-programming",
    label: "programming identifiers",
    weight: 7,
    terms: [
      "stdio.h",
      "ctype.h",
      "#include",
      "printf",
      "scanf",
      "function",
      "program",
      "source code",
      "compiler",
      "javascript",
      "python",
      "java program",
      "c program"
    ]
  },
  {
    folderId: "cs-cyber-security",
    label: "security and vulnerability concepts",
    weight: 8,
    terms: [
      "file inclusion",
      "dvwa",
      "vulnerability",
      "path traversal",
      "sql injection",
      "xss",
      "csrf",
      "burp",
      "payload",
      "exploit",
      "authentication bypass",
      "upload vulnerability"
    ]
  },
  {
    folderId: "cs-databases",
    label: "database concepts",
    weight: 7,
    terms: [
      "database",
      "dbms",
      "sql",
      "normalization",
      "transaction",
      "query",
      "primary key",
      "foreign key",
      "relational model",
      "schema"
    ]
  },
  {
    folderId: "math-statistics",
    label: "statistics concepts",
    weight: 8,
    terms: [
      "statistics",
      "statistical",
      "sampling theory",
      "test of significance",
      "t-test",
      "standard deviation",
      "population mean",
      "sample mean",
      "hypothesis",
      "confidence interval",
      "n < 30",
      "chi square"
    ]
  },
  {
    folderId: "math-discrete-mathematics",
    label: "discrete mathematics concepts",
    weight: 7,
    terms: [
      "discrete mathematics",
      "graph theory",
      "set theory",
      "relation",
      "function",
      "truth table",
      "proposition",
      "combinatorics",
      "permutation",
      "recurrence"
    ]
  },
  {
    folderId: "assignments",
    label: "assignment or question paper signals",
    weight: 6,
    terms: [
      "assignment",
      "homework",
      "question paper",
      "lab manual",
      "practical",
      "submit",
      "deadline",
      "marks",
      "rubric",
      "bcs303",
      "bas302",
      "assignment04"
    ]
  },
  {
    folderId: "notes",
    label: "notes or chapter signals",
    weight: 5,
    terms: [
      "notes",
      "chapter",
      "unit",
      "unit 1",
      "unit 2",
      "unit 3",
      "unit 4",
      "unit 5",
      "lecture",
      "topic",
      "definition",
      "advantages",
      "features"
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
    confidence < 0.52 ||
    topScore < 3 ||
    textQuality < 35 ||
    (
      wordCount > 0 &&
      wordCount < 12
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

    for (
      const term
      of rule.terms
    ) {
      if (
        hasTerm(
          normalized,
          compact,
          term
        )
      ) {
        matched += 1;
      }
    }

    if (
      matched > 0
    ) {
      addScore(
        scores,
        rule.folderId,
        rule.weight + matched * 1.6,
        `${rule.label}: ${matched} signal${matched === 1 ? "" : "s"}`
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
      2,
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
      Medical: "documents",
      Resume: "documents",
      Technical: "computer-science"
    };

    if (
      categoryMap[document.category]
    ) {
      addScore(
        scores,
        categoryMap[document.category],
        3,
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

  const secondaryFolderIds =
    ranked
      .slice(1)
      .filter(item =>
        item.score >= 4
      )
      .slice(0, 5)
      .map(item =>
        item.folderId
      );

  const folderIds =
    unique([
      top.folderId,
      ...getVirtualFolderAncestors(
        top.folderId
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
      top.folderId,
    primaryFolderPath:
      top.folder?.path ||
      top.folder?.name ||
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
      top.reasons.slice(0, 3),
    alternatives:
      ranked
        .slice(1, 4)
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
