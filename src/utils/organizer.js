export const ORGANIZER_VERSION = 3;

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
    id: "exam-papers",
    name: "Exam Papers",
    source: "system",
    children: [
      {
        id: "exam-papers-jee",
        name: "JEE",
        source: "system"
      },
      {
        id: "exam-papers-university",
        name: "University",
        source: "system"
      },
      {
        id: "exam-papers-computer-science",
        name: "Computer Science",
        source: "system"
      },
      {
        id: "exam-papers-mathematics",
        name: "Mathematics",
        source: "system"
      },
      {
        id: "exam-papers-physical-education",
        name: "Physical Education",
        source: "system"
      },
      {
        id: "exam-papers-engineering",
        name: "Engineering",
        source: "system"
      },
      {
        id: "exam-papers-other",
        name: "Other Exam Papers",
        source: "system"
      }
    ]
  },
  {
    id: "assignments",
    name: "Assignments",
    source: "system",
    children: [
      {
        id: "assignments-computer-science",
        name: "Computer Science",
        source: "system"
      },
      {
        id: "assignments-python",
        name: "Python",
        source: "system"
      },
      {
        id: "assignments-mathematics",
        name: "Mathematics",
        source: "system"
      },
      {
        id: "assignments-engineering",
        name: "Engineering",
        source: "system"
      },
      {
        id: "assignments-other",
        name: "Other Assignments",
        source: "system"
      }
    ]
  },
  {
    id: "lab-manuals",
    name: "Lab Manuals",
    source: "system",
    children: [
      {
        id: "lab-manuals-computer-science",
        name: "Computer Science",
        source: "system"
      },
      {
        id: "lab-manuals-computer-organization",
        name: "Computer Organization",
        source: "system"
      },
      {
        id: "lab-manuals-engineering",
        name: "Engineering",
        source: "system"
      },
      {
        id: "lab-manuals-other",
        name: "Other Lab Manuals",
        source: "system"
      }
    ]
  },
  {
    id: "notes-books",
    name: "Notes & Books",
    source: "system",
    children: [
      {
        id: "notes-computer-science",
        name: "Computer Science",
        source: "system"
      },
      {
        id: "notes-theory-of-computation",
        name: "Theory of Computation",
        source: "system"
      },
      {
        id: "notes-computer-organization",
        name: "Computer Organization",
        source: "system"
      },
      {
        id: "notes-mathematics",
        name: "Mathematics",
        source: "system"
      },
      {
        id: "notes-physical-education",
        name: "Physical Education",
        source: "system"
      },
      {
        id: "notes-english",
        name: "English",
        source: "system"
      },
      {
        id: "notes-engineering",
        name: "Engineering",
        source: "system"
      },
      {
        id: "notes-other",
        name: "Other Notes",
        source: "system"
      }
    ]
  },
  {
    id: "academic-records",
    name: "Academic Records",
    source: "system",
    children: [
      {
        id: "academic-records-marksheets",
        name: "Marksheets & Results",
        source: "system"
      },
      {
        id: "academic-records-applications",
        name: "Applications & Admissions",
        source: "system"
      },
      {
        id: "academic-records-toppers",
        name: "Toppers Lists",
        source: "system"
      }
    ]
  },
  {
    id: "certificates",
    name: "Certificates",
    source: "system"
  },
  {
    id: "career-interview",
    name: "Career & Interview",
    source: "system"
  },
  {
    id: "code-projects",
    name: "Code & Projects",
    source: "system",
    children: [
      {
        id: "code-android",
        name: "Android",
        source: "system"
      },
      {
        id: "code-web",
        name: "Web",
        source: "system"
      },
      {
        id: "code-programming",
        name: "Programming",
        source: "system"
      }
    ]
  },
  {
    id: "medical",
    name: "Medical",
    source: "system"
  },
  {
    id: "images",
    name: "Images",
    source: "system"
  },
  {
    id: "documents",
    name: "Documents",
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
    id: "other",
    name: "Other",
    source: "system"
  }
];

const TYPE_RULES = [
  {
    type: "certificate",
    label: "certificate",
    minScore: 7,
    terms: [
      ["certificate of completion", 10],
      ["certificate", 8],
      ["certification", 6],
      ["awarded", 4],
      ["participation", 4],
      ["verify certificate", 5],
      ["certificate id", 6]
    ]
  },
  {
    type: "academic-record",
    label: "academic record",
    minScore: 8,
    terms: [
      ["marksheet", 10],
      ["mark sheet", 10],
      ["result", 6],
      ["toppers", 8],
      ["subject toppers", 10],
      ["application form", 8],
      ["admission", 5],
      ["counselling", 5],
      ["roll no", 5],
      ["student id", 4],
      ["marks obtained", 6],
      ["guardian", 3]
    ]
  },
  {
    type: "assignment",
    label: "assignment",
    minScore: 6,
    terms: [
      ["assignment", 10],
      ["homework", 8],
      ["submit", 4],
      ["submission", 4],
      ["deadline", 5],
      ["rubric", 5]
    ]
  },
  {
    type: "lab-manual",
    label: "lab manual",
    minScore: 7,
    terms: [
      ["lab manual", 10],
      ["laboratory manual", 10],
      ["experiment", 6],
      ["experiment no", 8],
      ["practical", 5],
      ["procedure", 3],
      ["observation", 3]
    ]
  },
  {
    type: "exam-paper",
    label: "exam paper",
    minScore: 7,
    terms: [
      ["question paper", 10],
      ["paper code", 8],
      ["paper", 5],
      ["pyq", 9],
      ["pyqs", 9],
      ["previous year", 6],
      ["solutions", 6],
      ["exam", 5],
      ["examination", 6],
      ["semester", 5],
      ["maximum marks", 7],
      ["attempt any", 6],
      ["section", 2]
    ]
  },
  {
    type: "career",
    label: "career/interview",
    minScore: 7,
    terms: [
      ["interview questions", 10],
      ["interview", 7],
      ["resume", 7],
      ["assessment center", 8],
      ["assessmentcenterreport", 10],
      ["candidate", 4],
      ["job", 4],
      ["communication skills", 4]
    ]
  },
  {
    type: "medical",
    label: "medical",
    minScore: 7,
    terms: [
      ["patient", 8],
      ["prescription", 9],
      ["medicine", 6],
      ["tablet", 5],
      ["dosage", 6],
      ["laboratory test report", 8],
      ["hemoglobin", 7],
      ["leucocyte", 7]
    ]
  },
  {
    type: "code-project",
    label: "code/project",
    minScore: 6,
    terms: [
      ["#include", 10],
      ["public static void", 10],
      ["doctype html", 8],
      ["android", 6],
      ["gradle", 7],
      ["junit", 6],
      ["source code", 8],
      ["function", 3],
      ["class", 2],
      ["import", 2]
    ]
  },
  {
    type: "notes-book",
    label: "notes/book",
    minScore: 7,
    terms: [
      ["notes", 9],
      ["chapter", 7],
      ["unit", 4],
      ["lecture", 7],
      ["book", 6],
      ["grammar", 6],
      ["definition", 4],
      ["advantages", 3],
      ["features", 3],
      ["cbseguide", 7]
    ]
  }
];

const SUBJECT_RULES = [
  {
    subject: "jee",
    label: "JEE",
    terms: [
      ["jee", 10],
      ["iit", 5],
      ["nta", 5],
      ["xii pass", 6],
      ["xii", 3]
    ]
  },
  {
    subject: "python",
    label: "Python",
    terms: [
      ["python", 10],
      ["list", 2],
      ["tuple", 3],
      ["dictionary", 3]
    ]
  },
  {
    subject: "android",
    label: "Android",
    terms: [
      ["android", 10],
      ["kotlin", 8],
      ["gradle", 7],
      ["junit", 5],
      ["resizer", 4]
    ]
  },
  {
    subject: "web",
    label: "Web",
    terms: [
      ["html", 8],
      ["css", 8],
      ["javascript", 7],
      ["frontend", 8],
      ["react", 7]
    ]
  },
  {
    subject: "algorithms",
    label: "Algorithms/DSA",
    terms: [
      ["algorithm", 8],
      ["data structure", 8],
      ["dsa", 9],
      ["leetcode", 8],
      ["postfix", 7],
      ["stack", 5],
      ["queue", 4],
      ["tree", 4],
      ["graph", 4]
    ]
  },
  {
    subject: "operating-systems",
    label: "Operating Systems",
    terms: [
      ["operating system", 10],
      ["deadlock", 8],
      ["banker algorithm", 8],
      ["paging", 6],
      ["semaphore", 6],
      ["process scheduling", 7]
    ]
  },
  {
    subject: "theory-of-computation",
    label: "Theory of Computation",
    terms: [
      ["turing machine", 10],
      ["turing", 6],
      ["automata", 8],
      ["finite control", 8],
      ["grammar", 5],
      ["regular language", 6],
      ["read write head", 8]
    ]
  },
  {
    subject: "computer-organization",
    label: "Computer Organization",
    terms: [
      ["computer organization", 10],
      ["coa", 9],
      ["architecture", 5],
      ["microprocessor", 7],
      ["cpu", 5],
      ["memory hierarchy", 6]
    ]
  },
  {
    subject: "mathematics",
    label: "Mathematics",
    terms: [
      ["mathematics", 9],
      ["maths", 9],
      ["calculus", 7],
      ["statistics", 8],
      ["differential", 6],
      ["integral", 6],
      ["bas102", 7],
      ["bas 102", 7],
      ["bas202", 7],
      ["bas 202", 7],
      ["bas403", 7],
      ["bas 403", 7]
    ]
  },
  {
    subject: "physical-education",
    label: "Physical Education",
    terms: [
      ["physical education", 10],
      ["sports", 7],
      ["yoga", 7],
      ["asana", 7],
      ["tournament", 6],
      ["cbseguide", 5]
    ]
  },
  {
    subject: "english",
    label: "English",
    terms: [
      ["english", 9],
      ["grammar", 8],
      ["noun", 5],
      ["verb", 5],
      ["sentence", 5]
    ]
  },
  {
    subject: "engineering",
    label: "Engineering",
    terms: [
      ["engineering", 6],
      ["sensor", 7],
      ["instrumentation", 7],
      ["mechatronics", 7],
      ["mechanical", 5],
      ["electronics", 5],
      ["bme101", 8],
      ["bve301", 8],
      ["bve 301", 8]
    ]
  },
  {
    subject: "computer-science",
    label: "Computer Science",
    terms: [
      ["computer science", 8],
      ["bcs", 7],
      ["bcs303", 8],
      ["bcs 303", 8],
      ["bcs402", 8],
      ["bcs 402", 8],
      ["programming", 5],
      ["database", 5]
    ]
  },
  {
    subject: "admissions",
    label: "Admissions",
    terms: [
      ["admission", 8],
      ["application form", 8],
      ["uptac", 8],
      ["counselling", 7],
      ["seat", 4]
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
    ".tsx",
    ".xml"
  ]);

const SUBJECT_FOLDER_IDS = {
  "exam-paper": {
    jee: "exam-papers-jee",
    "computer-science": "exam-papers-computer-science",
    algorithms: "exam-papers-computer-science",
    "operating-systems": "exam-papers-computer-science",
    "theory-of-computation": "exam-papers-computer-science",
    "computer-organization": "exam-papers-computer-science",
    mathematics: "exam-papers-mathematics",
    "physical-education": "exam-papers-physical-education",
    engineering: "exam-papers-engineering"
  },
  assignment: {
    python: "assignments-python",
    "computer-science": "assignments-computer-science",
    algorithms: "assignments-computer-science",
    "operating-systems": "assignments-computer-science",
    "theory-of-computation": "assignments-computer-science",
    "computer-organization": "assignments-computer-science",
    mathematics: "assignments-mathematics",
    engineering: "assignments-engineering",
    jee: "assignments-other"
  },
  "lab-manual": {
    "computer-organization": "lab-manuals-computer-organization",
    "computer-science": "lab-manuals-computer-science",
    algorithms: "lab-manuals-computer-science",
    python: "lab-manuals-computer-science",
    android: "lab-manuals-computer-science",
    engineering: "lab-manuals-engineering"
  },
  "notes-book": {
    "theory-of-computation": "notes-theory-of-computation",
    "computer-organization": "notes-computer-organization",
    "computer-science": "notes-computer-science",
    algorithms: "notes-computer-science",
    "operating-systems": "notes-computer-science",
    python: "notes-computer-science",
    mathematics: "notes-mathematics",
    "physical-education": "notes-physical-education",
    english: "notes-english",
    engineering: "notes-engineering",
    jee: "notes-other"
  },
  "code-project": {
    android: "code-android",
    web: "code-web",
    python: "code-programming",
    "computer-science": "code-programming",
    algorithms: "code-programming"
  }
};

const TYPE_DEFAULT_FOLDER = {
  "exam-paper": "exam-papers-university",
  assignment: "assignments-other",
  "lab-manual": "lab-manuals-other",
  "notes-book": "notes-other",
  certificate: "certificates",
  "academic-record": "academic-records",
  career: "career-interview",
  medical: "medical",
  "code-project": "code-projects"
};

const RECORD_SUBFOLDER_TERMS = [
  {
    folderId: "academic-records-marksheets",
    terms: [
      "marksheet",
      "mark sheet",
      "result",
      "marks obtained",
      "internal marks",
      "consolidated internal marks"
    ]
  },
  {
    folderId: "academic-records-applications",
    terms: [
      "application form",
      "applicationform",
      "admission",
      "uptac",
      "counselling"
    ]
  },
  {
    folderId: "academic-records-toppers",
    terms: [
      "toppers",
      "subject toppers",
      "rank"
    ]
  }
];

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

function collectFilenameText(document) {
  return [
    document?.fileName,
    document?.filePath
  ]
    .filter(Boolean)
    .join(" ");
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
    /^[a-z]+\s*\d+$/i.test(term)
  ) {
    return compact.includes(
      normalizedTerm.replace(/\s+/g, "")
    );
  }

  return false;
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

function scoreRule(rule, source, filenameSource) {
  let score = 0;
  const matched = [];
  const normalized =
    normalizeText(
      source
    );
  const compact =
    compactText(
      source
    );
  const filenameNormalized =
    normalizeText(
      filenameSource
    );
  const filenameCompact =
    compactText(
      filenameSource
    );

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
        filenameNormalized,
        filenameCompact,
        termValue.text
      )
    ) {
      score +=
        termValue.weight * 1.8;
      matched.push(
        termValue.text
      );
      continue;
    }

    if (
      hasTerm(
        normalized,
        compact,
        termValue.text
      )
    ) {
      score +=
        termValue.weight;
      matched.push(
        termValue.text
      );
    }
  }

  return {
    score,
    matched
  };
}

function detectBest(rules, sourceText, filenameText) {
  const ranked =
    rules
      .map(rule => ({
        ...rule,
        ...scoreRule(
          rule,
          sourceText,
          filenameText
        )
      }))
      .filter(result =>
        result.score >=
        (result.minScore || 1)
      )
      .sort(
        (a, b) =>
          b.score - a.score
      );

  return {
    best:
      ranked[0] || null,
    ranked
  };
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

function unique(values) {
  return [
    ...new Set(
      values.filter(Boolean)
    )
  ];
}

function chooseAcademicRecordFolder(sourceText) {
  const normalized =
    normalizeText(
      sourceText
    );
  const compact =
    compactText(
      sourceText
    );

  for (
    const option
    of RECORD_SUBFOLDER_TERMS
  ) {
    if (
      option.terms.some(term =>
        hasTerm(
          normalized,
          compact,
          term
        )
      )
    ) {
      return option.folderId;
    }
  }

  return "academic-records";
}

function getPrimaryFolderFor(type, subject, sourceText) {
  if (
    type === "academic-record"
  ) {
    return chooseAcademicRecordFolder(
      sourceText
    );
  }

  const subjectFolder =
    SUBJECT_FOLDER_IDS[type]?.[subject];

  return subjectFolder ||
    TYPE_DEFAULT_FOLDER[type] ||
    "other";
}

function normalizeFolderKeywordOverrides(overrides) {
  if (
    !overrides
  ) {
    return [];
  }

  const list =
    Array.isArray(overrides)
      ? overrides
      : Object.values(overrides).flat();

  return list
    .map(item => ({
      folderId:
        item.folderId ||
        item.folder_id,
      keyword:
        normalizeText(
          item.keyword
        ),
      role:
        item.role || "positive",
      weight:
        Number(item.weight || 1)
    }))
    .filter(item =>
      item.folderId &&
      item.keyword &&
      [
        "positive",
        "negative",
        "ignored"
      ].includes(item.role)
    );
}

function applyFolderKeywordOverrides(scores, overrides, sourceText) {
  const normalized =
    normalizeText(
      sourceText
    );
  const compact =
    compactText(
      sourceText
    );

  for (
    const override
    of normalizeFolderKeywordOverrides(
      overrides
    )
  ) {
    if (
      !hasTerm(
        normalized,
        compact,
        override.keyword
      )
    ) {
      continue;
    }

    const weight =
      Math.max(
        0.5,
        Math.min(
          3,
          override.weight
        )
      );

    if (
      override.role === "positive"
    ) {
      addScore(
        scores,
        override.folderId,
        12 * weight,
        `user positive keyword: ${override.keyword}`
      );
    } else if (
      override.role === "negative"
    ) {
      addScore(
        scores,
        override.folderId,
        -14 * weight,
        `user negative keyword: ${override.keyword}`
      );
    }
  }
}

function getConfidence(topScore, secondScore, document) {
  if (topScore <= 0) {
    return 0.2;
  }

  let confidence =
    0.38 +
    Math.min(
      topScore,
      32
    ) / 48;

  if (
    secondScore > 0
  ) {
    confidence -=
      Math.min(
        0.2,
        secondScore /
          (topScore + secondScore) *
          0.28
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

function isReviewNeeded(document, confidence, topScore, type) {
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
    type === "unknown" ||
    confidence < 0.55 ||
    topScore < 7 ||
    (
      textQuality < 35 &&
      topScore < 18
    ) ||
    (
      wordCount > 0 &&
      wordCount < 10 &&
      topScore < 12
    )
  );
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

export function suggestOrganization(document = {}, options = {}) {
  const scores =
    new Map();
  const sourceText =
    collectDocumentText(
      document
    );
  const filenameText =
    collectFilenameText(
      document
    );
  const extension =
    getExtension(
      document.filePath ||
      document.fileName
    );
  const typeResult =
    detectBest(
      TYPE_RULES,
      sourceText,
      filenameText
    );
  const subjectResult =
    detectBest(
      SUBJECT_RULES,
      sourceText,
      filenameText
    );
  const type =
    typeResult.best?.type ||
    (
      CODE_EXTENSIONS.has(extension)
        ? "code-project"
        : "unknown"
    );
  const subject =
    subjectResult.best?.subject ||
    "general";
  const primaryCandidateFolderId =
    getPrimaryFolderFor(
      type,
      subject,
      sourceText
    );
  const typeScore =
    typeResult.best?.score ||
    (
      type === "code-project"
        ? 8
        : 0
    );
  const subjectScore =
    subjectResult.best?.score || 0;
  const primaryScore =
    typeScore +
    Math.min(
      subjectScore,
      14
    );

  if (
    primaryCandidateFolderId !== "other" &&
    primaryScore > 0
  ) {
    addScore(
      scores,
      primaryCandidateFolderId,
      primaryScore,
      `${typeResult.best?.label || "file type"}${subjectResult.best ? ` + ${subjectResult.best.label}` : ""}`
    );
  }

  for (
    const candidate
    of typeResult.ranked.slice(1, 4)
  ) {
    const folderId =
      getPrimaryFolderFor(
        candidate.type,
        subject,
        sourceText
      );

    addScore(
      scores,
      folderId,
      candidate.score * 0.65,
      `secondary type signal: ${candidate.label}`
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
      Resume: "career-interview",
      Technical: "code-projects"
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

  if (
    CODE_EXTENSIONS.has(extension)
  ) {
    addScore(
      scores,
      getPrimaryFolderFor(
        "code-project",
        subject,
        sourceText
      ),
      7,
      "source code file extension"
    );
  } else if (
    FILE_TYPE_FOLDERS[extension] &&
    scores.size === 0
  ) {
    addScore(
      scores,
      FILE_TYPE_FOLDERS[extension],
      1.5,
      `${extension} file type`
    );
  }

  applyFolderKeywordOverrides(
    scores,
    options.folderKeywordOverrides,
    sourceText
  );

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
      top.score,
      type
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
        item.score >= 7
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
    documentType:
      type,
    subject,
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
    organization.documentType,
    organization.subject,
    ...(organization.secondaryFolderPaths || []),
    ...(organization.folderIds || [])
      .map(folderId =>
        getVirtualFolderById(folderId)?.path
      )
  ]
    .filter(Boolean)
    .join(" ");
}
