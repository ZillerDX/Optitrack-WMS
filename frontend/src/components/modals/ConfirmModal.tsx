/**
 * คอมโพเนนต์โมดัลการยืนยัน
 * สำหรับการยืนยันการลบและการดำเนินการที่สำคัญ
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
      iconColor: 'text-red-600',
      iconBg: 'bg-red-100',
      buttonClass: 'bg-red-600 hover:bg-red-700',
    },
    warning: {
      icon: AlertTriangle,
      iconColor: 'text-yellow-600',
      iconBg: 'bg-yellow-100',
      buttonClass: 'bg-yellow-600 hover:bg-yellow-700',
    },
    info: {
      icon: CheckCircle,
      iconColor: 'text-blue-600',
      iconBg: 'bg-blue-100',
      buttonClass: 'bg-blue-600 hover:bg-blue-700',
    },
  };

  const config = typeConfig[type];
  const Icon = config.icon;

  return createPortal(
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
      {/* ฉากหลัง */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* โมดัล */}
      <div className="relative bg-white rounded-xl shadow-2xl max-w-md w-full p-6 transform transition-all">
        <div className="flex flex-col items-center text-center">
          {/* Icon */}
          <div className={`${config.iconBg} p-4 rounded-full mb-4`}>
            <Icon className={`h-12 w-12 ${config.iconColor}`} />
          </div>

          {/* Title */}
          <h3 className="text-2xl font-bold text-gray-900 mb-2">{title}</h3>

          {/* Message */}
          <p className="text-gray-600 mb-6">{message}</p>

          {/* Buttons */}
          <div className="flex gap-3 w-full">
            <button
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 px-4 py-2.5 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors disabled:opacity-50"
            >
              {cancelText}
            </button>
            <button
              onClick={() => {
                onConfirm();
                onClose();
              }}
              disabled={isLoading}
              className={`flex-1 px-4 py-2.5 ${config.buttonClass} text-white rounded-lg font-medium transition-colors disabled:opacity-50`}
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
