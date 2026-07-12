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

const TYPE_OPTIONS = [
  "all",
  "pdf",
  "image",
  "office",
  "code",
  "text"
];

const STATUS_OPTIONS = [
  "all",
  "done",
  "indexing",
  "failed"
];

const SEARCH_EXAMPLES = [
  "t-test",
  "BCS303",
  "banker algorithm",
  "CPU cache",
  "stdio.h"
];

const imageDataCache =
  new Map();

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

function ImageThumbnail({ path }) {
  const [
    imageSrc,
    setImageSrc
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
      const data =
        await window
          .electronAPI
          .getImageData(path);

      imageDataCache.set(
        path,
        data
      );

      if (!cancelled) {
        setImageSrc(data);
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

  if (!imageSrc) {
    return (
      <div
        className="thumb-placeholder"
        ref={ref}
      >
        IMG
      </div>
    );
  }

  return (
    <img
      ref={ref}
      src={imageSrc}
      alt=""
    />
  );
}

function FileThumb({
  doc,
  loadImage = false
}) {
  const type =
    getFileType(doc.filePath);

  if (
    type === "image" &&
    loadImage
  ) {
    return (
      <ImageThumbnail
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
    recentSearches,
    setRecentSearches
  ] = useState([]);
  const [
    viewMode,
    setViewMode
  ] = useState("list");
  const [
    typeFilter,
    setTypeFilter
  ] = useState("all");
  const [
    statusFilter,
    setStatusFilter
  ] = useState("all");
  const [
    categoryFilter,
    setCategoryFilter
  ] = useState("all");
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
    searchState,
    setSearchState
  ] = useState("idle");

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

  const categoryOptions =
    useMemo(
      () => [
        "all",
        ...new Set(
          documents
            .map(doc => doc.category)
            .filter(Boolean)
        )
      ],
      [documents]
    );

  const visibleResults =
    useMemo(
      () =>
        results.filter(doc => {
          if (
            typeFilter !== "all" &&
            getFileType(doc.filePath) !== typeFilter
          )
            return false;

          if (
            statusFilter !== "all" &&
            (doc.status || "done") !== statusFilter
          )
            return false;

          if (
            categoryFilter !== "all" &&
            doc.category !== categoryFilter
          )
            return false;

          if (
            selectedFolderId !== "all-files" &&
            !getDocumentFolderIds(doc)
              .includes(selectedFolderId)
          )
            return false;

          return true;
        }),
      [
        results,
        typeFilter,
        statusFilter,
        categoryFilter,
        selectedFolderId
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
    const docs =
      (
        await window
          .electronAPI
          .getDocuments()
      ).map(
        hydrateDocument
      );

    setDocuments(docs);

    if (!query.trim()) {
      setResults(docs);
    }

    return docs;
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
            : {
                ...document,
                ...(saved || {})
              }
        );

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

    setSearchState("searching");

    if (!trimmed) {
      const docs =
        await refreshDocuments();

      setResults(docs);
      setSearchState("idle");
      return;
    }

    const docs =
      (
        await window
        .electronAPI
        .searchDocuments(
          trimmed
        )
      ).map(
        hydrateDocument
      );

    setResults(docs);
    setSearchState("idle");
    setRecentSearches(prev => [
      trimmed,
      ...prev.filter(
        item =>
          item !== trimmed
      )
    ].slice(0, 6));
  }

  function applyRecentSearch(item) {
    setQuery(item);
    runSearch(item);
  }

  const queueTotal =
    getQueueTotal(queueStatus);

  const selectedText =
    selectedDoc?.cleanText ||
    selectedDoc?.text ||
    "";
  const selectedOrganization =
    selectedDoc
      ? getOrganization(
          selectedDoc
        )
      : null;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">
            Local file intelligence
          </p>
          <h1>
            Smart File Organiser
          </h1>
          <p className="subtitle">
            Search messy folders by content, OCR text, tags, and document context.
          </p>
        </div>

        <div className="topbar-actions">
          <button
            className="btn btn-secondary"
            onClick={handleFolderSelect}
            disabled={isProcessing}
          >
            Upload Folder
          </button>
          <button
            className="btn btn-primary"
            onClick={handleFileSelect}
            disabled={isProcessing}
          >
            Upload Files
          </button>
        </div>
      </header>

      <main className="layout">
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
                Virtual Folders
              </h2>
              <span>
                no file moves
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
          <section className="search-panel">
            <div className="search-row">
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
                placeholder="Search: t-test, BCS303, banker algorithm, CPU cache"
                className="search-input"
              />

              {
                query && (
                  <button
                    className="btn btn-secondary icon-btn"
                    onClick={() => {
                      setQuery("");
                      runSearch("");
                    }}
                    aria-label="Clear search"
                  >
                    Clear
                  </button>
                )
              }

              <button
                onClick={() =>
                  runSearch()
                }
                className="btn btn-primary"
              >
                {searchState === "searching" ? "Searching" : "Search"}
              </button>
            </div>

            <div className="chips">
              {
                (recentSearches.length
                  ? recentSearches
                  : SEARCH_EXAMPLES
                ).map(item => (
                  <button
                    key={item}
                    className="chip"
                    onClick={() =>
                      applyRecentSearch(item)
                    }
                  >
                    {item}
                  </button>
                ))
              }
            </div>
          </section>

          <section className="filters">
            <label>
              Type
              <select
                value={typeFilter}
                onChange={event =>
                  setTypeFilter(event.target.value)
                }
              >
                {
                  TYPE_OPTIONS.map(option => (
                    <option
                      key={option}
                      value={option}
                    >
                      {option}
                    </option>
                  ))
                }
              </select>
            </label>

            <label>
              Status
              <select
                value={statusFilter}
                onChange={event =>
                  setStatusFilter(event.target.value)
                }
              >
                {
                  STATUS_OPTIONS.map(option => (
                    <option
                      key={option}
                      value={option}
                    >
                      {option}
                    </option>
                  ))
                }
              </select>
            </label>

            <label>
              Category
              <select
                value={categoryFilter}
                onChange={event =>
                  setCategoryFilter(event.target.value)
                }
              >
                {
                  categoryOptions.map(option => (
                    <option
                      key={option}
                      value={option}
                    >
                      {option}
                    </option>
                  ))
                }
              </select>
            </label>

            <div className="view-toggle">
              <button
                className={viewMode === "list" ? "active" : ""}
                onClick={() =>
                  setViewMode("list")
                }
              >
                List
              </button>
              <button
                className={viewMode === "grid" ? "active" : ""}
                onClick={() =>
                  setViewMode("grid")
                }
              >
                Grid
              </button>
            </div>
          </section>

          <section className="results-header">
            <div>
              <h2>
                Results
              </h2>
              <p>
                {visibleResults.length} shown from {results.length || documents.length} indexed files
                {selectedFolder ? ` in ${selectedFolder.path}` : ""}
              </p>
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
                  <div className={viewMode === "grid" ? "grid-view" : "list-view"}>
                    {
                      visibleResults.map(doc => (
                        <article
                          key={`${doc.documentId || doc.filePath}-${doc.filePath}`}
                          className={`result-card ${viewMode}`}
                          onClick={() =>
                            setSelectedDoc(doc)
                          }
                        >
                          <div className="result-thumb">
                            <FileThumb
                              doc={doc}
                              loadImage={viewMode === "grid"}
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

                            <p className="preview">
                              {doc.preview || doc.cleanText?.slice(0, 220) || "No preview available"}
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
                                {doc.organization?.primaryFolderPath || "Other"}
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
                            </div>
                          </div>
                        </article>
                      ))
                    }
                  </div>
                )
          }
        </section>

        {
          selectedDoc && (
            <aside className="detail-panel">
              <div className="detail-header">
                <div>
                  <p className="eyebrow">
                    Document detail
                  </p>
                  <h2>
                    {selectedDoc.fileName}
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

              <div className="detail-actions">
                <button
                  className="btn btn-primary"
                  onClick={() =>
                    window
                      .electronAPI
                      .openFile(selectedDoc.filePath)
                  }
                >
                  Open File
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() =>
                    window
                      .electronAPI
                      .revealFile(selectedDoc.filePath)
                  }
                >
                  Reveal
                </button>
              </div>

              <div className="detail-stats">
                <div>
                  <strong>
                    {getQualityLabel(selectedDoc)}
                  </strong>
                  <span>
                    OCR quality
                  </span>
                </div>
                <div>
                  <strong>
                    {selectedDoc.cleanWordCount || 0}
                  </strong>
                  <span>
                    words
                  </span>
                </div>
                <div>
                  <strong>
                    {selectedDoc.status || "done"}
                  </strong>
                  <span>
                    status
                  </span>
                </div>
              </div>

              <section className="detail-section">
                <h3>
                  Virtual Folder
                </h3>
                <p className="category-box">
                  {selectedOrganization?.primaryFolderPath || "Other"}
                </p>
                <p className="muted">
                  Confidence {Math.round((selectedOrganization?.confidence || 0) * 100)}%.
                  {" "}
                  Reason: {(selectedOrganization?.reason || []).join("; ") || "document content"}.
                </p>
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
                  Tags
                </h3>
                <div className="tag-row">
                  {
                    [
                      ...(selectedDoc.titleTags || []),
                      ...(selectedDoc.keywordTags || [])
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
                getQualityLabel(selectedDoc) === "Low OCR" && (
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
            </aside>
          )
        }
      </main>
    </div>
  );
}

export default App;
