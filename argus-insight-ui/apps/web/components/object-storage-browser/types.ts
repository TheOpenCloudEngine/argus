/** Represents a "folder" (common prefix) in the object storage. */
export type StorageFolder = {
  kind: "folder"
  /** The full prefix key (e.g. "data/logs/2026/"). Always ends with "/". */
  key: string
  /** Display name (last segment, e.g. "2026"). */
  name: string
}

/** Represents a single object (file) in the object storage. */
export type StorageObject = {
  kind: "object"
  /** The full object key (e.g. "data/logs/2026/app.log"). */
  key: string
  /** Display name (last segment, e.g. "app.log"). */
  name: string
  /** Size in bytes. */
  size: number
  /** Last modified timestamp (ISO 8601). */
  lastModified: string
  /** S3 storage class (e.g. "STANDARD", "GLACIER"). */
  storageClass?: string
}

/** Union type for items displayed in the browser table. */
export type StorageEntry = StorageFolder | StorageObject

/** Response shape returned by the list API. */
export type ListObjectsResponse = {
  /** Folders (common prefixes) at this level. */
  folders: StorageFolder[]
  /** Objects (files) at this level. */
  objects: StorageObject[]
  /** If present, there are more results to fetch. */
  nextContinuationToken?: string
  /** True if the response was truncated. */
  isTruncated: boolean
}

/** Callbacks that the browser delegates to the parent / data layer. */
export type BrowserDataSource = {
  /** List objects under a given prefix with optional pagination token. */
  listObjects: (
    bucket: string,
    prefix: string,
    continuationToken?: string,
  ) => Promise<ListObjectsResponse>

  /** Delete one or more object keys. */
  deleteObjects: (bucket: string, keys: string[]) => Promise<void>

  /** Create a folder (put an empty object with trailing slash). */
  createFolder: (bucket: string, key: string) => Promise<void>

  /** Upload files to the given prefix. Returns when complete. */
  uploadFiles: (bucket: string, prefix: string, files: File[]) => Promise<void>

  /** Get a download URL (presigned) for a given key. */
  getDownloadUrl: (bucket: string, key: string) => Promise<string>
}

/** Sort direction. */
export type SortDirection = "asc" | "desc"

/** Sort configuration. */
export type SortConfig = {
  column: "name" | "size" | "lastModified"
  direction: SortDirection
}
