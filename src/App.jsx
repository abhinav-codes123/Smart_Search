import {
  useRef,
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";
import { classifyDocument } from "./utils/classifier";
import { extractMetadata } from "./utils/extractMetadata";
import {
  generateKeywordTags,
  generateTitleTags
} from "./utils/tagGenerator";
import {
  VIRTUAL_FOLDER_TREE,
  flattenVirtualFolders,
  getDocumentFolderIds,
  suggestOrganization
} from "./utils/organizer";
import "./App.css";

const SEARCH_VISIBLE_RESULTS = 30;
const APP_VERSION = "1.0.0";
const FOLDER_KEYWORD_ROLE_OPTIONS = [
  {
    value: "positive",
    label: "Important"
  },
  {
    value: "negative",
    label: "Unrelated"
  },
  {
    value: "ignored",
    label: "Ignore"
  }
];
const FOLDER_KEYWORD_GROUPS = [
  {
    role: "positive",
    title: "Important",
    empty: "No important keywords."
  },
  {
    role: "negative",
    title: "Unrelated",
    empty: "No unrelated keywords."
  },
  {
    role: "ignored",
    title: "Ignored",
    empty: "No ignored keywords."
  }
];

const imageDataCache =
  new Map();

const previewDocuments = [
  {
    documentId: "preview-jee-paper",
    fileName: "2024-JEE Main - 4_XIIth Pass_Paper.pdf",
    filePath: "/Users/mac/Documents/Exam Papers/2024-JEE Main - 4_XIIth Pass_Paper.pdf",
    keywordTags: [
      "jee",
      "question paper",
      "marks",
      "physics"
    ],
    titleTags: [
      "JEE Main Paper"
    ],
    category: "Unknown",
    cleanText: "JEE Main question paper maximum marks section paper code",
    textQuality: 96,
    cleanWordCount: 840,
    totalPages: 24,
    indexedPages: 3,
    status: "done",
    semanticEmbedding: {
      hasVector: true
    },
    updatedAt: "2026-07-14T10:00:00.000Z"
  },
  {
    documentId: "preview-assignment",
    fileName: "Assignment-1(BCS 402).pdf",
    filePath: "/Users/mac/Documents/Semester/Assignment-1(BCS 402).pdf",
    keywordTags: [
      "assignment",
      "bcs402",
      "computer science"
    ],
    titleTags: [
      "BCS402 Assignment"
    ],
    category: "Unknown",
    cleanText: "assignment BCS 402 computer science submit practical questions",
    textQuality: 91,
    cleanWordCount: 360,
    totalPages: 4,
    indexedPages: 4,
    status: "done",
    semanticEmbedding: {
      hasVector: true
    },
    updatedAt: "2026-07-14T09:50:00.000Z"
  },
  {
    documentId: "preview-android",
    fileName: "AndroidManifest.xml",
    filePath: "/Users/mac/Projects/App/AndroidManifest.xml",
    keywordTags: [
      "android",
      "manifest",
      "gradle"
    ],
    titleTags: [
      "Android Project"
    ],
    category: "Technical",
    cleanText: "android gradle manifest application activity kotlin",
    textQuality: 98,
    cleanWordCount: 120,
    status: "done",
    semanticEmbedding: {
      hasVector: true
    },
    updatedAt: "2026-07-14T09:40:00.000Z"
  },
  {
    documentId: "preview-notes",
    fileName: "12_physical_education_ch_3_yoga_lifestyle.pdf",
    filePath: "/Users/mac/Documents/Notes/12_physical_education_ch_3_yoga_lifestyle.pdf",
    keywordTags: [
      "physical education",
      "yoga",
      "sports"
    ],
    titleTags: [
      "Yoga Lifestyle"
    ],
    category: "Unknown",
    cleanText: "physical education chapter yoga lifestyle sports asana cbseguide notes",
    textQuality: 94,
    cleanWordCount: 1260,
    totalPages: 12,
    indexedPages: 3,
    status: "done",
    semanticEmbedding: {
      hasVector: true
    },
    updatedAt: "2026-07-14T09:30:00.000Z"
  },
  {
    documentId: "preview-review",
    fileName: "scanned_handwritten_page.pdf",
    filePath: "/Users/mac/Documents/Mixed/scanned_handwritten_page.pdf",
    keywordTags: [
      "page",
      "notes"
    ],
    titleTags: [],
    category: "Unknown",
    cleanText: "partial handwritten OCR page notes unclear",
    textQuality: 42,
    cleanWordCount: 78,
    totalPages: 1,
    indexedPages: 1,
    status: "done",
    semanticEmbedding: {
      hasVector: true
    },
    updatedAt: "2026-07-14T09:20:00.000Z"
  }
];

const fallbackElectronAPI = {
  onSmartSearchLog: () => () => {},
  selectFolder: async () => ({
    files: []
  }),
  selectFiles: async () => [],
  getImageData: async () => null,
  getFilePreviewData: async () => null,
  extractDocumentText: async () => ({
    success: false,
    error: "Electron preview mode"
  }),
  saveDocument: async document => document,
  getDocuments: async () =>
    previewDocuments.map(
      hydrateDocument
    ),
  getDocumentDetail: async documentId =>
    previewDocuments
      .map(
        hydrateDocument
      )
      .find(document =>
        document.documentId === documentId
      ) || null,
  searchDocuments: async query => {
    const lower =
      String(query || "")
        .toLowerCase();

    return previewDocuments.map(
      hydrateDocument
    ).filter(document =>
      [
        document.fileName,
        document.cleanText,
        document.organization?.primaryFolderPath,
        ...(document.keywordTags || [])
      ]
        .join(" ")
        .toLowerCase()
        .includes(lower)
    );
  },
  searchDocumentsPlanB: async query =>
    fallbackElectronAPI.searchDocuments(
      query
    ),
  getFolderKeywords: async () => [
    {
      folderId: "exam-papers-jee",
      keyword: "jee",
      role: "positive"
    },
    {
      folderId: "exam-papers-jee",
      keyword: "admission",
      role: "negative"
    },
    {
      folderId: "exam-papers-jee",
      keyword: "student",
      role: "ignored"
    }
  ],
  saveFolderKeyword: async payload => ({
    success: true,
    overrides: [
      payload
    ],
    refreshed: {
      documents: 0
    }
  }),
  deleteFolderKeyword: async () => ({
    success: true,
    overrides: [],
    refreshed: {
      documents: 0
    }
  }),
  getOcrQueueStatus: async () => ({
    pending: 0,
    processing: 0,
    done: 5,
    failed: 0
  }),
  openFile: async () => true,
  revealFile: async () => true
};

if (
  typeof window !== "undefined" &&
  !window.electronAPI
) {
  window.electronAPI =
    fallbackElectronAPI;
}

function getExtension(filePath = "") {
  const match =
    filePath
      .toLowerCase()
      .match(/\.[^.]+$/);

  return match?.[0] || "";
}

function getFileType(filePath = "") {
  const extension =
    getExtension(filePath);

  if (extension === ".pdf")
    return "pdf";

  if (
    [
      ".png",
      ".jpg",
      ".jpeg",
      ".webp",
      ".bmp",
      ".gif",
      ".tif",
      ".tiff"
    ].includes(extension)
  )
    return "image";

  if (
    [
      ".doc",
      ".docx",
      ".pptx",
      ".xlsx",
      ".odt",
      ".odp",
      ".ods"
    ].includes(extension)
  )
    return "office";

  if (
    [
      ".js",
      ".jsx",
      ".ts",
      ".tsx",
      ".py",
      ".java",
      ".c",
      ".cpp",
      ".h",
      ".hpp",
      ".cs",
      ".go",
      ".rs",
      ".php",
      ".rb",
      ".swift",
      ".kt",
      ".sql",
      ".css",
      ".html"
    ].includes(extension)
  )
    return "code";

  return "text";
}

function getQualityLabel(doc) {
  const quality =
    Number(doc?.textQuality ?? 0);

  if (
    doc?.status === "indexing"
  )
    return "Partial";

  if (quality >= 85)
    return "Good";

  if (quality >= 65)
    return "Review";

  return "Low OCR";
}

function getQualityClass(doc) {
  const label =
    getQualityLabel(doc);

  return label
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function getConfidenceLabel(organization) {
  const confidence =
    Number(organization?.confidence || 0);

  if (
    organization?.needsReview ||
    confidence < 0.55
  ) {
    return "Needs review";
  }

  if (confidence >= 0.8) {
    return "High confidence";
  }

  return "Medium confidence";
}

function getConfidenceClass(organization) {
  const label =
    getConfidenceLabel(
      organization
    );

  return label
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function getOrganizationReason(document) {
  const organization =
    getOrganization(
      document
    );

  return (
    organization?.reason || []
  )
    .slice(0, 2)
    .join("; ") ||
    "content and filename signals";
}

function formatUpdatedAt(value) {
  if (!value) {
    return "Unknown";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat(
    undefined,
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }
  ).format(date);
}

function getConfidencePercent(organization) {
  return Math.round(
    Number(
      organization?.confidence || 0
    ) * 100
  );
}

function getTypeLabel(organization, document) {
  return organization?.documentType ||
    getFileType(
      document?.filePath || ""
    );
}

function getQueueTotal(queueStatus) {
  return Object.values(
    queueStatus || {}
  ).reduce(
    (sum, value) =>
      sum + Number(value || 0),
    0
  );
}

function compactPath(filePath = "") {
  const parts =
    filePath.split("/");

  if (parts.length <= 4)
    return filePath;

  return [
    parts[0],
    "...",
    ...parts.slice(-3)
  ].join("/");
}

function hydrateDocument(document) {
  if (!document) {
    return document;
  }

  return {
    ...document,
    organization:
      document.organization ||
      suggestOrganization(
        document
      )
  };
}

function getOrganization(document) {
  return document?.organization ||
    suggestOrganization(
      document || {}
    );
}

function buildDocumentFromExtraction(file, result) {
  const text =
    result.text || "";
  const cleanText =
    result.cleanText ||
    text;
  const document = {
    documentId:
      result.documentId,
    fileHash:
      result.fileHash,
    filePath:
      file.path,
    fileName:
      file.name,
    titleTags:
      generateTitleTags(
        cleanText
      ),
    keywordTags:
      generateKeywordTags(
        cleanText
      ),
    category:
      classifyDocument(
        cleanText
      ),
    metadata:
      extractMetadata(
        cleanText
      ),
    text,
    cleanText,
    textQuality:
      result.textQuality,
    rawWordCount:
      result.rawWordCount,
    cleanWordCount:
      result.cleanWordCount,
    noiseRatio:
      result.noiseRatio,
    pages:
      result.pages || [],
    jobs:
      result.jobs || [],
    totalPages:
      result.totalPages ?? null,
    status:
      result.status || "done",
    duplicate:
      Boolean(result.duplicate),
    scannedAt:
      new Date().toISOString()
  };

  return hydrateDocument(
    document
  );
}

function FilePreviewImage({ path }) {
  const [
    previewSrc,
    setPreviewSrc
  ] = useState(() =>
    imageDataCache.get(path) ?? null
  );
  const [
    isVisible,
    setIsVisible
  ] = useState(false);
  const ref =
    useRef(null);

  useEffect(() => {
    const element =
      ref.current;

    if (!element) {
      return undefined;
    }

    if (!("IntersectionObserver" in window)) {
      queueMicrotask(() =>
        setIsVisible(true)
      );
      return undefined;
    }

    const observer =
      new IntersectionObserver(
        entries => {
          if (
            entries.some(entry =>
              entry.isIntersecting
            )
          ) {
            setIsVisible(true);
            observer.disconnect();
          }
        },
        {
          rootMargin:
            "180px"
        }
      );

    observer.observe(
      element
    );

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!isVisible) {
      return undefined;
    }

    const cached =
      imageDataCache.get(path);

    if (cached !== undefined) {
      return undefined;
    }

    let cancelled = false;

    async function load() {
      let data = null;

      if (
        window
          .electronAPI
          .getFilePreviewData
      ) {
        data =
          await window
            .electronAPI
            .getFilePreviewData(
              path
            );
      }

      if (!data) {
        data =
          await window
            .electronAPI
            .getImageData(path);
      }

      imageDataCache.set(
        path,
        data
      );

      if (!cancelled) {
        setPreviewSrc(data);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [
    isVisible,
    path
  ]);

  if (!previewSrc) {
    return (
      <div
        className="thumb-placeholder"
        ref={ref}
      >
        {getFileType(path).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      ref={ref}
      src={previewSrc}
      alt=""
    />
  );
}

function FileThumb({
  doc,
  loadPreview = false
}) {
  const type =
    getFileType(doc.filePath);

  if (
    loadPreview &&
    [
      "image",
      "pdf"
    ].includes(type)
  ) {
    return (
      <FilePreviewImage
        path={doc.filePath}
      />
    );
  }

  return (
    <div className={`file-icon type-${type}`}>
      {type.toUpperCase()}
    </div>
  );
}

function FolderTree({
  folders,
  selectedFolderId,
  counts,
  onSelect
}) {
  return (
    <div className="folder-tree">
      {
        folders.map(folder => (
          <div
            key={folder.id}
            className="folder-node"
          >
            <button
              className={`folder-button ${selectedFolderId === folder.id ? "active" : ""}`}
              onClick={() =>
                onSelect(folder.id)
              }
            >
              <span>
                {folder.name}
              </span>
              <strong>
                {counts[folder.id] || 0}
              </strong>
            </button>

            {
              folder.children?.length > 0 && (
                <FolderTree
                  folders={folder.children}
                  selectedFolderId={selectedFolderId}
                  counts={counts}
                  onSelect={onSelect}
                />
              )
            }
          </div>
        ))
      }
    </div>
  );
}

function App() {
  const [
    documents,
    setDocuments
  ] = useState([]);
  const [
    results,
    setResults
  ] = useState([]);
  const [
    query,
    setQuery
  ] = useState("");
  const [
    viewMode,
    setViewMode
  ] = useState("compact");
  const [
    sidebarOpen,
    setSidebarOpen
  ] = useState(true);
  const [
    selectedFolderId,
    setSelectedFolderId
  ] = useState("all-files");
  const [
    selectedDoc,
    setSelectedDoc
  ] = useState(null);
  const [
    detailLoading,
    setDetailLoading
  ] = useState(false);
  const [
    uploadProgress,
    setUploadProgress
  ] = useState(0);
  const [
    isProcessing,
    setIsProcessing
  ] = useState(false);
  const [
    isRefreshing,
    setIsRefreshing
  ] = useState(false);
  const [
    activity,
    setActivity
  ] = useState([]);
  const [
    currentTask,
    setCurrentTask
  ] = useState("Idle");
  const [
    queueStatus,
    setQueueStatus
  ] = useState({});
  const [
    searchMode,
    setSearchMode
  ] = useState("fast");
  const [
    folderKeywords,
    setFolderKeywords
  ] = useState([]);
  const [
    folderKeywordInput,
    setFolderKeywordInput
  ] = useState("");
  const [
    folderKeywordRole,
    setFolderKeywordRole
  ] = useState("positive");
  const [
    folderKeywordSaving,
    setFolderKeywordSaving
  ] = useState(false);

  const virtualFolders =
    useMemo(
      () =>
        flattenVirtualFolders(
          VIRTUAL_FOLDER_TREE
        ),
      []
    );
  const selectedFolder =
    useMemo(
      () =>
        virtualFolders.find(folder =>
          folder.id === selectedFolderId
        ),
      [
        virtualFolders,
        selectedFolderId
      ]
    );
  const folderCounts =
    useMemo(
      () => {
        const counts = {
          "all-files":
            documents.length
        };

        for (
          const document
          of documents
        ) {
          for (
            const folderId
            of getDocumentFolderIds(document)
          ) {
            if (folderId === "all-files") {
              continue;
            }

            counts[folderId] =
              (counts[folderId] || 0) + 1;
          }
        }

        return counts;
      },
      [documents]
    );

  const visibleResults =
    useMemo(
      () => {
        const filtered =
          results.filter(doc => {
          if (
            selectedFolderId !== "all-files" &&
            !getDocumentFolderIds(doc)
              .includes(selectedFolderId)
          )
            return false;

          return true;
        });

        return [...filtered].sort((a, b) => {
          return new Date(b.updatedAt || b.scannedAt || 0).getTime() -
            new Date(a.updatedAt || a.scannedAt || 0).getTime();
        });
      },
      [
        results,
        selectedFolderId
      ]
    );
  const displayedResults =
    useMemo(
      () =>
        query.trim()
          ? visibleResults.slice(
              0,
              SEARCH_VISIBLE_RESULTS
            )
          : visibleResults,
      [
        visibleResults,
        query
      ]
    );
  const dashboardStats =
    useMemo(
      () => {
        const reviewCount =
          documents.filter(doc =>
            getOrganization(doc)
              ?.needsReview
          ).length;
        const indexedPages =
          documents.reduce(
            (sum, doc) =>
              sum +
              Number(
                doc.indexedPages ||
                doc.pages?.length ||
                0
              ),
            0
          );
        const totalPages =
          documents.reduce(
            (sum, doc) =>
              sum +
              Number(
                doc.totalPages ||
                doc.indexedPages ||
                doc.pages?.length ||
                0
              ),
            0
          );
        const embeddings =
          documents.filter(doc =>
            doc.semanticEmbedding?.hasVector ||
            doc.semanticEmbedding?.vector?.length
          ).length;

        return [
          {
            label: "Files Indexed",
            value:
              documents.length
          },
          {
            label: "Pages Found",
            value:
              totalPages
          },
          {
            label: "Pages Indexed",
            value:
              indexedPages
          },
          {
            label: "Need Review",
            value:
              reviewCount
          },
          {
            label: "Embeddings Ready",
            value:
              embeddings
          }
        ];
      },
      [documents]
    );
  const groupedFolderKeywords =
    useMemo(
      () => ({
        positive:
          folderKeywords.filter(item =>
            item.role === "positive"
          ),
        negative:
          folderKeywords.filter(item =>
            item.role === "negative"
          ),
        ignored:
          folderKeywords.filter(item =>
            item.role === "ignored"
          )
      }),
      [folderKeywords]
    );

  function addActivity(event) {
    setActivity(prev => [
      {
        id:
          `${Date.now()}-${Math.random()}`,
        time:
          new Date().toLocaleTimeString(),
        ...event
      },
      ...prev
    ].slice(0, 60));
  }

  async function refreshDocuments() {
    const rawDocs =
      await window
        .electronAPI
        .getDocuments();
    const docs =
      rawDocs.map(
        hydrateDocument
      );

    setDocuments(docs);

    if (!query.trim()) {
      setResults(docs);
    }

    return docs;
  }

  async function handleManualRefresh() {
    if (isRefreshing) {
      return;
    }

    setIsRefreshing(true);
    setCurrentTask("Refreshing library");

    try {
      const docs =
        await refreshDocuments();

      await refreshQueue();

      addActivity({
        level: "info",
        title: "Library refreshed",
        detail:
          `${docs.length} file${docs.length === 1 ? "" : "s"} loaded`
      });
    } catch (error) {
      addActivity({
        level: "error",
        title: "Refresh failed",
        detail:
          error.message
      });
    } finally {
      setIsRefreshing(false);

      if (!isProcessing) {
        setCurrentTask("Idle");
      }
    }
  }

  const refreshQueue =
    useCallback(async () => {
    const status =
      await window
        .electronAPI
        .getOcrQueueStatus();

    setQueueStatus(status || {});
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadInitialState() {
      const [
        docs,
        status
      ] =
        await Promise.all([
          window.electronAPI.getDocuments(),
          window.electronAPI.getOcrQueueStatus()
        ]);

      if (cancelled) {
        return;
      }

      const hydratedDocs =
        docs.map(
          hydrateDocument
        );

      setDocuments(hydratedDocs);
      setResults(hydratedDocs);
      setQueueStatus(status || {});
    }

    loadInitialState();

    const interval =
      window.setInterval(
        refreshQueue,
        3000
      );

    const unsubscribe =
      window
        .electronAPI
        .onSmartSearchLog?.(entry => {
          if (
            [
              "document.extract.skipped-duplicate",
              "database.document.duplicate-hit",
              "document.extract.failed",
              "planb.enrich.start",
              "planb.enrich.completed",
              "planb.enrich.failed",
              "planb.search.start",
              "planb.search.completed",
              "planb.search.failed",
              "database.job.queued",
              "ocr.job.failed",
              "ocr.job.completed"
            ].includes(entry.event)
          ) {
            addActivity({
              level:
                entry.level,
              title:
                entry.event,
              detail:
                entry.details?.filePath ||
                entry.details?.documentId ||
                entry.details?.query ||
                entry.details?.error ||
                ""
            });
          }
        });

    return () => {
      cancelled = true;
      window.clearInterval(interval);

      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [refreshQueue]);

  useEffect(() => {
    let cancelled = false;

    async function loadFolderKeywords() {
      if (
        !selectedFolderId ||
        selectedFolderId === "all-files"
      ) {
        setFolderKeywords([]);
        return;
      }

      const keywords =
        await window
          .electronAPI
          .getFolderKeywords?.(
            selectedFolderId
          );

      if (!cancelled) {
        setFolderKeywords(
          keywords || []
        );
      }
    }

    loadFolderKeywords();

    return () => {
      cancelled = true;
    };
  }, [selectedFolderId]);

  async function handleSaveFolderKeyword(event) {
    event.preventDefault();

    const keyword =
      folderKeywordInput.trim();

    if (
      !keyword ||
      !selectedFolder ||
      selectedFolder.id === "all-files"
    ) {
      return;
    }

    setFolderKeywordSaving(true);

    try {
      const result =
        await window
          .electronAPI
          .saveFolderKeyword?.({
            folderId:
              selectedFolder.id,
            keyword,
            role:
              folderKeywordRole,
            weight: 1
          });

      if (result?.success === false) {
        addActivity({
          level: "error",
          title: "Folder keyword failed",
          detail:
            result.error || keyword
        });
        return;
      }

      setFolderKeywordInput("");
      setFolderKeywords(
        result?.overrides || []
      );
      await refreshDocuments();
      addActivity({
        level: "info",
        title: "Folder keyword saved",
        detail:
          `${selectedFolder.name}: ${keyword}`
      });
    } finally {
      setFolderKeywordSaving(false);
    }
  }

  async function handleDeleteFolderKeyword(keyword) {
    if (
      !selectedFolder ||
      selectedFolder.id === "all-files"
    ) {
      return;
    }

    setFolderKeywordSaving(true);

    try {
      const result =
        await window
          .electronAPI
          .deleteFolderKeyword?.(
            selectedFolder.id,
            keyword
          );

      if (result?.success === false) {
        addActivity({
          level: "error",
          title: "Folder keyword delete failed",
          detail:
            result.error || keyword
        });
        return;
      }

      setFolderKeywords(
        result?.overrides || []
      );
      await refreshDocuments();
      addActivity({
        level: "info",
        title: "Folder keyword removed",
        detail:
          `${selectedFolder.name}: ${keyword}`
      });
    } finally {
      setFolderKeywordSaving(false);
    }
  }

  useEffect(() => {
    if (
      !selectedDoc?.documentId ||
      selectedDoc.text ||
      selectedDoc.cleanText ||
      selectedDoc.pages?.length
    ) {
      return undefined;
    }

    let cancelled = false;

    async function loadDetail() {
      setDetailLoading(true);

      try {
        const detail =
          await window
            .electronAPI
            .getDocumentDetail(
              selectedDoc.documentId
            );

        if (
          !cancelled &&
          detail
        ) {
          setSelectedDoc(current =>
            current?.documentId ===
              selectedDoc.documentId
              ? hydrateDocument({
                  ...current,
                  ...detail
                })
              : current
          );
        }
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    }

    loadDetail();

    return () => {
      cancelled = true;
    };
  }, [
    selectedDoc?.cleanText,
    selectedDoc?.documentId,
    selectedDoc?.pages?.length,
    selectedDoc?.text
  ]);

  async function processFiles(files) {
    if (!files.length)
      return;

    setIsProcessing(true);
    setUploadProgress(0);
    setCurrentTask("Preparing files");
    addActivity({
      level: "info",
      title: "Indexing started",
      detail: `${files.length} file${files.length === 1 ? "" : "s"} selected`
    });

    const processedDocs = [];

    for (let index = 0; index < files.length; index++) {
      const file =
        files[index];

      setCurrentTask(
        `Extracting ${file.name}`
      );
      addActivity({
        level: "info",
        title: "Extracting",
        detail:
          file.name
      });

      try {
        const result =
          await window
            .electronAPI
            .extractDocumentText(
              file.path
            );

        if (!result.success) {
          addActivity({
            level: "error",
            title: "Extraction failed",
            detail:
              `${file.name}: ${result.error}`
          });
          continue;
        }

        if (result.duplicate) {
          addActivity({
            level: "info",
            title: "Duplicate reused",
            detail:
              file.name
          });
        }

        const document =
          buildDocumentFromExtraction(
            file,
            result
          );

        setCurrentTask(
          `Saving ${file.name}`
        );

        const saved =
          await window
            .electronAPI
            .saveDocument(
              document
            );

        processedDocs.push(
          saved?.success === false
            ? document
            : saved?.document ||
              {
                ...document,
                ...(saved || {})
              }
        );

        if (saved?.planB?.status === "done") {
          addActivity({
            level: "info",
            title: "Plan B enriched",
            detail:
              `${file.name}: ${(saved.planB.keywords || []).slice(0, 3).join(", ")}`
          });
        } else if (saved?.planB?.status === "failed") {
          addActivity({
            level: "warn",
            title: "Plan B failed",
            detail:
              `${file.name}: ${saved.planB.error}`
          });
        }

        addActivity({
          level: "info",
          title:
            document.jobs.length > 0
              ? "Queued background pages"
              : "Indexed",
          detail:
            document.jobs.length > 0
              ? `${file.name}: ${document.jobs.length} page jobs`
              : file.name
        });
      } catch (error) {
        addActivity({
          level: "error",
          title: "Upload failed",
          detail:
            `${file.name}: ${error.message}`
        });
      } finally {
        setUploadProgress(
          Math.round(
            ((index + 1) / files.length) * 100
          )
        );
        await refreshQueue();
      }
    }

    setCurrentTask("Refreshing library");
    const docs =
      await refreshDocuments();
    setResults(
      query.trim()
        ? results
        : docs
    );
    setIsProcessing(false);
    setCurrentTask("Idle");
    addActivity({
      level: "info",
      title: "Indexing finished",
      detail:
        `${processedDocs.length} file${processedDocs.length === 1 ? "" : "s"} saved`
    });
  }

  async function handleFolderSelect() {
    const result =
      await window
        .electronAPI
        .selectFolder();

    await processFiles(
      result?.files || []
    );
  }

  async function handleFileSelect() {
    const files =
      await window
        .electronAPI
        .selectFiles();

    await processFiles(files || []);
  }

  async function runSearch(nextQuery = query) {
    const trimmed =
      nextQuery.trim();

    if (!trimmed) {
      const docs =
        await refreshDocuments();

      setResults(docs);
      return;
    }

    const docs =
      (
        await (
          searchMode === "planB" &&
          window.electronAPI.searchDocumentsPlanB
            ? window.electronAPI.searchDocumentsPlanB(
                trimmed
              )
            : window.electronAPI.searchDocuments(
                trimmed
              )
        )
      ).map(
        hydrateDocument
      );

    setResults(docs);
  }

  const queueTotal =
    getQueueTotal(queueStatus);

  const inspectedDoc =
    selectedDoc || null;
  const selectedText =
    inspectedDoc?.cleanText ||
    inspectedDoc?.text ||
    "";
  const selectedOrganization =
    inspectedDoc
      ? getOrganization(
          inspectedDoc
        )
      : null;

  return (
    <div className="app-shell">
      <section className="app-window">
        <header className="topbar">
          <div className="brand-block">
            <button
              className={`toolbar-icon ${sidebarOpen ? "active" : ""}`}
              type="button"
              aria-label={sidebarOpen ? "Hide smart folders" : "Show smart folders"}
              aria-expanded={sidebarOpen}
              onClick={() =>
                setSidebarOpen(current =>
                  !current
                )
              }
            >
              <span />
            </button>
            <div className="brand-mark" aria-hidden="true">
              SF
            </div>
            <h1>
              Smart File Organiser
            </h1>
          </div>

          <div className="toolbar-search">
            <input
              value={query}
              onChange={event =>
                setQuery(
                  event.target.value
                )
              }
              onKeyDown={event => {
                if (event.key === "Enter") {
                  runSearch();
                }
              }}
              placeholder="Search files by name, content, or keywords..."
              className="search-input"
            />
            <span>
              ⌘K
            </span>
          </div>

          <div className="upload-actions">
            <button
              className="btn btn-secondary upload-main"
              onClick={handleFileSelect}
              disabled={isProcessing}
            >
              Upload Files
            </button>
            <button
              className="btn btn-secondary upload-main"
              onClick={handleFolderSelect}
              disabled={isProcessing}
            >
              Folder
            </button>
          </div>

          <label className="semantic-toggle">
            <input
              type="checkbox"
              checked={searchMode === "planB"}
              onChange={event =>
                setSearchMode(
                  event.target.checked
                    ? "planB"
                    : "fast"
                )
              }
            />
            <span />
            Semantic Search
          </label>

          <div className="view-toggle toolbar-view-toggle">
            <button
              className={viewMode === "compact" ? "active" : ""}
              onClick={() =>
                setViewMode("compact")
              }
            >
              Compact
            </button>
            <button
              className={viewMode === "list" ? "active" : ""}
              onClick={() =>
                setViewMode("list")
              }
            >
              List
            </button>
          </div>
        </header>

        <section className="stats-strip">
          {
            dashboardStats.map(stat => (
              <div
                className="stat-item"
                key={stat.label}
              >
                <span className="stat-icon" aria-hidden="true" />
                <strong>
                  {stat.value}
                </strong>
                <small>
                  {stat.label}
                </small>
              </div>
            ))
          }
          <div className="stat-item processing-stat">
            <span className="stat-icon success" aria-hidden="true" />
            <strong>
              {isProcessing ? "Processing" : "All processing is on-device"}
            </strong>
            <small>
              Private · Fast · Secure
            </small>
          </div>
        </section>

      <main className={`layout ${sidebarOpen ? "" : "sidebar-collapsed"} ${inspectedDoc ? "" : "inspector-closed"}`}>
        <aside className="side-panel">
          <section className="panel-section">
            <div className="panel-heading">
              <h2>
                Indexing
              </h2>
              <span className={`status-dot ${isProcessing ? "active" : ""}`} />
            </div>

            <p className="task-text">
              {currentTask}
            </p>

            <div className="progress">
              <div
                className="progress-bar"
                style={{
                  width:
                    `${uploadProgress}%`
                }}
              />
            </div>

            <div className="progress-meta">
              <span>
                {uploadProgress}%
              </span>
              <span>
                {documents.length} indexed
              </span>
            </div>
          </section>

          <section className="panel-section">
            <div className="panel-heading">
              <h2>
                Background Queue
              </h2>
              <span>
                {queueTotal} jobs
              </span>
            </div>

            <div className="queue-grid">
              {
                [
                  "pending",
                  "processing",
                  "done",
                  "failed"
                ].map(status => (
                  <div
                    key={status}
                    className="queue-cell"
                  >
                    <strong>
                      {queueStatus[status] || 0}
                    </strong>
                    <span>
                      {status}
                    </span>
                  </div>
                ))
              }
            </div>
          </section>

          <section className="panel-section folder-section">
            <div className="panel-heading">
              <h2>
                SMART FOLDERS
              </h2>
              <span>
                +
              </span>
            </div>

            <FolderTree
              folders={VIRTUAL_FOLDER_TREE}
              selectedFolderId={selectedFolderId}
              counts={folderCounts}
              onSelect={setSelectedFolderId}
            />
          </section>

          <section className="panel-section activity-section">
            <div className="panel-heading">
              <h2>
                Activity
              </h2>
            </div>

            <div className="activity-list">
              {
                activity.length === 0
                  ? (
                      <p className="empty-text">
                        Upload files to see extraction, duplicate, and queue events here.
                      </p>
                    )
                  : activity.map(item => (
                      <div
                        key={item.id}
                        className={`activity-item ${item.level}`}
                      >
                        <div>
                          <strong>
                            {item.title}
                          </strong>
                          <p>
                            {item.detail}
                          </p>
                        </div>
                        <span>
                          {item.time}
                        </span>
                      </div>
                    ))
              }
            </div>
          </section>

        </aside>

        <section className="workspace">
          <section className="file-pane-header">
            <div>
              <span className="pane-folder-icon" aria-hidden="true" />
              <h2>
                {selectedFolder?.path || "All Files"}
              </h2>
              <p>
                {displayedResults.length} file{displayedResults.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="pane-actions">
              <button
                className="refresh-button"
                type="button"
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                aria-label="Refresh files"
                title="Refresh files"
              >
                <span aria-hidden="true">
                  ↻
                </span>
                {isRefreshing ? "Refreshing" : "Refresh"}
              </button>
            </div>
          </section>

          {
            visibleResults.length === 0
              ? (
                  <div className="empty-state">
                    <h3>
                      No matching files yet
                    </h3>
                    <p>
                      Try a broader topic, an exact code like BCS303, or upload a folder to build the local index.
                    </p>
                  </div>
                )
              : (
                  viewMode === "compact"
                    ? (
                        <div className="compact-table">
                          <div className="compact-row compact-head">
                            <span>
                              File
                            </span>
                            <span>
                              Type
                            </span>
                            <span>
                              Confidence
                            </span>
                            <span>
                              Match Reason
                            </span>
                            <span>
                              Updated
                            </span>
                          </div>

                          {
                            displayedResults.map(doc => {
                              const organization =
                                getOrganization(
                                  doc
                                );

                              return (
                                <button
                                  key={`${doc.documentId || doc.filePath}-${doc.filePath}`}
                                  className={`compact-row ${selectedDoc?.documentId === doc.documentId ? "active" : ""}`}
                                  onClick={() =>
                                    setSelectedDoc(doc)
                                  }
                                >
                                  <span
                                    className="compact-file"
                                    title={doc.filePath || doc.fileName}
                                  >
                                    <strong>
                                      {doc.fileName}
                                    </strong>
                                  </span>
                                  <span>
                                    {getTypeLabel(
                                      organization,
                                      doc
                                    )}
                                  </span>
                                  <span>
                                    <b className={`confidence-pill ${getConfidenceClass(organization)}`}>
                                      {getConfidencePercent(organization)}%
                                    </b>
                                  </span>
                                  <span>
                                    {getOrganizationReason(doc)}
                                  </span>
                                  <span>
                                    {formatUpdatedAt(
                                      doc.updatedAt ||
                                      doc.scannedAt
                                    )}
                                  </span>
                                </button>
                              );
                            })
                          }
                        </div>
                      )
                    : (
                        <div className={viewMode === "grid" ? "grid-view" : "list-view"}>
                          {
                            displayedResults.map(doc => {
                              const organization =
                                getOrganization(
                                  doc
                                );

                              return (
                                <article
                                  key={`${doc.documentId || doc.filePath}-${doc.filePath}`}
                                  className={`result-card ${viewMode} ${selectedDoc?.documentId === doc.documentId ? "active" : ""}`}
                                  onClick={() =>
                                    setSelectedDoc(doc)
                                  }
                                >
                                  <div className="result-thumb">
                                    <FileThumb
                                      doc={doc}
                                      loadPreview={viewMode === "list"}
                                    />
                                  </div>

                                  <div className="result-body">
                                    <div className="result-title-row">
                                      <h3>
                                        {doc.fileName}
                                      </h3>
                                      <span className={`quality-pill ${getQualityClass(doc)}`}>
                                        {getQualityLabel(doc)}
                                      </span>
                                    </div>

                                    <p className="path-text">
                                      {compactPath(doc.filePath)}
                                    </p>

                                    <p className="folder-line">
                                      {organization?.primaryFolderPath || "Other"}
                                      {" "}
                                      <b className={`confidence-pill ${getConfidenceClass(organization)}`}>
                                        {Math.round((organization?.confidence || 0) * 100)}%
                                      </b>
                                    </p>

                                    <p className="preview">
                                      {doc.preview || doc.cleanText?.slice(0, 220) || "No preview available"}
                                    </p>

                                    <p className="reason-line">
                                      {getOrganizationReason(doc)}
                                    </p>

                                    <div className="tag-row">
                                      {
                                        (doc.keywordTags || [])
                                          .slice(0, 5)
                                          .map(tag => (
                                            <span key={tag}>
                                              {tag}
                                            </span>
                                          ))
                                      }
                                    </div>

                                    <div className="meta-row">
                                      <span>
                                        {getFileType(doc.filePath)}
                                      </span>
                                      <span>
                                        {doc.category || "Unknown"}
                                      </span>
                                      <span>
                                        {doc.totalPages ? `${doc.indexedPages || doc.pages?.length || 0}/${doc.totalPages} pages` : "single item"}
                                      </span>
                                      {
                                        doc.score != null && (
                                          <span>
                                            score {doc.score}
                                          </span>
                                        )
                                      }
                                      {
                                        doc.planBScore != null && (
                                          <span>
                                            Plan B {doc.planBScore}
                                          </span>
                                        )
                                      }
                                    </div>
                                  </div>
                                </article>
                              );
                            })
                          }
                        </div>
                      )
                )
          }
        </section>

        <aside className="detail-panel">
          {
            inspectedDoc
              ? (
                <>
              <div className="detail-header">
                <div>
                  <h2>
                    Why This Folder?
                  </h2>
                </div>
                <button
                  className="close-btn"
                  onClick={() =>
                    setSelectedDoc(null)
                  }
                >
                  Close
                </button>
              </div>

              <section className="inspector-card file-summary-card">
                <div className={`file-summary-icon type-${getFileType(inspectedDoc.filePath)}`}>
                  {getFileType(inspectedDoc.filePath).toUpperCase()}
                </div>
                <div>
                  <h3>
                    {inspectedDoc.fileName}
                  </h3>
                  <p>
                    {getFileType(inspectedDoc.filePath).toUpperCase()} Document
                    {" "}
                    ·
                    {" "}
                    {inspectedDoc.totalPages ? `${inspectedDoc.totalPages} pages` : "single item"}
                  </p>
                </div>
              </section>

              <div className="detail-actions">
                <button
                  className="btn btn-primary"
                  onClick={() =>
                    window
                      .electronAPI
                      .openFile(inspectedDoc.filePath)
                  }
                >
                  Open File
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() =>
                    window
                      .electronAPI
                      .revealFile(inspectedDoc.filePath)
                  }
                >
                  Reveal
                </button>
              </div>

              <section className="detail-section why-section">
                <div className="inspector-facts">
                  <span>
                    Folder
                  </span>
                  <strong>
                    {selectedOrganization?.primaryFolderPath || "Other"}
                  </strong>
                  <span>
                    Type
                  </span>
                  <strong>
                    {selectedOrganization?.documentType || "unknown"}
                  </strong>
                  <span>
                    Subject
                  </span>
                  <strong>
                    {selectedOrganization?.subject || "general"}
                  </strong>
                  <span>
                    Confidence
                  </span>
                  <strong>
                    {getConfidencePercent(selectedOrganization)}%
                  </strong>
                </div>
                <div className="confidence-row">
                  <b className={`confidence-pill ${getConfidenceClass(selectedOrganization)}`}>
                    {getConfidenceLabel(selectedOrganization)}
                  </b>
                  <span>
                    {Math.round((selectedOrganization?.confidence || 0) * 100)}%
                  </span>
                </div>
                <h3>
                  Reasons
                </h3>
                <ul className="reason-list">
                  {
                    (selectedOrganization?.reason?.length
                      ? selectedOrganization.reason
                      : [
                          "document content"
                        ]
                    ).map(reason => (
                      <li key={reason}>
                        {reason}
                      </li>
                    ))
                  }
                </ul>
                {
                  selectedOrganization?.secondaryFolderPaths?.length > 0 && (
                    <div className="tag-row">
                      {
                        selectedOrganization.secondaryFolderPaths
                          .slice(0, 6)
                          .map(folderPath => (
                            <span key={folderPath}>
                              {folderPath}
                            </span>
                          ))
                      }
                    </div>
                  )
                }
                {
                  selectedOrganization?.needsReview && (
                    <p className="organizer-review">
                      Needs review because the OCR or category confidence is low.
                    </p>
                  )
                }
              </section>

              <section className="detail-section">
                <h3>
                  OCR Quality
                </h3>
                <div className="inspector-facts">
                  <span>
                    Quality
                  </span>
                  <strong>
                    {getQualityLabel(inspectedDoc)}
                  </strong>
                  <span>
                    Pages Found
                  </span>
                  <strong>
                    {inspectedDoc.totalPages || 1}
                  </strong>
                  <span>
                    Pages Indexed
                  </span>
                  <strong>
                    {inspectedDoc.indexedPages || inspectedDoc.pages?.length || 1}
                  </strong>
                  <span>
                    Last Updated
                  </span>
                  <strong>
                    {formatUpdatedAt(inspectedDoc.updatedAt || inspectedDoc.scannedAt)}
                  </strong>
                </div>
              </section>

              <section className="detail-section folder-keyword-editor inspector-keywords">
                <div className="folder-keyword-heading">
                  <strong>
                    Folder Keywords
                  </strong>
                  <button
                    className="close-btn"
                    type="button"
                    disabled={
                      folderKeywordSaving ||
                      !folderKeywordInput.trim() ||
                      !selectedFolder ||
                      selectedFolder.id === "all-files"
                    }
                    onClick={handleSaveFolderKeyword}
                  >
                    Add
                  </button>
                </div>

                <form
                  className="folder-keyword-form"
                  onSubmit={handleSaveFolderKeyword}
                >
                  <input
                    value={folderKeywordInput}
                    onChange={event =>
                      setFolderKeywordInput(
                        event.target.value
                      )
                    }
                    placeholder="keyword or phrase"
                    disabled={folderKeywordSaving}
                  />
                  <select
                    value={folderKeywordRole}
                    onChange={event =>
                      setFolderKeywordRole(
                        event.target.value
                      )
                    }
                    disabled={folderKeywordSaving}
                  >
                    {
                      FOLDER_KEYWORD_ROLE_OPTIONS.map(option => (
                        <option
                          key={option.value}
                          value={option.value}
                        >
                          {option.label}
                        </option>
                      ))
                    }
                  </select>
                </form>

                <div className="folder-keyword-groups">
                  {
                    FOLDER_KEYWORD_GROUPS.map(group => (
                      <div
                        className="folder-keyword-group"
                        key={group.role}
                      >
                        <div className="folder-keyword-group-title">
                          <span>
                            {group.title}
                          </span>
                          <strong>
                            {groupedFolderKeywords[group.role].length}
                          </strong>
                        </div>

                        {
                          groupedFolderKeywords[group.role].length === 0
                            ? (
                                <p className="folder-keyword-empty">
                                  {group.empty}
                                </p>
                              )
                            : (
                                <div className="folder-keyword-list">
                                  {
                                    groupedFolderKeywords[group.role].map(item => (
                                      <span
                                        className={`folder-keyword-pill ${item.role}`}
                                        key={`${item.role}-${item.keyword}`}
                                      >
                                        <b>
                                          {item.keyword}
                                        </b>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleDeleteFolderKeyword(
                                              item.keyword
                                            )
                                          }
                                          disabled={folderKeywordSaving}
                                          aria-label={`Remove ${item.keyword}`}
                                        >
                                          x
                                        </button>
                                      </span>
                                    ))
                                  }
                                </div>
                              )
                        }
                      </div>
                    ))
                  }
                </div>
              </section>

              <section className="detail-section">
                <h3>
                  Tags
                </h3>
                <div className="tag-row">
                  {
                    [
                      ...(inspectedDoc.titleTags || []),
                      ...(inspectedDoc.keywordTags || [])
                    ]
                      .slice(0, 18)
                      .map(tag => (
                        <span key={tag}>
                          {tag}
                        </span>
                      ))
                  }
                </div>
              </section>

              {
                getQualityLabel(inspectedDoc) === "Low OCR" && (
                  <section className="warning-box">
                    OCR quality may be low. Topic keywords may work better than exact handwritten sentences.
                  </section>
                )
              }

              <section className="detail-section">
                <h3>
                  Extracted Text
                </h3>
                <pre className="text-preview">
                  {
                    detailLoading
                      ? "Loading extracted text..."
                      : selectedText || "No extracted text stored yet."
                  }
                </pre>
              </section>
                </>
              )
              : (
                  <div className="detail-empty">
                    <p className="eyebrow">
                      Inspector
                    </p>
                    <h2>
                      Select a file
                    </h2>
                    <p className="muted">
                      The app will show why the file belongs in its smart folder, confidence, OCR quality, keywords, and original path.
                    </p>
                  </div>
                )
          }
        </aside>
      </main>
        <footer className="local-footer">
          <span>
            <i />
            All data is stored locally on your device.
          </span>
          <span>
            On-device AI · Private · No cloud uploads
          </span>
          <span>
            Version {APP_VERSION}
          </span>
        </footer>
      </section>
    </div>
  );
}

export default App;
