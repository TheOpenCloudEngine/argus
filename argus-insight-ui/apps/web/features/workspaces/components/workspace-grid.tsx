"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  CheckCircle2,
  Circle,
  Loader2,
  MoreHorizontal,
  SkipForward,
  Trash2,
  XCircle,
} from "lucide-react"
import { AgGridReact } from "ag-grid-react"
import {
  AllCommunityModule,
  ModuleRegistry,
  type ColDef,
  type PaginationNumberFormatterParams,
} from "ag-grid-community"

import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"

import type { WorkflowExecution, WorkflowStep, WorkspaceResponse } from "@/features/workspaces/types"
import {
  deleteWorkspace,
  fetchWorkspaces,
  fetchWorkspaceWorkflows,
} from "@/features/workspaces/api"

ModuleRegistry.registerModules([AllCommunityModule])

function formatDateTime(value: string): string {
  const d = new Date(value)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function statusColor(status: string) {
  switch (status) {
    case "active":
      return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
    case "provisioning":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 animate-pulse"
    case "deleting":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 animate-pulse"
    case "failed":
      return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
    case "deleted":
      return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
    default:
      return ""
  }
}

function stepIcon(status: string) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-4 w-4 text-green-600" />
    case "failed":
      return <XCircle className="h-4 w-4 text-red-600" />
    case "running":
      return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
    case "skipped":
      return <SkipForward className="h-4 w-4 text-gray-400" />
    default:
      return <Circle className="h-4 w-4 text-gray-400" />
  }
}

interface WorkspaceGridProps {
  onSelect: (workspace: WorkspaceResponse) => void
  onDeleted: (workspaceId: number) => void
  refreshKey: number
}

export function WorkspaceGrid({ onSelect, onDeleted, refreshKey }: WorkspaceGridProps) {
  const [workspaces, setWorkspaces] = useState<WorkspaceResponse[]>([])
  const [loading, setLoading] = useState(true)

  // Delete dialog state
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmTarget, setConfirmTarget] = useState<WorkspaceResponse | null>(null)
  const [deletePhase, setDeletePhase] = useState<"confirm" | "progress" | "done" | "error">("confirm")
  const [deleteSteps, setDeleteSteps] = useState<WorkflowStep[]>([])
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadWorkspaces = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true)
      const data = await fetchWorkspaces(1, 100)
      setWorkspaces(data.items.filter((w) => w.status !== "deleted"))
    } catch {
      setWorkspaces([])
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadWorkspaces()
  }, [loadWorkspaces, refreshKey])

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [])

  const openDeleteDialog = useCallback((ws: WorkspaceResponse) => {
    setConfirmTarget(ws)
    setDeletePhase("confirm")
    setDeleteSteps([])
    setDeleteError(null)
    setConfirmOpen(true)
  }, [])

  const handleDelete = useCallback(async () => {
    if (!confirmTarget) return
    setDeletePhase("progress")
    setDeleteSteps([])
    setDeleteError(null)

    try {
      await deleteWorkspace(confirmTarget.id, true)
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Delete request failed")
      setDeletePhase("error")
      return
    }

    // Start polling for workflow progress
    const wsId = confirmTarget.id
    pollingRef.current = setInterval(async () => {
      try {
        const workflows = await fetchWorkspaceWorkflows(wsId)
        const deleteWf = workflows.find((w) => w.workflow_name === "workspace-delete")
        if (deleteWf) {
          setDeleteSteps(deleteWf.steps.sort((a, b) => a.step_order - b.step_order))

          if (deleteWf.status === "completed") {
            if (pollingRef.current) clearInterval(pollingRef.current)
            pollingRef.current = null
            setDeletePhase("done")
            onDeleted(wsId)
            await loadWorkspaces(false)
          } else if (deleteWf.status === "failed") {
            if (pollingRef.current) clearInterval(pollingRef.current)
            pollingRef.current = null
            setDeleteError(deleteWf.error_message || "Deletion failed")
            setDeletePhase("error")
            await loadWorkspaces(false)
          }
        }
      } catch {
        // ignore polling errors
      }
    }, 2000)
  }, [confirmTarget, onDeleted, loadWorkspaces])

  const closeDeleteDialog = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
    setConfirmOpen(false)
    setConfirmTarget(null)
    if (deletePhase === "done" || deletePhase === "error") {
      loadWorkspaces(false)
    }
  }, [deletePhase, loadWorkspaces])

  const columnDefs = useMemo<ColDef<WorkspaceResponse>[]>(
    () => [
      {
        headerName: "Name",
        field: "display_name",
        flex: 1,
        minWidth: 150,
      },
      {
        headerName: "Domain",
        field: "domain",
        width: 120,
      },
      {
        headerName: "K8s Namespace",
        field: "k8s_namespace",
        width: 160,
      },
      {
        headerName: "Status",
        field: "status",
        width: 130,
        cellRenderer: (params: { value: string }) => (
          <Badge className={`${statusColor(params.value)} hover:${statusColor(params.value)}`}>
            {params.value}
          </Badge>
        ),
      },
      {
        headerName: "Created",
        field: "created_at",
        width: 160,
        valueFormatter: (params) =>
          params.value ? formatDateTime(params.value) : "",
      },
      {
        headerName: "Updated",
        field: "updated_at",
        width: 160,
        valueFormatter: (params) =>
          params.value ? formatDateTime(params.value) : "",
      },
      {
        headerName: "Action",
        width: 80,
        sortable: false,
        filter: false,
        cellRenderer: (params: { data: WorkspaceResponse }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="text-destructive"
                onClick={(e) => {
                  e.stopPropagation()
                  openDeleteDialog(params.data)
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [openDeleteDialog],
  )

  return (
    <>
      <div className="ag-theme-alpine" style={{ width: "100%" }}>
        <style>{`
          .ag-theme-alpine {
            --ag-font-family: 'Roboto Condensed', Roboto, sans-serif;
            --ag-font-size: var(--text-sm);
          }
        `}</style>
        <AgGridReact<WorkspaceResponse>
          rowData={workspaces}
          columnDefs={columnDefs}
          loading={loading}
          rowSelection="single"
          onRowClicked={(event) => {
            if (event.data) onSelect(event.data)
          }}
          getRowId={(params) => String(params.data.id)}
          domLayout="autoHeight"
          headerHeight={36}
          rowHeight={40}
          pagination={true}
          paginationPageSize={10}
          paginationPageSizeSelector={[10, 20, 50]}
          paginationNumberFormatter={(params: PaginationNumberFormatterParams) =>
            params.value.toLocaleString()
          }
          overlayNoRowsTemplate="No workspaces found."
        />
      </div>

      {/* Delete Progress Dialog */}
      <Dialog open={confirmOpen} onOpenChange={(open) => { if (!open) closeDeleteDialog() }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Workspace</DialogTitle>
            <DialogDescription>
              {deletePhase === "confirm" && "This will tear down all provisioned resources."}
              {deletePhase === "progress" && "Deleting workspace resources..."}
              {deletePhase === "done" && "Workspace deleted successfully."}
              {deletePhase === "error" && "Deletion encountered an error."}
            </DialogDescription>
          </DialogHeader>

          {confirmTarget && (
            <p className="text-sm font-medium">
              {confirmTarget.display_name}
              <span className="text-muted-foreground ml-1">({confirmTarget.name})</span>
            </p>
          )}

          {/* Step progress */}
          {(deletePhase === "progress" || deletePhase === "done" || deletePhase === "error") && (
            <div className="space-y-2 py-2">
              {deleteSteps.length === 0 && deletePhase === "progress" && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Initializing deletion...
                </div>
              )}
              {deleteSteps.map((step) => (
                <div key={step.id} className="flex items-center gap-3 text-sm">
                  {stepIcon(step.status)}
                  <span className="flex-1 font-medium">{step.step_name}</span>
                  <span className="text-xs text-muted-foreground">{step.status}</span>
                  {step.status === "failed" && step.error_message && (
                    <span className="text-xs text-red-600 truncate max-w-[150px]" title={step.error_message}>
                      {step.error_message}
                    </span>
                  )}
                </div>
              ))}

              {deletePhase === "done" && (
                <div className="mt-2 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-2 text-sm">
                  All resources have been torn down.
                </div>
              )}

              {deletePhase === "error" && deleteError && (
                <div className="mt-2 rounded-md bg-red-50 text-red-700 border border-red-200 px-3 py-2 text-sm">
                  {deleteError}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            {deletePhase === "confirm" && (
              <>
                <Button variant="outline" onClick={closeDeleteDialog}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleDelete}>
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  Delete
                </Button>
              </>
            )}
            {deletePhase === "progress" && (
              <Button variant="outline" disabled>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                Deleting...
              </Button>
            )}
            {(deletePhase === "done" || deletePhase === "error") && (
              <Button onClick={closeDeleteDialog}>
                Close
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
