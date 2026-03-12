'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Loader2, CheckCircle, XCircle, Eye, EyeOff, Bot, Zap, Search, Send,
  RefreshCw, Activity, FileText, AlertTriangle, Plug, ChevronDown, ChevronUp,
} from 'lucide-react';
import { getAiProviderConfig, saveAiProviderConfig, verifyAiProviderConnection } from './actions';
import {
  getAgentSyncStatus, getPluginHealth, triggerSync, previewInstructions,
  type SyncStatusResponse, type SyncStatusDetail, type PluginHealth,
} from '../agent-sync/actions';

interface AiProviderConfig {
  id: string;
  api_url: string;
  api_key: string;
  api_key_masked: boolean;
  agent_id?: string;
  is_active: boolean;
  verified_at?: string;
  openrouter_api_key?: string | null;
  telegram_bot_token?: string | null;
  brave_search_api_key?: string | null;
}

function MaskedInput({
  id,
  label,
  placeholder,
  value,
  onChange,
  description,
  icon: Icon,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  description: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type={show ? 'text' : 'password'}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="absolute right-0 top-0 h-full px-3"
          onClick={() => setShow(!show)}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function SyncStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'synced':
      return <Badge className="bg-green-600/20 text-green-400 border-green-600/30">Synced</Badge>;
    case 'syncing':
      return <Badge className="bg-blue-600/20 text-blue-400 border-blue-600/30">Syncing</Badge>;
    case 'pending':
      return <Badge className="bg-yellow-600/20 text-yellow-400 border-yellow-600/30">Pending</Badge>;
    case 'stale':
      return <Badge className="bg-orange-600/20 text-orange-400 border-orange-600/30">Stale</Badge>;
    case 'error':
      return <Badge variant="destructive">Error</Badge>;
    default:
      return <Badge variant="outline" className="text-muted-foreground">No Agent</Badge>;
  }
}

function AgentSyncPanel() {
  const [syncStatus, setSyncStatus] = useState<SyncStatusResponse | null>(null);
  const [health, setHealth] = useState<PluginHealth | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [loadingHealth, setLoadingHealth] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncingCategory, setSyncingCategory] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState('');
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    setLoadingStatus(true);
    setLoadingHealth(true);

    const [statusData, healthData] = await Promise.all([
      getAgentSyncStatus(),
      getPluginHealth(),
    ]);

    setSyncStatus(statusData);
    setHealth(healthData);
    setLoadingStatus(false);
    setLoadingHealth(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSyncAll = async () => {
    setSyncing(true);
    try {
      await triggerSync();
      await loadData();
    } catch {
      // Error handled by action
    } finally {
      setSyncing(false);
    }
  };

  const handleSyncCategory = async (categoryId: string) => {
    setSyncingCategory(categoryId);
    try {
      await triggerSync(categoryId);
      await loadData();
    } catch {
      // Error handled by action
    } finally {
      setSyncingCategory(null);
    }
  };

  const handlePreview = async (categoryId: string, categoryName: string) => {
    const result = await previewInstructions(categoryId);
    if (result?.content) {
      setPreviewContent(result.content);
      setPreviewTitle(categoryName);
      setPreviewOpen(true);
    }
  };

  const toggleError = (categoryId: string) => {
    setExpandedErrors((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  };

  if (loadingStatus && loadingHealth) {
    return (
      <Card className="mt-6">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="mt-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Provider Sync Status
              </CardTitle>
              <CardDescription className="mt-1">
                Skills and knowledge synced to OpenClaw as SKILL.md files
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={loadData} disabled={loadingStatus}>
                <RefreshCw className={`h-4 w-4 mr-1 ${loadingStatus ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button size="sm" onClick={handleSyncAll} disabled={syncing}>
                {syncing ? (
                  <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Syncing...</>
                ) : (
                  'Sync All'
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Plugin Health */}
          <div className="flex items-center gap-3 p-3 rounded-lg border bg-card">
            <Plug className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Plugin Status</span>
            {loadingHealth ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : health?.plugin_connected ? (
              <Badge className="bg-green-600/20 text-green-400 border-green-600/30">
                <CheckCircle className="h-3 w-3 mr-1" />
                Connected
              </Badge>
            ) : (
              <Badge variant="destructive">
                <XCircle className="h-3 w-3 mr-1" />
                Disconnected
              </Badge>
            )}
            {health?.plugin_data?.managedSkills && (
              <span className="text-xs text-muted-foreground ml-auto">
                {health.plugin_data.managedSkills.length} skill(s) on server
              </span>
            )}
            {health?.error && (
              <span className="text-xs text-red-400 ml-auto">{health.error}</span>
            )}
          </div>

          {/* Summary Counts */}
          {syncStatus && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg border bg-card text-center">
                <div className="text-2xl font-bold text-green-400">{syncStatus.agents_synced}</div>
                <div className="text-xs text-muted-foreground">Synced</div>
              </div>
              <div className="p-3 rounded-lg border bg-card text-center">
                <div className="text-2xl font-bold text-yellow-400">
                  {syncStatus.agents_pending + syncStatus.agents_stale}
                </div>
                <div className="text-xs text-muted-foreground">Pending</div>
              </div>
              <div className="p-3 rounded-lg border bg-card text-center">
                <div className="text-2xl font-bold text-red-400">{syncStatus.agents_error}</div>
                <div className="text-xs text-muted-foreground">Error</div>
              </div>
              <div className="p-3 rounded-lg border bg-card text-center">
                <div className="text-2xl font-bold text-muted-foreground">{syncStatus.agents_none}</div>
                <div className="text-xs text-muted-foreground">No Agent</div>
              </div>
            </div>
          )}

          {/* Per-Category Table */}
          {syncStatus && syncStatus.details.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium">Category</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium hidden sm:table-cell">Skills</th>
                    <th className="text-left p-3 font-medium hidden sm:table-cell">Last Synced</th>
                    <th className="text-right p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {syncStatus.details.map((detail) => (
                    <tr key={detail.category_id} className="border-b last:border-0">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          {detail.category_icon && (
                            <span className="text-base">{detail.category_icon}</span>
                          )}
                          <span className="font-medium">{detail.category_name}</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-col gap-1">
                          <SyncStatusBadge status={detail.sync_status} />
                          {detail.sync_status === 'error' && detail.last_sync_error && (
                            <button
                              onClick={() => toggleError(detail.category_id)}
                              className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300"
                            >
                              <AlertTriangle className="h-3 w-3" />
                              {expandedErrors.has(detail.category_id) ? (
                                <ChevronUp className="h-3 w-3" />
                              ) : (
                                <ChevronDown className="h-3 w-3" />
                              )}
                            </button>
                          )}
                        </div>
                        {expandedErrors.has(detail.category_id) && detail.last_sync_error && (
                          <p className="text-xs text-red-400 mt-1 max-w-xs break-words">
                            {detail.last_sync_error}
                          </p>
                        )}
                      </td>
                      <td className="p-3 hidden sm:table-cell">
                        <span className="text-muted-foreground">
                          {detail.skill_count} skill{detail.skill_count !== 1 ? 's' : ''}
                          {detail.has_knowledge && ' + KB'}
                        </span>
                      </td>
                      <td className="p-3 hidden sm:table-cell">
                        <span className="text-xs text-muted-foreground">
                          {detail.last_synced_at
                            ? new Date(detail.last_synced_at).toLocaleString()
                            : 'Never'}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handlePreview(detail.category_id, detail.category_name)}
                            title="Preview SKILL.md"
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSyncCategory(detail.category_id)}
                            disabled={syncingCategory === detail.category_id}
                            title="Sync category"
                          >
                            {syncingCategory === detail.category_id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCw className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {syncStatus && syncStatus.details.length === 0 && (
            <div className="text-center py-6 text-muted-foreground text-sm">
              No categories found. Create categories and link skills to enable provider sync.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>SKILL.md Preview - {previewTitle}</DialogTitle>
          </DialogHeader>
          <div className="overflow-auto max-h-[60vh]">
            <pre className="text-xs font-mono whitespace-pre-wrap p-4 rounded-lg bg-muted/50 border">
              {previewContent || 'No content'}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function AiProviderSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [config, setConfig] = useState<AiProviderConfig | null>(null);
  const [formData, setFormData] = useState({
    api_url: '',
    api_key: '',
    agent_id: '',
    openrouter_api_key: '',
    telegram_bot_token: '',
    brave_search_api_key: '',
  });
  const [alert, setAlert] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const data = await getAiProviderConfig();

      if (data) {
        setConfig(data);
        setFormData({
          api_url: data.api_url || '',
          api_key: '',
          agent_id: data.agent_id || '',
          openrouter_api_key: '',
          telegram_bot_token: '',
          brave_search_api_key: '',
        });
      }
    } catch (error) {
      console.error('Failed to load AI provider config:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyConnection = async () => {
    setVerifying(true);
    setAlert(null);

    try {
      if (!formData.api_key && !config) {
        setAlert({ type: 'error', message: 'Please save your API key first, then verify' });
        setVerifying(false);
        return;
      }

      // Send the new key if provided, otherwise backend will use the stored key
      const result = await verifyAiProviderConnection({
        api_url: formData.api_url,
        api_key: formData.api_key || undefined,
        agent_id: formData.agent_id,
      });

      if (result.success) {
        setAlert({ type: 'success', message: result.message || 'Connection verified successfully!' });
        // Refresh config to get updated verified_at
        loadConfig();
      } else {
        setAlert({ type: 'error', message: `Connection failed: ${result.message || 'Unknown error'}` });
      }
    } catch (error: any) {
      setAlert({ type: 'error', message: `Verification error: ${error.message}` });
    } finally {
      setVerifying(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setAlert(null);

    try {
      const payload: any = {
        api_url: formData.api_url,
        agent_id: formData.agent_id,
      };

      // Only include fields if user entered a new value
      if (formData.api_key) payload.api_key = formData.api_key;
      if (formData.openrouter_api_key) payload.openrouter_api_key = formData.openrouter_api_key;
      if (formData.telegram_bot_token) payload.telegram_bot_token = formData.telegram_bot_token;
      if (formData.brave_search_api_key) payload.brave_search_api_key = formData.brave_search_api_key;

      const result = await saveAiProviderConfig(payload);

      if (result.error) {
        setAlert({ type: 'error', message: `Failed to save: ${result.error}` });
      } else {
        setConfig(result);
        setFormData({
          api_url: result.api_url,
          api_key: '',
          agent_id: result.agent_id || '',
          openrouter_api_key: '',
          telegram_bot_token: '',
          brave_search_api_key: '',
        });
        setAlert({ type: 'success', message: 'All OpenClaw credentials saved successfully!' });
      }
    } catch (error: any) {
      setAlert({ type: 'error', message: `Save error: ${error.message}` });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2">OpenClaw Settings</h1>
      <p className="text-muted-foreground mb-6">
        Configure your OpenClaw AI instance and service credentials. All keys are encrypted at rest.
      </p>

      {alert && (
        <Alert
          className={`mb-6 ${
            alert.type === 'success'
              ? 'bg-green-50 text-green-900 border-green-200 dark:bg-green-950 dark:text-green-100 dark:border-green-800'
              : alert.type === 'error'
              ? 'bg-red-50 text-red-900 border-red-200 dark:bg-red-950 dark:text-red-100 dark:border-red-800'
              : 'bg-blue-50 text-blue-900 border-blue-200 dark:bg-blue-950 dark:text-blue-100 dark:border-blue-800'
          }`}
        >
          {alert.type === 'success' ? (
            <CheckCircle className="h-4 w-4" />
          ) : alert.type === 'error' ? (
            <XCircle className="h-4 w-4" />
          ) : null}
          <AlertDescription>{alert.message}</AlertDescription>
        </Alert>
      )}

      {/* Section 1: Connection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            OpenClaw Connection
          </CardTitle>
          <CardDescription>
            Connect to your self-hosted OpenClaw AI instance
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="api_url">Server URL *</Label>
            <Input
              id="api_url"
              type="url"
              placeholder="http://your-ip:18789 or https://your-openclaw.com"
              value={formData.api_url}
              onChange={(e) => setFormData({ ...formData, api_url: e.target.value })}
            />
            <p className="text-sm text-muted-foreground">
              The base URL of your OpenClaw instance (include port, e.g. http://your-server:18789)
            </p>
          </div>

          <MaskedInput
            id="api_key"
            label="API Key *"
            placeholder={config ? 'Enter new key to update (leave blank to keep current)' : 'Your OpenClaw API key'}
            value={formData.api_key}
            onChange={(v) => setFormData({ ...formData, api_key: v })}
            description="Your OpenClaw authentication key (stored encrypted)"
          />

          <div className="space-y-2">
            <Label htmlFor="agent_id">Agent ID (Optional)</Label>
            <Input
              id="agent_id"
              type="text"
              placeholder="default-agent"
              value={formData.agent_id}
              onChange={(e) => setFormData({ ...formData, agent_id: e.target.value })}
            />
            <p className="text-sm text-muted-foreground">
              Specific agent identifier if using multiple agents
            </p>
          </div>

          {config?.verified_at && (
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
              <CheckCircle className="h-4 w-4" />
              Last verified: {new Date(config.verified_at).toLocaleString()}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button onClick={handleVerifyConnection} variant="outline" disabled={!formData.api_url || verifying}>
              {verifying ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verifying...</>
              ) : (
                'Verify Connection'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Section 2: AI Model Service */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            AI Model (OpenRouter)
          </CardTitle>
          <CardDescription>
            OpenRouter routes requests to the best AI model. Provide your key for OpenClaw to use.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MaskedInput
            id="openrouter_api_key"
            label="OpenRouter API Key"
            placeholder={config?.openrouter_api_key ? 'Enter new key to update' : 'sk-or-v1-...'}
            value={formData.openrouter_api_key}
            onChange={(v) => setFormData({ ...formData, openrouter_api_key: v })}
            description="OpenRouter API key for AI model access"
            icon={Zap}
          />
          {config?.openrouter_api_key && (
            <p className="text-xs text-muted-foreground mt-2">
              Current: {config.openrouter_api_key}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Section 3: Services */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Additional Services
          </CardTitle>
          <CardDescription>
            Optional service credentials for enhanced OpenClaw capabilities
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <MaskedInput
            id="brave_search_api_key"
            label="Brave Search API Key"
            placeholder={config?.brave_search_api_key ? 'Enter new key to update' : 'BSA...'}
            value={formData.brave_search_api_key}
            onChange={(v) => setFormData({ ...formData, brave_search_api_key: v })}
            description="Enables web search capabilities for OpenClaw"
            icon={Search}
          />
          {config?.brave_search_api_key && (
            <p className="text-xs text-muted-foreground -mt-4">
              Current: {config.brave_search_api_key}
            </p>
          )}

          <MaskedInput
            id="telegram_bot_token"
            label="Telegram Bot Token"
            placeholder={config?.telegram_bot_token ? 'Enter new token to update' : '1234567890:ABC...'}
            value={formData.telegram_bot_token}
            onChange={(v) => setFormData({ ...formData, telegram_bot_token: v })}
            description="Telegram bot token for notifications and alerts"
            icon={Send}
          />
          {config?.telegram_bot_token && (
            <p className="text-xs text-muted-foreground -mt-4">
              Current: {config.telegram_bot_token}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Save button */}
      <div className="mt-6 flex justify-end">
        <Button onClick={handleSave} disabled={!formData.api_url || saving} size="lg">
          {saving ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
          ) : (
            'Save All Settings'
          )}
        </Button>
      </div>

      {/* Section 4: Agent Sync Status */}
      {config && <AgentSyncPanel />}
    </div>
  );
}
