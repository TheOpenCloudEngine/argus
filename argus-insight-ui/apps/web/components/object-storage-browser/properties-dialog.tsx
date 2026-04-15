"use client"

import {
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType,
  FileVideo,
  Folder,
} from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"

import type { StorageEntry } from "./types"
import { formatBytes, formatDate, getFileCategory, getExtension } from "./utils"

type PropertiesDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  entry: StorageEntry | null
}

const fileIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  image: FileImage,
  video: FileVideo,
  audio: FileAudio,
  archive: FileArchive,
  code: FileCode,
  document: FileText,
  text: FileType,
  data: FileSpreadsheet,
  generic: File,
}

function EntryIcon({ entry, className }: { entry: StorageEntry; className?: string }) {
  if (entry.kind === "folder") return <Folder className={className} />
  const category = getFileCategory(entry.name)
  const Icon = fileIcons[category] ?? File
  return <Icon className={className} />
}

function PropertyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-4 py-2 border-b last:border-b-0">
      <span className="text-sm font-medium text-muted-foreground w-32 shrink-0">
        {label}
      </span>
      <span className="text-sm break-all">{value}</span>
    </div>
  )
}

export function PropertiesDialog({
  open,
  onOpenChange,
  entry,
}: PropertiesDialogProps) {
  if (!entry) return null

  const isFolder = entry.kind === "folder"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <EntryIcon
              entry={entry}
              className={`h-5 w-5 shrink-0 ${isFolder ? "text-muted-foreground" : "text-muted-foreground"}`}
            />
            <span className="truncate">{entry.name}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="mt-2">
          <PropertyRow label="Name" value={entry.name} />
          <PropertyRow label="Type" value={isFolder ? "Folder" : getFileCategory(entry.name)} />
          <PropertyRow label="Full Key" value={entry.key} />

          {!isFolder && (
            <>
              <PropertyRow
                label="Size"
                value={`${formatBytes(entry.size)} (${entry.size.toLocaleString()} Bytes)`}
              />
              <PropertyRow
                label="Last Modified"
                value={formatDate(entry.lastModified)}
              />
              {getExtension(entry.name) && (
                <PropertyRow
                  label="Extension"
                  value={`.${getExtension(entry.name)}`}
                />
              )}
              <PropertyRow
                label="Storage Class"
                value={entry.storageClass ?? "STANDARD"}
              />
            </>
          )}

          <PropertyRow label="Owner" value={entry.owner ?? ""} />
          <PropertyRow label="Group" value={entry.group ?? ""} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
