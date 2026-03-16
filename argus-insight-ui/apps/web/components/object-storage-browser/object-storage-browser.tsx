"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2 } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import type {
  BrowserDataSource,
  SortConfig,
  StorageEntry,
  StorageFolder,
  StorageObject,
} from "./types"
import { BrowserBreadcrumb } from "./browser-breadcrumb"
import { BrowserToolbar } from "./browser-toolbar"
import { BrowserTable } from "./browser-table"
import { CreateFolderDialog } from "./create-folder-dialog"
import { UploadDialog } from "./upload-dialog"
import { DeleteDialog } from "./delete-dialog"

type ObjectStorageBrowserProps = {
  /** The bucket name to browse. */
  bucket: string
  /** Data source callbacks. */
  dataSource: BrowserDataSource
  /** Optional CSS class for the root container. */
  className?: string
}

export function ObjectStorageBrowser({
  bucket,
  dataSource,
  className,
}: ObjectStorageBrowserProps) {
  // --- Navigation state ---
  const [prefix, setPrefix] = useState("")
  const [navigationHistory, setNavigationHistory] = useState<string[]>([])

  // --- Data state ---
  const [folders, setFolders] = useState<StorageFolder[]>([])
  const [objects, setObjects] = useState<StorageObject[]>([])
  const [continuationToken, setContinuationToken] = useState<string | undefined>()
  const [isTruncated, setIsTruncated] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  // --- UI state ---
  const [searchValue, setSearchValue] = useState("")
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [sort, setSort] = useState<SortConfig>({ column: "name", direction: "asc" })

  // --- Dialog state ---
  const [createFolderOpen, setCreateFolderOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [dialogLoading, setDialogLoading] = useState(false)

  // --- Data fetching ---
  const fetchData = useCallback(
    async (targetPrefix: string, token?: string) => {
      const isAppend = !!token
      if (isAppend) {
        setIsLoadingMore(true)
      } else {
        setIsLoading(true)
      }

      try {
        const response = await dataSource.listObjects(bucket, targetPrefix, token)

        if (isAppend) {
          setObjects((prev) => [...prev, ...response.objects])
        } else {
          setFolders(response.folders)
          setObjects(response.objects)
        }
        setContinuationToken(response.nextContinuationToken)
        setIsTruncated(response.isTruncated)
      } finally {
        setIsLoading(false)
        setIsLoadingMore(false)
      }
    },
    [bucket, dataSource],
  )

  // Fetch on prefix change
  useEffect(() => {
    setSelectedKeys(new Set())
    setSearchValue("")
    setContinuationToken(undefined)
    fetchData(prefix)
  }, [prefix, fetchData])

  // --- Navigation ---
  function navigateTo(targetPrefix: string) {
    setNavigationHistory((prev) => [...prev, prefix])
    setPrefix(targetPrefix)
  }

  function navigateBack() {
    const prev = navigationHistory[navigationHistory.length - 1]
    if (prev !== undefined) {
      setNavigationHistory((h) => h.slice(0, -1))
      setPrefix(prev)
    }
  }

  // --- Sorting & filtering ---
  const entries = useMemo(() => {
    const all: StorageEntry[] = [...folders, ...objects]

    // Filter
    const filtered = searchValue
      ? all.filter((e) =>
          e.name.toLowerCase().includes(searchValue.toLowerCase()),
        )
      : all

    // Sort: folders always first, then sort within each group
    const sortedFolders = filtered
      .filter((e): e is StorageFolder => e.kind === "folder")
      .sort((a, b) => {
        if (sort.column === "name") {
          const cmp = a.name.localeCompare(b.name)
          return sort.direction === "asc" ? cmp : -cmp
        }
        return 0
      })

    const sortedObjects = filtered
      .filter((e): e is StorageObject => e.kind === "object")
      .sort((a, b) => {
        let cmp = 0
        switch (sort.column) {
          case "name":
            cmp = a.name.localeCompare(b.name)
            break
          case "size":
            cmp = a.size - b.size
            break
          case "lastModified":
            cmp = new Date(a.lastModified).getTime() - new Date(b.lastModified).getTime()
            break
        }
        return sort.direction === "asc" ? cmp : -cmp
      })

    return [...sortedFolders, ...sortedObjects]
  }, [folders, objects, searchValue, sort])

  // --- Actions ---
  async function handleCreateFolder(folderName: string) {
    setDialogLoading(true)
    try {
      await dataSource.createFolder(bucket, `${prefix}${folderName}/`)
      setCreateFolderOpen(false)
      await fetchData(prefix)
    } finally {
      setDialogLoading(false)
    }
  }

  async function handleUpload(files: File[]) {
    setDialogLoading(true)
    try {
      await dataSource.uploadFiles(bucket, prefix, files)
      setUploadOpen(false)
      await fetchData(prefix)
    } finally {
      setDialogLoading(false)
    }
  }

  async function handleDelete() {
    setDialogLoading(true)
    try {
      await dataSource.deleteObjects(bucket, Array.from(selectedKeys))
      setDeleteOpen(false)
      setSelectedKeys(new Set())
      await fetchData(prefix)
    } finally {
      setDialogLoading(false)
    }
  }

  async function handleDownload() {
    const fileKeys = Array.from(selectedKeys).filter((k) => !k.endsWith("/"))
    for (const key of fileKeys) {
      const url = await dataSource.getDownloadUrl(bucket, key)
      window.open(url, "_blank")
    }
  }

  function handleLoadMore() {
    if (continuationToken) {
      fetchData(prefix, continuationToken)
    }
  }

  return (
    <div className={className}>
      <div className="flex flex-col gap-3">
        {/* Breadcrumb */}
        <BrowserBreadcrumb
          bucket={bucket}
          prefix={prefix}
          onNavigate={(p) => {
            setNavigationHistory([])
            setPrefix(p)
          }}
        />

        {/* Toolbar */}
        <BrowserToolbar
          searchValue={searchValue}
          onSearchChange={setSearchValue}
          selectedCount={selectedKeys.size}
          onUpload={() => setUploadOpen(true)}
          onCreateFolder={() => setCreateFolderOpen(true)}
          onDelete={() => setDeleteOpen(true)}
          onDownload={handleDownload}
          onRefresh={() => fetchData(prefix)}
          isLoading={isLoading}
        />

        {/* Table */}
        <BrowserTable
          entries={entries}
          selectedKeys={selectedKeys}
          onSelectionChange={setSelectedKeys}
          onFolderOpen={navigateTo}
          sort={sort}
          onSortChange={setSort}
          isLoading={isLoading}
        />

        {/* Load more / status bar */}
        <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
          <span>
            {folders.length} folder{folders.length !== 1 ? "s" : ""},{" "}
            {objects.length} object{objects.length !== 1 ? "s" : ""}
            {searchValue && ` (filtered: ${entries.length})`}
          </span>
          {isTruncated && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleLoadMore}
              disabled={isLoadingMore}
              className="h-7 text-xs"
            >
              {isLoadingMore ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                  Loading...
                </>
              ) : (
                "Load more"
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <CreateFolderDialog
        open={createFolderOpen}
        onOpenChange={setCreateFolderOpen}
        currentPrefix={prefix}
        onConfirm={handleCreateFolder}
        isLoading={dialogLoading}
      />
      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        currentPrefix={prefix}
        onConfirm={handleUpload}
        isLoading={dialogLoading}
      />
      <DeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        selectedKeys={Array.from(selectedKeys)}
        onConfirm={handleDelete}
        isLoading={dialogLoading}
      />
    </div>
  )
}
