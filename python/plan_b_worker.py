#!/usr/bin/env python3
import argparse
import json
import math
import os
import sys
import time
from collections import OrderedDict


def now_ms():
    return time.perf_counter() * 1000


def clean_phrase(value):
    return " ".join(str(value or "").lower().split()).strip(" -_:;,.()[]{}")


def dedupe_phrases(phrases, limit=20):
    selected = []
    seen = set()

    for phrase in phrases:
        normalized = clean_phrase(phrase)

        if not normalized or normalized in seen:
            continue

        if any(normalized in item or item in normalized for item in seen):
            continue

        seen.add(normalized)
        selected.append(normalized)

        if len(selected) >= limit:
            break

    return selected


def load_json_input(input_file=None):
    if input_file:
        with open(input_file, "r", encoding="utf-8") as handle:
            return json.load(handle)

    try:
        return json.load(sys.stdin)
    except json.JSONDecodeError as error:
        print(
            json.dumps({
                "error": f"invalid JSON input: {error}"
            }),
            file=sys.stderr,
        )
        sys.exit(2)


def import_optional_modules():
    modules = {}
    errors = {}

    for name in [
        "yake",
        "spacy",
        "sentence_transformers",
        "sklearn",
        "faiss",
        "numpy",
    ]:
        try:
            modules[name] = __import__(name)
        except Exception as error:
            modules[name] = None
            errors[name] = str(error)

    return modules, errors


def make_yake_extractor(yake_module):
    if yake_module is None:
        return None

    return yake_module.KeywordExtractor(
        lan="en",
        n=3,
        dedupLim=0.85,
        top=24,
        features=None,
    )


def extract_yake_keywords(extractor, text):
    if extractor is None or not text.strip():
        return []

    try:
        candidates = extractor.extract_keywords(text)
    except Exception:
        return []

    return dedupe_phrases(
        [phrase for phrase, _score in candidates],
        limit=20,
    )


def load_spacy(spacy_module):
    if spacy_module is None:
        return None

    try:
        return spacy_module.load("en_core_web_sm")
    except Exception:
        try:
            nlp = spacy_module.blank("en")
            nlp.add_pipe("sentencizer")
            return nlp
        except Exception:
            return None


def extract_spacy_signals(nlp, text):
    if nlp is None or not text.strip():
        return {
            "entities": [],
            "nounPhrases": [],
        }

    doc = nlp(text[:120000])
    entities = []
    noun_phrases = []

    for entity in getattr(doc, "ents", []):
        label = getattr(entity, "label_", "")

        if label in {
            "PERSON",
            "ORG",
            "GPE",
            "DATE",
            "PRODUCT",
            "EVENT",
            "WORK_OF_ART",
            "LAW",
        }:
            entities.append({
                "text": clean_phrase(entity.text),
                "label": label,
            })

    if doc.has_annotation("DEP"):
        for chunk in doc.noun_chunks:
            phrase = clean_phrase(chunk.text)

            if 3 <= len(phrase) <= 64:
                noun_phrases.append(phrase)

    unique_entities = []
    seen_entities = set()

    for entity in entities:
        key = (entity["text"], entity["label"])

        if entity["text"] and key not in seen_entities:
            seen_entities.add(key)
            unique_entities.append(entity)

        if len(unique_entities) >= 20:
            break

    return {
        "entities": unique_entities,
        "nounPhrases": dedupe_phrases(noun_phrases, limit=20),
    }


def configure_model_network(allow_model_download):
    if allow_model_download:
        return

    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
    os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")


def configure_native_runtime():
    os.environ.setdefault("OMP_NUM_THREADS", "1")
    os.environ.setdefault("MKL_NUM_THREADS", "1")
    os.environ.setdefault("VECLIB_MAXIMUM_THREADS", "1")
    os.environ.setdefault("NUMEXPR_NUM_THREADS", "1")
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")


def load_embedding_model(sentence_transformers_module, model_name, allow_model_download):
    if sentence_transformers_module is None:
        return None, "sentence_transformers unavailable"

    try:
        model = sentence_transformers_module.SentenceTransformer(
            model_name,
            local_files_only=not allow_model_download,
        )
        return model, None
    except Exception as error:
        return None, str(error)


def normalize_vectors(vectors):
    norms = (vectors * vectors).sum(axis=1) ** 0.5
    norms[norms == 0] = 1
    return vectors / norms[:, None]


def build_vector_index(vectors, modules, top_k=5):
    faiss_module = modules.get("faiss")

    if faiss_module is not None:
        try:
            normalized = normalize_vectors(vectors.astype("float32"))
            index = faiss_module.IndexFlatIP(normalized.shape[1])
            index.add(normalized)
            return {
                "type": "faiss",
                "index": index,
                "vectors": normalized,
            }
        except Exception:
            pass

    try:
        from sklearn.neighbors import NearestNeighbors

        normalized = normalize_vectors(vectors)
        index = NearestNeighbors(
            n_neighbors=min(top_k, len(normalized)),
            metric="cosine",
            algorithm="brute",
        )
        index.fit(normalized)

        return {
            "type": "sklearn-nearest-neighbors",
            "index": index,
            "vectors": normalized,
        }
    except Exception as error:
        return {
            "type": "none",
            "error": str(error),
        }


def search_vector_index(index_info, query_vectors, documents, top_k=5):
    if index_info["type"] == "none":
        return []

    normalized_queries = normalize_vectors(query_vectors)

    if index_info["type"] == "faiss":
        scores, indices = index_info["index"].search(
            normalized_queries.astype("float32"),
            min(top_k, len(documents)),
        )

        return [
            [
                {
                    "file": documents[index]["file"],
                    "score": round(float(score), 4),
                }
                for score, index in zip(row_scores, row_indices)
                if index >= 0
            ]
            for row_scores, row_indices in zip(scores, indices)
        ]

    distances, indices = index_info["index"].kneighbors(
        normalized_queries,
        n_neighbors=min(top_k, len(documents)),
    )

    return [
        [
            {
                "file": documents[index]["file"],
                "score": round(float(1 - distance), 4),
            }
            for distance, index in zip(row_distances, row_indices)
        ]
        for row_distances, row_indices in zip(distances, indices)
    ]


def combine_keywords(yake_keywords, spacy_signals):
    phrases = []
    phrases.extend(yake_keywords)
    phrases.extend(spacy_signals.get("nounPhrases", []))
    phrases.extend(entity["text"] for entity in spacy_signals.get("entities", []))
    return dedupe_phrases(phrases, limit=24)


class PlanBRuntime:
    def __init__(self, allow_model_download=False):
        self.allow_model_download = allow_model_download
        self.timings = OrderedDict()
        self.embedding_models = {}

        started = now_ms()
        self.modules, self.import_errors = import_optional_modules()
        self.timings["importsMs"] = round(now_ms() - started, 2)

        setup_started = now_ms()
        self.yake_extractor = make_yake_extractor(self.modules.get("yake"))
        self.nlp = load_spacy(self.modules.get("spacy"))
        self.timings["nlpSetupMs"] = round(now_ms() - setup_started, 2)

    def get_embedding_model(self, model_name):
        if model_name not in self.embedding_models:
            model, error = load_embedding_model(
                self.modules.get("sentence_transformers"),
                model_name,
                self.allow_model_download,
            )

            if model is None:
                return None, error

            self.embedding_models[model_name] = model

        return self.embedding_models[model_name], None

    def capabilities(self):
        return {
            "yake": self.modules.get("yake") is not None,
            "spacy": self.modules.get("spacy") is not None,
            "spacyPipeline": getattr(self.nlp, "pipe_names", []) if self.nlp else [],
            "sentenceTransformers": self.modules.get("sentence_transformers") is not None,
            "faiss": self.modules.get("faiss") is not None,
            "sklearn": self.modules.get("sklearn") is not None,
            "importErrors": self.import_errors,
        }


def coerce_cached_vectors(documents, modules):
    numpy_module = modules.get("numpy")

    if numpy_module is None or not documents:
        return None

    vectors = []
    dimensions = None

    for document in documents:
        vector = document.get("embedding")

        if not isinstance(vector, list) or not vector:
            return None

        if dimensions is None:
            dimensions = len(vector)
        elif len(vector) != dimensions:
            return None

        try:
            vectors.append([float(value) for value in vector])
        except Exception:
            return None

    try:
        return numpy_module.array(vectors, dtype="float32")
    except Exception:
        return None


def process_payload(payload, runtime, model_name, no_embeddings):
    documents = payload.get("documents", [])
    queries = payload.get("queries", [])
    analyze_documents = payload.get("analyze", True)
    return_embeddings = payload.get("returnEmbeddings", False)
    top_k = max(1, int(payload.get("topK", 5) or 5))
    timings = OrderedDict()

    if payload.get("includeStartupTimings"):
        for key, value in runtime.timings.items():
            timings[key] = value

    per_doc = []
    analyze_started = now_ms()

    for document in documents:
        text = document.get("text") or ""
        yake_keywords = []
        spacy_signals = {
            "entities": [],
            "nounPhrases": [],
        }
        yake_ms = 0
        spacy_ms = 0

        if analyze_documents:
            yake_started = now_ms()
            yake_keywords = extract_yake_keywords(runtime.yake_extractor, text)
            yake_ms = now_ms() - yake_started

            spacy_started = now_ms()
            spacy_signals = extract_spacy_signals(runtime.nlp, text)
            spacy_ms = now_ms() - spacy_started

        per_doc.append({
            "file": document.get("file"),
            "chars": len(text),
            "yakeKeywords": yake_keywords,
            "spacy": spacy_signals,
            "combinedKeywords": combine_keywords(yake_keywords, spacy_signals),
            "timingMs": {
                "yake": round(yake_ms, 2),
                "spacy": round(spacy_ms, 2),
            },
        })

    timings["analysisMs"] = round(now_ms() - analyze_started, 2)

    vector_info = {
        "enabled": False,
        "backend": "none",
        "model": model_name,
        "error": None,
        "queries": [],
    }

    if not no_embeddings and documents:
        embedding_started = now_ms()
        model, model_error = runtime.get_embedding_model(model_name)
        timings["embeddingModelLoadMs"] = round(now_ms() - embedding_started, 2)

        if model is None:
            vector_info["error"] = model_error
        else:
            encode_started = now_ms()
            document_vectors = coerce_cached_vectors(documents, runtime.modules)

            if document_vectors is None:
                document_texts = [
                    (
                        document.get("title") or document.get("file") or ""
                    ) + "\n" + (document.get("text") or "")[:4000]
                    for document in documents
                ]
                document_vectors = model.encode(
                    document_texts,
                    convert_to_numpy=True,
                    normalize_embeddings=False,
                    show_progress_bar=False,
                )
                timings["cachedDocumentEmbeddings"] = False
            else:
                timings["cachedDocumentEmbeddings"] = True

            timings["documentEmbeddingMs"] = round(now_ms() - encode_started, 2)

            if return_embeddings:
                for index, vector in enumerate(document_vectors):
                    per_doc[index]["embedding"] = [
                        round(float(value), 6)
                        for value in vector.tolist()
                    ]
                    per_doc[index]["embeddingModel"] = model_name
                    per_doc[index]["embeddingDimensions"] = len(vector)

            index_started = now_ms()
            index_info = build_vector_index(document_vectors, runtime.modules, top_k)
            timings["vectorIndexBuildMs"] = round(now_ms() - index_started, 2)

            vector_info["enabled"] = index_info["type"] != "none"
            vector_info["backend"] = index_info["type"]

            if index_info["type"] == "none":
                vector_info["error"] = index_info.get("error")
            elif queries:
                query_started = now_ms()
                query_vectors = model.encode(
                    queries,
                    convert_to_numpy=True,
                    normalize_embeddings=False,
                    show_progress_bar=False,
                )
                query_results = search_vector_index(
                    index_info,
                    query_vectors,
                    documents,
                    top_k,
                )
                timings["queryEmbeddingSearchMs"] = round(now_ms() - query_started, 2)
                vector_info["queries"] = [
                    {
                        "query": query,
                        "results": results,
                    }
                    for query, results in zip(queries, query_results)
                ]

    return {
        "capabilities": runtime.capabilities(),
        "startupTimingMs": runtime.timings,
        "timingMs": timings,
        "documents": per_doc,
        "vectorSearch": vector_info,
    }


def write_json_line(payload):
    sys.stdout.write(json.dumps(payload, ensure_ascii=True) + "\n")
    sys.stdout.flush()


def run_server(args):
    runtime = PlanBRuntime(args.allow_model_download)

    write_json_line({
        "type": "ready",
        "capabilities": runtime.capabilities(),
        "startupTimingMs": runtime.timings,
    })

    for line in sys.stdin:
        if not line.strip():
            continue

        try:
            request = json.loads(line)
            request_id = request.get("id")

            if request.get("command") == "shutdown":
                write_json_line({
                    "id": request_id,
                    "ok": True,
                    "type": "shutdown",
                })
                break

            payload = request.get("payload") or {}
            result = process_payload(
                payload,
                runtime,
                request.get("model") or args.model,
                bool(request.get("noEmbeddings", args.no_embeddings)),
            )
            write_json_line({
                "id": request_id,
                "ok": True,
                "result": result,
            })
        except Exception as error:
            write_json_line({
                "id": locals().get("request_id", None),
                "ok": False,
                "error": str(error),
            })


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--model",
        default="sentence-transformers/all-MiniLM-L6-v2",
    )
    parser.add_argument(
        "--no-embeddings",
        action="store_true",
    )
    parser.add_argument(
        "--input-file",
        default=None,
    )
    parser.add_argument(
        "--allow-model-download",
        action="store_true",
    )
    parser.add_argument(
        "--server",
        action="store_true",
    )
    args = parser.parse_args()

    configure_native_runtime()
    configure_model_network(args.allow_model_download)

    if args.server:
        run_server(args)
        return

    payload = load_json_input(args.input_file)
    runtime = PlanBRuntime(args.allow_model_download)
    output = process_payload(
        {
            **payload,
            "includeStartupTimings": True,
        },
        runtime,
        args.model,
        args.no_embeddings,
    )

    print(json.dumps(output, ensure_ascii=True))


if __name__ == "__main__":
    main()
