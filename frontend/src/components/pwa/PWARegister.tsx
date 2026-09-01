"use client";

import { useEffect, useState } from 'react';
import { Download, X, Sparkles } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
  interface Window {
    __pwaPrompt?: BeforeInstallPromptEvent | null;
    triggerPWAInstall?: () => Promise<boolean>;
  }
}

export function PWARegister() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // 1. Check if already running in standalone mode
    const isStandalone = 
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;

    if (isStandalone) {
      setIsInstalled(true);
      return;
    }

    // 2. Register Service Worker
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((reg) => {
            console.log('[PWA] Service Worker registered with scope:', reg.scope);
          })
          .catch((err) => {
            console.warn('[PWA] Service Worker registration failed:', err);
          });
      });
    }

    // 3. Capture beforeinstallprompt
    const handleBeforeInstallPrompt = (e: BeforeInstallPromptEvent) => {
      e.preventDefault();
      setDeferredPrompt(e);
      window.__pwaPrompt = e;
      
      const dismissed = sessionStorage.getItem('optitrack_pwa_dismissed');
      if (!dismissed) {
        setShowInstallBanner(true);
      }
    };

    const handleAppInstalled = () => {
      console.log('[PWA] OptiTrack WMS installed successfully');
      setDeferredPrompt(null);
      window.__pwaPrompt = null;
      setShowInstallBanner(false);
      setIsInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    window.triggerPWAInstall = async () => {
      const prompt = window.__pwaPrompt || deferredPrompt;
      if (!prompt) return false;
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === 'accepted') {
        setShowInstallBanner(false);
        return true;
      }
      return false;
    };

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [deferredPrompt]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowInstallBanner(false);
    }
  };

  const handleDismiss = () => {
    setShowInstallBanner(false);
    sessionStorage.setItem('optitrack_pwa_dismissed', 'true');
  };

  if (!showInstallBanner || isInstalled) return null;

  return (
    <div className="fixed top-5 right-5 z-50 max-w-sm animate-in slide-in-from-top-5 duration-300">
      <div className="bg-slate-900/95 border border-blue-500/30 rounded-2xl p-4 shadow-2xl backdrop-blur-md text-white flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20 shrink-0">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">Install OptiTrack App</h4>
              <p className="text-xs text-slate-400">Instant desktop/mobile access with offline capability</p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
            aria-label="Dismiss install banner"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={handleInstallClick}
            className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold py-2 px-3 rounded-xl flex items-center justify-center gap-2 shadow-md shadow-blue-600/20 transition-all active:scale-95"
          >
            <Download size={14} />
            <span>Install Web App</span>
          </button>
          <button
            onClick={handleDismiss}
            className="text-xs text-slate-400 hover:text-slate-300 py-2 px-3 rounded-xl hover:bg-slate-800/60 transition-colors"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}