"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Save,
  History,
  FileText,
} from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Separator } from "@workspace/ui/components/separator"
import { useCreateBlockNote } from "@blocknote/react"
import { BlockNoteView } from "@blocknote/shadcn"
import "@blocknote/core/style.css"
import "@blocknote/shadcn/style.css"
import { VersionHistory } from "./version-history"
import { useNotes } from "./notes-provider"

export function PageEditor() {
  const { currentPage, savePage } = useNotes()
  const [title, setTitle] = useState("")
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showVersions, setShowVersions] = useState(false)
  const contentRef = useRef("")
  const isLoadingRef = useRef(false)

  const editor = useCreateBlockNote()

  // Load content from currentPage into BlockNote
  useEffect(() => {
    if (!currentPage || !editor) return
    isLoadingRef.current = true
    setTitle(currentPage.title)
    contentRef.current = currentPage.content
    setDirty(false)

    const loadContent = async () => {
      try {
        if (currentPage.content) {
          const blocks = await editor.tryParseMarkdownToBlocks(currentPage.content)
          editor.replaceBlocks(editor.document, blocks)
        } else {
          editor.replaceBlocks(editor.document, [])
        }
      } finally {
        isLoadingRef.current = false
      }
    }
    loadContent()
  }, [currentPage, editor])

  const handleEditorChange = useCallback(async () => {
    if (isLoadingRef.current || !editor || !currentPage) return
    const md = await editor.blocksToMarkdownLossy(editor.document)
    contentRef.current = md
    setDirty(true)
  }, [editor, currentPage])

  const handleTitleChange = useCallback(
    (value: string) => {
      setTitle(value)
      if (currentPage && value !== currentPage.title) {
        setDirty(true)
      }
    },
    [currentPage],
  )

  const handleSave = useCallback(async () => {
    if (!currentPage || !dirty) return
    setSaving(true)
    try {
      await savePage(currentPage.id, title, contentRef.current)
      setDirty(false)
    } finally {
      setSaving(false)
    }
  }, [currentPage, title, dirty, savePage])

  // Ctrl+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [handleSave])

  if (!currentPage) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <FileText className="h-12 w-12 mb-4" />
        <p className="text-lg font-medium">Select a page</p>
        <p className="text-sm">Choose a page from the list to start editing</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0">
        <Input
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          className="h-8 font-semibold text-lg border-none shadow-none focus-visible:ring-0 px-1"
          placeholder="Page title"
        />
        <Separator orientation="vertical" className="h-5" />
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-sm"
          onClick={() => setShowVersions(true)}
        >
          <History className="h-3.5 w-3.5 mr-1" />
          v{currentPage.currentVersion}
        </Button>
        <Button
          size="sm"
          className="h-7 ml-auto"
          onClick={handleSave}
          disabled={!dirty || saving}
        >
          <Save className="h-3.5 w-3.5 mr-1" />
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>

      {/* BlockNote Editor */}
      <div className="flex-1 min-h-0 overflow-auto">
        <BlockNoteView
          editor={editor}
          onChange={handleEditorChange}
          theme="light"
        />
      </div>

      {/* Status bar */}
      <div className="flex items-center px-3 py-1.5 border-t text-sm text-muted-foreground shrink-0">
        <span>
          {dirty ? "Unsaved changes" : `Last saved ${new Date(currentPage.updatedAt).toLocaleString()}`}
        </span>
        <span className="ml-auto">Version {currentPage.currentVersion}</span>
      </div>

      {/* Version history sheet */}
      <VersionHistory open={showVersions} onOpenChange={setShowVersions} />
    </div>
  )
}
