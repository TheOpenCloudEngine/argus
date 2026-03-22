"use client"

import { useCallback, useEffect, useState } from "react"
import { Check, Eye, EyeOff, Loader2, Play, Save, X } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

import { fetchAuthConfig, fetchAuthSecret, testAuthConnection, updateAuthConfig, type AuthConfig } from "./api"

export function AuthSettings() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const [serverUrl, setServerUrl] = useState("")
  const [realm, setRealm] = useState("")
  const [clientId, setClientId] = useState("")
  const [clientSecret, setClientSecret] = useState("")
  const [adminRole, setAdminRole] = useState("")
  const [superuserRole, setSuperuserRole] = useState("")
  const [userRole, setUserRole] = useState("")
  const [showSecret, setShowSecret] = useState(false)
  const [realSecret, setRealSecret] = useState<string | null>(null)

  const handleToggleSecret = async () => {
    if (!showSecret && realSecret === null) {
      // First reveal — fetch the actual secret from server
      try {
        const secret = await fetchAuthSecret()
        setRealSecret(secret)
        setClientSecret(secret)
      } catch {
        // ignore
      }
    }
    setShowSecret(!showSecret)
  }

  const loadConfig = useCallback(async () => {
    try {
      setLoading(true)
      const cfg = await fetchAuthConfig()
      setServerUrl(cfg.server_url)
      setRealm(cfg.realm)
      setClientId(cfg.client_id)
      setClientSecret(cfg.client_secret)
      setAdminRole(cfg.admin_role)
      setSuperuserRole(cfg.superuser_role)
      setUserRole(cfg.user_role)
    } catch {
      setMessage({ type: "error", text: "Failed to load authentication configuration" })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadConfig() }, [loadConfig])

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      await updateAuthConfig({
        type: "keycloak",
        server_url: serverUrl,
        realm,
        client_id: clientId,
        client_secret: clientSecret,
        admin_role: adminRole,
        superuser_role: superuserRole,
        user_role: userRole,
      })
      setMessage({ type: "success", text: "Authentication configuration saved" })
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Save failed" })
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setMessage(null)
    try {
      const result = await testAuthConnection({
        type: "keycloak",
        server_url: serverUrl,
        realm,
        client_id: clientId,
        client_secret: clientSecret,
        admin_role: adminRole,
        superuser_role: superuserRole,
        user_role: userRole,
      })
      setMessage({ type: result.success ? "success" : "error", text: result.message })
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Test failed" })
    } finally {
      setTesting(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  return (
    <div className="space-y-4 max-w-2xl">
      {message && (
        <div className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
          message.type === "success" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"
        }`}>
          {message.type === "success" ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
          {message.text}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Keycloak OIDC</CardTitle>
          <CardDescription>Configure Keycloak server connection for SSO authentication.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Server URL</Label>
              <Input value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} placeholder="http://localhost:8180" />
            </div>
            <div className="space-y-1.5">
              <Label>Realm</Label>
              <Input value={realm} onChange={(e) => setRealm(e.target.value)} placeholder="argus" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Client ID</Label>
              <Input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="argus-client" />
            </div>
            <div className="space-y-1.5">
              <Label>Client Secret</Label>
              <div className="relative">
                <Input
                  type={showSecret ? "text" : "password"}
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder="••••••••"
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                  onClick={handleToggleSecret}
                >
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">Leave unchanged to keep existing secret.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Admin Role</Label>
              <Input value={adminRole} onChange={(e) => setAdminRole(e.target.value)} placeholder="argus-admin" />
            </div>
            <div className="space-y-1.5">
              <Label>Superuser Role</Label>
              <Input value={superuserRole} onChange={(e) => setSuperuserRole(e.target.value)} placeholder="argus-superuser" />
            </div>
            <div className="space-y-1.5">
              <Label>User Role</Label>
              <Input value={userRole} onChange={(e) => setUserRole(e.target.value)} placeholder="argus-user" />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
              Save
            </Button>
            <Button variant="outline" onClick={handleTest} disabled={testing}>
              {testing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />}
              Test Connection
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
