"use client"

import { ServersApproveDialog } from "./servers-approve-dialog"
import { ServersTable } from "./servers-table"
import { useServers } from "./servers-provider"

export function ServersTableWrapper() {
  const { servers, isLoading, open, setOpen, currentRow, selectedServers } = useServers()

  return (
    <>
      <ServersTable data={servers} isLoading={isLoading} />
      <ServersApproveDialog
        open={open === "approve"}
        onOpenChange={(v) => setOpen(v ? "approve" : null)}
        currentRow={currentRow}
        selectedServers={selectedServers}
      />
    </>
  )
}
