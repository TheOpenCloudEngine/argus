"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  BookOpen,
  Plus,
  Search,
  Trash2,
  Pin,
  MoreVertical,
} from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Card } from "@workspace/ui/components/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { useNotes } from "./notes-provider"

const COLORS: Record<string, string> = {
  default: "bg-muted",
  blue: "bg-blue-100 dark:bg-blue-950",
  green: "bg-green-100 dark:bg-green-950",
  red: "bg-red-100 dark:bg-red-950",
  purple: "bg-purple-100 dark:bg-purple-950",
  orange: "bg-orange-100 dark:bg-orange-950",
}

export function NotebookList() {
  const router = useRouter()
  const { notebooks, loadNotebooks, createNotebook, removeNotebook } = useNotes()
  const [search, setSearch] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [newDescription, setNewDescription] = useState("")
  const [newColor, setNewColor] = useState("default")

  const handleSearch = (value: string) => {
    setSearch(value)
    loadNotebooks(value || undefined)
  }

  const handleCreate = async () => {
    if (!newTitle.trim()) return
    const nb = await createNotebook(newTitle.trim(), newDescription.trim() || undefined, newColor)
    setDialogOpen(false)
    setNewTitle("")
    setNewDescription("")
    setNewColor("default")
    router.push(`/dashboard/notes/${nb.id}`)
  }

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation()
    await removeNotebook(id)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search notebooks..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" />
              New Notebook
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Notebook</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3 py-4">
              <Input
                placeholder="Notebook title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
              <Input
                placeholder="Description (optional)"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
              />
              <div className="flex gap-2">
                {Object.keys(COLORS).map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewColor(c)}
                    className={`h-6 w-6 rounded-full border-2 ${COLORS[c]} ${
                      newColor === c ? "border-primary" : "border-transparent"
                    }`}
                  />
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={!newTitle.trim()}>
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {notebooks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <BookOpen className="h-12 w-12 mb-4" />
          <p className="text-lg font-medium">No notebooks yet</p>
          <p className="text-sm">Create your first notebook to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {notebooks.map((nb) => (
            <Card
              key={nb.id}
              className={`cursor-pointer hover:shadow-md transition-shadow relative group ${COLORS[nb.color] || COLORS.default}`}
              onClick={() => router.push(`/dashboard/notes/${nb.id}`)}
            >
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    {nb.isPinned && <Pin className="h-3 w-3 text-muted-foreground shrink-0" />}
                    <h3 className="font-semibold truncate">{nb.title}</h3>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreVertical className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={(e) => handleDelete(e, nb.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {nb.description && (
                  <p className="text-sm text-muted-foreground mt-1 truncate">
                    {nb.description}
                  </p>
                )}
                <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                  <span>{nb.sectionCount} sections</span>
                  <span>{nb.pageCount} pages</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Updated {new Date(nb.updatedAt).toLocaleDateString()}
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
