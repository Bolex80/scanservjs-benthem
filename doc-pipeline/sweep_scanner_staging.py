#!/usr/bin/env python3
"""Weekly sweep: re-append scanner-archived docs missing from their collection.

The weekly reindex wrappers recreate collections delete-first from their own
staging sources — scanner archives would drop out of the index every week.
This sweep diffs the scanner staging tree (qdrant-scanner-archive-src/<collection>)
against each collection's staged_path payloads and appends the missing ones via
pipeline.index_file (never deletes, continues max(doc_id)).

Run:  /home/alex/workspace/.qdrant-ingest-venv/bin/python sweep_scanner_staging.py
Designed for the cron/wrapper after the weekly reindex (dry-run: --dry-run).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline as pl  # noqa: E402
from qdrant_client import QdrantClient  # noqa: E402
from qdrant_client.models import FieldCondition, Filter, MatchValue  # noqa: E402


def staged_paths_present(client, collection: str, paths: list[str]) -> set[str]:
    present: set[str] = set()
    for path in paths:
        points, _ = client.scroll(
            collection_name=collection,
            scroll_filter=Filter(must=[FieldCondition(
                key="staged_path", match=MatchValue(value=str(path)))]),
            limit=1, with_payload=False, with_vectors=False,
        )
        if points:
            present.add(str(path))
    return present


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    client = QdrantClient(url=pl.QDRANT_URL)
    root = pl.STAGING_ROOT
    if not root.is_dir():
        print(f"staging root missing: {root}")
        return 0

    appended = skipped = failed = 0
    for coll_dir in sorted(p for p in root.iterdir() if p.is_dir()):
        collection = coll_dir.name
        collections = {c.name for c in client.get_collections().collections}
        if collection not in collections:
            print(f"{collection}: collection does not exist, skipping sweep dir")
            continue
        for meta_file in sorted(coll_dir.glob("*.meta.json")):
            pdf = meta_file.with_suffix("")  # name without .meta.json
            if pdf.suffix != ".pdf":
                pdf = meta_file.parent / (meta_file.stem + ".pdf")
            if not pdf.exists():
                continue
            meta = {}
            try:
                meta = json.loads(meta_file.read_text(encoding="utf-8"))
            except Exception:
                pass
            present = staged_paths_present(client, collection, [str(pdf)])
            if present:
                skipped += 1
                continue
            if args.dry_run:
                print(f"[dry-run] would append {pdf.name} -> {collection}")
                appended += 1
                continue
            try:
                result = pl.index_file(pdf, collection, meta.get("archive_path", str(pdf)),
                                       title=meta.get("title") or pdf.stem,
                                       staged_path=str(pdf), classifier="sweep")
                print(f"appended {pdf.name} -> {collection}: "
                      f"{result['points']} points (doc_id {result['doc_id']})")
                appended += 1
            except Exception as exc:
                print(f"FAILED {pdf.name} -> {collection}: {type(exc).__name__}: {exc}")
                failed += 1

    print(f"=== sweep finished: appended {appended}, already indexed {skipped}, failed {failed} ===")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
