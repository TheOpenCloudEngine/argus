"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, Plus, Trash2 } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { createTable } from "../api"

const NAME_PATTERN = /^[a-z_]+$/

const COLUMN_TYPES = [
  "BOOLEAN",
  "BYTE",
  "SHORT",
  "INT",
  "LONG",
  "FLOAT",
  "DOUBLE",
  "STRING",
  "BINARY",
  "DATE",
  "TIMESTAMP",
  "TIMESTAMP_NTZ",
  "DECIMAL",
] as const

type ColumnRow = {
  name: string
  type_name: string
  nullable: boolean
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  catalogName: string
  schemaName: string
  onSuccess: () => void
}

export function CreateTableDialog({ open, onOpenChange, catalogName, schemaName, onSuccess }: Props) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tableName, setTableName] = useState("")
  const [nameError, setNameError] = useState<string | null>(null)
  const [columns, setColumns] = useState<ColumnRow[]>([
    { name: "", type_name: "STRING", nullable: true },
  ])

  const reset = useCallback(() => {
    setTableName("")
    setNameError(null)
    setColumns([{ name: "", type_name: "STRING", nullable: true }])
    setError(null)
    setSaving(false)
  }, [])

  function handleOpenChange(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  // Debounced name validation
  useEffect(() => {
    if (!tableName) {
      setNameError(null)
      return
    }
    const timer = setTimeout(() => {
      if (!NAME_PATTERN.test(tableName)) {
        setNameError("Only lowercase letters and underscores are allowed")
      } else {
        setNameError(null)
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [tableName])

  function addColumn() {
    setColumns((prev) => [...prev, { name: "", type_name: "STRING", nullable: true }])
  }

  function removeColumn(index: number) {
    setColumns((prev) => prev.filter((_, i) => i !== index))
  }

  function updateColumn(index: number, field: keyof ColumnRow, value: string | boolean) {
    setColumns((prev) => prev.map((col, i) => (i === index ? { ...col, [field]: value } : col)))
  }

  const nameValid = tableName.length > 0 && NAME_PATTERN.test(tableName)
  const columnsValid = columns.length > 0 && columns.every((c) => c.name.trim().length > 0)
  const canSubmit = nameValid && columnsValid && !saving

  async function handleSubmit() {
    if (!canSubmit) return
    setSaving(true)
    setError(null)
    try {
      await createTable({
        catalog_name: catalogName,
        schema_name: schemaName,
        name: tableName,
        table_type: "MANAGED",
        data_source_format: "DELTA",
        columns: columns.map((c, i) => ({
          name: c.name.trim(),
          type_name: c.type_name,
          position: i,
          nullable: c.nullable,
        })),
      })
      handleOpenChange(false)
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create table")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>Create Table</DialogTitle>
          <DialogDescription>
            Create a new table in <span className="font-medium">{catalogName}.{schemaName}</span>.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {/* Table name */}
          <div className="space-y-2">
            <Label>
              Table Name <span className="text-destructive">*</span>
            </Label>
            <Input
              placeholder="e.g. user_events"
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
            />
            {nameError && <p className="text-sm text-destructive">{nameError}</p>}
          </div>

          {/* Columns grid */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>
                Columns <span className="text-destructive">*</span>
              </Label>
              <div className="flex items-center gap-1">
                <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={addColumn}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <div className="rounded-md border">
              {/* Header */}
              <div className="grid grid-cols-[1fr_140px_70px_36px] gap-2 border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                <span>Name</span>
                <span>Type</span>
                <span>Nullable</span>
                <span />
              </div>

              {/* Rows */}
              {columns.map((col, index) => (
                <div
                  key={index}
                  className="grid grid-cols-[1fr_140px_70px_36px] items-center gap-2 border-b px-3 py-1.5 last:border-b-0"
                >
                  <Input
                    className="h-8 text-sm"
                    placeholder="column_name"
                    value={col.name}
                    onChange={(e) => updateColumn(index, "name", e.target.value)}
                  />
                  <Select
                    value={col.type_name}
                    onValueChange={(v) => updateColumn(index, "type_name", v)}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COLUMN_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex justify-center">
                    <input
                      type="checkbox"
                      checked={col.nullable}
                      onChange={(e) => updateColumn(index, "nullable", e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    disabled={columns.length <= 1}
                    onClick={() => removeColumn(index)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!canSubmit} onClick={handleSubmit}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
