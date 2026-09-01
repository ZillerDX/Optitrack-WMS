"use client";

import React, { useRef } from 'react';
import { Modal } from './Modal';
import { Printer, Download, X, Barcode as BarcodeIcon, Check } from 'lucide-react';

interface BarcodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: {
    name: string;
    sku: string;
    barcode?: string;
    sell_price?: number;
    category?: string;
  } | null;
}

export function BarcodeModal({ isOpen, onClose, product }: BarcodeModalProps) {
  const printRef = useRef<HTMLDivElement>(null);

  if (!product) return null;

  const handlePrint = () => {
    window.print();
  };

  const barcodeValue = product.barcode || product.sku;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Product Barcode Label & Tag">
      <div className="space-y-6">
        {/* Printable Label Card Preview */}
        <div className="flex justify-center p-6 bg-slate-950 rounded-xl border border-slate-800">
          <div 
            ref={printRef}
            className="w-72 bg-white text-slate-900 p-5 rounded-lg shadow-xl border border-slate-200 flex flex-col items-center text-center font-sans select-none"
          >
            <div className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-1">
              OptiTrack WMS • Tag
            </div>
            <div className="text-sm font-bold text-slate-900 leading-tight mb-0.5 line-clamp-1">
              {product.name}
            </div>
            <div className="text-xs text-slate-600 font-medium mb-3">
              SKU: <span className="font-mono font-bold text-slate-900">{product.sku}</span>
            </div>

            {/* Visual Barcode SVG simulation */}
            <div className="w-full flex flex-col items-center justify-center my-1 bg-white py-1">
              <svg className="w-48 h-14" viewBox="0 0 200 60" preserveAspectRatio="none">
                {/* Code bars generated cleanly */}
                {[
                  2, 5, 9, 12, 16, 18, 22, 26, 29, 34, 38, 41, 45, 48, 52, 55, 59, 63, 67, 70, 74, 
                  78, 82, 85, 89, 93, 97, 101, 105, 108, 112, 116, 120, 124, 128, 131, 135, 139, 
                  143, 147, 151, 154, 158, 162, 166, 170, 174, 177, 181, 185, 189, 193, 196
                ].map((x, i) => (
                  <rect
                    key={i}
                    x={x}
                    y={0}
                    width={i % 3 === 0 ? 3 : i % 2 === 0 ? 2 : 1}
                    height={55}
                    fill="#111827"
                  />
                ))}
              </svg>
              <span className="text-[11px] font-mono tracking-widest text-slate-700 font-bold mt-1">
                *{barcodeValue}*
              </span>
            </div>

            <div className="w-full border-t border-dashed border-slate-300 mt-2 pt-2 flex items-center justify-between text-xs">
              <span className="text-slate-500">{product.category || 'General'}</span>
              <span className="font-bold text-sm text-slate-950">
                ฿{Number(product.sell_price || 0).toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-lg shadow-blue-600/20 transition-all"
          >
            <Printer className="w-4 h-4" />
            Print Label
          </button>
        </div>
      </div>
    </Modal>
  );
}
