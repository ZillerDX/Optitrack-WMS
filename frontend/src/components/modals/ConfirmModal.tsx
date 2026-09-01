/**
 * Modern Confirm Modal Component
 * Dark glassmorphism confirmation dialog for OptiTrack WMS
 */

import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  type?: 'danger' | 'warning' | 'info';
  confirmText?: string;
  cancelText?: string;
  isLoading?: boolean;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  type = 'warning',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isLoading = false,
}: ConfirmModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted) return null;

  const typeConfig = {
    danger: {
      icon: XCircle,
      iconColor: 'text-rose-400',
      iconBg: 'bg-rose-500/10 border border-rose-500/20',
      buttonClass: 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30',
    },
    warning: {
      icon: AlertTriangle,
      iconColor: 'text-amber-400',
      iconBg: 'bg-amber-500/10 border border-amber-500/20',
      buttonClass: 'bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-600/30',
    },
    info: {
      icon: CheckCircle,
      iconColor: 'text-blue-400',
      iconBg: 'bg-blue-500/10 border border-blue-500/20',
      buttonClass: 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30',
    },
  };

  const config = typeConfig[type];
  const Icon = config.icon;

  return createPortal(
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div className="relative bg-slate-900/95 border border-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-6 transform transition-all backdrop-blur-xl text-slate-100 ring-1 ring-white/5 animate-in zoom-in-95 duration-150">
        <div className="flex flex-col items-center text-center">
          {/* Icon Badge */}
          <div className={`${config.iconBg} p-3.5 rounded-2xl mb-4 shadow-sm`}>
            <Icon className={`h-8 w-8 ${config.iconColor}`} />
          </div>

          {/* Title & Message */}
          <h3 className="text-xl font-bold text-white tracking-tight mb-2">{title}</h3>
          <p className="text-sm text-slate-400 mb-6 leading-relaxed">{message}</p>

          {/* Action Buttons */}
          <div className="flex gap-3 w-full">
            <button
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 px-4 py-2.5 border border-slate-800 bg-slate-950/60 text-slate-300 hover:text-white hover:bg-slate-800/80 rounded-xl text-xs font-semibold transition-all disabled:opacity-50"
            >
              {cancelText}
            </button>
            <button
              onClick={() => {
                onConfirm();
                onClose();
              }}
              disabled={isLoading}
              className={`flex-1 px-4 py-2.5 ${config.buttonClass} rounded-xl text-xs font-semibold transition-all disabled:opacity-50`}
            >
              {isLoading ? 'Processing...' : confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
