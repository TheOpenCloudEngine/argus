"use client"

import { useEffect, useState } from "react"
import mammoth from "mammoth"
import { Loader2 } from "lucide-react"

type DocxViewerProps = {
  /** Presigned download URL. */
  url: string
}

export function DocxViewer({ url }: DocxViewerProps) {
  const [html, setHtml] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch file (${res.status})`)
        return res.arrayBuffer()
      })
      .then((buf) => mammoth.convertToHtml({ arrayBuffer: buf }))
      .then((result) => {
        if (result.messages.length > 0) {
          console.warn("DOCX conversion warnings:", result.messages)
        }
        setHtml(result.value)
        setIsLoading(false)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load file")
        setIsLoading(false)
      })
  }, [url])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[200px]">
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    )
  }

  return (
    <div
      className="prose prose-sm max-w-none overflow-auto max-h-[600px] p-4 border rounded bg-white dark:bg-background"
      dangerouslySetInnerHTML={{ __html: html! }}
    />
  )
}
