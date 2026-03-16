"use client"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { TerminalView } from "@/features/terminal/components/terminal-view"
import { buildTerminalWsUrl } from "@/features/terminal/components/terminal-panel"
import { type Server } from "../data/schema"

type ServersTerminalDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow: Server
}

export function ServersTerminalDialog({
  open,
  onOpenChange,
  currentRow,
}: ServersTerminalDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm">
            Terminal — {currentRow.hostname} ({currentRow.ipAddress})
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0">
          {open && (
            <TerminalView
              wsUrl={buildTerminalWsUrl(currentRow.hostname)}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
