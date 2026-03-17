import type { ListObjectsResponse, StorageFolder, StorageObject } from "./types"
import { getNameFromKey } from "./utils"

/**
 * Mock data store that simulates an S3-like bucket structure.
 * Replace this module with real API calls when connecting to the server.
 */

type MockEntry =
  | { kind: "folder"; key: string }
  | {
      kind: "object"
      key: string
      size: number
      lastModified: string
      storageClass?: string
    }

const MOCK_ENTRIES: MockEntry[] = [
  // Root level folders
  { kind: "folder", key: "data/" },
  { kind: "folder", key: "logs/" },
  { kind: "folder", key: "backups/" },
  { kind: "folder", key: "config/" },
  { kind: "folder", key: "models/" },

  // Root level files
  { kind: "object", key: "README.md", size: 2048, lastModified: "2026-03-10T09:00:00Z" },
  { kind: "object", key: "docker-compose.yml", size: 1536, lastModified: "2026-03-12T14:30:00Z" },
  { kind: "object", key: ".env.example", size: 512, lastModified: "2026-02-28T10:00:00Z" },

  // data/ folder
  { kind: "folder", key: "data/raw/" },
  { kind: "folder", key: "data/processed/" },
  { kind: "folder", key: "data/exports/" },
  { kind: "object", key: "data/schema.json", size: 4096, lastModified: "2026-03-14T11:20:00Z" },
  { kind: "object", key: "data/pipeline.py", size: 8192, lastModified: "2026-03-13T16:45:00Z" },

  // data/raw/
  { kind: "object", key: "data/raw/users-20260301.csv", size: 15728640, lastModified: "2026-03-01T00:05:00Z" },
  { kind: "object", key: "data/raw/users-20260302.csv", size: 16252928, lastModified: "2026-03-02T00:05:00Z" },
  { kind: "object", key: "data/raw/users-20260303.csv", size: 14680064, lastModified: "2026-03-03T00:05:00Z" },
  { kind: "object", key: "data/raw/transactions-20260301.parquet", size: 52428800, lastModified: "2026-03-01T01:00:00Z" },
  { kind: "object", key: "data/raw/transactions-20260302.parquet", size: 48234496, lastModified: "2026-03-02T01:00:00Z" },

  // data/processed/
  { kind: "object", key: "data/processed/aggregated-users.parquet", size: 8388608, lastModified: "2026-03-14T08:00:00Z" },
  { kind: "object", key: "data/processed/daily-summary.json", size: 1048576, lastModified: "2026-03-14T08:30:00Z" },

  // data/exports/
  { kind: "object", key: "data/exports/report-2026-Q1.xlsx", size: 3145728, lastModified: "2026-03-15T10:00:00Z" },
  { kind: "object", key: "data/exports/report-2026-Q1.pdf", size: 2097152, lastModified: "2026-03-15T10:05:00Z" },

  // logs/ folder
  { kind: "folder", key: "logs/2026-03/" },
  { kind: "folder", key: "logs/2026-02/" },
  { kind: "object", key: "logs/access.log", size: 104857600, lastModified: "2026-03-16T00:00:00Z" },
  { kind: "object", key: "logs/error.log", size: 5242880, lastModified: "2026-03-16T00:00:00Z" },

  // logs/2026-03/
  { kind: "object", key: "logs/2026-03/app-01.log.gz", size: 20971520, lastModified: "2026-03-15T23:59:00Z" },
  { kind: "object", key: "logs/2026-03/app-02.log.gz", size: 18874368, lastModified: "2026-03-15T23:59:00Z" },
  { kind: "object", key: "logs/2026-03/app-03.log.gz", size: 22020096, lastModified: "2026-03-15T23:59:00Z" },

  // logs/2026-02/
  { kind: "object", key: "logs/2026-02/app-01.log.gz", size: 19922944, lastModified: "2026-02-28T23:59:00Z", storageClass: "GLACIER" },
  { kind: "object", key: "logs/2026-02/app-02.log.gz", size: 17825792, lastModified: "2026-02-28T23:59:00Z", storageClass: "GLACIER" },

  // backups/
  { kind: "folder", key: "backups/db/" },
  { kind: "object", key: "backups/full-backup-20260315.tar.gz", size: 536870912, lastModified: "2026-03-15T02:00:00Z" },
  { kind: "object", key: "backups/full-backup-20260308.tar.gz", size: 524288000, lastModified: "2026-03-08T02:00:00Z", storageClass: "STANDARD_IA" },

  // backups/db/
  { kind: "object", key: "backups/db/postgres-20260316.sql.gz", size: 268435456, lastModified: "2026-03-16T03:00:00Z" },
  { kind: "object", key: "backups/db/postgres-20260315.sql.gz", size: 262144000, lastModified: "2026-03-15T03:00:00Z" },

  // config/
  { kind: "object", key: "config/nginx.conf", size: 2048, lastModified: "2026-03-10T08:00:00Z" },
  { kind: "object", key: "config/prometheus.yml", size: 4096, lastModified: "2026-03-10T08:00:00Z" },
  { kind: "object", key: "config/grafana-dashboard.json", size: 32768, lastModified: "2026-03-11T14:00:00Z" },
  { kind: "object", key: "config/alertmanager.yml", size: 1024, lastModified: "2026-03-10T08:00:00Z" },

  // models/
  { kind: "folder", key: "models/v1/" },
  { kind: "folder", key: "models/v2/" },
  { kind: "object", key: "models/metadata.json", size: 8192, lastModified: "2026-03-14T17:00:00Z" },

  // models/v1/
  { kind: "object", key: "models/v1/model.bin", size: 1073741824, lastModified: "2026-01-15T12:00:00Z", storageClass: "STANDARD_IA" },
  { kind: "object", key: "models/v1/config.json", size: 1024, lastModified: "2026-01-15T12:00:00Z", storageClass: "STANDARD_IA" },

  // models/v2/
  { kind: "object", key: "models/v2/model.bin", size: 2147483648, lastModified: "2026-03-14T16:00:00Z" },
  { kind: "object", key: "models/v2/config.json", size: 2048, lastModified: "2026-03-14T16:00:00Z" },
  { kind: "object", key: "models/v2/tokenizer.json", size: 524288, lastModified: "2026-03-14T16:00:00Z" },
]

const PAGE_SIZE = 20

/**
 * Simulate S3 list_objects_v2 with Delimiter and ContinuationToken support.
 */
export async function mockListObjects(
  _bucket: string,
  prefix: string,
  continuationToken?: string,
): Promise<ListObjectsResponse> {
  // Simulate network delay
  await new Promise((r) => setTimeout(r, 300 + Math.random() * 200))

  // Filter entries that are direct children of the prefix
  const folders: StorageFolder[] = []
  const objects: StorageObject[] = []
  const seenPrefixes = new Set<string>()

  for (const entry of MOCK_ENTRIES) {
    if (!entry.key.startsWith(prefix)) continue
    if (entry.key === prefix) continue

    const remainder = entry.key.slice(prefix.length)

    if (entry.kind === "folder") {
      // Only include direct child folders
      const parts = remainder.replace(/\/$/, "").split("/")
      if (parts.length === 1 && !seenPrefixes.has(entry.key)) {
        seenPrefixes.add(entry.key)
        folders.push({
          kind: "folder",
          key: entry.key,
          name: getNameFromKey(entry.key),
        })
      }
    } else {
      // Only include direct child objects (no "/" in remainder)
      if (!remainder.includes("/")) {
        objects.push({
          kind: "object",
          key: entry.key,
          name: getNameFromKey(entry.key),
          size: entry.size,
          lastModified: entry.lastModified,
          storageClass: entry.storageClass,
        })
      }
    }
  }

  // Simulate pagination on objects (folders are always returned in full)
  const startIndex = continuationToken ? parseInt(continuationToken, 10) : 0
  const paginatedObjects = objects.slice(startIndex, startIndex + PAGE_SIZE)
  const hasMore = startIndex + PAGE_SIZE < objects.length
  const nextToken = hasMore ? String(startIndex + PAGE_SIZE) : undefined

  return {
    folders,
    objects: paginatedObjects,
    nextContinuationToken: nextToken,
    isTruncated: hasMore,
  }
}

export async function mockDeleteObjects(
  _bucket: string,
  _keys: string[],
): Promise<void> {
  await new Promise((r) => setTimeout(r, 500))
}

export async function mockCreateFolder(
  _bucket: string,
  _key: string,
): Promise<void> {
  await new Promise((r) => setTimeout(r, 300))
}

export async function mockUploadFiles(
  _bucket: string,
  _prefix: string,
  _files: File[],
): Promise<void> {
  await new Promise((r) => setTimeout(r, 1000))
}

export async function mockGetDownloadUrl(
  _bucket: string,
  key: string,
): Promise<string> {
  await new Promise((r) => setTimeout(r, 200))
  return `https://example-bucket.s3.amazonaws.com/${key}?presigned=mock`
}
