/**
 * Data Table Row Actions component (DNS Zone).
 *
 * Renders a "..." dropdown menu button in each row of the DNS zone table.
 * Provides per-row actions: Edit and Delete.
 */

"use client"

import { type Row } from "@tanstack/react-table"
import { Ban, CheckCircle, MoreHorizontal, Pencil, Trash2 } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { type DnsRecord } from "../data/schema"
import { updateZoneRecords } from "../api"
import { useDnsZone } from "./dns-zone-provider"

type DataTableRowActionsProps = {
  row: Row<DnsRecord>
}

export function DataTableRowActions({ row }: DataTableRowActionsProps) {
  const { setOpen, setCurrentRow, refreshRecords } = useDnsZone()
  const record = row.original

  const isDisabled = record.disabled

  async function handleToggleStatus() {
    try {
      await updateZoneRecords([
        {
          name: record.name,
          type: record.type,
          ttl: record.ttl,
          changetype: "REPLACE",
          records: [{ content: record.content, disabled: !isDisabled }],
        },
      ])
      await refreshRecords()
    } catch (err) {
      console.error("Failed to toggle record status:", err)
    }
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="flex h-8 w-8 p-0 data-[state=open]:bg-muted"
        >
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Open menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[160px]">
        <DropdownMenuItem
          onClick={() => {
            setCurrentRow(record)
            setOpen("edit")
          }}
        >
          Edit
          <span className="ml-auto">
            <Pencil size={16} />
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            setCurrentRow(record)
            setOpen("delete")
          }}
          className="text-red-500!"
        >
          Delete
          <span className="ml-auto">
            <Trash2 size={16} />
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleToggleStatus}>
          {isDisabled ? "Enable" : "Disable"}
          <span className="ml-auto">
            {isDisabled ? <CheckCircle size={16} /> : <Ban size={16} />}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
