"use client";

import { useEffect, useState } from 'react';
import { Minus, Square, Copy, X, Wifi, Box, Search, ShieldCheck, Server, Download } from 'lucide-react';
import { api } from '@/lib/api';
import { ApiSettingsModal } from '@/components/modals';

interface WindowControlsProps {
  onOpenCommandMenu?: () => void;
}

export function DesktopTitleBar({ onOpenCommandMenu }: WindowControlsProps) {
  const [isElectron, setIsElectron] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isApiOnline, setIsApiOnline] = useState(true);
  const [latency, setLatency] = useState<number | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const checkHealth = async () => {
    try {
      const res = await api.checkHealth();
      setIsApiOnline(res.status === 'alive');
      setLatency(res.latency);
    } catch {
      setIsApiOnline(false);
      setLatency(null);
    }
  };

  useEffect(() => {
    // Check if running in Electron environment
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      setIsElectron(true);
      (window as any).electronAPI.onMaximizeChange?.((max: boolean) => {
        setIsMaximized(max);
      });
    }

    checkHealth();
    const interval = setInterval(checkHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleMinimize = () => {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.minimize) {
      (window as any).electronAPI.minimize();
    }
  };

  const handleMaximize = () => {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.maximize) {
      (window as any).electronAPI.maximize();
      setIsMaximized(!isMaximized);
    }
  };

  const handleClose = () => {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.close) {
      (window as any).electronAPI.close();
    }
  };

  return (
    <div className="h-9 w-full bg-slate-950/90 backdrop-blur border-b border-slate-800/80 flex items-center justify-between px-3 text-xs text-slate-400 select-none z-50 flex-shrink-0" style={{ WebkitAppRegion: 'drag' } as any}>
      {/* Left: App Brand & Version */}
      <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as any}>
        <div className="flex items-center gap-1.5 font-semibold text-slate-200">
          <div className="w-4 h-4 rounded bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-sm">
            <Box className="w-2.5 h-2.5" />
          </div>
          <span className="tracking-wide">OptiTrack WMS</span>
        </div>
        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">
          v1.0.0 Desktop
        </span>
      </div>

      {/* Middle: Command Search Trigger & Status */}
      <div className="flex items-center gap-3" style={{ WebkitAppRegion: 'no-drag' } as any}>
        <button
          onClick={onOpenCommandMenu}
          className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 transition-all cursor-pointer shadow-sm group"
        >
          <Search className="w-3 h-3 text-slate-500 group-hover:text-blue-400" />
          <span className="text-[11px]">Quick Search / Actions</span>
          <kbd className="text-[9px] px-1 py-0.2 bg-slate-800 text-slate-400 rounded border border-slate-700 font-mono">
            Ctrl + K
          </kbd>
        </button>

        {/* Live System Indicator */}
        <button
          type="button"
          onClick={() => setIsSettingsOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-[10px] transition-all cursor-pointer shadow-sm group"
          title="Click to configure backend API endpoint"
        >
          <span className={`w-1.5 h-1.5 rounded-full ${isApiOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
          <span className={isApiOnline ? 'text-emerald-400 font-medium' : 'text-rose-400 font-medium'}>
            {isApiOnline ? `API ${latency ? `(${latency}ms)` : 'Connected'}` : 'Offline Mode'}
          </span>
          <Server className="w-2.5 h-2.5 text-slate-500 group-hover:text-blue-400 transition-colors ml-0.5" />
        </button>
      </div>

      {/* Right: Window Controls */}
      <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as any}>
        {isElectron ? (
          <>
            <button
              onClick={handleMinimize}
              className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
              title="Minimize"
            >
              <Minus className="w-3 h-3" />
            </button>
            <button
              onClick={handleMaximize}
              className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
              title={isMaximized ? "Restore" : "Maximize"}
            >
              {isMaximized ? <Copy className="w-3 h-3" /> : <Square className="w-3 h-3" />}
            </button>
            <button
              onClick={handleClose}
              className="p-1.5 hover:bg-rose-600/80 rounded text-slate-400 hover:text-white transition-colors"
              title="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined' && (window as any).triggerPWAInstall) {
                  (window as any).triggerPWAInstall();
                }
              }}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 text-[10px] font-medium transition-colors"
              title="Install OptiTrack WMS as Progressive Web App"
            >
              <Download className="w-2.5 h-2.5" />
              <span>Install PWA</span>
            </button>
            <div className="flex items-center gap-1 text-[11px] text-slate-400">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              <span className="font-mono text-[10px]">Enterprise Web</span>
            </div>
          </div>
        )}
      </div>

      {/* API Endpoint Config Modal */}
      <ApiSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSaved={() => checkHealth()}
      />
    </div>
  );
}
