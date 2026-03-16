"use client"

import {
  Download,
  FolderPlus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

type BrowserToolbarProps = {
  searchValue: string
  onSearchChange: (value: string) => void
  selectedCount: number
  onUpload: () => void
  onCreateFolder: () => void
  onDelete: () => void
  onDownload: () => void
  onRefresh: () => void
  isLoading: boolean
}

function ToolbarButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  variant = "outline",
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
  disabled?: boolean
  variant?: "outline" | "destructive"
}) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={variant}
            size="sm"
            onClick={onClick}
            disabled={disabled}
            className="h-8 px-2.5"
          >
            <Icon className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function BrowserToolbar({
  searchValue,
  onSearchChange,
  selectedCount,
  onUpload,
  onCreateFolder,
  onDelete,
  onDownload,
  onRefresh,
  isLoading,
}: BrowserToolbarProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 flex-1">
        <div className="relative w-[220px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Filter by name..."
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-8 pl-8 pr-8 text-sm"
          />
          {searchValue && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {selectedCount > 0 && (
          <span className="text-sm text-muted-foreground">
            {selectedCount} selected
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <ToolbarButton
          icon={RefreshCw}
          label="Refresh"
          onClick={onRefresh}
          disabled={isLoading}
        />

        <div className="w-px h-5 bg-border mx-0.5" />

        <ToolbarButton
          icon={Upload}
          label="Upload files"
          onClick={onUpload}
        />
        <ToolbarButton
          icon={FolderPlus}
          label="Create folder"
          onClick={onCreateFolder}
        />

        <div className="w-px h-5 bg-border mx-0.5" />

        <ToolbarButton
          icon={Download}
          label="Download selected"
          onClick={onDownload}
          disabled={selectedCount === 0}
        />
        <ToolbarButton
          icon={Trash2}
          label="Delete selected"
          onClick={onDelete}
          disabled={selectedCount === 0}
          variant="destructive"
        />
      </div>
    </div>
  )
}
