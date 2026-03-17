"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

type MoveDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentKey: string
  /** Set of all existing folder keys (ending with "/"). */
  existingFolderKeys: Set<string>
  /** Set of all existing object keys (files). */
  existingObjectKeys: Set<string>
  onConfirm: (destinationKey: string) => Promise<void>
  isLoading: boolean
}

export function MoveDialog({
  open,
  onOpenChange,
  currentKey,
  existingFolderKeys,
  existingObjectKeys,
  onConfirm,
  isLoading,
}: MoveDialogProps) {
  const [destination, setDestination] = useState(currentKey)
  const [error, setError] = useState("")

  function handleOpenChange(v: boolean) {
    if (v) {
      setDestination(currentKey)
      setError("")
    }
    onOpenChange(v)
  }

  /** Extract the file/folder name from the current key. */
  function getSourceName(): string {
    const isFolder = currentKey.endsWith("/")
    const key = isFolder ? currentKey.slice(0, -1) : currentKey
    const lastSlash = key.lastIndexOf("/")
    const name = lastSlash >= 0 ? key.substring(lastSlash + 1) : key
    return isFolder ? name + "/" : name
  }

  /**
   * Resolve the final destination key.
   * - If the destination is an existing folder, move into it.
   * - Otherwise use the destination as-is.
   */
  function resolveDestination(trimmed: string): string {
    if (existingFolderKeys.has(trimmed) || existingFolderKeys.has(trimmed + "/")) {
      const folder = trimmed.endsWith("/") ? trimmed : trimmed + "/"
      return folder + getSourceName()
    }
    return trimmed
  }

  /** Check if the destination conflicts with an existing file. */
  function getConflictError(trimmed: string): string | null {
    if (!trimmed || trimmed === currentKey) return null
    const resolved = resolveDestination(trimmed)
    if (resolved === currentKey) return null
    if (existingObjectKeys.has(resolved)) {
      return "This path is unavailable. It already exists."
    }
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = destination.trim()
    if (!trimmed) {
      setError("Destination path cannot be empty.")
      return
    }
    if (trimmed === currentKey) {
      setError("Destination is the same as the current path.")
      return
    }
    const conflict = getConflictError(trimmed)
    if (conflict) {
      setError(conflict)
      return
    }
    const resolved = resolveDestination(trimmed)
    if (resolved === currentKey) {
      setError("Destination is the same as the current path.")
      return
    }
    setError("")
    await onConfirm(resolved)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Move</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-4">
            <div>
              <Label className="text-sm font-medium">Current path</Label>
              <p className="text-sm mt-1 font-mono bg-muted px-2 py-1 rounded break-all">
                {currentKey}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="move-input">Destination path</Label>
              <Input
                id="move-input"
                value={destination}
                onChange={(e) => {
                  setDestination(e.target.value)
                  setError("")
                }}
                autoFocus
                disabled={isLoading}
                className="font-mono"
              />
              {(() => {
                const conflict = getConflictError(destination.trim())
                return conflict ? <p className="text-xs text-destructive">{conflict}</p> : null
              })()}
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Move
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
