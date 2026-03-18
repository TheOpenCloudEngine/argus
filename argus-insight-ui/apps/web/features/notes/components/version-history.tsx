"use client"

import { useCallback, useEffect, useState } from "react"
import { History, RotateCcw } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"
import { Badge } from "@workspace/ui/components/badge"
import { Separator } from "@workspace/ui/components/separator"
import { MarkdownPreview } from "./markdown-preview"
import { useNotes } from "./notes-provider"
import {
  fetchVersions,
  fetchVersion,
  restoreVersion,
  type VersionListItem,
  type Version,
} from "../api"

interface VersionHistoryProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function VersionHistory({ open, onOpenChange }: VersionHistoryProps) {
  const { currentPage, refreshCurrentPage } = useNotes()
  const [versions, setVersions] = useState<VersionListItem[]>([])
  const [selectedVersion, setSelectedVersion] = useState<Version | null>(null)
  const [loading, setLoading] = useState(false)

  const loadVersions = useCallback(async () => {
    if (!currentPage) return
    setLoading(true)
    try {
      const data = await fetchVersions(currentPage.id)
      setVersions(data)
    } finally {
      setLoading(false)
    }
  }, [currentPage])

  useEffect(() => {
    if (open && currentPage) {
      loadVersions()
      setSelectedVersion(null)
    }
  }, [open, currentPage, loadVersions])

  const handleSelectVersion = async (v: VersionListItem) => {
    if (!currentPage) return
    const ver = await fetchVersion(currentPage.id, v.version)
    setSelectedVersion(ver)
  }

  const handleRestore = async () => {
    if (!currentPage || !selectedVersion) return
    await restoreVersion(currentPage.id, selectedVersion.version)
    await refreshCurrentPage()
    setSelectedVersion(null)
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[600px] sm:max-w-[600px] flex flex-col p-0">
        <SheetHeader className="px-6 py-4 border-b shrink-0">
          <SheetTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Version History
          </SheetTitle>
        </SheetHeader>
        <div className="flex flex-1 min-h-0">
          {/* Version list */}
          <div className="w-52 border-r overflow-auto shrink-0">
            {loading ? (
              <div className="p-4 text-sm text-muted-foreground">Loading...</div>
            ) : versions.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">No versions</div>
            ) : (
              <div className="flex flex-col">
                {versions.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => handleSelectVersion(v)}
                    className={`text-left px-3 py-2.5 border-b hover:bg-muted/50 transition-colors ${
                      selectedVersion?.version === v.version ? "bg-muted" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        v{v.version}
                      </Badge>
                      {v.version === currentPage?.currentVersion && (
                        <Badge variant="default" className="text-xs">
                          current
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {v.changeSummary || "No description"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(v.createdAt).toLocaleString()}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Version preview */}
          <div className="flex-1 flex flex-col min-w-0">
            {selectedVersion ? (
              <>
                <div className="flex items-center justify-between px-4 py-2 border-b shrink-0">
                  <div>
                    <span className="text-sm font-medium">{selectedVersion.title}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      v{selectedVersion.version}
                    </span>
                  </div>
                  {selectedVersion.version !== currentPage?.currentVersion && (
                    <Button size="sm" variant="outline" onClick={handleRestore}>
                      <RotateCcw className="h-3.5 w-3.5 mr-1" />
                      Restore
                    </Button>
                  )}
                </div>
                <div className="flex-1 overflow-auto">
                  <MarkdownPreview content={selectedVersion.content} />
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <History className="h-8 w-8 mb-2" />
                <p className="text-sm">Select a version to preview</p>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
