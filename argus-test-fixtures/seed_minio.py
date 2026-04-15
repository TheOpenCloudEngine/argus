"""
Seed MinIO test bucket with diverse directories and 1M files in one folder.
Usage: python3 seed_minio.py
"""

import boto3
import io
import time
import concurrent.futures
from datetime import datetime

ENDPOINT = "http://10.0.1.50:51000"
ACCESS_KEY = "minioadmin"
SECRET_KEY = "minioadmin"
BUCKET = "test"
REGION = "us-east-1"


def get_client():
    return boto3.client(
        "s3",
        endpoint_url=ENDPOINT,
        aws_access_key_id=ACCESS_KEY,
        aws_secret_access_key=SECRET_KEY,
        region_name=REGION,
    )


def ensure_bucket(s3):
    try:
        s3.head_bucket(Bucket=BUCKET)
        print(f"Bucket '{BUCKET}' already exists.")
    except Exception:
        s3.create_bucket(Bucket=BUCKET)
        print(f"Bucket '{BUCKET}' created.")


def put_text(s3, key: str, content: str = ""):
    s3.put_object(
        Bucket=BUCKET,
        Key=key,
        Body=content.encode("utf-8") if content else b"",
    )


def create_diverse_structure(s3):
    """Create a realistic directory structure with various file types."""
    print("Creating diverse directory structure...")

    # Folders (0-byte objects with trailing slash)
    folders = [
        "data/", "data/raw/", "data/processed/", "data/exports/",
        "logs/", "logs/2026-03/", "logs/2026-02/",
        "backups/", "backups/db/",
        "config/", "models/", "models/v1/", "models/v2/",
        "images/", "images/thumbnails/", "images/originals/",
        "reports/", "reports/quarterly/", "reports/monthly/",
        "scripts/", "temp/",
    ]
    for f in folders:
        put_text(s3, f)

    # Root files
    files = {
        "README.md": "# Test Bucket\nThis is a test bucket for Argus Insight.\n",
        "docker-compose.yml": "version: '3'\nservices:\n  app:\n    image: nginx\n",
        ".env.example": "DB_HOST=localhost\nDB_PORT=5432\n",
    }
    for key, content in files.items():
        put_text(s3, key, content)

    # data/ files
    for i in range(1, 6):
        put_text(s3, f"data/raw/users-2026030{i}.csv", f"id,name,email\n{i},user{i},u{i}@test.com\n" * 100)
        put_text(s3, f"data/raw/transactions-2026030{i}.parquet", "PARQUET_MOCK_DATA" * 500)
    put_text(s3, "data/processed/aggregated-users.parquet", "AGG_DATA" * 200)
    put_text(s3, "data/processed/daily-summary.json", '{"date":"2026-03-14","total":1234}')
    put_text(s3, "data/exports/report-2026-Q1.xlsx", "XLSX_MOCK" * 100)
    put_text(s3, "data/exports/report-2026-Q1.pdf", "PDF_MOCK" * 100)
    put_text(s3, "data/schema.json", '{"type":"object","properties":{"id":{"type":"integer"}}}')
    put_text(s3, "data/pipeline.py", "import pandas as pd\n\ndef run():\n    pass\n")

    # logs/
    put_text(s3, "logs/access.log", "127.0.0.1 GET /api 200\n" * 500)
    put_text(s3, "logs/error.log", "ERROR: something failed\n" * 50)
    for d in range(1, 16):
        put_text(s3, f"logs/2026-03/app-{d:02d}.log.gz", "LOG_GZ_DATA" * 100)
    for d in range(1, 10):
        put_text(s3, f"logs/2026-02/app-{d:02d}.log.gz", "OLD_LOG_DATA" * 80)

    # config/
    configs = {
        "config/nginx.conf": "server { listen 80; }",
        "config/prometheus.yml": "scrape_configs:\n  - job_name: 'app'\n",
        "config/grafana-dashboard.json": '{"dashboard":{"title":"Main"}}',
        "config/alertmanager.yml": "route:\n  receiver: 'default'\n",
    }
    for key, content in configs.items():
        put_text(s3, key, content)

    # models/
    put_text(s3, "models/metadata.json", '{"v1":"2026-01-15","v2":"2026-03-14"}')
    put_text(s3, "models/v1/model.bin", "MODEL_BIN_V1" * 200)
    put_text(s3, "models/v1/config.json", '{"layers":12,"hidden":768}')
    put_text(s3, "models/v2/model.bin", "MODEL_BIN_V2" * 400)
    put_text(s3, "models/v2/config.json", '{"layers":24,"hidden":1024}')
    put_text(s3, "models/v2/tokenizer.json", '{"vocab_size":32000}')

    # images/
    for i in range(1, 21):
        put_text(s3, f"images/originals/photo-{i:04d}.jpg", f"JPEG_DATA_{i}" * 50)
        put_text(s3, f"images/thumbnails/photo-{i:04d}-thumb.jpg", f"THUMB_{i}" * 10)

    # reports/
    for q in ["Q1", "Q2", "Q3", "Q4"]:
        put_text(s3, f"reports/quarterly/{q}-2025.pdf", f"QUARTERLY_REPORT_{q}" * 100)
    for m in range(1, 13):
        put_text(s3, f"reports/monthly/{m:02d}-2025.pdf", f"MONTHLY_REPORT_{m}" * 50)

    # scripts/
    scripts = {
        "scripts/deploy.sh": "#!/bin/bash\necho 'deploying...'\n",
        "scripts/backup.sh": "#!/bin/bash\npg_dump > backup.sql\n",
        "scripts/cleanup.py": "import os\nprint('cleaning temp files')\n",
        "scripts/migrate.sql": "ALTER TABLE users ADD COLUMN role VARCHAR(20);\n",
    }
    for key, content in scripts.items():
        put_text(s3, key, content)

    print("  Diverse structure created.")


def create_million_files(s3):
    """Create 1,000,000 files inside stress-test/ directory using parallel uploads."""
    PREFIX = "stress-test/"
    TOTAL = 1_000_000
    BATCH_SIZE = 1000  # files per batch upload call

    # Create the folder marker
    put_text(s3, PREFIX)

    print(f"Creating {TOTAL:,} files in '{PREFIX}' ...")
    start = time.time()

    created = 0

    def upload_batch(batch_start: int, batch_end: int):
        """Upload a batch of files using a fresh S3 client (thread-safe)."""
        client = get_client()
        for i in range(batch_start, batch_end):
            key = f"{PREFIX}file-{i:07d}.txt"
            client.put_object(
                Bucket=BUCKET,
                Key=key,
                Body=f"test content {i}".encode(),
            )
        return batch_end - batch_start

    # Use ThreadPoolExecutor for parallel uploads
    WORKERS = 32
    batches = []
    for start_idx in range(0, TOTAL, BATCH_SIZE):
        end_idx = min(start_idx + BATCH_SIZE, TOTAL)
        batches.append((start_idx, end_idx))

    with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as executor:
        futures = {
            executor.submit(upload_batch, b[0], b[1]): b
            for b in batches
        }
        for future in concurrent.futures.as_completed(futures):
            created += future.result()
            if created % 50_000 == 0:
                elapsed = time.time() - start
                rate = created / elapsed if elapsed > 0 else 0
                print(f"  Progress: {created:>10,} / {TOTAL:,}  ({rate:,.0f} files/sec)")

    elapsed = time.time() - start
    print(f"  Done: {created:,} files in {elapsed:.1f}s ({created/elapsed:,.0f} files/sec)")


def verify(s3):
    """Quick verification of what was created."""
    print("\nVerification:")

    # Count root-level entries
    resp = s3.list_objects_v2(Bucket=BUCKET, Prefix="", Delimiter="/", MaxKeys=100)
    folders = [cp["Prefix"] for cp in resp.get("CommonPrefixes", [])]
    objects = [o["Key"] for o in resp.get("Contents", [])]
    print(f"  Root folders: {len(folders)} -> {folders}")
    print(f"  Root files: {len(objects)} -> {objects}")

    # Count stress-test files (just first page)
    resp = s3.list_objects_v2(Bucket=BUCKET, Prefix="stress-test/", Delimiter="/", MaxKeys=10)
    total_in_stress = resp.get("KeyCount", 0)
    is_truncated = resp.get("IsTruncated", False)
    print(f"  stress-test/ first page: {total_in_stress} objects, truncated={is_truncated}")

    # Full count by iterating
    paginator = s3.get_paginator("list_objects_v2")
    count = 0
    for page in paginator.paginate(Bucket=BUCKET, Prefix="stress-test/"):
        count += page.get("KeyCount", 0)
    print(f"  stress-test/ total objects: {count:,}")


def main():
    s3 = get_client()
    ensure_bucket(s3)
    create_diverse_structure(s3)
    create_million_files(s3)
    verify(s3)
    print("\nAll done!")


if __name__ == "__main__":
    main()
