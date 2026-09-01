/**
 * Reusable Modal Component
 * Modern Dark Glassmorphism modal system for OptiTrack WMS
 */

import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  description?: string;
}

export function Modal({ isOpen, onClose, title, description, children, size = 'md' }: ModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close modal on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen || !mounted) return null;

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-xl',
    lg: 'max-w-3xl',
    xl: 'max-w-5xl',
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-200">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div
        className={`relative bg-slate-900/95 border border-slate-800 rounded-2xl shadow-2xl shadow-black/80 w-full ${sizeClasses[size]} max-h-[92vh] overflow-hidden transform transition-all flex flex-col backdrop-blur-xl text-slate-100 ring-1 ring-white/5 animate-in zoom-in-95 duration-200 my-auto`}
      >
        {/* Header */}
        <div className="flex-none flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-800/80 bg-slate-900/50">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">{title}</h2>
            {description && <p className="text-xs text-slate-400 mt-0.5 font-medium">{description}</p>}
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl p-2 transition-all shrink-0 hover:scale-105"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 px-5 sm:px-6 py-5 overflow-y-auto text-slate-200 scrollbar-thin scrollbar-thumb-slate-800">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
