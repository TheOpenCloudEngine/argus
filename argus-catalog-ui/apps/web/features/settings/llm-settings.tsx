"use client"

import { useCallback, useEffect, useState } from "react"
import { Bot, Check, Eye, EyeOff, Loader2, Play, Save, Sparkles, X } from "lucide-react"

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
  bulkGenerate, fetchAIStats, fetchLLMConfig, testLLM, updateLLMConfig,
  type AIStats, type LLMConfig,
} from "./api"

const PROVIDER_MODELS: Record<string, { label: string; models: { id: string; label: string }[] }> = {
  openai: {
    label: "OpenAI API",
    models: [
      { id: "gpt-4o-mini", label: "gpt-4o-mini (fast, low cost)" },
      { id: "gpt-4o", label: "gpt-4o (high quality)" },
      { id: "gpt-4.1-mini", label: "gpt-4.1-mini (latest)" },
    ],
  },
  ollama: {
    label: "Ollama (Local LLM)",
    models: [
      { id: "qwen2.5:7b", label: "qwen2.5:7b (Korean recommended)" },
      { id: "qwen2.5:14b", label: "qwen2.5:14b (Korean high quality)" },
      { id: "llama3.1:8b", label: "llama3.1:8b (English)" },
      { id: "gemma2:9b", label: "gemma2:9b (Multilingual)" },
    ],
  },
  anthropic: {
    label: "Anthropic (Claude)",
    models: [
      { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4 (balanced)" },
      { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (fast)" },
    ],
  },
}

const LANGUAGES = [
  { id: "ko", label: "Korean" },
  { id: "en", label: "English" },
  { id: "ja", label: "Japanese" },
  { id: "zh", label: "Chinese" },
]

export function LLMSettings() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const [enabled, setEnabled] = useState(false)
  const [provider, setProvider] = useState("ollama")
  const [model, setModel] = useState("qwen2.5:7b")
  const [apiKey, setApiKey] = useState("")
  const [apiUrl, setApiUrl] = useState("")
  const [temperature, setTemperature] = useState(0.3)
  const [maxTokens, setMaxTokens] = useState(1024)
  const [autoGenerateOnSync, setAutoGenerateOnSync] = useState(false)
  const [language, setLanguage] = useState("ko")
  const [showApiKey, setShowApiKey] = useState(false)

  const [stats, setStats] = useState<AIStats | null>(null)

  const loadConfig = useCallback(async () => {
    try {
      setLoading(true)
      const [cfg, st] = await Promise.all([
        fetchLLMConfig(),
        fetchAIStats().catch(() => null),
      ])
      setEnabled(cfg.enabled)
      setProvider(cfg.provider)
      setModel(cfg.model)
      setApiKey(cfg.api_key)
      setApiUrl(cfg.api_url)
      setTemperature(cfg.temperature)
      setMaxTokens(cfg.max_tokens)
      setAutoGenerateOnSync(cfg.auto_generate_on_sync)
      setLanguage(cfg.language)
      setStats(st)
    } catch {
      setMessage({ type: "error", text: "Failed to load LLM configuration" })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadConfig() }, [loadConfig])

  const handleProviderChange = (val: string) => {
    setProvider(val)
    const models = PROVIDER_MODELS[val]?.models
    if (models?.length) setModel(models[0].id)
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      await updateLLMConfig({
        enabled, provider, model, api_key: apiKey, api_url: apiUrl,
        temperature, max_tokens: maxTokens,
        auto_generate_on_sync: autoGenerateOnSync, language,
      })
      setMessage({ type: "success", text: "LLM configuration saved" })
      const st = await fetchAIStats().catch(() => null)
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
      const result = await testLLM({
        enabled, provider, model, api_key: apiKey, api_url: apiUrl,
        temperature, max_tokens: maxTokens,
        auto_generate_on_sync: autoGenerateOnSync, language,
      })
      setMessage({ type: result.success ? "success" : "error", text: result.message })
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Test failed" })
    } finally {
      setTesting(false)
    }
  }

  const handleBulkGenerate = async (types: string[]) => {
    setGenerating(true)
    setMessage(null)
    try {
      const result = await bulkGenerate({
        generation_types: types,
        apply: true,
        empty_only: true,
      })
      setMessage({
        type: "success",
        text: `Bulk generation complete: ${result.processed} processed, ${result.errors} errors (total: ${result.total})`,
      })
      const st = await fetchAIStats().catch(() => null)
      setStats(st)
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Bulk generate failed" })
    } finally {
      setGenerating(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const coverage = stats?.description_coverage

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

      {/* AI Coverage Stats */}
      {stats && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Bot className="h-4 w-4" /> AI Metadata Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-6 text-sm flex-wrap">
              {coverage && (
                <div>
                  <span className="text-muted-foreground">Description Coverage: </span>
                  <span className="font-semibold">{coverage.described_datasets} / {coverage.total_datasets}</span>
                  <Badge variant="outline" className="ml-2">{coverage.coverage_pct}%</Badge>
                </div>
              )}
              {stats.provider && (
                <div>
                  <span className="text-muted-foreground">Provider: </span>
                  <span className="font-semibold">{stats.provider} / {stats.model}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-6 text-sm flex-wrap">
              <div>
                <span className="text-muted-foreground">Generations: </span>
                <span className="font-semibold">{stats.total_generations}</span>
                <span className="text-muted-foreground ml-2">({stats.applied_count} applied, {stats.pending_count} pending)</span>
              </div>
              <div>
                <span className="text-muted-foreground">Tokens: </span>
                <span className="font-semibold">{(stats.total_prompt_tokens + stats.total_completion_tokens).toLocaleString()}</span>
              </div>
            </div>
            {coverage && coverage.described_datasets < coverage.total_datasets && coverage.total_datasets > 0 && (
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${coverage.coverage_pct}%` }}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">LLM Provider</CardTitle>
          <CardDescription>
            Configure the LLM provider for AI-powered metadata generation (descriptions, tags, PII detection).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Enable toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label>Enable AI Metadata Generation</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                When enabled, AI can generate descriptions, suggest tags, and detect PII.
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
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDER_MODELS[provider]?.models.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* API Key (OpenAI/Anthropic) */}
          {(provider === "openai" || provider === "anthropic") && (
            <div className="space-y-1.5">
              <Label>API Key</Label>
              <div className="relative">
                <Input
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={provider === "openai" ? "sk-..." : "sk-ant-..."}
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

          {/* API URL */}
          <div className="space-y-1.5">
            <Label>API URL {provider === "ollama" ? "(Ollama endpoint)" : "(optional override)"}</Label>
            <Input
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder={
                provider === "ollama" ? "http://localhost:11434" :
                provider === "anthropic" ? "https://api.anthropic.com" :
                "https://api.openai.com/v1"
              }
            />
          </div>

          {/* Language */}
          <div className="space-y-1.5">
            <Label>Generation Language</Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Temperature */}
          <div className="space-y-1.5">
            <Label>Temperature ({temperature})</Label>
            <Input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="h-2"
            />
            <p className="text-xs text-muted-foreground">
              Lower = more factual, higher = more creative. 0.3 recommended for metadata.
            </p>
          </div>

          {/* Max Tokens */}
          <div className="space-y-1.5">
            <Label>Max Tokens</Label>
            <Input
              type="number"
              value={maxTokens}
              onChange={(e) => setMaxTokens(parseInt(e.target.value) || 1024)}
              min={256}
              max={8192}
            />
          </div>

          {/* Auto-generate on sync */}
          <div className="flex items-center justify-between">
            <div>
              <Label>Auto-generate on Sync</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Automatically generate descriptions for new datasets after metadata sync.
              </p>
            </div>
            <Switch checked={autoGenerateOnSync} onCheckedChange={setAutoGenerateOnSync} />
          </div>

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

      {/* Bulk Generation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bulk AI Generation</CardTitle>
          <CardDescription>
            Generate metadata for all datasets that are missing descriptions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => handleBulkGenerate(["description"])}
              disabled={generating || !enabled}
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
              Generate Descriptions
            </Button>
            <Button
              variant="outline"
              onClick={() => handleBulkGenerate(["description", "columns", "tags", "pii"])}
              disabled={generating || !enabled}
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
              Generate All (Desc + Columns + Tags + PII)
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Only processes datasets with empty descriptions. Results are applied directly.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
