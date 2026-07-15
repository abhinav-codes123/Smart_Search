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

const imageDataCache =
  new Map();

function getUploadProgress(
  fileIndex,
  totalFiles,
  filePhase = 0
) {
  if (!totalFiles) {
    return 0;
  }

  return Math.min(
    100,
    Math.max(
      0,
      Math.round(
        ((fileIndex + filePhase) / totalFiles) * 100
      )
    )
  );
}

function normalizeVirtualFolder(folder) {
  return {
    id:
      folder.id ||
      folder.folderId,
    name:
      folder.name,
    parentId:
      folder.parentId ||
      null,
    path:
      folder.path ||
      folder.displayPath ||
      folder.name,
    source:
      folder.source || "system",
    sortOrder:
      Number(folder.sortOrder || 0)
  };
}

function buildFolderTree(flatFolders) {
  const folders =
    flatFolders
      .map(
        normalizeVirtualFolder
      )
      .filter(folder =>
        folder.id
      )
      .sort((a, b) =>
        a.sortOrder - b.sortOrder ||
        a.path.localeCompare(b.path)
      );
  const byId =
    new Map();
  const roots = [];

  for (
    const folder
    of folders
  ) {
    byId.set(
      folder.id,
      {
        ...folder,
        children: []
      }
    );
  }

  for (
    const folder
    of byId.values()
  ) {
    if (
      folder.parentId &&
      byId.has(folder.parentId)
    ) {
      byId
        .get(folder.parentId)
        .children
        .push(folder);
    } else {
      roots.push(folder);
    }
  }

  return roots;
}

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
  getFilePreviewUrl: () => null,
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
  getVirtualFolders: async () =>
    flattenVirtualFolders(
      VIRTUAL_FOLDER_TREE
    ),
  saveVirtualFolder: async payload => ({
    success: true,
    folder:
      payload,
    folders:
      flattenVirtualFolders(
        VIRTUAL_FOLDER_TREE
      )
  }),
  deleteVirtualFolder: async () => ({
    success: true,
    folders:
      flattenVirtualFolders(
        VIRTUAL_FOLDER_TREE
      )
  }),
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
  saveDocumentFolderOverride: async () => ({
    success: true,
    overrides: [],
    refreshed: {
      documents: 0
    }
  }),
  deleteDocumentFolderOverride: async () => ({
    success: true,
    overrides: [],
    refreshed: {
      documents: 0
    }
  }),
  addDocumentKeywordTag: async (documentId, tag) => {
    const document =
      previewDocuments.find(item =>
        item.documentId === documentId
      );

    return {
      success: true,
      document: {
        ...document,
        keywordTags: [
          ...(document?.keywordTags || []),
          tag
        ]
      }
    };
  },
  deleteDocumentKeywordTag: async (documentId, tag) => {
    const document =
      previewDocuments.find(item =>
        item.documentId === documentId
      );

    return {
      success: true,
      document: {
        ...document,
        keywordTags:
          (document?.keywordTags || [])
            .filter(item =>
              item !== tag
            ),
        titleTags:
          (document?.titleTags || [])
            .filter(item =>
              item !== tag
            )
      }
    };
  },
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

function FilePreviewImage({
  path,
  quality = "fast"
}) {
  const containerRef =
    useRef(null);
  const highQuality =
    quality === "high";
  const directPreviewUrl =
    highQuality
      ? null
      : window
          .electronAPI
          .getFilePreviewUrl?.(
            path
          );
  const [
    previewSrc,
    setPreviewSrc
  ] = useState(() =>
    imageDataCache.get(
      `${quality}:${path}`
    ) ||
    null
  );
  const [
    directPreviewFailed,
    setDirectPreviewFailed
  ] = useState(false);
  const [
    shouldLoadPreview,
    setShouldLoadPreview
  ] = useState(false);

  useEffect(() => {
    const element =
      containerRef.current;

    if (!element) {
      return undefined;
    }

    if (!("IntersectionObserver" in window)) {
      queueMicrotask(() =>
        setShouldLoadPreview(true)
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
            setShouldLoadPreview(true);
            observer.disconnect();
          }
        },
        {
          rootMargin:
            "240px"
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
    if (!shouldLoadPreview) {
      return undefined;
    }

    if (
      directPreviewUrl &&
      !directPreviewFailed
    ) {
      return undefined;
    }

    const cached =
      imageDataCache.get(
        `${quality}:${path}`
      );

    if (cached !== undefined) {
      return undefined;
    }

    let cancelled = false;

    async function load() {
      let data = null;

      try {
        if (
          window
            .electronAPI
            .getFilePreviewData
        ) {
          data =
            await window
              .electronAPI
              .getFilePreviewData(
                path,
                {
                  quality
                }
              );
        }

        if (!data) {
          data =
            await window
              .electronAPI
              .getImageData(path);
        }
      } catch {
        data = null;
      }

      if (data) {
        imageDataCache.set(
          `${quality}:${path}`,
          data
        );
      }

      if (!cancelled) {
        setPreviewSrc(data);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [
    directPreviewFailed,
    directPreviewUrl,
    shouldLoadPreview,
    path,
    quality
  ]);

  const activePreviewSrc =
    shouldLoadPreview &&
    directPreviewUrl &&
    !directPreviewFailed
      ? directPreviewUrl
      : previewSrc;

  if (!activePreviewSrc) {
    return (
      <div
        className="thumb-placeholder"
        ref={containerRef}
      >
        {getFileType(path).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      ref={containerRef}
      src={activePreviewSrc}
      alt=""
      onError={() => {
        if (
          activePreviewSrc === directPreviewUrl
        ) {
          setDirectPreviewFailed(true);
          setPreviewSrc(null);
        }
      }}
    />
  );
}

function FileThumb({
  doc,
  loadPreview = false,
  previewRefreshKey = 0,
  previewQuality = "fast"
}) {
  const type =
    getFileType(doc.filePath);

  if (
    loadPreview
  ) {
    return (
      <FilePreviewImage
        key={`${doc.filePath}-${previewRefreshKey}-${previewQuality}`}
        path={doc.filePath}
        quality={previewQuality}
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
  onSelect,
  collapsedFolderIds,
  onToggle
}) {
  return (
    <div className="folder-tree">
      {
        folders.map(folder => (
          <div
            key={folder.id}
            className="folder-node"
          >
            <div className="folder-row">
              {
                folder.children?.length > 0 ? (
                  <button
                    className="folder-toggle"
                    type="button"
                    aria-label={`${collapsedFolderIds.has(folder.id) ? "Expand" : "Collapse"} ${folder.name}`}
                    onClick={() =>
                      onToggle(folder.id)
                    }
                  >
                    {collapsedFolderIds.has(folder.id) ? "›" : "⌄"}
                  </button>
                ) : (
                  <span className="folder-toggle-spacer" />
                )
              }
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
            </div>

            {
              folder.children?.length > 0 &&
                !collapsedFolderIds.has(folder.id) && (
                <FolderTree
                  folders={folder.children}
                  selectedFolderId={selectedFolderId}
                  counts={counts}
                  onSelect={onSelect}
                  collapsedFolderIds={collapsedFolderIds}
                  onToggle={onToggle}
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
    colorMode,
    setColorMode
  ] = useState(() => {
    if (
      typeof window === "undefined" ||
      !window.localStorage
    ) {
      return "light";
    }

    return (
      window
        .localStorage
        .getItem("smart-file-organiser-theme") ||
      "light"
    );
  });
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
    uploadProgress,
    setUploadProgress
  ] = useState(0);
  const [
    uploadStatus,
    setUploadStatus
  ] = useState({
    current:
      0,
    total:
      0,
    fileName:
      "",
    saved:
      0,
    phase:
      "Idle"
  });
  const [
    isProcessing,
    setIsProcessing
  ] = useState(false);
  const [
    isUploadPaused,
    setIsUploadPaused
  ] = useState(false);
  const [
    isRefreshing,
    setIsRefreshing
  ] = useState(false);
  const [
    previewRefreshKey,
    setPreviewRefreshKey
  ] = useState(0);
  const [
    activity,
    setActivity
  ] = useState([]);
  const [
    currentTask,
    setCurrentTask
  ] = useState("Idle");
  const uploadControlRef =
    useRef({
      action:
        "idle"
    });
  const pausedUploadRef =
    useRef(null);
  const [
    queueStatus,
    setQueueStatus
  ] = useState({});
  const [
    searchMode,
    setSearchMode
  ] = useState("fast");
  const [
    documentTagInput,
    setDocumentTagInput
  ] = useState("");
  const [
    documentTagSaving,
    setDocumentTagSaving
  ] = useState(false);
  const [
    filtersOpen,
    setFiltersOpen
  ] = useState(false);
  const [
    fileTypeFilter,
    setFileTypeFilter
  ] = useState("all");
  const [
    qualityFilter,
    setQualityFilter
  ] = useState("all");
  const [
    virtualFolderList,
    setVirtualFolderList
  ] = useState(() =>
    flattenVirtualFolders(
      VIRTUAL_FOLDER_TREE
    )
  );
  const [
    folderStructureSaving,
    setFolderStructureSaving
  ] = useState(false);
  const [
    folderCreateOpen,
    setFolderCreateOpen
  ] = useState(false);
  const [
    newFolderName,
    setNewFolderName
  ] = useState("");
  const [
    collapsedFolderIds,
    setCollapsedFolderIds
  ] = useState(() =>
    new Set()
  );

  const virtualFolders =
    useMemo(
      () =>
        virtualFolderList.map(
          normalizeVirtualFolder
        ),
      [
        virtualFolderList
      ]
    );
  const virtualFolderTree =
    useMemo(
      () =>
        buildFolderTree(
          virtualFolders
        ),
      [
        virtualFolders
      ]
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
  function handleToggleFolder(folderId) {
    setCollapsedFolderIds(current => {
      const next =
        new Set(current);

      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }

      return next;
    });
  }

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

          if (
            fileTypeFilter !== "all" &&
            getFileType(doc.filePath) !== fileTypeFilter
          )
            return false;

          if (
            qualityFilter !== "all" &&
            getQualityClass(doc) !== qualityFilter
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
        selectedFolderId,
        fileTypeFilter,
        qualityFilter
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

  async function refreshVirtualFolders() {
    const folders =
      await window
        .electronAPI
        .getVirtualFolders?.();

    if (folders?.length) {
      setVirtualFolderList(
        folders.map(
          normalizeVirtualFolder
        )
      );
    }

    return folders || [];
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
        status,
        folders
      ] =
        await Promise.all([
          window.electronAPI.getDocuments(),
          window.electronAPI.getOcrQueueStatus(),
          window.electronAPI.getVirtualFolders?.()
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
      if (folders?.length) {
        setVirtualFolderList(
          folders.map(
            normalizeVirtualFolder
          )
        );
      }
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
          const trackedEvents =
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
              "ocr.job.completed",
              "preview.thumbnail.cache-hit",
              "preview.thumbnail.queued",
              "preview.thumbnail.completed",
              "preview.thumbnail.unavailable",
              "preview.thumbnail.failed",
              "preview.thumbnail.schedule-failed"
            ];

          if (
            entry.event ===
              "preview.thumbnail.completed" ||
            entry.event ===
              "preview.thumbnail.cache-hit"
          ) {
            setPreviewRefreshKey(key =>
              key + 1
            );
          }

          if (
            trackedEvents.includes(
              entry.event
            )
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

  async function refreshAfterOrganizationChange() {
    const docs =
      await refreshDocuments();

    if (!query.trim()) {
      setResults(docs);
    }

    if (selectedDoc) {
      const refreshedSelected =
        docs.find(doc =>
          doc.documentId === selectedDoc.documentId
        );

      if (refreshedSelected) {
        setSelectedDoc(refreshedSelected);
      }
    }

    return docs;
  }

  function applyUpdatedDocument(document) {
    const updatedDocument =
      hydrateDocument(
        document
      );

    setSelectedDoc(
      updatedDocument
    );
    setDocuments(current =>
      current.map(item =>
        item.documentId === updatedDocument.documentId
          ? updatedDocument
          : item
      )
    );
    setResults(current =>
      current.map(item =>
        item.documentId === updatedDocument.documentId
          ? updatedDocument
          : item
      )
    );
  }

  async function handleAddDocumentTag(event) {
    event.preventDefault();

    if (
      !inspectedDoc ||
      !documentTagInput.trim()
    ) {
      return;
    }

    const tag =
      documentTagInput.trim();
    setDocumentTagSaving(true);

    try {
      const result =
        await window
          .electronAPI
          .addDocumentKeywordTag?.(
            inspectedDoc.documentId,
            tag
          );

      if (result?.success === false) {
        addActivity({
          level: "error",
          title: "Tag add failed",
          detail:
            result.error || tag
        });
        return;
      }

      setDocumentTagInput("");
      if (result?.document) {
        applyUpdatedDocument(
          result.document
        );
      }
      await refreshAfterOrganizationChange();
      addActivity({
        level: "info",
        title: "Tag added",
        detail:
          `${inspectedDoc.fileName}: ${tag}`
      });
    } finally {
      setDocumentTagSaving(false);
    }
  }

  async function handleDeleteDocumentTag(tag) {
    if (
      !inspectedDoc ||
      !tag
    ) {
      return;
    }

    const confirmed =
      window.confirm(
        `Delete tag "${tag}" from "${inspectedDoc.fileName}"?`
      );

    if (!confirmed) {
      return;
    }

    setDocumentTagSaving(true);

    try {
      const result =
        await window
          .electronAPI
          .deleteDocumentKeywordTag?.(
            inspectedDoc.documentId,
            tag
          );

      if (result?.success === false) {
        addActivity({
          level: "error",
          title: "Tag delete failed",
          detail:
            result.error || tag
        });
        return;
      }

      if (result?.document) {
        applyUpdatedDocument(
          result.document
        );
      }
      await refreshAfterOrganizationChange();
      addActivity({
        level: "info",
        title: "Tag deleted",
        detail:
          `${inspectedDoc.fileName}: ${tag}`
      });
    } finally {
      setDocumentTagSaving(false);
    }
  }

  function handleOpenCreateFolder() {
    setNewFolderName("");
    setFolderCreateOpen(true);
  }

  async function handleCreateVirtualFolder(event) {
    event.preventDefault();

    const folderName =
      newFolderName.trim();

    if (
      !folderName
    ) {
      return;
    }

    setFolderStructureSaving(true);

    try {
      const result =
        await window
          .electronAPI
          .saveVirtualFolder?.({
            folderId:
              null,
            name:
              folderName,
            parentId:
              selectedFolder?.id === "all-files"
                ? null
                : selectedFolder?.id || null
          });

      if (result?.success === false) {
        addActivity({
          level: "error",
          title: "Folder save failed",
          detail:
            result.error || folderName
        });
        return;
      }

      await refreshVirtualFolders();
      await refreshAfterOrganizationChange();
      setFolderCreateOpen(false);
      setNewFolderName("");
      addActivity({
        level: "info",
        title: "Folder created",
        detail:
          folderName
      });
    } finally {
      setFolderStructureSaving(false);
    }
  }

  async function handleDeleteVirtualFolder() {
    if (
      !selectedFolder ||
      selectedFolder.id === "all-files"
    ) {
      addActivity({
        level: "warn",
        title: "Folder delete blocked",
        detail:
          "All Files is the root view and cannot be deleted."
      });
      return;
    }

    const confirmed =
      window.confirm(
        `Delete folder "${selectedFolder.name}"?\n\nFiles will stay in their original locations. Only this virtual folder will be removed.`
      );

    if (!confirmed) {
      return;
    }

    setFolderStructureSaving(true);

    try {
      const result =
        await window
          .electronAPI
          .deleteVirtualFolder?.(
            selectedFolder.id
          );

      if (result?.success === false) {
        addActivity({
          level: "error",
          title: "Folder delete failed",
          detail:
            result.error || selectedFolder.name
        });
        return;
      }

      setSelectedFolderId("all-files");
      await refreshVirtualFolders();
      await refreshAfterOrganizationChange();
      addActivity({
        level: "warn",
        title: "Folder deleted",
        detail:
          selectedFolder.name
      });
    } finally {
      setFolderStructureSaving(false);
    }
  }

  function handlePauseUpload() {
    if (!isProcessing) {
      return;
    }

    uploadControlRef.current.action =
      "pause";
    setUploadStatus(status => ({
      ...status,
      phase:
        "Pausing after current file"
    }));
    setCurrentTask(
      "Pausing after current file"
    );
  }

  function handleStopUpload() {
    const wasPaused =
      isUploadPaused &&
      !isProcessing;

    uploadControlRef.current.action =
      wasPaused
        ? "idle"
        : "stop";
    pausedUploadRef.current =
      null;
    setIsUploadPaused(false);
    setUploadStatus(status => ({
      ...status,
      phase:
        "Stopping"
    }));
    setCurrentTask(
      wasPaused
        ? "Upload stopped"
        : "Stopping upload"
    );

    if (wasPaused) {
      addActivity({
        level: "warn",
        title: "Indexing stopped",
        detail:
          "Paused upload was cleared"
      });
    }
  }

  async function handleResumeUpload() {
    const pausedUpload =
      pausedUploadRef.current;

    if (!pausedUpload) {
      return;
    }

    await processFiles(
      pausedUpload.files,
      {
        startIndex:
          pausedUpload.nextIndex,
        keepStatus:
          true
      }
    );
  }

  async function processFiles(
    files,
    options = {}
  ) {
    if (
      !files.length ||
      isProcessing
    )
      return;

    const {
      startIndex = 0,
      keepStatus = false
    } = options;

    uploadControlRef.current.action =
      "running";
    pausedUploadRef.current =
      null;
    setIsUploadPaused(false);
    setIsProcessing(true);
    if (!keepStatus) {
      setUploadProgress(0);
      setUploadStatus({
        current:
          0,
        total:
          files.length,
        fileName:
          "",
        saved:
          0,
        phase:
          "Preparing"
      });
    } else {
      setUploadProgress(
        getUploadProgress(
          startIndex,
          files.length,
          0
        )
      );
      setUploadStatus(status => ({
        ...status,
        current:
          startIndex + 1,
        total:
          files.length,
        phase:
          "Resuming"
      }));
    }
    setCurrentTask("Preparing files");
    addActivity({
      level: "info",
      title:
        keepStatus
          ? "Indexing resumed"
          : "Indexing started",
      detail:
        keepStatus
          ? `Continuing from file ${startIndex + 1} of ${files.length}`
          : `${files.length} file${files.length === 1 ? "" : "s"} selected`
    });

    const processedDocs = [];

    for (let index = startIndex; index < files.length; index++) {
      const file =
        files[index];

      setUploadStatus(status => ({
        ...status,
        current:
          index + 1,
        fileName:
          file.name,
        phase:
          "Extracting"
      }));
      setUploadProgress(
        getUploadProgress(
          index,
          files.length,
          0
        )
      );
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
          setUploadStatus(status => ({
            ...status,
            phase:
              "Failed"
          }));
          continue;
        }

        setUploadStatus(status => ({
          ...status,
          phase:
            "Saving"
        }));
        setUploadProgress(
          getUploadProgress(
            index,
            files.length,
            0.65
          )
        );

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

        setUploadStatus(status => ({
          ...status,
          phase:
            "Updating library"
        }));
        setUploadProgress(
          getUploadProgress(
            index,
            files.length,
            0.9
          )
        );

        const savedDocument =
          saved?.success === false
            ? document
            : saved?.document ||
              {
                ...document,
                ...(saved || {})
              };

        processedDocs.push(
          savedDocument
        );
        setUploadStatus(status => ({
          ...status,
          saved:
            status.saved + 1,
          phase:
            "Indexed"
        }));

        setDocuments(current => {
          const hydrated =
            hydrateDocument(
              savedDocument
            );
          const withoutExisting =
            current.filter(item =>
              item.documentId !==
                hydrated.documentId
            );

          return [
            hydrated,
            ...withoutExisting
          ];
        });

        if (!query.trim()) {
          setResults(current => {
            const hydrated =
              hydrateDocument(
                savedDocument
              );
            const withoutExisting =
              current.filter(item =>
                item.documentId !==
                  hydrated.documentId
              );

            return [
              hydrated,
              ...withoutExisting
            ];
          });
        }

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
          getUploadProgress(
            index,
            files.length,
            1
          )
        );
        await refreshQueue();
      }

      const nextIndex =
        index + 1;
      const requestedAction =
        uploadControlRef.current.action;

      if (
        requestedAction === "pause" &&
        nextIndex < files.length
      ) {
        pausedUploadRef.current = {
          files,
          nextIndex
        };
        setIsProcessing(false);
        setIsUploadPaused(true);
        setUploadStatus(status => ({
          ...status,
          current:
            nextIndex,
          phase:
            "Paused"
        }));
        setCurrentTask(
          `Paused. ${files.length - nextIndex} file${files.length - nextIndex === 1 ? "" : "s"} remaining`
        );
        addActivity({
          level: "info",
          title: "Indexing paused",
          detail:
            `${files.length - nextIndex} file${files.length - nextIndex === 1 ? "" : "s"} remaining`
        });

        const docs =
          await refreshDocuments();
        if (!query.trim()) {
          setResults(docs);
        }
        return;
      }

      if (requestedAction === "stop") {
        uploadControlRef.current.action =
          "idle";
        pausedUploadRef.current =
          null;
        setIsUploadPaused(false);
        setIsProcessing(false);
        setUploadStatus(status => ({
          ...status,
          phase:
            "Stopped"
        }));
        setCurrentTask(
          "Upload stopped"
        );
        addActivity({
          level: "warn",
          title: "Indexing stopped",
          detail:
            `${files.length - nextIndex} file${files.length - nextIndex === 1 ? "" : "s"} skipped`
        });

        const docs =
          await refreshDocuments();
        if (!query.trim()) {
          setResults(docs);
        }
        return;
      }
    }

    setCurrentTask("Refreshing library");
    uploadControlRef.current.action =
      "idle";
    pausedUploadRef.current =
      null;
    setIsUploadPaused(false);
    const docs =
      await refreshDocuments();
    setResults(
      query.trim()
        ? results
        : docs
    );
    setIsProcessing(false);
    setUploadStatus({
      current:
        0,
      total:
        0,
      fileName:
        "",
      saved:
        0,
      phase:
        "Idle"
    });
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

  useEffect(() => {
    window
      .localStorage
      ?.setItem(
        "smart-file-organiser-theme",
        colorMode
      );
  }, [
    colorMode
  ]);

  return (
    <div
      className="app-shell"
      data-theme={colorMode}
    >
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
            {
              query.trim() ? (
                <button
                  className="search-clear-button"
                  type="button"
                  aria-label="Clear search"
                  title="Clear search"
                  onClick={async () => {
                    setQuery("");
                    const docs =
                      await refreshDocuments();
                    setResults(docs);
                  }}
                >
                  x
                </button>
              ) : (
                <span>
                  ⌘K
                </span>
              )
            }
          </div>

          <div className="upload-actions">
            <button
              className="btn btn-secondary upload-main"
              onClick={handleFileSelect}
              disabled={isProcessing || isUploadPaused}
            >
              Upload Files
            </button>
            <button
              className="btn btn-secondary upload-main"
              onClick={handleFolderSelect}
              disabled={isProcessing || isUploadPaused}
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

          <button
            className="theme-toggle"
            type="button"
            aria-label={`Switch to ${colorMode === "dark" ? "light" : "dark"} mode`}
            onClick={() =>
              setColorMode(mode =>
                mode === "dark"
                  ? "light"
                  : "dark"
              )
            }
          >
            <span aria-hidden="true">
              {colorMode === "dark" ? "☀" : "☾"}
            </span>
            {colorMode === "dark" ? "Light" : "Dark"}
          </button>

        </header>

        <section className="project-info-strip">
          <div>
            <strong>
              Local Smart File Organiser
            </strong>
            <span>
              Files stay in their original location. This app builds private smart folders, tags, previews, and search locally on your device.
            </span>
          </div>
          <div className="project-info-metrics">
            <span>
              {documents.length} files indexed
            </span>
            <span>
              {queueTotal} background jobs
            </span>
            <span>
              {searchMode === "planB" ? "Semantic search on" : "Fast search on"}
            </span>
          </div>
        </section>

        {
          (isProcessing || isUploadPaused) && (
            <section className="live-progress-panel">
              <div>
                <strong>
                  {isUploadPaused
                    ? "Upload paused"
                    : "Uploading and indexing"}
                </strong>
                <span>
                  File{" "}
                  {uploadStatus.current || 1}
                  {" "}
                  of{" "}
                  {uploadStatus.total || 1}
                  {" "}
                  ·
                  {" "}
                  {uploadStatus.saved}
                  {" "}
                  saved
                </span>
              </div>

              <p>
                {currentTask}
              </p>

              <div className="progress live-progress">
                <div
                  className="progress-bar"
                  style={{
                    width:
                      `${uploadProgress}%`
                  }}
                />
              </div>

              <div className="upload-control-row">
                {
                  isUploadPaused ? (
                    <button
                      className="btn btn-primary"
                      type="button"
                      onClick={handleResumeUpload}
                    >
                      Resume
                    </button>
                  ) : (
                    <button
                      className="btn btn-secondary"
                      type="button"
                      onClick={handlePauseUpload}
                    >
                      Pause
                    </button>
                  )
                }
                <button
                  className="btn btn-danger"
                  type="button"
                  onClick={handleStopUpload}
                >
                  Stop
                </button>
              </div>

              <small>
                {uploadStatus.phase || "Preparing"}
                {uploadStatus.fileName
                  ? ` · ${uploadStatus.fileName}`
                  : ""}
              </small>
            </section>
          )
        }

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
              <div className="folder-actions">
                <button
                  className="tiny-action"
                  type="button"
                  disabled={folderStructureSaving}
                  title="Add folder inside selected folder"
                  onClick={handleOpenCreateFolder}
                >
                  +
                </button>
                <button
                  className="tiny-action danger"
                  type="button"
                  disabled={
                    folderStructureSaving ||
                    !selectedFolder ||
                    selectedFolder.id === "all-files"
                  }
                  title="Delete selected folder"
                  onClick={handleDeleteVirtualFolder}
                >
                  -
                </button>
              </div>
            </div>

            {
              folderCreateOpen && (
                <form
                  className="folder-create-form"
                  onSubmit={handleCreateVirtualFolder}
                >
                  <span>
                    Inside {selectedFolder?.id === "all-files" || !selectedFolder ? "Smart Folders" : selectedFolder.name}
                  </span>
                  <div>
                    <input
                      value={newFolderName}
                      onChange={event =>
                        setNewFolderName(
                          event.target.value
                        )
                      }
                      placeholder="Folder name"
                      autoFocus
                      disabled={folderStructureSaving}
                    />
                    <button
                      className="tiny-action"
                      type="submit"
                      disabled={
                        folderStructureSaving ||
                        !newFolderName.trim()
                      }
                      title="Create folder"
                    >
                      ✓
                    </button>
                    <button
                      className="tiny-action"
                      type="button"
                      disabled={folderStructureSaving}
                      title="Cancel"
                      onClick={() => {
                        setFolderCreateOpen(false);
                        setNewFolderName("");
                      }}
                    >
                      ×
                    </button>
                  </div>
                </form>
              )
            }

            <div className="folder-tree-scroll">
              <FolderTree
                folders={virtualFolderTree}
                selectedFolderId={selectedFolderId}
                counts={folderCounts}
                onSelect={setSelectedFolderId}
                collapsedFolderIds={collapsedFolderIds}
                onToggle={handleToggleFolder}
              />
            </div>
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
            <div className="file-pane-title-row">
              <div className="file-pane-title">
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
                  className={`filter-button ${filtersOpen ? "active" : ""}`}
                  type="button"
                  aria-expanded={filtersOpen}
                  onClick={() =>
                    setFiltersOpen(open =>
                      !open
                    )
                  }
                >
                  <span aria-hidden="true">
                    ≡
                  </span>
                  Filter
                </button>

                <div className="view-toggle pane-view-toggle">
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
            </div>

            {
              filtersOpen && (
                <div className="filter-panel">
                  <label className="filter-field">
                    <span>
                      File type
                    </span>
                    <select
                      value={fileTypeFilter}
                      onChange={event =>
                        setFileTypeFilter(
                          event.target.value
                        )
                      }
                    >
                      <option value="all">
                        All types
                      </option>
                      <option value="pdf">
                        PDF
                      </option>
                      <option value="image">
                        Images
                      </option>
                      <option value="office">
                        Docs, PPT, Sheets
                      </option>
                      <option value="code">
                        Code
                      </option>
                      <option value="text">
                        Text / other
                      </option>
                    </select>
                  </label>

                  <label className="filter-field">
                    <span>
                      OCR quality
                    </span>
                    <select
                      value={qualityFilter}
                      onChange={event =>
                        setQualityFilter(
                          event.target.value
                        )
                      }
                    >
                      <option value="all">
                        All quality
                      </option>
                      <option value="good">
                        Good
                      </option>
                      <option value="review">
                        Review
                      </option>
                      <option value="low-ocr">
                        Low OCR
                      </option>
                      <option value="partial">
                        Partial
                      </option>
                    </select>
                  </label>

                  <button
                    className="filter-clear"
                    type="button"
                    disabled={
                      fileTypeFilter === "all" &&
                      qualityFilter === "all"
                    }
                    onClick={() => {
                      setFileTypeFilter("all");
                      setQualityFilter("all");
                    }}
                  >
                    Clear filters
                  </button>
                </div>
              )
            }
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
                                  onDoubleClick={() =>
                                    window
                                      .electronAPI
                                      .openFile(doc.filePath)
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
                                  onDoubleClick={() =>
                                    window
                                      .electronAPI
                                      .openFile(doc.filePath)
                                  }
                                >
                                  <div className="result-thumb">
                                    <FileThumb
                                      doc={doc}
                                      loadPreview={viewMode === "list"}
                                      previewRefreshKey={previewRefreshKey}
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

                                    <div className="meta-row">
                                      <span>
                                        {getTypeLabel(
                                          organization,
                                          doc
                                        )}
                                      </span>
                                      <span>
                                        {organization?.primaryFolderPath || "Other"}
                                      </span>
                                      <span>
                                        <b className={`confidence-pill ${getConfidenceClass(organization)}`}>
                                          {Math.round((organization?.confidence || 0) * 100)}%
                                        </b>
                                      </span>
                                      <span>
                                        {doc.totalPages ? `${doc.indexedPages || doc.pages?.length || 0}/${doc.totalPages} pages` : "single item"}
                                      </span>
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

        <aside className="detail-panel clean-inspector">
          {
            inspectedDoc
              ? (
                <>
                  <div className="inspector-fixed">
                    <div className="detail-header">
                      <div>
                        <h2>
                          File Preview
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

                    <section className="inspector-preview-card">
                      <div className="inspector-preview">
                        <FileThumb
                          doc={inspectedDoc}
                          loadPreview
                          previewRefreshKey={previewRefreshKey}
                          previewQuality="high"
                        />
                      </div>
                    </section>
                  </div>

                  <div className="inspector-scroll">
                    <section className="file-title-section">
                      <h3>
                        {inspectedDoc.fileName}
                      </h3>
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
                        Open
                      </button>
                      <button
                        className="btn btn-secondary"
                        onClick={() =>
                          window
                            .electronAPI
                            .revealFile(inspectedDoc.filePath)
                        }
                      >
                        Show in Finder
                      </button>
                    </div>

                    <section className="detail-section compact-tags-section">
                      <h3>
                        Tags
                      </h3>
                      <div className="tag-row">
                        {
                          [
                            ...(inspectedDoc.titleTags || []),
                            ...(inspectedDoc.keywordTags || [])
                          ]
                            .filter(
                              (tag, index, all) =>
                                tag &&
                                all.indexOf(tag) === index
                            )
                            .slice(0, 24)
                            .map(tag => (
                              <span
                                className="tag-pill"
                                key={tag}
                              >
                                <span>
                                  {tag}
                                </span>
                                <button
                                  type="button"
                                  aria-label={`Delete ${tag}`}
                                  disabled={documentTagSaving}
                                  onClick={() =>
                                    handleDeleteDocumentTag(
                                      tag
                                    )
                                  }
                                >
                                  x
                                </button>
                              </span>
                            ))
                        }
                      </div>
                    </section>

                    <form
                      className="tag-add-form"
                      onSubmit={handleAddDocumentTag}
                    >
                      <input
                        value={documentTagInput}
                        onChange={event =>
                          setDocumentTagInput(
                            event.target.value
                          )
                        }
                        placeholder="add tag"
                        disabled={documentTagSaving}
                      />
                      <button
                        className="btn btn-primary"
                        type="submit"
                        disabled={
                          documentTagSaving ||
                          !documentTagInput.trim()
                        }
                      >
                        Add
                      </button>
                    </form>
                  </div>
                </>
              )
              : (
                  <div className="detail-empty">
                    <p className="eyebrow">
                      Preview
                    </p>
                    <h2>
                      Select a file
                    </h2>
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
