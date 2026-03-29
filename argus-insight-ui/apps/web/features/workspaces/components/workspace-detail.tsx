"use client"

import { useEffect, useState } from "react"
import {
  CheckCircle2,
  Circle,
  Database,
  ExternalLink,
  FolderGit2,
  Loader2,
  Network,
  Server,
  Trash2,
  UserMinus,
  Workflow,
  XCircle,
} from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { Badge } from "@workspace/ui/components/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Button } from "@workspace/ui/components/button"
import type {
  WorkspaceResponse,
  WorkspaceMember,
  WorkflowExecution,
  WorkflowStep,
} from "@/features/workspaces/types"
import {
  fetchWorkspaceMembers,
  fetchWorkspaceWorkflows,
  removeWorkspaceMember,
} from "@/features/workspaces/api"

interface WorkspaceDetailProps {
  workspace: WorkspaceResponse
  onRefresh: () => void
}

function isUrl(value: string): boolean {
  return /^https?:\/\//.test(value)
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

interface ResourceItem {
  label: string
  value: string | null
  icon: React.ReactNode
}

function ResourceCard({ label, value, icon }: ResourceItem) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <div className="text-muted-foreground mt-0.5">{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-muted-foreground text-xs font-medium">{label}</p>
          {value ? (
            isUrl(value) ? (
              <a
                href={value}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
              >
                {value}
                <ExternalLink className="h-3 w-3 flex-shrink-0" />
              </a>
            ) : (
              <p className="text-sm font-medium">{value}</p>
            )
          ) : (
            <p className="text-muted-foreground text-sm italic">Not provisioned</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function workflowStatusBadge(status: string) {
  switch (status) {
    case "completed":
      return (
        <Badge className="bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900 dark:text-green-200">
          completed
        </Badge>
      )
    case "failed":
      return (
        <Badge className="bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-900 dark:text-red-200">
          failed
        </Badge>
      )
    case "running":
      return (
        <Badge className="animate-pulse bg-blue-100 text-blue-800 hover:bg-blue-100 dark:bg-blue-900 dark:text-blue-200">
          running
        </Badge>
      )
    default:
      return (
        <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-200">
          {status}
        </Badge>
      )
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
    default:
      return <Circle className="h-4 w-4 text-gray-400" />
  }
}

function roleBadge(role: string) {
  if (role === "WorkspaceAdmin") {
    return (
      <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 dark:bg-blue-900 dark:text-blue-200">
        {role}
      </Badge>
    )
  }
  return (
    <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-200">
      {role}
    </Badge>
  )
}

// ---------- Resources Tab ----------

function ResourcesTab({ workspace }: { workspace: WorkspaceResponse }) {
  const iconClass = "h-5 w-5"
  const resources: ResourceItem[] = [
    { label: "GitLab", value: workspace.gitlab_project_url, icon: <FolderGit2 className={iconClass} /> },
    { label: "MinIO Endpoint", value: workspace.minio_endpoint, icon: <Database className={iconClass} /> },
    { label: "MinIO Console", value: workspace.minio_console_endpoint, icon: <Database className={iconClass} /> },
    { label: "Airflow", value: workspace.airflow_endpoint, icon: <Workflow className={iconClass} /> },
    { label: "MLflow", value: workspace.mlflow_endpoint, icon: <Server className={iconClass} /> },
    { label: "KServe", value: workspace.kserve_endpoint, icon: <Server className={iconClass} /> },
    { label: "K8s Cluster", value: workspace.k8s_cluster, icon: <Network className={iconClass} /> },
    { label: "K8s Namespace", value: workspace.k8s_namespace, icon: <Network className={iconClass} /> },
  ]

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {resources.map((r) => (
        <ResourceCard key={r.label} {...r} />
      ))}
    </div>
  )
}

// ---------- Members Tab ----------

function MembersTab({
  workspace,
  onRefresh,
}: {
  workspace: WorkspaceResponse
  onRefresh: () => void
}) {
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [loading, setLoading] = useState(true)
  const [removingId, setRemovingId] = useState<number | null>(null)

  const loadMembers = () => {
    setLoading(true)
    fetchWorkspaceMembers(workspace.id)
      .then(setMembers)
      .catch(() => setMembers([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchWorkspaceMembers(workspace.id)
      .then((data) => {
        if (!cancelled) setMembers(data)
      })
      .catch(() => {
        if (!cancelled) setMembers([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [workspace.id])

  const handleRemove = async (member: WorkspaceMember) => {
    setRemovingId(member.id)
    try {
      await removeWorkspaceMember(workspace.id, member.id)
      loadMembers()
      onRefresh()
    } catch {
      // silently handle
    } finally {
      setRemovingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
        <span className="text-muted-foreground ml-2 text-sm">Loading members...</span>
      </div>
    )
  }

  if (members.length === 0) {
    return (
      <div className="text-muted-foreground py-12 text-center text-sm">No members</div>
    )
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User ID</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Joined</TableHead>
            <TableHead className="w-[80px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((m) => (
            <TableRow key={m.id}>
              <TableCell className="font-mono text-sm">{m.user_id}</TableCell>
              <TableCell>{roleBadge(m.role)}</TableCell>
              <TableCell className="text-sm">{formatDateTime(m.created_at)}</TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive h-8 w-8"
                  disabled={removingId === m.id}
                  onClick={() => handleRemove(m)}
                >
                  {removingId === m.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserMinus className="h-4 w-4" />
                  )}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

// ---------- Workflows Tab ----------

function WorkflowsTab({ workspace }: { workspace: WorkspaceResponse }) {
  const [workflows, setWorkflows] = useState<WorkflowExecution[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchWorkspaceWorkflows(workspace.id)
      .then((data) => {
        if (!cancelled) setWorkflows(data)
      })
      .catch(() => {
        if (!cancelled) setWorkflows([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [workspace.id])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
        <span className="text-muted-foreground ml-2 text-sm">Loading workflows...</span>
      </div>
    )
  }

  if (workflows.length === 0) {
    return (
      <div className="text-muted-foreground py-12 text-center text-sm">
        No workflow executions
      </div>
    )
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Workflow</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created At</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {workflows.map((wf) => (
            <tbody key={wf.id}>
              <TableRow
                className={`cursor-pointer ${expandedId === wf.id ? "bg-muted/50" : ""}`}
                onClick={() => setExpandedId(expandedId === wf.id ? null : wf.id)}
              >
                <TableCell className="font-medium">{wf.workflow_name}</TableCell>
                <TableCell>{workflowStatusBadge(wf.status)}</TableCell>
                <TableCell className="text-sm">{formatDateTime(wf.created_at)}</TableCell>
              </TableRow>

              {expandedId === wf.id && (
                <TableRow>
                  <TableCell colSpan={3} className="bg-muted/30 p-4">
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold">Step Details</h4>
                      <ol className="space-y-1.5">
                        {wf.steps
                          .sort((a, b) => a.step_order - b.step_order)
                          .map((step) => (
                            <li
                              key={step.id}
                              className="flex items-center gap-3 text-sm"
                            >
                              {stepIcon(step.status)}
                              <span className="min-w-[200px] font-medium">
                                {step.step_name}
                              </span>
                              {step.status === "failed" && step.error_message && (
                                <span className="text-xs text-red-600">
                                  {step.error_message}
                                </span>
                              )}
                            </li>
                          ))}
                      </ol>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </tbody>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

// ---------- Main Component ----------

export function WorkspaceDetail({ workspace, onRefresh }: WorkspaceDetailProps) {
  return (
    <Tabs defaultValue="resources" className="w-full">
      <TabsList>
        <TabsTrigger value="resources">Resources</TabsTrigger>
        <TabsTrigger value="members">Members</TabsTrigger>
        <TabsTrigger value="workflows">Workflows</TabsTrigger>
      </TabsList>

      <TabsContent value="resources" className="mt-4">
        <ResourcesTab workspace={workspace} />
      </TabsContent>

      <TabsContent value="members" className="mt-4">
        <MembersTab workspace={workspace} onRefresh={onRefresh} />
      </TabsContent>

      <TabsContent value="workflows" className="mt-4">
        <WorkflowsTab workspace={workspace} />
      </TabsContent>
    </Tabs>
  )
}
