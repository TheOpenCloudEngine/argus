"use client"

import { DashboardHeader } from "@/components/dashboard-header"
import {
  ObjectStorageBrowser,
  mockListObjects,
  mockDeleteObjects,
  mockCreateFolder,
  mockUploadFiles,
  mockGetDownloadUrl,
} from "@/components/object-storage-browser"

const mockDataSource = {
  listObjects: mockListObjects,
  deleteObjects: mockDeleteObjects,
  createFolder: mockCreateFolder,
  uploadFiles: mockUploadFiles,
  getDownloadUrl: mockGetDownloadUrl,
}

export default function FileBrowserPage() {
  return (
    <>
      <DashboardHeader title="File Browser" />
      <div className="flex flex-1 flex-col gap-4 p-4">
        <ObjectStorageBrowser
          bucket="argus-data"
          dataSource={mockDataSource}
        />
      </div>
    </>
  )
}
