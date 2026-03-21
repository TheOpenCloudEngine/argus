"use client"

import { useCallback, useMemo, useState } from "react"
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  Position,
  Handle,
  type NodeProps,
  ReactFlowProvider,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { toast } from "sonner"
import dynamic from "next/dynamic"
import type { DatasetDetail } from "@/features/datasets/data/schema"

const MonacoEditor = dynamic(() => import("@monaco-editor/react").then(m => m.default), { ssr: false })

// ---------------------------------------------------------------------------
// NiFi Processor Node Component
// ---------------------------------------------------------------------------

function ProcessorNode({ data }: NodeProps) {
  const d = data as { label: string; type: string; properties: Record<string, string> }
  return (
    <div className="border-2 border-gray-300 rounded-lg bg-white shadow-md min-w-[220px]">
      <Handle type="target" position={Position.Left} className="!bg-gray-400 !w-2.5 !h-2.5" />
      <div className="px-3 py-2 bg-gray-100 rounded-t-md border-b flex items-center gap-2">
        <div
          className={`w-2.5 h-2.5 rounded-full ${
            d.type === "source" ? "bg-green-500"
            : d.type === "sink" ? "bg-blue-500"
            : "bg-orange-400"
          }`}
        />
        <span className="text-xs font-bold text-gray-700">{d.label}</span>
      </div>
      <div className="px-3 py-2 space-y-0.5">
        {Object.entries(d.properties).map(([k, v]) => (
          <div key={k} className="flex gap-1 text-[10px]">
            <span className="text-gray-400 shrink-0">{k}:</span>
            <span className="text-gray-600 font-medium truncate max-w-[180px]" title={v}>{v}</span>
          </div>
        ))}
      </div>
      <Handle type="source" position={Position.Right} className="!bg-gray-400 !w-2.5 !h-2.5" />
    </div>
  )
}

const nodeTypes = { processor: ProcessorNode }

// ---------------------------------------------------------------------------
// Flow builder
// ---------------------------------------------------------------------------

function getJdbcDriver(platformType: string): string {
  switch (platformType) {
    case "mysql": return "com.mysql.cj.jdbc.Driver"
    case "postgresql": case "greenplum": return "org.postgresql.Driver"
    case "starrocks": return "com.mysql.cj.jdbc.Driver"
    case "trino": return "io.trino.jdbc.TrinoDriver"
    case "oracle": return "oracle.jdbc.OracleDriver"
    default: return `${platformType}.jdbc.Driver`
  }
}

function buildNiFiFlow(dataset: DatasetDetail): { nodes: Node[]; edges: Edge[] } {
  const tableName = dataset.name
  const parts = tableName.split(".")
  const dbName = parts.length > 1 ? parts[0] : "<database>"
  const tblName = parts.length > 1 ? parts[1] : parts[0]
  const platformType = dataset.platform.type
  const platformId = dataset.platform.platform_id
  const columns = dataset.schema_fields.map(f => f.field_path).join(", ")
  const columnsTrunc = columns.length > 60 ? columns.slice(0, 57) + "..." : columns

  const xGap = 300
  const yPos = 100

  const nodes: Node[] = [
    {
      id: "1",
      type: "processor",
      position: { x: 0, y: yPos },
      data: {
        label: "GenerateTableFetch",
        type: "source",
        properties: {
          "Database Type": platformType.toUpperCase(),
          "Table Name": `${dbName}.${tblName}`,
          "Columns": columnsTrunc,
          "Max-Value Columns": dataset.schema_fields.find(f => f.is_primary_key === "true")?.field_path || "id",
        },
      },
    },
    {
      id: "2",
      type: "processor",
      position: { x: xGap, y: yPos },
      data: {
        label: "ExecuteSQL",
        type: "transform",
        properties: {
          "JDBC Pool": `${platformId}-pool`,
          "Driver": getJdbcDriver(platformType),
          "Output Format": "Avro",
        },
      },
    },
    {
      id: "3",
      type: "processor",
      position: { x: xGap * 2, y: yPos },
      data: {
        label: "ConvertAvroToParquet",
        type: "transform",
        properties: {
          "Compression": "SNAPPY",
          "Schema": `${dataset.schema_fields.length} fields`,
        },
      },
    },
    {
      id: "4",
      type: "processor",
      position: { x: xGap * 3, y: yPos },
      data: {
        label: "PutHDFS",
        type: "sink",
        properties: {
          "Directory": `hdfs://nameservice/data/catalog/${platformId}/${dbName}/${tblName}`,
          "Conflict Resolution": "replace",
        },
      },
    },
  ]

  const edges: Edge[] = [
    { id: "e1-2", source: "1", target: "2", animated: true, style: { stroke: "#94a3b8" } },
    { id: "e2-3", source: "2", target: "3", animated: true, style: { stroke: "#94a3b8" } },
    { id: "e3-4", source: "3", target: "4", animated: true, style: { stroke: "#94a3b8" } },
  ]

  return { nodes, edges }
}

// ---------------------------------------------------------------------------
// NiFi Flow JSON generator (for export)
// ---------------------------------------------------------------------------

function generateNiFiFlowJson(dataset: DatasetDetail): string {
  const tableName = dataset.name
  const parts = tableName.split(".")
  const dbName = parts.length > 1 ? parts[0] : "<database>"
  const tblName = parts.length > 1 ? parts[1] : parts[0]
  const platformType = dataset.platform.type
  const platformId = dataset.platform.platform_id

  const flow = {
    flowContents: {
      name: `${platformId}-${dbName}-${tblName}-ingestion`,
      comments: `Auto-generated by Argus Catalog for ${dataset.name}`,
      processors: [
        {
          name: "GenerateTableFetch",
          type: "org.apache.nifi.processors.standard.GenerateTableFetch",
          properties: {
            "Database Connection Pooling Service": `${platformId}-pool`,
            "Database Type": platformType === "mysql" ? "MySQL" : platformType === "postgresql" ? "PostgreSQL" : platformType.toUpperCase(),
            "Table Name": `${dbName}.${tblName}`,
            "Columns to Return": dataset.schema_fields.map(f => f.field_path).join(", "),
            "Maximum-value Columns": dataset.schema_fields.find(f => f.is_primary_key === "true")?.field_path || "",
          },
        },
        {
          name: "ExecuteSQL",
          type: "org.apache.nifi.processors.standard.ExecuteSQL",
          properties: {
            "Database Connection Pooling Service": `${platformId}-pool`,
          },
        },
        {
          name: "ConvertAvroToParquet",
          type: "org.apache.nifi.processors.parquet.ConvertAvroToParquet",
          properties: {
            "Compression Type": "SNAPPY",
          },
        },
        {
          name: "PutHDFS",
          type: "org.apache.nifi.processors.hadoop.PutHDFS",
          properties: {
            "Directory": `hdfs://nameservice/data/catalog/${platformId}/${dbName}/${tblName}`,
            "Conflict Resolution Strategy": "replace",
          },
        },
      ],
      connections: [
        { source: "GenerateTableFetch", destination: "ExecuteSQL", selectedRelationships: ["success"] },
        { source: "ExecuteSQL", destination: "ConvertAvroToParquet", selectedRelationships: ["success"] },
        { source: "ConvertAvroToParquet", destination: "PutHDFS", selectedRelationships: ["success"] },
      ],
      controllerServices: [
        {
          name: `${platformId}-pool`,
          type: "org.apache.nifi.dbcp.DBCPConnectionPool",
          properties: {
            "Database Connection URL": `jdbc:${platformType === "postgresql" || platformType === "greenplum" ? "postgresql" : "mysql"}://<HOST>:<PORT>/${dbName}`,
            "Database Driver Class Name": getJdbcDriver(platformType),
            "Database User": "<USERNAME>",
            "Password": "<PASSWORD>",
          },
        },
      ],
    },
  }

  return JSON.stringify(flow, null, 2)
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type NiFiFlowTabProps = {
  dataset: DatasetDetail
}

function NiFiFlowInner({ dataset }: NiFiFlowTabProps) {
  const { nodes, edges } = useMemo(() => buildNiFiFlow(dataset), [dataset])
  const flowJson = useMemo(() => generateNiFiFlowJson(dataset), [dataset])
  const [showJson, setShowJson] = useState(false)
  const jsonLineCount = useMemo(() => flowJson.split("\n").length, [flowJson])

  const handleCopyJson = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(flowJson)
      toast.success("NiFi flow JSON copied to clipboard.")
    } catch {
      toast.error("Failed to copy. Clipboard API requires HTTPS.")
    }
  }, [flowJson])

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between py-3">
        <div>
          <CardTitle className="text-base">NiFi Flow</CardTitle>
          <CardDescription className="text-xs mt-1">
            Auto-generated NiFi ingestion pipeline: {dataset.platform.type} → Avro → Parquet → HDFS
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowJson(!showJson)}>
            {showJson ? "Hide" : "Show"} Flow JSON
          </Button>
          <Button size="sm" variant="outline" onClick={handleCopyJson}>
            Copy Flow JSON
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="border-t" style={{ height: 350 }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            proOptions={{ hideAttribution: true }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            panOnDrag
            zoomOnScroll
          >
            <Background gap={16} size={1} color="#e5e7eb" />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      </CardContent>

      <Dialog open={showJson} onOpenChange={setShowJson}>
        <DialogContent className="max-w-4xl max-h-[85vh] p-0 gap-0">
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle>NiFi Flow JSON</DialogTitle>
          </DialogHeader>
          <div style={{ height: Math.min(jsonLineCount * 20 + 20, 600) }}>
            <MonacoEditor
              height="100%"
              language="json"
              value={flowJson}
              theme="vs"
              options={{
                readOnly: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                fontSize: 13,
                fontFamily: "var(--font-d2coding), 'D2Coding', Consolas, 'Courier New', monospace",
                lineNumbers: "on",
                renderLineHighlight: "none",
                overviewRulerLanes: 0,
                hideCursorInOverviewRuler: true,
                scrollbar: { vertical: "auto", horizontal: "auto" },
                wordWrap: "off",
                domReadOnly: true,
                padding: { top: 8, bottom: 8 },
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

export function NiFiFlowTab({ dataset }: NiFiFlowTabProps) {
  return (
    <ReactFlowProvider>
      <NiFiFlowInner dataset={dataset} />
    </ReactFlowProvider>
  )
}
