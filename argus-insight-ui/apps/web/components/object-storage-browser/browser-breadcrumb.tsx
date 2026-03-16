"use client"

import { ChevronRight, Database } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

type BrowserBreadcrumbProps = {
  bucket: string
  prefix: string
  onNavigate: (prefix: string) => void
}

export function BrowserBreadcrumb({
  bucket,
  prefix,
  onNavigate,
}: BrowserBreadcrumbProps) {
  const segments = prefix
    .split("/")
    .filter(Boolean)

  return (
    <nav className="flex items-center gap-1 text-sm overflow-x-auto py-1">
      <button
        type="button"
        onClick={() => onNavigate("")}
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded-md font-medium shrink-0",
          "hover:bg-accent hover:text-accent-foreground transition-colors",
          prefix === "" ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <Database className="h-4 w-4" />
        {bucket}
      </button>

      {segments.map((segment, i) => {
        const segmentPrefix = segments.slice(0, i + 1).join("/") + "/"
        const isLast = i === segments.length - 1

        return (
          <div key={segmentPrefix} className="flex items-center gap-1 shrink-0">
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            <button
              type="button"
              onClick={() => onNavigate(segmentPrefix)}
              className={cn(
                "px-2 py-1 rounded-md transition-colors",
                "hover:bg-accent hover:text-accent-foreground",
                isLast
                  ? "font-medium text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {segment}
            </button>
          </div>
        )
      })}
    </nav>
  )
}
