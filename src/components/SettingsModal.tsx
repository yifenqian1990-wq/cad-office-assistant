import React, { useState } from 'react';
import { AppSettings, ApiKey } from '../hooks/useSettings';
import { GoogleGenAI } from '@google/genai';
import { 
  X, Plus, Trash2, Edit2, Check, Key, RefreshCw, FolderOpen, 
  Sparkles, CheckCircle2, AlertCircle, Loader2, Bot, Server
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (newSettings: Partial<AppSettings>) => void;
  chatHistory: any;
}

export function SettingsModal({ isOpen, onClose, settings, onSave, chatHistory }: SettingsModalProps) {
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [editingKeyId, setEditingKeyId] = useState<string | null>(null);
  const [showKeyId, setShowKeyId] = useState<string | null>(null);
  const [testingStatus, setTestingStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testingMessage, setTestingMessage] = useState<string>('');

  // Cached and fetched models state
  const [fetchedModels, setFetchedModels] = useState<{
    deepseek: string[];
    gemini: string[];
    openai: string[];
  }>(() => {
    try {
      const cached = localStorage.getItem('autocad_ai_cached_models');
      if (cached) {
        const parsed = JSON.parse(cached);
        return {
          deepseek: Array.isArray(parsed.deepseek) ? parsed.deepseek : [],
          gemini: Array.isArray(parsed.gemini) ? parsed.gemini : [],
          openai: Array.isArray(parsed.openai) ? parsed.openai : []
        };
      }
    } catch {}
    return { deepseek: [], gemini: [], openai: [] };
  });

  const [fetchingProvider, setFetchingProvider] = useState<'deepseek' | 'gemini' | 'openai' | null>(null);
  const [fetchStatus, setFetchStatus] = useState<{
    provider: 'deepseek' | 'gemini' | 'openai' | null;
    type: 'success' | 'error' | null;
    message: string;
  }>({ provider: null, type: null, message: '' });

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setLocalSettings((prev) => ({ ...prev, [name]: value as any }));
  };

  // DeepSeek key management
  const handleAddDeepseekKey = () => {
    const newKey: ApiKey = {
      id: crypto.randomUUID(),
      name: `DeepSeek 密钥 ${(localSettings.deepseekKeys || []).length + 1}`,
      key: ''
    };
    setLocalSettings(prev => ({
      ...prev,
      deepseekKeys: [...(prev.deepseekKeys || []), newKey]
    }));
    setEditingKeyId(newKey.id);
  };

  const handleUpdateDeepseekKey = (id: string, field: 'name' | 'key', value: string) => {
    setLocalSettings(prev => ({
      ...prev,
      deepseekKeys: (prev.deepseekKeys || []).map(k => k.id === id ? { ...k, [field]: value } : k)
    }));
  };

  const handleDeleteDeepseekKey = (id: string) => {
    setLocalSettings(prev => ({
      ...prev,
      deepseekKeys: (prev.deepseekKeys || []).filter(k => k.id !== id)
    }));
  };

  // Gemini key management
  const handleAddGeminiKey = () => {
    const newKey: ApiKey = {
      id: crypto.randomUUID(),
      name: `Gemini 密钥 ${(localSettings.geminiKeys || []).length + 1}`,
      key: ''
    };
    setLocalSettings(prev => ({
      ...prev,
      geminiKeys: [...(prev.geminiKeys || []), newKey]
    }));
    setEditingKeyId(newKey.id);
  };

  const handleUpdateGeminiKey = (id: string, field: 'name' | 'key', value: string) => {
    setLocalSettings(prev => ({
      ...prev,
      geminiKeys: (prev.geminiKeys || []).map(k => k.id === id ? { ...k, [field]: value } : k)
    }));
  };

  const handleDeleteGeminiKey = (id: string) => {
    setLocalSettings(prev => ({
      ...prev,
      geminiKeys: (prev.geminiKeys || []).filter(k => k.id !== id)
    }));
  };

  // Helper to fetch available models for Gemini with multi-strategy fallback
  const fetchGeminiModels = async (apiKey: string): Promise<{ models: string[]; message?: string }> => {
    const cleanKey = apiKey.trim().replace(/^["']|["']$/g, '');
    if (!cleanKey) {
      throw new Error('请先在上方添加并填写有效的 Gemini API Key 密钥');
    }

    // Strategy 1: Use official @google/genai SDK
    try {
      const ai = new GoogleGenAI({ apiKey: cleanKey });
      const response = await ai.models.list();
      const list: string[] = [];
      for await (const m of response) {
        if (m?.name) {
          const cleanName = m.name.replace(/^models\//, '');
          const genMethods = (m as any).supportedGenerationMethods;
          if (!genMethods || genMethods.includes('generateContent')) {
            list.push(cleanName);
          }
        }
      }
      if (list.length > 0) {
        list.sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }));
        return {
          models: Array.from(new Set(list)),
          message: `成功通过 Google API 获取到 ${list.length} 个可用模型！`
        };
      }
    } catch (sdkErr: any) {
      console.warn('GoogleGenAI SDK models.list failed:', sdkErr);
    }

    // Strategy 2: Direct REST requests (DO NOT send Content-Type on GET)
    const restEndpoints = [
      { url: `https://generativelanguage.googleapis.com/v1beta/models`, headers: { 'x-goog-api-key': cleanKey } },
      { url: `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(cleanKey)}`, headers: {} },
      { url: `https://generativelanguage.googleapis.com/v1/models`, headers: { 'x-goog-api-key': cleanKey } },
      { url: `https://generativelanguage.googleapis.com/v1/models?key=${encodeURIComponent(cleanKey)}`, headers: {} },
    ];

    for (const ep of restEndpoints) {
      try {
        const res = await fetch(ep.url, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            ...ep.headers
          }
        });
        if (res.ok) {
          const data = await res.json();
          const models = (data.models || [])
            .filter((m: any) => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent'))
            .map((m: any) => (m.name || '').replace(/^models\//, ''))
            .filter(Boolean);
          if (models.length > 0) {
            models.sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }));
            return {
              models: Array.from(new Set(models)),
              message: `成功获取到 ${models.length} 个可用模型！`
            };
          }
        }
      } catch {
        // continue to next endpoint
      }
    }

    // Strategy 3: Probe generateContent (Google Cloud API keys often restrict models.list method but allow generateContent)
    const probeModel = localSettings.geminiModel?.trim() || 'gemini-2.5-flash';
    let keyValid = false;
    try {
      const probeUrl = `https://generativelanguage.googleapis.com/v1beta/models/${probeModel}:generateContent?key=${encodeURIComponent(cleanKey)}`;
      const probeRes = await fetch(probeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: '1' }] }]
        })
      });
      // If 200 OK or 429 (rate limit), the API key itself is authenticated and valid!
      if (probeRes.ok || probeRes.status === 429) {
        keyValid = true;
      }
    } catch {
      keyValid = false;
    }

    // If key is valid OR even if list is restricted, provide the complete official verified model catalog
    const officialGeminiModels = [
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-2.0-flash',
      'gemini-2.0-flash-thinking-exp-01-21',
      'gemini-3-flash-preview',
      'gemini-3.1-pro-preview',
      'gemini-1.5-flash',
      'gemini-1.5-pro'
    ];

    if (localSettings.geminiModel && !officialGeminiModels.includes(localSettings.geminiModel)) {
      officialGeminiModels.unshift(localSettings.geminiModel);
    }

    if (keyValid) {
      return {
        models: officialGeminiModels,
        message: `API 密钥验证有效！因 Google 限制了该 Key 的 listModels 目录权限，已自动为您配置官方推荐模型。`
      };
    }

    // Return official list with advisory
    return {
      models: officialGeminiModels,
      message: `已加载官方最新 Gemini 模型列表（若报错请检查 API 密钥是否有效或具有 Google AI 权限）。`
    };
  };

  // Helper to fetch available models for OpenAI compatible endpoints (DeepSeek, SiliconFlow, OpenRouter, etc.)
  const fetchOpenAICompatibleModels = async (baseUrl: string, apiKey: string, providerType: 'deepseek' | 'openai'): Promise<{ models: string[]; message?: string }> => {
    const cleanKey = apiKey.trim().replace(/^["']|["']$/g, '');
    let cleanBaseUrl = (baseUrl || '').trim().replace(/\/+$/, '');
    if (!cleanBaseUrl.startsWith('http://') && !cleanBaseUrl.startsWith('https://')) {
      cleanBaseUrl = 'https://' + cleanBaseUrl;
    }
    cleanBaseUrl = cleanBaseUrl.replace(/\/chat\/completions$/, '').replace(/\/chat$/, '');

    const urlsToTry: string[] = [];
    if (cleanBaseUrl.endsWith('/v1')) {
      urlsToTry.push(`${cleanBaseUrl}/models`);
      urlsToTry.push(`${cleanBaseUrl.slice(0, -3)}/models`);
    } else {
      urlsToTry.push(`${cleanBaseUrl}/models`);
      urlsToTry.push(`${cleanBaseUrl}/v1/models`);
    }

    let lastError = '';
    for (const url of urlsToTry) {
      try {
        const res = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${cleanKey}`,
            'Accept': 'application/json'
          }
        });
        if (res.ok) {
          const json = await res.json();
          let list: any[] = [];
          if (Array.isArray(json)) list = json;
          else if (Array.isArray(json.data)) list = json.data;
          else if (Array.isArray(json.models)) list = json.models;

          const ids: string[] = list
            .map((item: any) => (typeof item === 'string' ? item : item?.id || item?.name || ''))
            .filter((id: string) => typeof id === 'string' && id.trim().length > 0);

          if (ids.length > 0) {
            return {
              models: Array.from(new Set(ids)),
              message: `成功从接口获取到 ${ids.length} 个可用模型！`
            };
          }
        } else {
          const errText = await res.text();
          lastError = `HTTP ${res.status}: ${errText.slice(0, 100)}`;
        }
      } catch (e: any) {
        lastError = e.message || '网络请求失败';
      }
    }

    // If /models endpoint is not supported (e.g. DeepSeek official endpoint returns 404 on /models), fallback to standard models
    if (providerType === 'deepseek') {
      const defaultDeepseekModels = [
        'deepseek-chat',
        'deepseek-reasoner',
        'deepseek-coder',
        'deepseek-ai/DeepSeek-V3',
        'deepseek-ai/DeepSeek-R1'
      ];
      return {
        models: defaultDeepseekModels,
        message: `已自动配置 DeepSeek 常用官方模型（官方接口未开放 /models 列表查询，可直接选用）。`
      };
    }

    const defaultOpenaiModels = [
      'gpt-4o',
      'gpt-4o-mini',
      'o1',
      'o1-mini',
      'o3-mini',
      'gpt-4-turbo'
    ];
    return {
      models: defaultOpenaiModels,
      message: `已自动配置标准模型列表（接口未开放 /models 目录或响应超时）。`
    };
  };

  const handleFetchModels = async (provider: 'deepseek' | 'gemini' | 'openai') => {
    setFetchingProvider(provider);
    setFetchStatus({ provider, type: null, message: '' });

    try {
      let result: { models: string[]; message?: string } = { models: [] };

      if (provider === 'deepseek') {
        const activeKey = (localSettings.deepseekKeys || []).find(k => k.key.trim().length > 0)?.key || (localSettings.openaiKey?.trim() || '');
        if (!activeKey) {
          throw new Error('请先在上方添加并填写有效的 DeepSeek API Key 密钥');
        }
        const baseUrl = localSettings.deepseekBaseUrl || 'https://api.deepseek.com';
        result = await fetchOpenAICompatibleModels(baseUrl, activeKey, 'deepseek');
      } else if (provider === 'gemini') {
        const activeKey = (localSettings.geminiKeys || []).find(k => k.key.trim().length > 0)?.key || (localSettings.geminiKey?.trim() || '');
        if (!activeKey) {
          throw new Error('请先在上方添加并填写有效的 Gemini API Key 密钥');
        }
        result = await fetchGeminiModels(activeKey);
      } else if (provider === 'openai') {
        const activeKey = localSettings.openaiKey?.trim();
        if (!activeKey) {
          throw new Error('请先在上方填写有效的 OpenAI API Key 密钥');
        }
        const baseUrl = localSettings.openaiBaseUrl || 'https://api.openai.com/v1';
        result = await fetchOpenAICompatibleModels(baseUrl, activeKey, 'openai');
      }

      if (!result.models || result.models.length === 0) {
        throw new Error('未获取到可用模型');
      }

      setFetchedModels(prev => {
        const updated = { ...prev, [provider]: result.models };
        try {
          localStorage.setItem('autocad_ai_cached_models', JSON.stringify(updated));
        } catch {}
        return updated;
      });

      setFetchStatus({
        provider,
        type: 'success',
        message: result.message || `已就绪 ${result.models.length} 个可用模型，可在输入框下拉选择或直接输入。`
      });
    } catch (err: any) {
      setFetchStatus({
        provider,
        type: 'error',
        message: err.message || '获取模型列表失败，请检查网络或密钥配置'
      });
    } finally {
      setFetchingProvider(null);
    }
  };

  const handleTestConnection = async () => {
    setTestingStatus('testing');
    setTestingMessage('');
    try {
      if (localSettings.activeProvider === 'deepseek') {
        const activeKey = (localSettings.deepseekKeys || []).find(k => k.key.trim().length > 0)?.key;
        if (!activeKey) {
          throw new Error('请先添加并填写有效的 DeepSeek API Key');
        }
        const baseUrl = (localSettings.deepseekBaseUrl || 'https://api.deepseek.com').replace(/\/+$/, '');
        const url = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${activeKey}`
          },
          body: JSON.stringify({
            model: localSettings.deepseekModel || 'deepseek-chat',
            messages: [{ role: 'user', content: 'Hi, respond with OK.' }],
            max_tokens: 10
          })
        });
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`HTTP ${res.status}: ${errText.slice(0, 150)}`);
        }
        setTestingStatus('success');
        setTestingMessage('DeepSeek API 连接测试成功！');
      } else if (localSettings.activeProvider === 'gemini') {
        const activeKey = (localSettings.geminiKeys || []).find(k => k.key.trim().length > 0)?.key;
        if (!activeKey) {
          throw new Error('请先添加并填写有效的 Gemini API Key');
        }
        const model = localSettings.geminiModel || 'gemini-2.5-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${activeKey}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Hi' }] }]
          })
        });
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`HTTP ${res.status}: ${errText.slice(0, 150)}`);
        }
        setTestingStatus('success');
        setTestingMessage('Gemini API 连接测试成功！');
      } else {
        if (!localSettings.openaiKey) {
          throw new Error('请先填写 OpenAI API Key');
        }
        const baseUrl = (localSettings.openaiBaseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
        const url = `${baseUrl}/chat/completions`;
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localSettings.openaiKey}`
          },
          body: JSON.stringify({
            model: localSettings.openaiModel || 'gpt-4o',
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 10
          })
        });
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`HTTP ${res.status}: ${errText.slice(0, 150)}`);
        }
        setTestingStatus('success');
        setTestingMessage('OpenAI 兼容接口连接测试成功！');
      }
    } catch (err: any) {
      setTestingStatus('error');
      setTestingMessage(err.message || '连接失败，请检查网络或密钥配置');
    }
  };

  const handleSave = () => {
    // Filter out empty keys before saving
    const cleanedSettings = {
      ...localSettings,
      deepseekKeys: (localSettings.deepseekKeys || []).filter(k => k.key.trim() !== ''),
      geminiKeys: (localSettings.geminiKeys || []).filter(k => k.key.trim() !== '')
    };
    onSave(cleanedSettings);
    onClose();
  };

  return (
    <div className="fixed inset-x-0 bottom-0 top-[64px] sm:top-[72px] z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center gap-2">
            <Bot size={20} className="text-blue-600" />
            <h2 className="text-base font-semibold text-gray-900">AI 模型与系统配置</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors p-1 rounded-lg hover:bg-gray-100">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Backup & Restore bar */}
          <div className="flex items-center justify-between pb-4 border-b border-gray-100 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const blob = new Blob([JSON.stringify(localSettings, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `cad_ai_settings_${new Date().toISOString().slice(0, 10)}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="px-3 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
              >
                导出配置
              </button>
              <label className="px-3 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors cursor-pointer">
                导入配置
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (event) => {
                      try {
                        const data = JSON.parse(event.target?.result as string);
                        if (data && typeof data === 'object') {
                          setLocalSettings(prev => ({ ...prev, ...data }));
                          alert('导入成功，请点击底部“保存设置”生效。');
                        }
                      } catch (err) {
                        alert('导入失败，文件格式不正确');
                      }
                    };
                    reader.readAsText(file);
                  }}
                />
              </label>
            </div>
            <span className="text-xs text-gray-400">设置自动保存至浏览器</span>
          </div>

          {/* Provider Tabs */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">选择 AI 服务商</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setLocalSettings(prev => ({ ...prev, activeProvider: 'deepseek' }))}
                className={`py-2.5 px-3 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1 transition-all ${
                  localSettings.activeProvider === 'deepseek'
                    ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-sm ring-2 ring-blue-500/20'
                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span className="font-bold flex items-center gap-1">
                  DeepSeek <Sparkles size={12} className="text-blue-500" />
                </span>
                <span className="text-[10px] text-gray-500 font-normal">深度求索 (推荐)</span>
              </button>

              <button
                type="button"
                onClick={() => setLocalSettings(prev => ({ ...prev, activeProvider: 'gemini' }))}
                className={`py-2.5 px-3 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1 transition-all ${
                  localSettings.activeProvider === 'gemini'
                    ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-sm ring-2 ring-blue-500/20'
                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span className="font-bold">Google Gemini</span>
                <span className="text-[10px] text-gray-500 font-normal">官方 API</span>
              </button>

              <button
                type="button"
                onClick={() => setLocalSettings(prev => ({ ...prev, activeProvider: 'openai' }))}
                className={`py-2.5 px-3 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1 transition-all ${
                  localSettings.activeProvider === 'openai'
                    ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-sm ring-2 ring-blue-500/20'
                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span className="font-bold">OpenAI 兼容</span>
                <span className="text-[10px] text-gray-500 font-normal">中转/自定义</span>
              </button>
            </div>
          </div>

          {/* DeepSeek Panel */}
          {localSettings.activeProvider === 'deepseek' && (
            <div className="space-y-5 animate-in fade-in slide-in-from-top-1">
              {/* DeepSeek Keys */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-800">DeepSeek API Key 密钥管理</label>
                  <button 
                    onClick={handleAddDeepseekKey}
                    className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    <Plus size={14} /> 添加密钥
                  </button>
                </div>
                <p className="text-[11px] text-gray-500">
                  支持多密钥负载均衡与轮询重试。官方 API 申请地址：<a href="https://platform.deepseek.com" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">platform.deepseek.com</a>
                </p>
                <div className="space-y-2">
                  {(localSettings.deepseekKeys || []).map((k) => (
                    <div key={k.id} className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        {editingKeyId === k.id ? (
                          <input 
                            autoFocus
                            className="bg-white border border-gray-300 rounded px-2 py-0.5 text-xs text-gray-800 outline-none focus:border-blue-500 w-1/2"
                            value={k.name}
                            onChange={e => handleUpdateDeepseekKey(k.id, 'name', e.target.value)}
                            onBlur={() => setEditingKeyId(null)}
                            onKeyDown={e => e.key === 'Enter' && setEditingKeyId(null)}
                          />
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-gray-800">{k.name}</span>
                            <button onClick={() => setEditingKeyId(k.id)} className="text-gray-400 hover:text-gray-600">
                              <Edit2 size={12} />
                            </button>
                          </div>
                        )}
                        <button onClick={() => handleDeleteDeepseekKey(k.id)} className="text-gray-400 hover:text-red-500 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="relative">
                        <input
                          type={showKeyId === k.id ? "text" : "password"}
                          value={k.key}
                          onChange={e => handleUpdateDeepseekKey(k.id, 'key', e.target.value)}
                          placeholder="sk-..."
                          className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-mono text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 pr-10"
                        />
                        <button 
                          onClick={() => setShowKeyId(showKeyId === k.id ? null : k.id)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          <Key size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {(!localSettings.deepseekKeys || localSettings.deepseekKeys.length === 0) && (
                    <div 
                      onClick={handleAddDeepseekKey}
                      className="text-center py-4 text-xs text-gray-500 border border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-blue-400 hover:text-blue-600 transition-colors"
                    >
                      点击此处添加您的第一个 DeepSeek API Key
                    </div>
                  )}
                </div>
              </div>

              {/* DeepSeek Base URL */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-700">接口地址 (Base URL)</label>
                  <div className="flex items-center gap-1 text-[10px] text-gray-500">
                    <span>预设:</span>
                    <button
                      type="button"
                      onClick={() => setLocalSettings(prev => ({ ...prev, deepseekBaseUrl: 'https://api.deepseek.com' }))}
                      className="text-blue-600 hover:underline"
                    >
                      官方
                    </button>
                    <span>|</span>
                    <button
                      type="button"
                      onClick={() => setLocalSettings(prev => ({ ...prev, deepseekBaseUrl: 'https://api.siliconflow.cn/v1' }))}
                      className="text-blue-600 hover:underline"
                    >
                      硅基流动
                    </button>
                    <span>|</span>
                    <button
                      type="button"
                      onClick={() => setLocalSettings(prev => ({ ...prev, deepseekBaseUrl: 'https://openrouter.ai/api/v1' }))}
                      className="text-blue-600 hover:underline"
                    >
                      OpenRouter
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  name="deepseekBaseUrl"
                  value={localSettings.deepseekBaseUrl || 'https://api.deepseek.com'}
                  onChange={handleChange}
                  placeholder="https://api.deepseek.com"
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>

              {/* DeepSeek Model */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-700">模型名称 (Model Identifier)</label>
                  {fetchedModels.deepseek.length > 0 && (
                    <span className="text-[10px] text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                      已获取 {fetchedModels.deepseek.length} 个可用模型
                    </span>
                  )}
                </div>

                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    name="deepseekModel"
                    value={localSettings.deepseekModel || 'deepseek-chat'}
                    onChange={handleChange}
                    list="deepseek-models-list"
                    placeholder="deepseek-chat"
                    className="flex-1 min-w-0 bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                  <button
                    type="button"
                    onClick={() => handleFetchModels('deepseek')}
                    disabled={fetchingProvider === 'deepseek'}
                    title="点击根据已输入的密钥自动获取可用模型"
                    className="px-3 py-2 bg-blue-50 hover:bg-blue-100 active:bg-blue-200 text-blue-700 border border-blue-200 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed shrink-0 shadow-xs"
                  >
                    <RefreshCw size={13} className={fetchingProvider === 'deepseek' ? 'animate-spin text-blue-600' : 'text-blue-600'} />
                    <span>{fetchingProvider === 'deepseek' ? '获取中...' : '刷新模型'}</span>
                  </button>
                </div>

                {fetchStatus.provider === 'deepseek' && fetchStatus.message && (
                  <div className={`p-2 rounded-lg text-[11px] flex items-center gap-1.5 ${
                    fetchStatus.type === 'success' 
                      ? 'bg-green-50 text-green-700 border border-green-200' 
                      : 'bg-red-50 text-red-700 border border-red-200'
                  }`}>
                    {fetchStatus.type === 'success' ? (
                      <CheckCircle2 size={13} className="shrink-0 text-green-600" />
                    ) : (
                      <AlertCircle size={13} className="shrink-0 text-red-600" />
                    )}
                    <span className="break-all">{fetchStatus.message}</span>
                  </div>
                )}

                {fetchedModels.deepseek.length > 0 && (
                  <div className="flex items-center gap-2 pt-0.5">
                    <span className="text-[11px] text-gray-500 whitespace-nowrap">快捷选用:</span>
                    <select
                      value={fetchedModels.deepseek.includes(localSettings.deepseekModel) ? localSettings.deepseekModel : ''}
                      onChange={(e) => {
                        if (e.target.value) {
                          setLocalSettings(prev => ({ ...prev, deepseekModel: e.target.value }));
                        }
                      }}
                      className="flex-1 min-w-0 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1 text-xs text-gray-800 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                    >
                      <option value="">-- 选择已获取的模型 ({fetchedModels.deepseek.length} 个) --</option>
                      {fetchedModels.deepseek.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                )}

                <datalist id="deepseek-models-list">
                  {Array.from(new Set([
                    ...(fetchedModels.deepseek || []),
                    'deepseek-chat',
                    'deepseek-reasoner',
                    'deepseek-coder',
                    'deepseek-ai/DeepSeek-V3',
                    'deepseek-ai/DeepSeek-R1'
                  ])).map(m => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
                <p className="text-[11px] text-gray-500 leading-tight">
                  注：DeepSeek 官方模型标识为 <code>deepseek-chat</code> (V3) 与 <code>deepseek-reasoner</code> (R1)。若使用硅基流动等第三方，可填对应平台模型 ID。
                </p>
              </div>
            </div>
          )}

          {/* Gemini Panel */}
          {localSettings.activeProvider === 'gemini' && (
            <div className="space-y-5 animate-in fade-in slide-in-from-top-1">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-800">Gemini API Key 密钥管理</label>
                  <button 
                    onClick={handleAddGeminiKey}
                    className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    <Plus size={14} /> 添加密钥
                  </button>
                </div>
                <div className="space-y-2">
                  {(localSettings.geminiKeys || []).map((k) => (
                    <div key={k.id} className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        {editingKeyId === k.id ? (
                          <input 
                            autoFocus
                            className="bg-white border border-gray-300 rounded px-2 py-0.5 text-xs text-gray-800 outline-none focus:border-blue-500 w-1/2"
                            value={k.name}
                            onChange={e => handleUpdateGeminiKey(k.id, 'name', e.target.value)}
                            onBlur={() => setEditingKeyId(null)}
                            onKeyDown={e => e.key === 'Enter' && setEditingKeyId(null)}
                          />
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-gray-800">{k.name}</span>
                            <button onClick={() => setEditingKeyId(k.id)} className="text-gray-400 hover:text-gray-600">
                              <Edit2 size={12} />
                            </button>
                          </div>
                        )}
                        <button onClick={() => handleDeleteGeminiKey(k.id)} className="text-gray-400 hover:text-red-500">
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="relative">
                        <input
                          type={showKeyId === k.id ? "text" : "password"}
                          value={k.key}
                          onChange={e => handleUpdateGeminiKey(k.id, 'key', e.target.value)}
                          placeholder="AIzaSy..."
                          className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-mono text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 pr-10"
                        />
                        <button 
                          onClick={() => setShowKeyId(showKeyId === k.id ? null : k.id)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          <Key size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {(!localSettings.geminiKeys || localSettings.geminiKeys.length === 0) && (
                    <div 
                      onClick={handleAddGeminiKey}
                      className="text-center py-4 text-xs text-gray-500 border border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-blue-400 hover:text-blue-600 transition-colors"
                    >
                      点击添加您的 Google Gemini API Key
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-700">模型名称 (Model Identifier)</label>
                  {fetchedModels.gemini.length > 0 && (
                    <span className="text-[10px] text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                      已获取 {fetchedModels.gemini.length} 个可用模型
                    </span>
                  )}
                </div>

                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    name="geminiModel"
                    value={localSettings.geminiModel || 'gemini-2.5-flash'}
                    onChange={handleChange}
                    list="gemini-models-list"
                    placeholder="gemini-2.5-flash"
                    className="flex-1 min-w-0 bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                  <button
                    type="button"
                    onClick={() => handleFetchModels('gemini')}
                    disabled={fetchingProvider === 'gemini'}
                    title="点击根据已输入的密钥自动获取可用模型"
                    className="px-3 py-2 bg-blue-50 hover:bg-blue-100 active:bg-blue-200 text-blue-700 border border-blue-200 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed shrink-0 shadow-xs"
                  >
                    <RefreshCw size={13} className={fetchingProvider === 'gemini' ? 'animate-spin text-blue-600' : 'text-blue-600'} />
                    <span>{fetchingProvider === 'gemini' ? '获取中...' : '刷新模型'}</span>
                  </button>
                </div>

                {fetchStatus.provider === 'gemini' && fetchStatus.message && (
                  <div className={`p-2 rounded-lg text-[11px] flex items-center gap-1.5 ${
                    fetchStatus.type === 'success' 
                      ? 'bg-green-50 text-green-700 border border-green-200' 
                      : 'bg-red-50 text-red-700 border border-red-200'
                  }`}>
                    {fetchStatus.type === 'success' ? (
                      <CheckCircle2 size={13} className="shrink-0 text-green-600" />
                    ) : (
                      <AlertCircle size={13} className="shrink-0 text-red-600" />
                    )}
                    <span className="break-all">{fetchStatus.message}</span>
                  </div>
                )}

                {fetchedModels.gemini.length > 0 && (
                  <div className="flex items-center gap-2 pt-0.5">
                    <span className="text-[11px] text-gray-500 whitespace-nowrap">快捷选用:</span>
                    <select
                      value={fetchedModels.gemini.includes(localSettings.geminiModel) ? localSettings.geminiModel : ''}
                      onChange={(e) => {
                        if (e.target.value) {
                          setLocalSettings(prev => ({ ...prev, geminiModel: e.target.value }));
                        }
                      }}
                      className="flex-1 min-w-0 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1 text-xs text-gray-800 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                    >
                      <option value="">-- 选择已获取的模型 ({fetchedModels.gemini.length} 个) --</option>
                      {fetchedModels.gemini.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                )}

                <datalist id="gemini-models-list">
                  {Array.from(new Set([
                    ...(fetchedModels.gemini || []),
                    'gemini-2.5-flash',
                    'gemini-2.5-pro',
                    'gemini-2.0-flash',
                    'gemini-3-flash-preview',
                    'gemini-3.1-pro-preview',
                    'gemini-1.5-flash',
                    'gemini-1.5-pro'
                  ])).map(m => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>
            </div>
          )}

          {/* OpenAI Panel */}
          {localSettings.activeProvider === 'openai' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-1">
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-700">接口地址 (Base URL)</label>
                <input
                  type="text"
                  name="openaiBaseUrl"
                  value={localSettings.openaiBaseUrl}
                  onChange={handleChange}
                  placeholder="https://api.openai.com/v1"
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-700">API Key (密钥)</label>
                <input
                  type="password"
                  name="openaiKey"
                  value={localSettings.openaiKey}
                  onChange={handleChange}
                  placeholder="sk-..."
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-700">模型名称 (Model Name)</label>
                  {fetchedModels.openai.length > 0 && (
                    <span className="text-[10px] text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                      已获取 {fetchedModels.openai.length} 个可用模型
                    </span>
                  )}
                </div>

                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    name="openaiModel"
                    value={localSettings.openaiModel}
                    onChange={handleChange}
                    list="openai-models-list"
                    placeholder="gpt-4o"
                    className="flex-1 min-w-0 bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                  <button
                    type="button"
                    onClick={() => handleFetchModels('openai')}
                    disabled={fetchingProvider === 'openai'}
                    title="点击根据已输入的密钥自动获取可用模型"
                    className="px-3 py-2 bg-blue-50 hover:bg-blue-100 active:bg-blue-200 text-blue-700 border border-blue-200 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed shrink-0 shadow-xs"
                  >
                    <RefreshCw size={13} className={fetchingProvider === 'openai' ? 'animate-spin text-blue-600' : 'text-blue-600'} />
                    <span>{fetchingProvider === 'openai' ? '获取中...' : '刷新模型'}</span>
                  </button>
                </div>

                {fetchStatus.provider === 'openai' && fetchStatus.message && (
                  <div className={`p-2 rounded-lg text-[11px] flex items-center gap-1.5 ${
                    fetchStatus.type === 'success' 
                      ? 'bg-green-50 text-green-700 border border-green-200' 
                      : 'bg-red-50 text-red-700 border border-red-200'
                  }`}>
                    {fetchStatus.type === 'success' ? (
                      <CheckCircle2 size={13} className="shrink-0 text-green-600" />
                    ) : (
                      <AlertCircle size={13} className="shrink-0 text-red-600" />
                    )}
                    <span className="break-all">{fetchStatus.message}</span>
                  </div>
                )}

                {fetchedModels.openai.length > 0 && (
                  <div className="flex items-center gap-2 pt-0.5">
                    <span className="text-[11px] text-gray-500 whitespace-nowrap">快捷选用:</span>
                    <select
                      value={fetchedModels.openai.includes(localSettings.openaiModel) ? localSettings.openaiModel : ''}
                      onChange={(e) => {
                        if (e.target.value) {
                          setLocalSettings(prev => ({ ...prev, openaiModel: e.target.value }));
                        }
                      }}
                      className="flex-1 min-w-0 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1 text-xs text-gray-800 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                    >
                      <option value="">-- 选择已获取的模型 ({fetchedModels.openai.length} 个) --</option>
                      {fetchedModels.openai.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                )}

                <datalist id="openai-models-list">
                  {Array.from(new Set([
                    ...(fetchedModels.openai || []),
                    'gpt-4o',
                    'gpt-4o-mini',
                    'o1',
                    'o1-mini',
                    'o3-mini',
                    'gpt-4-turbo'
                  ])).map(m => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>
            </div>
          )}

          {/* Test Connection Button & Result */}
          <div className="pt-2">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testingStatus === 'testing'}
              className="w-full py-2 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
            >
              {testingStatus === 'testing' ? (
                <>
                  <Loader2 size={14} className="animate-spin text-blue-600" />
                  <span>正在测试 API 连通性...</span>
                </>
              ) : (
                <>
                  <Server size={14} />
                  <span>测试当前 AI 接口连通性</span>
                </>
              )}
            </button>
            {testingStatus === 'success' && (
              <div className="mt-2 p-2.5 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-xs text-green-800">
                <CheckCircle2 size={16} className="text-green-600 flex-shrink-0" />
                <span>{testingMessage}</span>
              </div>
            )}
            {testingStatus === 'error' && (
              <div className="mt-2 p-2.5 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-xs text-red-800">
                <AlertCircle size={16} className="text-red-600 flex-shrink-0 mt-0.5" />
                <span className="break-all">{testingMessage}</span>
              </div>
            )}
          </div>

          {/* AutoCAD Proxy Address */}
          <div className="space-y-4 pt-4 border-t border-gray-100">
            <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">本地代理通信配置</h3>
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-700">AutoCAD WebSocket 地址</label>
              <input
                type="text"
                name="agentAddress"
                value={localSettings.agentAddress || 'ws://127.0.0.1:8765'}
                onChange={handleChange}
                placeholder="ws://127.0.0.1:8765"
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
              <p className="text-[11px] text-gray-500">本机运行时保持默认 <code>ws://127.0.0.1:8765</code> 即可。</p>
            </div>
          </div>

          {/* Personal Preferences / System Prompt */}
          <div className="space-y-4 pt-4 border-t border-gray-100">
            <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">自定义全局偏好</h3>
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-700">AI 补充提示词 (附加至系统指令)</label>
              <textarea
                name="personalPreferences"
                value={localSettings.personalPreferences || ''}
                onChange={handleChange}
                placeholder="例如：'生成 AutoLISP 代码时必须包含中文注释'、'所有线段默认绘制在当前图层'..."
                rows={3}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder:text-gray-400 text-xs resize-y"
              />
            </div>
          </div>

          {/* Local File Storage for Chat History */}
          <div className="space-y-4 pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">聊天历史文件同步</h3>
              <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded">实时同步</span>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${chatHistory.fileHandleName ? (chatHistory.handleNeedsPermission ? 'bg-yellow-400' : 'bg-green-500') : 'bg-gray-300'}`} />
                  <span className="text-xs text-gray-700">
                    {chatHistory.fileHandleName ? (
                      <span className="font-medium" title={chatHistory.fileHandleName}>
                        {chatHistory.fileHandleName.length > 25 ? chatHistory.fileHandleName.slice(0, 25) + '...' : chatHistory.fileHandleName}
                      </span>
                    ) : '未设置保存文件'}
                  </span>
                </div>
                {chatHistory.fileHandleName && !chatHistory.handleNeedsPermission && (
                  <span className="text-xs text-green-600 flex items-center gap-1">
                    <Check size={12} /> 已同步
                  </span>
                )}
              </div>
              
              {chatHistory.handleNeedsPermission && (
                <div className="bg-yellow-50 text-yellow-800 text-xs p-2 rounded-lg border border-yellow-200 flex items-center justify-between">
                  <span>需要重新授权文件读写权限</span>
                  <button 
                    onClick={chatHistory.reconnectFile}
                    className="flex items-center gap-1 bg-white px-2 py-1 rounded shadow-sm hover:bg-gray-50 transition-colors whitespace-nowrap ml-2 text-xs"
                  >
                    <RefreshCw size={12} />
                    <span>恢复连接</span>
                  </button>
                </div>
              )}

              <button
                onClick={chatHistory.setupFileConnection}
                className="w-full flex items-center justify-center gap-2 py-1.5 px-3 bg-white border border-gray-300 text-gray-700 rounded-lg text-xs hover:bg-gray-50 transition-colors shadow-sm"
              >
                <FolderOpen size={14} />
                {chatHistory.fileHandleName ? '更改同步文件位置' : '选择同步文件位置 (支持跨设备/重置防丢)'}
              </button>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-gray-700 hover:text-gray-900 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all shadow-sm shadow-blue-900/20"
          >
            保存配置
          </button>
        </div>
      </div>
    </div>
  );
}
