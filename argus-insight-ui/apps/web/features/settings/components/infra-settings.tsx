"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, Minus, Plus, Save } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

import { fetchInfraConfig, updateInfraCategory } from "@/features/settings/api"

const MAX_DNS_SERVERS = 3

// --------------------------------------------------------------------------- //
// Network Settings Section
// --------------------------------------------------------------------------- //

function NetworkSettingsSection({
  domainName,
  dnsServers,
  onDomainNameChange,
  onDnsServerChange,
  onAddDns,
  onRemoveDns,
  onSave,
  saving,
}: {
  domainName: string
  dnsServers: string[]
  onDomainNameChange: (value: string) => void
  onDnsServerChange: (index: number, value: string) => void
  onAddDns: () => void
  onRemoveDns: (index: number) => void
  onSave: () => void
  saving: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Network</CardTitle>
            <CardDescription>
              Domain name and DNS server configuration
            </CardDescription>
          </div>
          <Button size="sm" onClick={onSave} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
            ) : (
              <Save className="h-4 w-4 mr-1.5" />
            )}
            Save
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Domain Name */}
          <div className="space-y-2">
            <Label htmlFor="infra-domain-name">Domain Name</Label>
            <Input
              id="infra-domain-name"
              value={domainName}
              onChange={(e) => onDomainNameChange(e.target.value)}
              placeholder="e.g. example.com"
            />
            <p className="text-xs text-muted-foreground">
              The primary domain name for this infrastructure
            </p>
          </div>

          {/* DNS Servers */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label>DNS Servers</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Up to {MAX_DNS_SERVERS} DNS servers can be configured
                </p>
              </div>
              {dnsServers.length < MAX_DNS_SERVERS && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onAddDns}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add
                </Button>
              )}
            </div>
            <div className="space-y-2">
              {dnsServers.map((dns, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-6 shrink-0 text-right">
                    {index + 1}.
                  </span>
                  <Input
                    value={dns}
                    onChange={(e) => onDnsServerChange(index, e.target.value)}
                    placeholder={`DNS Server ${index + 1} (e.g. 8.8.8.8)`}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9 shrink-0"
                    onClick={() => onRemoveDns(index)}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {dnsServers.length === 0 && (
                <p className="text-sm text-muted-foreground py-2">
                  No DNS servers configured. Click &quot;Add&quot; to add one.
                </p>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// --------------------------------------------------------------------------- //
// Main Component
// --------------------------------------------------------------------------- //

export function InfraSettings() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Network state
  const [domainName, setDomainName] = useState("")
  const [dnsServers, setDnsServers] = useState<string[]>([])

  // Status messages
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const loadConfig = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await fetchInfraConfig()
      const network = data.categories.find((c) => c.category === "network")
      if (network) {
        setDomainName(network.items.domain_name ?? "")
        // Collect non-empty DNS servers and always show at least those
        const servers: string[] = []
        for (let i = 1; i <= MAX_DNS_SERVERS; i++) {
          const val = network.items[`dns_server_${i}`]
          if (val !== undefined) servers.push(val)
        }
        // Show at least 1 row if all are empty
        setDnsServers(servers.length > 0 ? servers : [""])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load configuration")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  function showStatus(type: "success" | "error", text: string) {
    setStatusMessage({ type, text })
    setTimeout(() => setStatusMessage(null), 3000)
  }

  async function handleSaveNetwork() {
    setSaving(true)
    try {
      const items: Record<string, string> = {
        domain_name: domainName,
      }
      for (let i = 0; i < MAX_DNS_SERVERS; i++) {
        items[`dns_server_${i + 1}`] = dnsServers[i] ?? ""
      }
      await updateInfraCategory("network", items)
      showStatus("success", "Network settings saved successfully")
      await loadConfig()
    } catch (err) {
      showStatus("error", err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  function handleDnsServerChange(index: number, value: string) {
    setDnsServers((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }

  function handleAddDns() {
    if (dnsServers.length < MAX_DNS_SERVERS) {
      setDnsServers((prev) => [...prev, ""])
    }
  }

  function handleRemoveDns(index: number) {
    setDnsServers((prev) => prev.filter((_, i) => i !== index))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading configuration...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={loadConfig}>
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Status message */}
      {statusMessage && (
        <div
          className={`rounded-md px-4 py-2 text-sm ${
            statusMessage.type === "success"
              ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"
              : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
          }`}
        >
          {statusMessage.text}
        </div>
      )}

      {/* Network Settings */}
      <NetworkSettingsSection
        domainName={domainName}
        dnsServers={dnsServers}
        onDomainNameChange={setDomainName}
        onDnsServerChange={handleDnsServerChange}
        onAddDns={handleAddDns}
        onRemoveDns={handleRemoveDns}
        onSave={handleSaveNetwork}
        saving={saving}
      />
    </div>
  )
}
