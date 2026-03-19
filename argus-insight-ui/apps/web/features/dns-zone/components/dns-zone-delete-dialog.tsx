/**
 * DNS Zone Bulk Delete Confirmation Dialog.
 */

"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { updateZoneRecords } from "../api"
import { type DnsRecord } from "../data/schema"
import { useDnsZone } from "./dns-zone-provider"

type DnsZoneDeleteDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  records: DnsRecord[]
}

export function DnsZoneDeleteDialog({ open, onOpenChange, records }: DnsZoneDeleteDialogProps) {
  const { refreshRecords } = useDnsZone()
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    setDeleting(true)
    setError(null)
    try {
      // Group records by name+type to build rrset patches
      const rrsetMap = new Map<string, { name: string; type: string }>()
      for (const record of records) {
        const key = `${record.name}::${record.type}`
        if (!rrsetMap.has(key)) {
          rrsetMap.set(key, { name: record.name, type: record.type })
        }
      }

      const rrsets = Array.from(rrsetMap.values()).map((r) => ({
        name: r.name,
        type: r.type,
        ttl: 0,
        changetype: "DELETE" as const,
        records: [],
      }))

      await updateZoneRecords(rrsets)
      onOpenChange(false)
      await refreshRecords()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete records")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Records</AlertDialogTitle>
          <AlertDialogDescription>
            You have selected {records.length} record(s). Are you sure you want to delete them?
            This action cannot be undone. You will need to re-enter the records manually.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <div className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
            {error}
          </div>
        )}
        <AlertDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
            {deleting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            OK
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
