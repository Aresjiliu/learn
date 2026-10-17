"""Verify the isolated local content database against the export manifest."""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

import pymysql


HOST = os.environ.get("LOCAL_DB_HOST", "127.0.0.1")
PORT = int(os.environ.get("LOCAL_DB_PORT", "3316"))
USER = os.environ.get("LOCAL_DB_USER", "root")
PASSWORD = os.environ.get("LOCAL_DB_PASSWORD")
EXPORT_DIR = Path(os.environ.get("REMOTE_EXPORT_DIR", "data/remote_7500km"))
CONTENT_DATABASE = "ruflo_content"
LEGACY_DATABASE = "ruflo_db"


def identifier(value: str) -> str:
    if not re.fullmatch(r"[A-Za-z0-9_]+", value):
        raise ValueError(f"Unsafe identifier: {value}")
    return f"`{value}`"


def connect(database: str | None = None):
    if not PASSWORD:
        raise RuntimeError("LOCAL_DB_PASSWORD is required")
    return pymysql.connect(
        host=HOST,
        port=PORT,
        user=USER,
        password=PASSWORD,
        database=database,
        charset="utf8mb4",
        connect_timeout=30,
        read_timeout=300,
    )


def main() -> None:
    manifest = json.loads((EXPORT_DIR / "manifest.json").read_text(encoding="utf-8"))
    connection = connect()
    mismatches: list[str] = []
    report_tables: list[dict[str, int | str]] = []
    try:
        with connection.cursor() as cursor:
            cursor.execute("SHOW DATABASES LIKE %s", (CONTENT_DATABASE,))
            if cursor.fetchone() is None:
                raise RuntimeError(f"Missing database: {CONTENT_DATABASE}")
            cursor.execute("SHOW DATABASES LIKE %s", (LEGACY_DATABASE,))
            if cursor.fetchone() is None:
                raise RuntimeError(f"Missing legacy database: {LEGACY_DATABASE}")

            for record in manifest["tables"]:
                raw_table = f"raw_{record['schema']}__{record['table']}"
                cursor.execute("SHOW TABLES IN " + identifier(CONTENT_DATABASE) + " LIKE %s", (raw_table,))
                if cursor.fetchone() is None:
                    mismatches.append(f"missing {raw_table}")
                    continue
                cursor.execute(
                    f"SELECT COUNT(*) FROM {identifier(CONTENT_DATABASE)}.{identifier(raw_table)}"
                )
                actual = int(cursor.fetchone()[0])
                expected = int(record["rows_exported"])
                print(f"{raw_table}: {actual}/{expected}")
                report_tables.append({"table": raw_table, "rows": actual, "expected_rows": expected})
                if actual != expected:
                    mismatches.append(f"{raw_table}: {actual} != {expected}")

            cursor.execute("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=%s", (LEGACY_DATABASE,))
            print(f"{LEGACY_DATABASE} tables: {cursor.fetchone()[0]}")
    finally:
        connection.close()

    if mismatches:
        raise SystemExit("Verification failed:\n" + "\n".join(mismatches))
    report = {"database": CONTENT_DATABASE, "source_manifest": "manifest.json", "tables": report_tables}
    (EXPORT_DIR / "local_import_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"Verified {len(manifest['tables'])} content tables; {LEGACY_DATABASE} remains present.")


if __name__ == "__main__":
    main()
