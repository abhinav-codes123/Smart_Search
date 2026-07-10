import { useEffect , useState } from "react";
import {  classifyDocument } from "./utils/classifier";
import { scanFiles } from "./utils/scanner";
import "./App.css"

function App() {
  const [scannedFiles,setScannedFiles] = useState([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [recentSearches, setRecentSearches] = useState([]);
  const [viewMode,setViewMode] = useState("grid");

  const handleFolderSelect =
    async () => {
      setUploadProgress(0);
      let processed = 0;

  const result =
    await window
      .electronAPI
      .selectFolder();

  if (
    !result?.files?.length
  )
    return;

  const totalFiles = result.files.length;

  const results =
    await scanFiles(
      result.files,
      window.electronAPI.extractDocumentText,
      classifyDocument,
      progress =>
        setUploadProgress(
          progress
        )
    );

  for (
    const document
    of results
  ) {

    await window
      .electronAPI
      .saveDocument(
        document
      );

    processed++;
    setUploadProgress(
      Math.round(
        (processed /
          totalFiles) *
          100
      )
    );
  }
  setUploadProgress(100);
  setScannedFiles(
    results
  );
};

function ImageThumbnail({
  path
}) {

  const [
    imageSrc,
    setImageSrc
  ] = useState(null);

  useEffect(() => {

    async function load() {

      const data =
        await window
          .electronAPI
          .getImageData(path);

      setImageSrc(data);
    }

    load();

  }, [path]);

  if (!imageSrc) {
    return (
      <div
        style={{
          width: "100px",
          height: "100px",
          background: "#222"
        }}
      />
    );
  }

  return (
    <img
      src={imageSrc}
      alt=""
      style={{
        width: "100px",
        height: "100px",
        objectFit: "cover",
        borderRadius: "8px"
      }}
    />
  );
}

const search =
  async () => {

    const docs =
      await window
        .electronAPI
        .searchDocuments(
          query
        );

    console.log(docs);

    setResults(
  docs
);

if (
  query.trim()
) {

  setRecentSearches(
    prev => [

      query,

      ...prev.filter(
        item =>
          item !== query
      )

    ].slice(0, 5)
  );
}
};

const handleFileSelect =
async () => {

  const files =
    await window
      .electronAPI
      .selectFiles();

  if (!files.length)
    return;

  const results =
    await scanFiles(
      files,
      window.electronAPI.extractDocumentText,
      classifyDocument,
      progress =>
        setUploadProgress(
          progress
        )
    );

  for (
    const document
    of results
  ) {

    await window
      .electronAPI
      .saveDocument(
        document
      );
  }

  setScannedFiles(
    results
  );
};

  return (
  <div className="app">

    <h1 className="title">
      Smart Search
    </h1>

    <p className="subtitle">
  Search anything inside PDFs,
  Images and Documents instantly.
</p>

    <div className="section">

      <h2 className="section-title">
        Upload & Processing
      </h2>

      <div className="btn-row">

        <button
          onClick={handleFolderSelect}
          className="btn btn-primary"
        >
          Upload Folder
        </button>

        <button
          onClick={handleFileSelect}
          className="btn btn-secondary"
        >
          Upload Files
        </button>

      </div>

      <div className="progress">

        <div
          className="progress-bar"
          style={{
            width: `${uploadProgress}%`
          }}
        />

      </div>

      <div
        style={{
          marginTop: "20px"
        }}
      >
        <h3 style={{
          color:"aliceblue"
        }}>
          Recent Uploads
        </h3>

        {
          scannedFiles
            .slice(-4)
            .reverse()
            .map(file => (

              <div
                key={file.filePath}
                style={{
                  marginTop: "8px",
                  color: "#9ca3af"
                }}
              >
                ✓ {file.fileName}
              </div>

            ))
        }
      </div>

    </div>

    <div className="search-row">

      <input
        value={query}
        onChange={(e) =>
          setQuery(
            e.target.value
          )
        }
        placeholder="Search files..."
        className="search-input"
      />

      <button
        onClick={search}
        className="btn btn-primary"
      >
        Search
      </button>

    </div>

    <div className="chips">

      {
        recentSearches.map(
          item => (

            <div
              key={item}
              className="chip"
            >
              {item}
            </div>

          )
        )
      }

    </div>

    <div className="results-header">

      <h2>
        Results
      </h2>

      <div
        style={{
          display: "flex",
          gap: "10px"
        }}
      >

        <button
          onClick={() =>
            setViewMode(
              "grid"
            )
          }
          className={
            viewMode === "grid"
              ? "btn btn-primary"
              : "btn btn-secondary"
          }
        >
          Grid
        </button>

        <button
          onClick={() =>
            setViewMode(
              "list"
            )
          }
          className={
            viewMode === "list"
              ? "btn btn-primary"
              : "btn btn-secondary"
          }
        >
          List
        </button>

      </div>

    </div>

    {
      viewMode === "grid"
      ? (

        <div className="grid-view">

          {
            results.map(
              doc => (

                <div
                  key={
                    doc.filePath
                  }
                  className="card"
                  onClick={() =>
                    window
                      .electronAPI
                      .openFile(
                        doc.filePath
                      )
                  }
                >

                  <div className="thumbnail">

                    {
                      doc.filePath?.match(
                        /\.(png|jpg|jpeg)$/i
                      )
                      ? (
                        <ImageThumbnail
                          path={
                            doc.filePath
                          }
                        />
                      )
                      : (
                        <div
                          style={{
                            fontSize:
                              "60px"
                          }}
                        >
                          📄
                        </div>
                      )
                    }

                  </div>

                  <h3 className="file-name">
                    {doc.fileName}
                  </h3>

                  <p className="preview">
                    {doc.preview}
                  </p>

                </div>

              )
            )
          }

        </div>

      )
      : (

        <div className="list-view">

          {
            results.map(
              doc => (

                <div
                  key={
                    doc.filePath
                  }
                  className="card"
                  onClick={() =>
                    window
                      .electronAPI
                      .openFile(
                        doc.filePath
                      )
                  }
                >

                  <h3 className="file-name">
                    {doc.fileName}
                  </h3>

                  <p className="preview">
                    {doc.preview}
                  </p>

                </div>

              )
            )
          }

        </div>

      )
    }

  </div>
);
}

export default App;
