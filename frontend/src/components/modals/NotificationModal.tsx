/**
 * Modern Notification Modal Component
 * Dark glassmorphism toast/alert for OptiTrack WMS
 */

import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface NotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  autoClose?: boolean;
  autoCloseDelay?: number;
}

export function NotificationModal({
  isOpen,
  onClose,
  type,
  title,
  message,
  autoClose = true,
  autoCloseDelay = 3000,
}: NotificationModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Auto-close after delay
  useEffect(() => {
    if (isOpen && autoClose) {
      const timer = setTimeout(() => {
        onClose();
      }, autoCloseDelay);

      return () => clearTimeout(timer);
    }
  }, [isOpen, autoClose, autoCloseDelay, onClose]);

  if (!isOpen || !mounted) return null;

  const typeConfig = {
    success: {
      icon: CheckCircle,
      iconColor: 'text-emerald-400',
      iconBg: 'bg-emerald-500/10 border border-emerald-500/20',
      borderColor: 'border-emerald-500/30',
      glowColor: 'shadow-emerald-500/10',
      barColor: 'bg-emerald-500',
    },
    error: {
      icon: XCircle,
      iconColor: 'text-rose-400',
      iconBg: 'bg-rose-500/10 border border-rose-500/20',
      borderColor: 'border-rose-500/30',
      glowColor: 'shadow-rose-500/10',
      barColor: 'bg-rose-500',
    },
    warning: {
      icon: AlertCircle,
      iconColor: 'text-amber-400',
      iconBg: 'bg-amber-500/10 border border-amber-500/20',
      borderColor: 'border-amber-500/30',
      glowColor: 'shadow-amber-500/10',
      barColor: 'bg-amber-500',
    },
    info: {
      icon: Info,
      iconColor: 'text-blue-400',
      iconBg: 'bg-blue-500/10 border border-blue-500/20',
      borderColor: 'border-blue-500/30',
      glowColor: 'shadow-blue-500/10',
      barColor: 'bg-blue-500',
    },
  };

  const config = typeConfig[type];
  const Icon = config.icon;

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      {/* Notification Card */}
      <div className={`relative my-auto bg-slate-900/95 border ${config.borderColor} rounded-2xl shadow-2xl ${config.glowColor} max-w-md w-full overflow-hidden transform transition-all animate-in zoom-in-95 duration-150 backdrop-blur-xl ring-1 ring-white/5`}>
        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-4">
            {/* Icon */}
            <div className={`${config.iconBg} p-2.5 rounded-xl flex-shrink-0`}>
              <Icon className={`h-6 w-6 ${config.iconColor}`} />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-white mb-1 tracking-tight">{title}</h3>
              <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">{message}</p>
            </div>

            {/* Close button */}
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors flex-shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Action button */}
          <div className="mt-5 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition-all border border-slate-700/60"
            >
              Dismiss
            </button>
          </div>
        </div>

        {/* Auto-close progress bar */}
        {autoClose && (
          <div className="h-1 bg-slate-800/80 w-full overflow-hidden">
            <div
              className={`h-full ${config.barColor} transition-all`}
              style={{
                animation: `shrink ${autoCloseDelay}ms linear`,
              }}
            />
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
