#!/usr/bin/env python3
import json
import os
import sqlite3
from pathlib import Path

import numpy as np
from sentence_transformers import SentenceTransformer


ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "electron" / "data" / "documents.sqlite"
MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"

QUERIES = [
    {
        "query": "paper",
        "terms": [
            "paper",
            "question",
            "questions",
            "exam",
            "examination",
            "theory",
            "pyq",
            "pyqs",
            "jee",
            "printed pages",
        ],
    },
    {
        "query": "exam paper",
        "terms": [
            "paper",
            "question",
            "exam",
            "examination",
            "theory",
            "printed pages",
            "marks",
            "attempt",
        ],
    },
    {
        "query": "jee paper",
        "terms": [
            "jee",
            "xii",
            "xiith",
            "pass",
            "paper",
            "solutions",
            "vidyamandir",
        ],
    },
    {
        "query": "assignment",
        "terms": [
            "assignment",
            "assignments",
            "homework",
            "worksheet",
            "question",
            "questions",
            "bcs",
            "bve",
            "bas",
        ],
    },
    {
        "query": "python programming",
        "terms": [
            "python",
            "programming",
            "function",
            "list",
            "tuple",
            "dictionary",
            "return",
        ],
    },
    {
        "query": "sensor instrumentation",
        "terms": [
            "sensor",
            "sensors",
            "instrumentation",
            "boe305",
            "boe405",
            "koe044",
            "koe034",
        ],
    },
    {
        "query": "marks",
        "terms": [
            "marks",
            "student",
            "internal",
            "score",
            "result",
            "toppers",
            "subject",
        ],
    },
    {
        "query": "certificate",
        "terms": [
            "certificate",
            "certificates",
            "completion",
            "participation",
            "hackathon",
            "verified",
            "award",
        ],
    },
    {
        "query": "grammar",
        "terms": [
            "grammar",
            "english",
            "noun",
            "pronoun",
            "verb",
            "tense",
            "sentence",
        ],
    },
    {
        "query": "computer organization",
        "terms": [
            "computer organization",
            "coa",
            "logic gate",
            "binary",
            "flip flop",
            "architecture",
            "bcs352",
        ],
    },
]

TOP_K_VALUES = [
    5,
    10,
    20,
    30,
    50,
]

THRESHOLDS = [
    0.15,
    0.20,
    0.25,
    0.30,
    0.35,
    0.40,
    0.50,
]


def normalize_vectors(vectors):
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    norms[norms == 0] = 1
    return vectors / norms


def load_documents():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row

    documents = []
    rows = connection.execute(
        """
        SELECT
          document_id,
          file_name,
          category,
          title_tags_json,
          keyword_tags_json,
          metadata_json,
          text,
          clean_text,
          total_pages,
          indexed_pages,
          status,
          embedding_json
        FROM documents
        ORDER BY updated_at DESC, file_name ASC
        """
    ).fetchall()

    for row in rows:
        embedding = json.loads(row["embedding_json"] or "[]")
        if not embedding:
            continue

        pages = connection.execute(
            """
            SELECT clean_text, text
            FROM pages
            WHERE document_id = ? AND status != 'failed'
            ORDER BY page_number
            """,
            (row["document_id"],),
        ).fetchall()

        page_text = "\n".join(
            (page["clean_text"] or page["text"] or "")
            for page in pages
        )
        title_tags = json.loads(row["title_tags_json"] or "[]")
        keyword_tags = json.loads(row["keyword_tags_json"] or "[]")
        metadata = json.loads(row["metadata_json"] or "{}")
        plan_b = metadata.get("planB") or {}
        entity_text = " ".join(
            entity.get("text", "")
            for entity in plan_b.get("entities", [])
            if isinstance(entity, dict)
        )
        metadata_text = " ".join(
            [
                " ".join(plan_b.get("yakeKeywords", [])),
                " ".join(plan_b.get("combinedKeywords", [])),
                " ".join(plan_b.get("nounPhrases", [])),
                entity_text,
            ]
        )
        search_text = " ".join(
            [
                row["file_name"] or "",
                row["category"] or "",
                " ".join(title_tags),
                " ".join(keyword_tags),
                metadata_text,
                row["clean_text"] or "",
                row["text"] or "",
                page_text,
            ]
        ).lower()

        documents.append(
            {
                "id": row["document_id"],
                "file": row["file_name"],
                "status": row["status"],
                "total_pages": row["total_pages"],
                "indexed_pages": row["indexed_pages"],
                "keywords": keyword_tags[:8],
                "search_text": search_text,
                "embedding": embedding,
            }
        )

    connection.close()
    return documents


def is_useful(document, terms):
    text = document["search_text"]
    return any(term.lower() in text for term in terms)


def format_ratio(value):
    if value is None:
        return "-"
    return f"{value:.2f}"


def main():
    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
    os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

    documents = load_documents()
    vectors = normalize_vectors(
        np.array([document["embedding"] for document in documents], dtype="float32")
    )
    model = SentenceTransformer(MODEL_NAME, local_files_only=True)
    query_vectors = normalize_vectors(
        model.encode(
            [query["query"] for query in QUERIES],
            convert_to_numpy=True,
            normalize_embeddings=False,
            show_progress_bar=False,
        ).astype("float32")
    )

    output = []
    output.append(f"Documents with embeddings: {len(documents)}")
    output.append("")
    output.append("## Top-K Limit Table")
    output.append(
        "| Query | Useful pool | K | Shown | Useful | Useless | Precision | Recall | Last score |"
    )
    output.append(
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|"
    )

    per_query_rankings = {}

    for query_index, query in enumerate(QUERIES):
        scores = vectors @ query_vectors[query_index]
        ranking = sorted(
            [
                {
                    **document,
                    "score": float(score),
                    "useful": is_useful(document, query["terms"]),
                }
                for document, score in zip(documents, scores)
            ],
            key=lambda item: item["score"],
            reverse=True,
        )
        per_query_rankings[query["query"]] = ranking
        useful_pool = sum(1 for item in ranking if item["useful"])

        for top_k in TOP_K_VALUES:
            shown = ranking[:top_k]
            useful = sum(1 for item in shown if item["useful"])
            useless = len(shown) - useful
            precision = useful / len(shown) if shown else None
            recall = useful / useful_pool if useful_pool else None
            last_score = shown[-1]["score"] if shown else None
            output.append(
                "| "
                + " | ".join(
                    [
                        query["query"],
                        str(useful_pool),
                        str(top_k),
                        str(len(shown)),
                        str(useful),
                        str(useless),
                        format_ratio(precision),
                        format_ratio(recall),
                        format_ratio(last_score),
                    ]
                )
                + " |"
            )

    output.append("")
    output.append("## Relation Score Threshold Table")
    output.append(
        "| Query | Useful pool | Threshold | Shown | Useful | Useless | Precision | Recall |"
    )
    output.append(
        "|---|---:|---:|---:|---:|---:|---:|---:|"
    )

    for query in QUERIES:
        ranking = per_query_rankings[query["query"]]
        useful_pool = sum(1 for item in ranking if item["useful"])

        for threshold in THRESHOLDS:
            shown = [
                item
                for item in ranking
                if item["score"] >= threshold
            ]
            useful = sum(1 for item in shown if item["useful"])
            useless = len(shown) - useful
            precision = useful / len(shown) if shown else None
            recall = useful / useful_pool if useful_pool else None
            output.append(
                "| "
                + " | ".join(
                    [
                        query["query"],
                        str(useful_pool),
                        f"{threshold:.2f}",
                        str(len(shown)),
                        str(useful),
                        str(useless),
                        format_ratio(precision),
                        format_ratio(recall),
                    ]
                )
                + " |"
            )

    output.append("")
    output.append("## First Useless Result By Query")
    output.append("| Query | Rank | Score | File |")
    output.append("|---|---:|---:|---|")

    for query in QUERIES:
        ranking = per_query_rankings[query["query"]]
        first_useless = next(
            (
                (index + 1, item)
                for index, item in enumerate(ranking)
                if not item["useful"]
            ),
            None,
        )

        if first_useless is None:
            output.append(f"| {query['query']} | - | - | - |")
            continue

        rank, item = first_useless
        output.append(
            f"| {query['query']} | {rank} | {item['score']:.2f} | {item['file']} |"
        )

    print("\n".join(output))


if __name__ == "__main__":
    main()
