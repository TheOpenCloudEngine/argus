"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import * as XLSX from "xlsx"
import { Loader2 } from "lucide-react"

import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

type XlsxViewerProps = {
  /** Presigned download URL. */
  url: string
}

export function XlsxViewer({ url }: XlsxViewerProps) {
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null)
  const [activeSheet, setActiveSheet] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch file (${res.status})`)
        return res.arrayBuffer()
      })
      .then((buf) => {
        const wb = XLSX.read(buf, { type: "array" })
        setWorkbook(wb)
        setActiveSheet(wb.SheetNames[0] ?? "")
        setIsLoading(false)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load file")
        setIsLoading(false)
      })
  }, [url])

  const rows = useMemo(() => {
    if (!workbook || !activeSheet) return []
    const sheet = workbook.Sheets[activeSheet]
    if (!sheet) return []
    return XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" })
  }, [workbook, activeSheet])

  const columnCount = useMemo(() => {
    if (!rows.length) return 0
    return Math.max(...rows.map((r) => r.length))
  }, [rows])

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

  const sheetNames = workbook?.SheetNames ?? []

  return (
    <div className="flex flex-col gap-3 h-full text-sm">
      <div className="flex items-end gap-3">
        {sheetNames.length > 1 && (
          <div className="space-y-1">
            <Label className="text-sm">Sheet</Label>
            <Select value={activeSheet} onValueChange={setActiveSheet}>
              <SelectTrigger className="w-[200px] h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sheetNames.map((name) => (
                  <SelectItem key={name} value={name} className="text-sm">
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <span className="text-sm text-muted-foreground ml-auto">
          {rows.length} rows · {columnCount} columns
          {sheetNames.length > 1 && ` · ${sheetNames.length} sheets`}
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
                {rows[0]?.map((cell, i) => (
                  <th
                    key={i}
                    className="px-2 py-1.5 text-left font-semibold border-r last:border-r-0 whitespace-nowrap"
                  >
                    {String(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.slice(1).map((row, ri) => (
                <tr key={ri} className="hover:bg-muted/30">
                  <td className="px-2 py-1 text-right text-muted-foreground border-r tabular-nums">
                    {ri + 1}
                  </td>
                  {Array.from({ length: columnCount }, (_, ci) => (
                    <td
                      key={ci}
                      className="px-2 py-1 border-r last:border-r-0 whitespace-nowrap max-w-[300px] truncate"
                      title={String(row[ci] ?? "")}
                    >
                      {String(row[ci] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex items-center justify-center h-[200px]">
          <p className="text-sm text-muted-foreground">No data in this sheet</p>
        </div>
      )}
    </div>
  )
}
