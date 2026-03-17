"use client"

import { DashboardHeader } from "@/components/dashboard-header"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { FileBrowserSettings } from "@/features/settings/components/file-browser-settings"

export default function SettingsPage() {
  return (
    <>
      <DashboardHeader title="Settings" />
      <div className="flex flex-1 flex-col gap-4 p-4">
        <Tabs defaultValue="file-browser">
          <TabsList variant="line">
            <TabsTrigger value="file-browser">File Browser</TabsTrigger>
          </TabsList>
          <TabsContent value="file-browser" className="mt-4">
            <FileBrowserSettings />
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}
