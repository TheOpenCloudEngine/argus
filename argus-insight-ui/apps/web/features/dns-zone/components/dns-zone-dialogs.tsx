/**
 * DNS Zone Dialogs Orchestrator component.
 *
 * Manages Add, Edit, Delete, and Bulk Delete dialogs.
 */

"use client"

import { DnsZoneAddDialog } from "./dns-zone-add-dialog"
import { DnsZoneBindDialog } from "./dns-zone-bind-dialog"
import { DnsZoneDeleteDialog } from "./dns-zone-delete-dialog"
import { DnsZoneEditDialog } from "./dns-zone-edit-dialog"
import { useDnsZone } from "./dns-zone-provider"

export function DnsZoneDialogs() {
  const { open, setOpen, currentRow, setCurrentRow, selectedRecordType, selectedRecords } = useDnsZone()

  return (
    <>
      {/* Add Record dialog */}
      {selectedRecordType && (
        <DnsZoneAddDialog
          key={`add-${selectedRecordType}`}
          open={open === "add"}
          onOpenChange={() => setOpen("add")}
          recordType={selectedRecordType}
        />
      )}

      {/* Edit Record dialog */}
      {currentRow && (
        <DnsZoneEditDialog
          key={`edit-${currentRow.name}-${currentRow.type}-${currentRow.content}`}
          open={open === "edit"}
          onOpenChange={() => {
            setOpen("edit")
            setTimeout(() => setCurrentRow(null), 500)
          }}
          currentRow={currentRow}
        />
      )}

      {/* Single Delete dialog (from row action) */}
      {currentRow && (
        <DnsZoneDeleteDialog
          key={`delete-${currentRow.name}-${currentRow.type}`}
          open={open === "delete"}
          onOpenChange={() => {
            setOpen("delete")
            setTimeout(() => setCurrentRow(null), 500)
          }}
          records={[currentRow]}
        />
      )}

      {/* Bulk Delete dialog */}
      <DnsZoneDeleteDialog
        key="bulk-delete"
        open={open === "bulk-delete"}
        onOpenChange={() => setOpen("bulk-delete")}
        records={selectedRecords}
      />

      {/* BIND Configuration Export dialog */}
      <DnsZoneBindDialog
        open={open === "bind-conf"}
        onOpenChange={() => setOpen("bind-conf")}
      />
    </>
  )
}
