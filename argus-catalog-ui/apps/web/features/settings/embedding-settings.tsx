"use client"

import { useCallback, useEffect, useState } from "react"
import { Brain, Check, Eye, EyeOff, Loader2, Play, RefreshCw, Save, Trash2, X } from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@workspace/ui/components/select"
import { Switch } from "@workspace/ui/components/switch"

import {
  backfillEmbeddings, clearEmbeddings,
  fetchEmbeddingConfig, fetchEmbeddingStats,
  testEmbedding, updateEmbeddingConfig,
  type EmbeddingConfig, type EmbeddingStats,
} from "./api"

const PROVIDER_MODELS: Record<string, { label: string; models: { id: string; label: string; dim: number }[] }> = {
  local: {
    label: "Local (sentence-transformers)",
    models: [
      { id: "all-MiniLM-L6-v2", label: "all-MiniLM-L6-v2 (English, 80MB)", dim: 384 },
      { id: "paraphrase-multilingual-MiniLM-L12-v2", label: "multilingual-MiniLM-L12-v2 (Korean+English, 470MB)", dim: 384 },
      { id: "bge-small-en-v1.5", label: "bge-small-en-v1.5 (English, 130MB)", dim: 384 },
    ],
  },
  openai: {
    label: "OpenAI API",
    models: [
      { id: "text-embedding-3-small", label: "text-embedding-3-small (1536d)", dim: 1536 },
      { id: "text-embedding-3-large", label: "text-embedding-3-large (3072d)", dim: 3072 },
      { id: "text-embedding-ada-002", label: "text-embedding-ada-002 (1536d)", dim: 1536 },
    ],
  },
  ollama: {
    label: "Ollama (Local API)",
    models: [
      { id: "all-minilm", label: "all-minilm (384d)", dim: 384 },
      { id: "nomic-embed-text", label: "nomic-embed-text (768d)", dim: 768 },
      { id: "mxbai-embed-large", label: "mxbai-embed-large (1024d)", dim: 1024 },
    ],
  },
}

export function EmbeddingSettings() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [backfilling, setBackfilling] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const [enabled, setEnabled] = useState(false)
  const [provider, setProvider] = useState("local")
  const [model, setModel] = useState("all-MiniLM-L6-v2")
  const [apiKey, setApiKey] = useState("")
  const [apiUrl, setApiUrl] = useState("")
  const [dimension, setDimension] = useState(384)
  const [showApiKey, setShowApiKey] = useState(false)

  const [stats, setStats] = useState<EmbeddingStats | null>(null)

  const loadConfig = useCallback(async () => {
    try {
      setLoading(true)
      const [cfg, st] = await Promise.all([
        fetchEmbeddingConfig(),
        fetchEmbeddingStats().catch(() => null),
      ])
      setEnabled(cfg.enabled)
      setProvider(cfg.provider)
      setModel(cfg.model)
      setApiKey(cfg.api_key)
      setApiUrl(cfg.api_url)
      setDimension(cfg.dimension)
      setStats(st)
    } catch {
      setMessage({ type: "error", text: "Failed to load embedding configuration" })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadConfig() }, [loadConfig])

  const handleProviderChange = (val: string) => {
    setProvider(val)
    const models = PROVIDER_MODELS[val]?.models
    if (models?.length) {
      setModel(models[0].id)
      setDimension(models[0].dim)
    }
  }

  const handleModelChange = (val: string) => {
    setModel(val)
    const m = PROVIDER_MODELS[provider]?.models.find((m) => m.id === val)
    if (m) setDimension(m.dim)
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      await updateEmbeddingConfig({ enabled, provider, model, api_key: apiKey, api_url: apiUrl, dimension })
      setMessage({ type: "success", text: "Embedding configuration saved" })
      const st = await fetchEmbeddingStats().catch(() => null)
      setStats(st)
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
      const result = await testEmbedding({ enabled, provider, model, api_key: apiKey, api_url: apiUrl, dimension })
      setMessage({ type: result.success ? "success" : "error", text: result.message })
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Test failed" })
    } finally {
      setTesting(false)
    }
  }

  const handleBackfill = async () => {
    setBackfilling(true)
    setMessage(null)
    try {
      const result = await backfillEmbeddings()
      setMessage({
        type: "success",
        text: `Backfill complete: ${result.embedded} embedded, ${result.skipped} skipped, ${result.errors} errors (total: ${result.total})`,
      })
      const st = await fetchEmbeddingStats().catch(() => null)
      setStats(st)
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Backfill failed" })
    } finally {
      setBackfilling(false)
    }
  }

  const handleClear = async () => {
    if (!confirm("Delete all embeddings? You will need to run backfill again.")) return
    setMessage(null)
    try {
      const result = await clearEmbeddings()
      setMessage({ type: "success", text: `Deleted ${result.deleted} embeddings` })
      const st = await fetchEmbeddingStats().catch(() => null)
      setStats(st)
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Clear failed" })
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Status message */}
      {message && (
        <div className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
          message.type === "success" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"
        }`}>
          {message.type === "success" ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
          {message.text}
        </div>
      )}

      {/* Embedding Coverage Stats */}
      {stats && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Brain className="h-4 w-4" /> Embedding Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6 text-sm">
              <div>
                <span className="text-muted-foreground">Coverage: </span>
                <span className="font-semibold">{stats.embedded_datasets} / {stats.total_datasets}</span>
                <Badge variant="outline" className="ml-2">{stats.coverage_pct}%</Badge>
              </div>
              {stats.provider && (
                <div>
                  <span className="text-muted-foreground">Provider: </span>
                  <span className="font-semibold">{stats.provider} / {stats.model}</span>
                  <span className="text-muted-foreground ml-1">({stats.dimension}d)</span>
                </div>
              )}
            </div>
            {stats.embedded_datasets < stats.total_datasets && stats.total_datasets > 0 && (
              <div className="mt-2">
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all"
                    style={{ width: `${stats.coverage_pct}%` }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Embedding Provider</CardTitle>
          <CardDescription>
            Configure the embedding provider for semantic search on catalog datasets.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Enable toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label>Enable Semantic Search</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                When enabled, datasets are automatically embedded for semantic search.
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          {/* Provider */}
          <div className="space-y-1.5">
            <Label>Provider</Label>
            <Select value={provider} onValueChange={handleProviderChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PROVIDER_MODELS).map(([key, val]) => (
                  <SelectItem key={key} value={key}>{val.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Model */}
          <div className="space-y-1.5">
            <Label>Model</Label>
            <Select value={model} onValueChange={handleModelChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDER_MODELS[provider]?.models.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Dimension: {dimension}. You can also type a custom model name.
            </p>
          </div>

          {/* API Key (OpenAI only) */}
          {provider === "openai" && (
            <div className="space-y-1.5">
              <Label>API Key</Label>
              <div className="relative">
                <Input
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          )}

          {/* API URL (OpenAI/Ollama) */}
          {(provider === "openai" || provider === "ollama") && (
            <div className="space-y-1.5">
              <Label>API URL {provider === "ollama" ? "(Ollama endpoint)" : "(optional override)"}</Label>
              <Input
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder={provider === "ollama" ? "http://localhost:11434" : "https://api.openai.com/v1"}
              />
            </div>
          )}

          {/* Actions */}
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

      {/* Embedding Management */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Embedding Management</CardTitle>
          <CardDescription>
            Manage dataset embeddings for semantic search.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleBackfill} disabled={backfilling || !enabled}>
              {backfilling ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              {backfilling ? "Backfilling..." : "Backfill All Datasets"}
            </Button>
            <Button variant="outline" onClick={handleClear} className="text-red-600 hover:text-red-700">
              <Trash2 className="h-4 w-4 mr-1" />
              Clear All Embeddings
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Backfill generates embeddings for all datasets that don&apos;t have one yet.
            Clear removes all embeddings (required before switching providers with different dimensions).
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
