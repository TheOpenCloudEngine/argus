"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Settings } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { checkUcConfigured } from "../api"

type Status = "checking" | "not_configured" | "ready"

export function UCConfigGuard({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("checking")
  const router = useRouter()

  const runCheck = useCallback(async () => {
    try {
      setStatus("checking")
      const { configured } = await checkUcConfigured()
      setStatus(configured ? "ready" : "not_configured")
    } catch {
      setStatus("not_configured")
    }
  }, [])

  useEffect(() => {
    runCheck()
  }, [runCheck])

  if (status === "checking") {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">
          Checking Unity Catalog connection...
        </span>
      </div>
    )
  }

  if (status === "not_configured") {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <p className="text-sm text-destructive">
          Unity Catalog connection must be configured by an administrator in Settings &gt; Argus &gt; Unity Catalog.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push("/dashboard/settings?tab=argus")}
        >
          <Settings className="h-4 w-4 mr-1.5" />
          Go to Unity Catalog Settings
        </Button>
      </div>
    )
  }

  return <>{children}</>
}
