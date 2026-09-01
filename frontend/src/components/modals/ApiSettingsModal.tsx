"use client";

import React, { useState, useEffect } from 'react';
import { Server, CheckCircle2, AlertCircle, RefreshCw, X, Globe, Save } from 'lucide-react';
import { getStoredApiUrl, setStoredApiUrl, api } from '@/lib/api';

interface ApiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (newUrl: string) => void;
}

export const ApiSettingsModal: React.FC<ApiSettingsModalProps> = ({
  isOpen,
  onClose,
  onSaved,
}) => {
  const [url, setUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    latency?: number;
    message?: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setUrl(getStoredApiUrl());
      setTestResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.checkHealth(url);
      setTestResult({
        success: true,
        latency: res.latency,
        message: `Connected successfully (${res.latency}ms)`,
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Unable to connect to server endpoint',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    if (!url.trim()) return;
    setStoredApiUrl(url.trim());
    if (onSaved) onSaved(url.trim());
    onClose();
  };

  const setPreset = (presetUrl: string) => {
    setUrl(presetUrl);
    setTestResult(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Backend Server Settings</h3>
              <p className="text-xs text-slate-400">Configure API Endpoint for Desktop WMS</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              API Base URL
            </label>
            <div className="relative">
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="http://localhost:8000"
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono"
              />
              <Globe className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          {/* Quick Presets */}
          <div>
            <span className="text-[11px] font-medium text-slate-400 block mb-1.5">
              Quick Environments
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPreset('http://localhost:8000')}
                className="px-2.5 py-1 text-xs bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700/60 transition-colors"
              >
                Localhost:8000
              </button>
              <button
                type="button"
                onClick={() => setPreset('http://127.0.0.1:8000')}
                className="px-2.5 py-1 text-xs bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700/60 transition-colors"
              >
                127.0.0.1:8000
              </button>
            </div>
          </div>

          {/* Connection Test Status */}
          {testResult && (
            <div
              className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs ${
                testResult.success
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              )}
              <span>{testResult.message}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-950/60">
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || !url.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
            <span>{testing ? 'Testing...' : 'Test Connection'}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-medium text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!url.trim()}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-xl shadow-lg shadow-blue-600/30 transition-all disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save &amp; Apply</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
