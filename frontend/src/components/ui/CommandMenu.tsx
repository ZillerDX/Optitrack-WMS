"use client";

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Search, 
  Package, 
  TrendingUp, 
  ArrowDownCircle, 
  ArrowUpCircle, 
  Layers, 
  Bot, 
  User, 
  Plus, 
  X, 
  CornerDownLeft,
  Warehouse
} from 'lucide-react';
import { api } from '@/lib/api';

interface CommandMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandMenu({ isOpen, onClose }: CommandMenuProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [products, setProducts] = useState<any[]>([]);
  const [isSearchingProducts, setIsSearchingProducts] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Fetch quick products list for fast search
  useEffect(() => {
    if (isOpen && products.length === 0) {
      api.getProducts()
        .then((data) => setProducts(data || []))
        .catch(() => {});
    }
  }, [isOpen, products.length]);

  // Navigation and Actions list
  const baseCommands = [
    { id: 'nav-dash', title: 'Go to Dashboard', category: 'Navigation', icon: TrendingUp, action: () => router.push('/dashboard') },
    { id: 'nav-inv', title: 'Go to Inventory Management', category: 'Navigation', icon: Layers, action: () => router.push('/inventory') },
    { id: 'nav-prod', title: 'Go to Products Catalog', category: 'Navigation', icon: Package, action: () => router.push('/products') },
    { id: 'nav-txn', title: 'Go to Transactions History', category: 'Navigation', icon: ArrowDownCircle, action: () => router.push('/transactions') },
    { id: 'nav-prof', title: 'Go to User Profile', category: 'Navigation', icon: User, action: () => router.push('/profile') },
    { id: 'act-inbound', title: 'New Inbound Transaction (Receive Stock)', category: 'Quick Action', icon: ArrowDownCircle, action: () => router.push('/transactions?action=inbound') },
    { id: 'act-outbound', title: 'New Outbound Transaction (Dispatch Stock)', category: 'Quick Action', icon: ArrowUpCircle, action: () => router.push('/transactions?action=outbound') },
    { id: 'act-add-prod', title: 'Add New Product Record', category: 'Quick Action', icon: Plus, action: () => router.push('/products?action=new') },
  ];

  // Filter commands by query
  const filteredCommands = query.trim() === ''
    ? baseCommands
    : baseCommands.filter(c => c.title.toLowerCase().includes(query.toLowerCase()));

  // Filter products by SKU or Name
  const matchedProducts = query.trim() !== ''
    ? products.filter(p => 
        p.sku?.toLowerCase().includes(query.toLowerCase()) || 
        p.name?.toLowerCase().includes(query.toLowerCase()) ||
        p.category?.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 5)
    : [];

  const allItems = [
    ...filteredCommands.map(c => ({ type: 'command', data: c })),
    ...matchedProducts.map(p => ({ type: 'product', data: p }))
  ];

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % (allItems.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + allItems.length) % (allItems.length || 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const current = allItems[selectedIndex];
      if (current) {
        if (current.type === 'command') {
          current.data.action();
        } else {
          router.push(`/products?search=${encodeURIComponent(current.data.sku)}`);
        }
        onClose();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center pt-24 px-4 animate-in fade-in duration-150">
      <div 
        className="w-full max-w-xl bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3 border-b border-slate-800 gap-3 bg-slate-950/50">
          <Search className="w-5 h-5 text-blue-400 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Type a command, search products, SKUs, or jump to page..."
            className="w-full bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
          />
          <button 
            onClick={onClose}
            className="p-1 text-slate-500 hover:text-slate-300 rounded hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {allItems.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">
              No matching commands or products found for &ldquo;{query}&rdquo;
            </div>
          ) : (
            allItems.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              if (item.type === 'command') {
                const cmd = item.data;
                const Icon = cmd.icon;
                return (
                  <div
                    key={cmd.id}
                    onClick={() => {
                      cmd.action();
                      onClose();
                    }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                      isSelected ? 'bg-blue-600/20 text-blue-200 border border-blue-500/30' : 'text-slate-300 hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-1.5 rounded-md ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className="text-sm font-medium">{cmd.title}</span>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                      {cmd.category}
                    </span>
                  </div>
                );
              } else {
                const prod = item.data;
                return (
                  <div
                    key={`prod-${prod.id}`}
                    onClick={() => {
                      router.push(`/products?search=${encodeURIComponent(prod.sku)}`);
                      onClose();
                    }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                      isSelected ? 'bg-indigo-600/20 text-indigo-200 border border-indigo-500/30' : 'text-slate-300 hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-1.5 rounded-md ${isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                        <Package className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-sm font-medium">{prod.name}</div>
                        <div className="text-xs text-slate-400 font-mono">SKU: {prod.sku} • {prod.category || 'General'}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-semibold text-emerald-400">฿{Number(prod.sell_price || 0).toLocaleString()}</span>
                      <div className="text-[10px] text-slate-500">Jump to product</div>
                    </div>
                  </div>
                );
              }
            })
          )}
        </div>

        {/* Footer Shortcut Tips */}
        <div className="flex items-center justify-between px-4 py-2 bg-slate-950/80 border-t border-slate-800 text-[11px] text-slate-500">
          <div className="flex items-center gap-2">
            <span>Navigate <kbd className="px-1 py-0.5 bg-slate-800 text-slate-300 rounded font-mono text-[9px]">↑</kbd> <kbd className="px-1 py-0.5 bg-slate-800 text-slate-300 rounded font-mono text-[9px]">↓</kbd></span>
            <span>Select <kbd className="px-1 py-0.5 bg-slate-800 text-slate-300 rounded font-mono text-[9px]">↵</kbd></span>
            <span>Close <kbd className="px-1 py-0.5 bg-slate-800 text-slate-300 rounded font-mono text-[9px]">Esc</kbd></span>
          </div>
          <div className="flex items-center gap-1 text-blue-400">
            <CornerDownLeft className="w-3 h-3" />
            <span>Instant WMS Action</span>
          </div>
        </div>
      </div>
    </div>
  );
}
