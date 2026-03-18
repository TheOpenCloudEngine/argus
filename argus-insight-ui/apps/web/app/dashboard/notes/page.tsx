"use client"

import { DashboardHeader } from "@/components/dashboard-header"
import { NotesProvider } from "@/features/notes/components/notes-provider"
import { NotebookList } from "@/features/notes/components/notebook-list"

export default function NotesPage() {
  return (
    <NotesProvider>
      <DashboardHeader title="My Notes" />
      <div className="flex flex-1 flex-col gap-4 p-4">
        <NotebookList />
      </div>
    </NotesProvider>
  )
}
