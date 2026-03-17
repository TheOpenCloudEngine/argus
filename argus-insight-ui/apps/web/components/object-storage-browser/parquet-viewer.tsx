"use client"

import { useEffect, useMemo, useState } from "react"
import { parquetMetadata, parquetRead } from "hyparquet"
import { Loader2 } from "lucide-react"

type ParquetViewerProps = {
  /** Presigned download URL. */
  url: string
}

export function ParquetViewer({ url }: ParquetViewerProps) {
  const [columns, setColumns] = useState<string[]>([])
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [totalRows, setTotalRows] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch file (${res.status})`)
        return res.arrayBuffer()
      })
      .then(async (buf) => {
        const metadata = parquetMetadata(buf)
        const numRows = Number(metadata.num_rows)
        setTotalRows(numRows)

        const cols = metadata.schema
          .filter((s) => s.name !== "schema" && s.num_children === undefined)
          .map((s) => s.name)
        setColumns(cols)

        // Read up to 1000 rows for preview
        const previewRows: Record<string, unknown>[] = []
        await parquetRead({
          file: buf,
          rowEnd: Math.min(numRows, 1000),
          onComplete: (data: Record<string, unknown>[]) => {
            previewRows.push(...data)
          },
        })
        setRows(previewRows)
        setIsLoading(false)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load file")
        setIsLoading(false)
      })
  }, [url])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[200px]">
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 h-full text-sm">
      <div className="flex items-end gap-3">
        <span className="text-sm text-muted-foreground ml-auto">
          {rows.length === totalRows
            ? `${totalRows} rows`
            : `Showing ${rows.length} of ${totalRows} rows`}{" "}
          · {columns.length} columns
        </span>
      </div>

      {rows.length > 0 ? (
        <div className="border rounded overflow-auto flex-1 min-h-0 max-h-[500px]">
          <table className="w-full text-sm font-[D2Coding,monospace] border-collapse">
            <thead className="bg-muted/60 sticky top-0 z-10">
              <tr>
                <th className="px-2 py-1.5 text-right text-muted-foreground border-r w-10 font-medium">
                  #
                </th>
                {columns.map((col) => (
                  <th
                    key={col}
                    className="px-2 py-1.5 text-left font-semibold border-r last:border-r-0 whitespace-nowrap"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row, ri) => (
                <tr key={ri} className="hover:bg-muted/30">
                  <td className="px-2 py-1 text-right text-muted-foreground border-r tabular-nums">
                    {ri + 1}
                  </td>
                  {columns.map((col) => {
                    const val = row[col]
                    const display = val === null || val === undefined ? "" : String(val)
                    return (
                      <td
                        key={col}
                        className="px-2 py-1 border-r last:border-r-0 whitespace-nowrap max-w-[300px] truncate"
                        title={display}
                      >
                        {display}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex items-center justify-center h-[200px]">
          <p className="text-sm text-muted-foreground">No data</p>
        </div>
      )}
    </div>
  )
}
