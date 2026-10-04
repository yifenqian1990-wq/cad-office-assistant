import { useState, useEffect } from 'react';

export interface ApiKey {
  id: string;
  name: string;
  key: string;
}

export interface AppSettings {
  geminiKey?: string; // deprecated
  geminiKeys: ApiKey[];
  geminiModel: string;
  deepseekKeys: ApiKey[];
  deepseekBaseUrl: string;
  deepseekModel: string;
  openaiKey: string;
  openaiBaseUrl: string;
  openaiModel: string;
  activeProvider: 'deepseek' | 'gemini' | 'openai';
  agentAddress: string;
  interactionMode: 'CODE' | 'SKILL';
  hasSeenOnboarding: boolean;
  libraryPath: string;
  personalPreferences?: string;
}

const defaultSettings: AppSettings = {
  geminiKeys: [],
  geminiModel: 'gemini-3.1-pro-preview',
  deepseekKeys: [],
  deepseekBaseUrl: 'https://api.deepseek.com',
  deepseekModel: 'deepseek-chat',
  openaiKey: '',
  openaiBaseUrl: 'https://api.openai.com/v1',
  openaiModel: 'gpt-4o',
  activeProvider: 'deepseek',
  agentAddress: 'ws://127.0.0.1:8765',
  interactionMode: 'CODE',
  hasSeenOnboarding: false,
  libraryPath: 'D:\\CAD_Library',
  personalPreferences: ''
};

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('autocad_ai_settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Migration from geminiKey to geminiKeys
        if (parsed.geminiKey && (!parsed.geminiKeys || parsed.geminiKeys.length === 0)) {
          parsed.geminiKeys = [{ id: 'default', name: '默认密钥', key: parsed.geminiKey }];
          delete parsed.geminiKey;
        }
        // Migration from openai settings to deepseek if openai was pointing to deepseek
        if (parsed.openaiBaseUrl && parsed.openaiBaseUrl.includes('deepseek') && (!parsed.deepseekKeys || parsed.deepseekKeys.length === 0)) {
          if (parsed.openaiKey) {
            parsed.deepseekKeys = [{ id: 'default', name: '默认密钥', key: parsed.openaiKey }];
          }
          parsed.deepseekBaseUrl = parsed.openaiBaseUrl;
          if (parsed.openaiModel) parsed.deepseekModel = parsed.openaiModel;
        }
        return { ...defaultSettings, ...parsed };
      } catch (e) {
        console.error('Failed to parse settings', e);
      }
    }
    return defaultSettings;
  });

  useEffect(() => {
    localStorage.setItem('autocad_ai_settings', JSON.stringify(settings));
  }, [settings]);

  const updateSettings = (newSettings: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
  };

  return { settings, updateSettings };
}
