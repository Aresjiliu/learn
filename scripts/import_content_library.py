"""Import the verified local content export into an isolated MySQL database."""

from __future__ import annotations

import csv
import gzip
import hashlib
import json
import os
import re
from pathlib import Path

import pymysql


HOST = os.environ.get("LOCAL_DB_HOST", "127.0.0.1")
PORT = int(os.environ.get("LOCAL_DB_PORT", "3316"))
USER = os.environ.get("LOCAL_DB_USER", "root")
PASSWORD = os.environ.get("LOCAL_DB_PASSWORD")
DATABASE = "ruflo_content"
EXPORT_DIR = Path(os.environ.get("REMOTE_EXPORT_DIR", "data/remote_7500km"))
INSERT_BATCH_SIZE = int(os.environ.get("CONTENT_INSERT_BATCH_SIZE", "1000"))
IMPORT_ONLY_TABLES = {
    item.strip() for item in os.environ.get("IMPORT_ONLY_TABLES", "").split(",") if item.strip()
}


def identifier(value: str) -> str:
    if not re.fullmatch(r"[A-Za-z0-9_]+", value):
        raise ValueError(f"Unsafe identifier: {value}")
    return f"`{value}`"


def connect(database: str | None = None, local_infile: bool = False):
    if not PASSWORD:
        raise RuntimeError("LOCAL_DB_PASSWORD is required")
    return pymysql.connect(
        host=HOST,
        port=PORT,
        user=USER,
        password=PASSWORD,
        database=database,
        charset="utf8mb4",
        local_infile=local_infile,
        connect_timeout=30,
        read_timeout=300,
        write_timeout=300,
    )


def verify_file(path: Path, expected_hash: str, expected_rows: int) -> None:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    if digest.hexdigest() != expected_hash:
        raise RuntimeError(f"SHA-256 mismatch: {path.name}")
    with gzip.open(path, "rt", encoding="utf-8", newline="") as source:
        reader = csv.reader(source)
        next(reader)
        rows = sum(1 for _ in reader)
    if rows != expected_rows:
        raise RuntimeError(f"Row count mismatch: {path.name}: {rows} != {expected_rows}")


def table_name(schema: str, table: str) -> str:
    return f"raw_{schema}__{table}"


def import_table(connection, record: dict) -> int:
    source = EXPORT_DIR / record["file"]
    verify_file(source, record["sha256"], record["rows_exported"])
    raw_table = table_name(record["schema"], record["table"])

    with gzip.open(source, "rt", encoding="utf-8", newline="") as compressed:
        reader = csv.reader(compressed)
        columns = next(reader)

    column_sql = ", ".join(f"{identifier(column)} LONGTEXT NULL" for column in columns)
    with connection.cursor() as cursor:
        cursor.execute(f"DROP TABLE IF EXISTS {identifier(raw_table)}")
        cursor.execute(
            f"CREATE TABLE {identifier(raw_table)} ("
            "_import_row_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, "
            f"{column_sql}"
            ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
        )

    load_columns = ", ".join(identifier(column) for column in columns)
    placeholders = ", ".join(["%s"] * len(columns))
    insert_sql = f"INSERT INTO {identifier(raw_table)} ({load_columns}) VALUES ({placeholders})"
    inserted = 0
    batch = []
    with gzip.open(source, "rt", encoding="utf-8", newline="") as compressed:
        reader = csv.reader(compressed)
        next(reader)
        with connection.cursor() as cursor:
            for row in reader:
                if len(row) != len(columns):
                    raise RuntimeError(f"CSV field count mismatch in {source.name}: {len(row)} != {len(columns)}")
                batch.append(row)
                if len(batch) >= INSERT_BATCH_SIZE:
                    cursor.executemany(insert_sql, batch)
                    inserted += len(batch)
                    batch.clear()
                    connection.commit()
                    print(f"  inserted {inserted} rows", flush=True)
            if batch:
                cursor.executemany(insert_sql, batch)
                inserted += len(batch)
                connection.commit()
    if inserted != record["rows_exported"]:
        raise RuntimeError(f"Inserted row count mismatch: {raw_table}: {inserted}")
    with connection.cursor() as cursor:
        cursor.execute(f"SELECT COUNT(*) FROM {identifier(raw_table)}")
        actual = cursor.fetchone()[0]
    if actual != record["rows_exported"]:
        raise RuntimeError(f"Imported row count mismatch: {raw_table}: {actual}")
    return actual


def main() -> None:
    manifest_path = EXPORT_DIR / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    admin = connect()
    with admin.cursor() as cursor:
        cursor.execute("SET GLOBAL local_infile = 1")
        cursor.execute(
            f"CREATE DATABASE IF NOT EXISTS {identifier(DATABASE)} "
            "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
        )
    admin.commit()
    admin.close()

    connection = connect(DATABASE, local_infile=True)
    report = {"database": DATABASE, "tables": []}
    try:
        for record in manifest["tables"]:
            if IMPORT_ONLY_TABLES and f"{record['schema']}.{record['table']}" not in IMPORT_ONLY_TABLES:
                continue
            print(f"Importing {record['schema']}.{record['table']}...", flush=True)
            rows = import_table(connection, record)
            report["tables"].append({"table": table_name(record["schema"], record["table"]), "rows": rows})
            print(f"  imported {rows} rows", flush=True)
    finally:
        connection.close()
    (EXPORT_DIR / "local_import_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"Imported {len(report['tables'])} tables into {DATABASE}")


if __name__ == "__main__":
    main()

