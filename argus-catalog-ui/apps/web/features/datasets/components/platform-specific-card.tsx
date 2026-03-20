"use client"

import { useState } from "react"
import { ChevronRight, Settings2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"

// ---------------------------------------------------------------------------
// Collapsible section
// ---------------------------------------------------------------------------

function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="mt-3">
      <button
        type="button"
        className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setOpen(!open)}
      >
        <ChevronRight
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`}
        />
        {title}
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

function formatNumber(n: number): string {
  return n.toLocaleString()
}

// ---------------------------------------------------------------------------
// Table-level property renderers
// ---------------------------------------------------------------------------

type PropItem = { label: string; value: string }

function mysqlTableProps(table: Record<string, unknown>): PropItem[] {
  const items: PropItem[] = []
  if (table.engine) items.push({ label: "Engine", value: String(table.engine) })
  if (table.row_format) items.push({ label: "Row Format", value: String(table.row_format) })
  if (table.collation) items.push({ label: "Collation", value: String(table.collation) })
  if (table.estimated_rows != null)
    items.push({ label: "Estimated Rows", value: formatNumber(Number(table.estimated_rows)) })
  if (table.data_size != null)
    items.push({ label: "Data Size", value: formatBytes(Number(table.data_size)) })
  if (table.index_size != null)
    items.push({ label: "Index Size", value: formatBytes(Number(table.index_size)) })
  if (table.avg_row_length != null)
    items.push({ label: "Avg Row Length", value: `${formatNumber(Number(table.avg_row_length))} B` })
  if (table.auto_increment != null)
    items.push({ label: "Auto Increment", value: formatNumber(Number(table.auto_increment)) })
  if (table.create_time) items.push({ label: "Created", value: String(table.create_time) })
  if (table.update_time) items.push({ label: "Updated", value: String(table.update_time) })
  if (table.create_options) items.push({ label: "Options", value: String(table.create_options) })
  return items
}

function pgTableProps(table: Record<string, unknown>): PropItem[] {
  const items: PropItem[] = []
  if (table.owner) items.push({ label: "Owner", value: String(table.owner) })
  if (table.kind) items.push({ label: "Kind", value: String(table.kind) })
  if (table.persistence) items.push({ label: "Persistence", value: String(table.persistence) })
  if (table.estimated_rows != null)
    items.push({ label: "Estimated Rows", value: formatNumber(Number(table.estimated_rows)) })
  if (table.total_size != null)
    items.push({ label: "Total Size", value: formatBytes(Number(table.total_size)) })
  if (table.table_size != null)
    items.push({ label: "Table Size", value: formatBytes(Number(table.table_size)) })
  if (table.index_size != null)
    items.push({ label: "Index Size", value: formatBytes(Number(table.index_size)) })
  if (table.has_indexes != null)
    items.push({ label: "Has Indexes", value: table.has_indexes ? "Yes" : "No" })
  if (table.has_triggers != null)
    items.push({ label: "Has Triggers", value: table.has_triggers ? "Yes" : "No" })
  return items
}

// ---------------------------------------------------------------------------
// Column-level detail renderers
// ---------------------------------------------------------------------------

function renderColumnDetails(
  platformType: string,
  columns: Record<string, Record<string, unknown>>,
) {
  const entries = Object.entries(columns)
  if (entries.length === 0) return null

  return (
    <CollapsibleSection title={`Column Details (${entries.length})`}>
      <div className="border rounded overflow-auto max-h-[300px]">
        <table className="w-full text-xs font-[family-name:var(--font-d2coding)]">
          <thead className="bg-muted/60 sticky top-0">
            <tr>
              <th className="px-2 py-1.5 text-left font-semibold border-r">Column</th>
              {platformType === "mysql" ? (
                <>
                  <th className="px-2 py-1.5 text-left font-semibold border-r">Key</th>
                  <th className="px-2 py-1.5 text-left font-semibold border-r">Default</th>
                  <th className="px-2 py-1.5 text-left font-semibold border-r">Extra</th>
                  <th className="px-2 py-1.5 text-left font-semibold border-r">Charset</th>
                  <th className="px-2 py-1.5 text-left font-semibold">Collation</th>
                </>
              ) : (
                <>
                  <th className="px-2 py-1.5 text-left font-semibold border-r">Default</th>
                  <th className="px-2 py-1.5 text-left font-semibold">Constraints</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y">
            {entries.map(([colName, props]) => (
              <tr key={colName} className="hover:bg-muted/30">
                <td className="px-2 py-1 border-r font-medium">{colName}</td>
                {platformType === "mysql" ? (
                  <>
                    <td className="px-2 py-1 border-r">{String(props.key ?? "")}</td>
                    <td className="px-2 py-1 border-r text-muted-foreground">{String(props.default ?? "")}</td>
                    <td className="px-2 py-1 border-r text-muted-foreground">{String(props.extra ?? "")}</td>
                    <td className="px-2 py-1 border-r">{String(props.charset ?? "")}</td>
                    <td className="px-2 py-1">{String(props.collation ?? "")}</td>
                  </>
                ) : (
                  <>
                    <td className="px-2 py-1 border-r text-muted-foreground truncate max-w-[200px]" title={String(props.default ?? "")}>
                      {String(props.default ?? "")}
                    </td>
                    <td className="px-2 py-1">
                      {Array.isArray(props.constraints)
                        ? (props.constraints as { type: string; references?: string }[]).map((c, i) => (
                            <span key={i} className="inline-block mr-1.5">
                              <span className="text-primary font-medium">{c.type}</span>
                              {c.references && (
                                <span className="text-muted-foreground"> &rarr; {c.references}</span>
                              )}
                            </span>
                          ))
                        : ""}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CollapsibleSection>
  )
}

// ---------------------------------------------------------------------------
// Index renderers (PostgreSQL)
// ---------------------------------------------------------------------------

function renderIndexes(indexes: { name: string; definition: string }[]) {
  if (!indexes || indexes.length === 0) return null

  return (
    <CollapsibleSection title={`Indexes (${indexes.length})`}>
      <div className="border rounded overflow-auto max-h-[200px]">
        <table className="w-full text-xs font-[family-name:var(--font-d2coding)]">
          <thead className="bg-muted/60 sticky top-0">
            <tr>
              <th className="px-2 py-1.5 text-left font-semibold border-r">Name</th>
              <th className="px-2 py-1.5 text-left font-semibold">Definition</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {indexes.map((idx) => (
              <tr key={idx.name} className="hover:bg-muted/30">
                <td className="px-2 py-1 border-r font-medium whitespace-nowrap">{idx.name}</td>
                <td className="px-2 py-1 text-muted-foreground">{idx.definition}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CollapsibleSection>
  )
}

// ---------------------------------------------------------------------------
// DDL (CREATE TABLE) renderer
// ---------------------------------------------------------------------------

function renderDDL(ddl: string) {
  return (
    <CollapsibleSection title="CREATE TABLE DDL">
      <div className="border rounded overflow-auto max-h-[400px] bg-muted/30">
        <pre className="p-3 text-xs font-[family-name:var(--font-d2coding)] whitespace-pre-wrap select-all">
          {ddl}
        </pre>
      </div>
    </CollapsibleSection>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type PlatformSpecificCardProps = {
  platformType: string
  properties: Record<string, unknown>
}

export function PlatformSpecificCard({ platformType, properties }: PlatformSpecificCardProps) {
  const table = (properties.table ?? {}) as Record<string, unknown>
  const columns = (properties.columns ?? {}) as Record<string, Record<string, unknown>>
  const indexes = (properties.indexes ?? []) as { name: string; definition: string }[]
  const ddl = (properties.ddl ?? "") as string

  const isMySQL = platformType === "mysql"
  const tableProps = isMySQL ? mysqlTableProps(table) : pgTableProps(table)

  if (tableProps.length === 0 && Object.keys(columns).length === 0 && indexes.length === 0 && !ddl) {
    return null
  }

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Settings2 className="h-4 w-4" />
          Platform Specific
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Table-level properties */}
        {tableProps.length > 0 && (
          <div className="grid gap-x-6 gap-y-2 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 text-sm">
            {tableProps.map((p) => (
              <div key={p.label}>
                <span className="text-xs text-muted-foreground">{p.label}</span>
                <p className="font-medium font-[family-name:var(--font-d2coding)] text-sm">{p.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Column details (collapsed) */}
        {renderColumnDetails(platformType, columns)}

        {/* Indexes - PostgreSQL (collapsed) */}
        {!isMySQL && renderIndexes(indexes)}

        {/* CREATE TABLE DDL (collapsed) */}
        {ddl && renderDDL(ddl)}
      </CardContent>
    </Card>
  )
}
