"use client"

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Button } from "@workspace/ui/components/button"

type ServersTerminalWarningDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ServersTerminalWarningDialog({
  open,
  onOpenChange,
}: ServersTerminalWarningDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader className="text-start">
          <AlertDialogTitle>Terminal Unavailable</AlertDialogTitle>
          <AlertDialogDescription>
            Terminal은 서버가 등록된 상태에서만 실행할 수 있습니다.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button onClick={() => onOpenChange(false)}>
            OK
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
