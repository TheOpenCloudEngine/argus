"use client"

import { useMemo } from "react"
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type SampleGridProps = {
  columns: string[]
  rows: (string | null)[][]
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SampleGrid({ columns, rows }: SampleGridProps) {
  // Build TanStack column defs with resizing
  const columnDefs = useMemo<ColumnDef<(string | null)[]>[]>(() => {
    const defs: ColumnDef<(string | null)[]>[] = [
      {
        id: "__row_num__",
        header: "#",
        size: 50,
        minSize: 40,
        maxSize: 60,
        enableResizing: false,
        cell: ({ row }) => (
          <span className="text-muted-foreground tabular-nums">{row.index + 1}</span>
        ),
        meta: { align: "right" as const },
      },
    ]

    columns.forEach((colName, ci) => {
      defs.push({
        id: `col_${ci}`,
        header: colName,
        size: Math.max(100, Math.min(colName.length * 10 + 40, 300)),
        minSize: 60,
        enableResizing: true,
        cell: ({ row }) => row.original[ci] ?? "",
      })
    })

    return defs
  }, [columns])

  const table = useReactTable({
    data: rows,
    columns: columnDefs,
    columnResizeMode: "onChange",
    getCoreRowModel: getCoreRowModel(),
  })

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-[200px]">
        <p className="text-sm text-muted-foreground">No data</p>
      </div>
    )
  }

  return (
    <div className="border rounded overflow-auto max-h-[500px] font-[family-name:var(--font-d2coding)]">
      <table
        className="text-sm border-collapse"
        style={{ width: table.getCenterTotalSize() }}
      >
        <thead className="bg-muted/60 sticky top-0 z-10">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((header) => {
                const align = (header.column.columnDef.meta as { align?: string })?.align
                return (
                  <th
                    key={header.id}
                    className="relative px-2 py-1.5 text-left font-semibold border-r last:border-r-0 whitespace-nowrap select-none"
                    style={{
                      width: header.getSize(),
                      textAlign: align === "right" ? "right" : "left",
                    }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getCanResize() && (
                      <div
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        className={`absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none hover:bg-primary/50 ${
                          header.column.getIsResizing() ? "bg-primary" : ""
                        }`}
                      />
                    )}
                  </th>
                )
              })}
            </tr>
          ))}
        </thead>
        <tbody className="divide-y">
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="hover:bg-muted/30">
              {row.getVisibleCells().map((cell) => {
                const align = (cell.column.columnDef.meta as { align?: string })?.align
                return (
                  <td
                    key={cell.id}
                    className="px-2 py-1 border-r last:border-r-0 whitespace-nowrap overflow-hidden text-ellipsis"
                    style={{
                      width: cell.column.getSize(),
                      maxWidth: cell.column.getSize(),
                      textAlign: align === "right" ? "right" : "left",
                    }}
                    title={String(cell.getValue() ?? "")}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
