/**
 * Notification Modal Component
 * For success/error messages after CRUD operations
 */

import { CheckCircle, XCircle, AlertCircle, Info } from 'lucide-react';
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
      iconColor: 'text-green-600',
      iconBg: 'bg-green-100',
      borderColor: 'border-green-500',
      bgGradient: 'from-green-50 to-emerald-50',
    },
    error: {
      icon: XCircle,
      iconColor: 'text-red-600',
      iconBg: 'bg-red-100',
      borderColor: 'border-red-500',
      bgGradient: 'from-red-50 to-rose-50',
    },
    warning: {
      icon: AlertCircle,
      iconColor: 'text-yellow-600',
      iconBg: 'bg-yellow-100',
      borderColor: 'border-yellow-500',
      bgGradient: 'from-yellow-50 to-amber-50',
    },
    info: {
      icon: Info,
      iconColor: 'text-blue-600',
      iconBg: 'bg-blue-100',
      borderColor: 'border-blue-500',
      bgGradient: 'from-blue-50 to-indigo-50',
    },
  };

  const config = typeConfig[type];
  const Icon = config.icon;

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Notification */}
      <div className={`relative bg-gradient-to-br ${config.bgGradient} rounded-xl shadow-2xl max-w-md w-full border-l-4 ${config.borderColor} transform transition-all animate-in`}>
        <div className="p-6">
          <div className="flex items-start gap-4">
            {/* Icon */}
            <div className={`${config.iconBg} p-3 rounded-full flex-shrink-0`}>
              <Icon className={`h-8 w-8 ${config.iconColor}`} />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h3 className="text-xl font-bold text-gray-900 mb-1">{title}</h3>
              <p className="text-gray-600 text-sm leading-relaxed">{message}</p>

              {/* Auto-close indicator */}
              {autoClose && (
                <div className="mt-3 h-1 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${config.iconColor.replace('text-', 'bg-')} transition-all`}
                    style={{
                      animation: `shrink ${autoCloseDelay}ms linear`,
                    }}
                  />
                </div>
              )}
            </div>

            {/* Close button */}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
            >
              <XCircle className="h-6 w-6" />
            </button>
          </div>

          {/* Action button */}
          <div className="mt-4 flex justify-end">
            <button
              onClick={onClose}
              className={`px-4 py-2 ${config.iconColor.replace('text-', 'bg-')} text-white rounded-lg font-medium hover:opacity-90 transition-opacity`}
            >
              OK
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes shrink {
          from {
            width: 100%;
          }
          to {
            width: 0%;
          }
        }

        .animate-in {
          animation: slideIn 0.3s ease-out;
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-20px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>,
    document.body
  );
}
