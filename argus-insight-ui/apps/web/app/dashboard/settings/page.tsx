"use client"

import { DashboardHeader } from "@/components/dashboard-header"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { FileBrowserSettings } from "@/features/settings/components/file-browser-settings"
import { InfraSettings } from "@/features/settings/components/infra-settings"

export default function SettingsPage() {
  return (
    <>
      <DashboardHeader title="Settings" />
      <div className="flex flex-1 flex-col gap-4 p-4">
        <Tabs defaultValue="infra">
          <TabsList variant="line">
            <TabsTrigger value="infra">Infra</TabsTrigger>
            <TabsTrigger value="file-browser">File Browser</TabsTrigger>
          </TabsList>
          <TabsContent value="infra" className="mt-4">
            <InfraSettings />
          </TabsContent>
          <TabsContent value="file-browser" className="mt-4">
            <FileBrowserSettings />
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}
