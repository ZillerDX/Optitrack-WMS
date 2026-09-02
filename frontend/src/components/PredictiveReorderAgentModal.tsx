"use client";

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Sparkles,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  Package,
  Building2,
  RefreshCw,
  FileCheck,
  Check,
  History,
  TrendingUp,
  X,
  ExternalLink,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { cn } from '@/lib/utils';

interface PredictiveItem {
  product_id: number;
  sku: string;
  name: string;
  category: string;
  supplier: string;
  target_location: string;
  current_stock: number;
  min_stock_level: number;
  cost_price: number;
  sell_price: number;
  units_sold_30d: number;
  daily_burn_rate: number;
  days_of_inventory: number;
  estimated_runout_date: string;
  suggested_reorder_qty: number;
  urgency: 'CRITICAL' | 'WARNING' | 'HEALTHY';
}

interface DraftPO {
  id: string;
  po_number: string;
  product_id: number;
  product_name: string;
  sku: string;
  supplier: string;
  target_location: string;
  current_stock: number;
  reorder_qty: number;
  unit_cost: number;
  total_amount: number;
  urgency: 'CRITICAL' | 'WARNING' | 'HEALTHY';
  days_remaining: number;
  estimated_lead_days: number;
  notes: string;
}

interface ApprovedPO {
  id: number;
  po_number: string;
  supplier: string;
  total_amount: number;
  status: string;
  items: any[];
  notes: string;
  approved_at: string;
}

interface PredictiveSummary {
  total_tracked_products: number;
  critical_count: number;
  warning_count: number;
  healthy_count: number;
  draft_po_count: number;
  total_restock_budget: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onPOApproved?: () => void;
}

export function PredictiveReorderAgentModal({ isOpen, onClose, onPOApproved }: Props) {
  const { formatCurrency } = useCurrencyFormatter();
  const [activeTab, setActiveTab] = useState<'drafts' | 'velocity' | 'history'>('drafts');
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approvedSuccessMap, setApprovedSuccessMap] = useState<Record<string, boolean>>({});

  const [summary, setSummary] = useState<PredictiveSummary>({
    total_tracked_products: 0,
    critical_count: 0,
    warning_count: 0,
    healthy_count: 0,
    draft_po_count: 0,
    total_restock_budget: 0,
  });

  const [predictiveItems, setPredictiveItems] = useState<PredictiveItem[]>([]);
  const [draftPOs, setDraftPOs] = useState<DraftPO[]>([]);
  const [approvedPOs, setApprovedPOs] = useState<ApprovedPO[]>([]);
  const [searchFilter, setSearchFilter] = useState('');

  const loadPredictiveData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getPredictiveAnalytics();
      setSummary(data.summary || {});
      setPredictiveItems(data.predictive_items || []);
      setDraftPOs(data.draft_purchase_orders || []);
      setApprovedPOs(data.approved_purchase_orders || []);
    } catch (err) {
      console.error('[Load Predictive Error]:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadPredictiveData();
    }
  }, [isOpen, loadPredictiveData]);

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

  // Lock body scroll when open
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

  const handleApprovePO = async (po: DraftPO) => {
    setApprovingId(po.id);
    try {
      await api.approvePurchaseOrder({
        po_number: po.po_number,
        product_id: po.product_id,
        product_name: po.product_name,
        sku: po.sku,
        supplier: po.supplier,
        reorder_qty: po.reorder_qty,
        unit_cost: po.unit_cost,
        total_amount: po.total_amount,
        target_location: po.target_location,
        notes: po.notes,
      });

      // Mark success locally
      setApprovedSuccessMap(prev => ({ ...prev, [po.id]: true }));

      // Remove from draft POs after a brief visual confirmation
      setTimeout(() => {
        setDraftPOs(prev => prev.filter(item => item.id !== po.id));
        setApprovedSuccessMap(prev => {
          const next = { ...prev };
          delete next[po.id];
          return next;
        });
        loadPredictiveData();
        if (onPOApproved) onPOApproved();
      }, 1200);
    } catch (err) {
      console.error('[Failed to approve PO]:', err);
      alert('Failed to approve PO. Please try again.');
    } finally {
      setApprovingId(null);
    }
  };

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-200">
      {/* Backdrop */}
      <div 
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-md transition-opacity duration-300" 
      />

      {/* Modal Dialog */}
      <div className="relative my-auto w-full max-w-5xl rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl shadow-black/80 z-10 flex flex-col max-h-[90vh] overflow-hidden backdrop-blur-xl animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-800 bg-slate-950/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="size-11 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-500 p-0.5 shadow-lg shadow-indigo-500/25 flex items-center justify-center">
              <div className="w-full h-full rounded-[14px] bg-slate-950 flex items-center justify-center">
                <Sparkles className="size-5 text-indigo-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">AI Predictive Inventory & Reorder Agent</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Autonomous v2.0
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Velocity tracking, run-out forecasting & 1-click purchase order approval
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={loadPredictiveData}
              disabled={loading}
              className="px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/80 text-xs font-semibold text-slate-200 flex items-center gap-2 transition-all"
            >
              <RefreshCw className={cn("size-3.5", loading && "animate-spin text-blue-400")} />
              <span>Rescan Velocity</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/80 text-slate-400 hover:text-white transition-all"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 sm:p-6 bg-slate-950/20 border-b border-slate-800/60">
          <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800/80">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
              <span>Critical Shortages</span>
              <AlertTriangle className="size-3.5 text-rose-400" />
            </div>
            <p className="text-2xl font-black text-rose-400 font-mono mt-1">{summary.critical_count}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Stock depleted or &le; 3 days</p>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800/80">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
              <span>Warning Threshold</span>
              <TrendingDown className="size-3.5 text-amber-400" />
            </div>
            <p className="text-2xl font-black text-amber-400 font-mono mt-1">{summary.warning_count}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Within 4-10 days of supply</p>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800/80">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
              <span>Pending Draft POs</span>
              <FileCheck className="size-3.5 text-indigo-400" />
            </div>
            <p className="text-2xl font-black text-indigo-400 font-mono mt-1">{draftPOs.length}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Ready for 1-click approval</p>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800/80">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
              <span>Restock Budget Needed</span>
              <CheckCircle2 className="size-3.5 text-emerald-400" />
            </div>
            <p className="text-2xl font-black text-white font-mono mt-1">{formatCurrency(summary.total_restock_budget)}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Calculated at wholesale cost</p>
          </div>
        </div>

        {/* Tab Switcher & Search */}
        <div className="px-5 py-3 border-b border-slate-800 bg-slate-950/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950/80 border border-slate-800/80">
            <button
              type="button"
              onClick={() => setActiveTab('drafts')}
              className={cn(
                "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2",
                activeTab === 'drafts'
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                  : "text-slate-400 hover:text-slate-200"
              )}
            >
              <FileCheck className="size-3.5" />
              <span>Draft POs ({draftPOs.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('velocity')}
              className={cn(
                "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2",
                activeTab === 'velocity'
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                  : "text-slate-400 hover:text-slate-200"
              )}
            >
              <TrendingUp className="size-3.5" />
              <span>Stock Velocity & Forecasting</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={cn(
                "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2",
                activeTab === 'history'
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                  : "text-slate-400 hover:text-slate-200"
              )}
            >
              <History className="size-3.5" />
              <span>Approved POs ({approvedPOs.length})</span>
            </button>
          </div>

          <div className="relative">
            <input
              type="text"
              placeholder="Filter by SKU or Product name..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full sm:w-64 h-9 pl-3 pr-3 text-xs bg-slate-950/80 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Tab Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-4">
          {/* TAB 1: DRAFT PURCHASE ORDERS */}
          {activeTab === 'drafts' && (
            <div className="space-y-4">
              {draftPOs.length === 0 ? (
                <div className="text-center py-16 px-4 rounded-3xl border border-dashed border-slate-800 bg-slate-950/30">
                  <div className="size-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center mb-3">
                    <CheckCircle2 className="size-7" />
                  </div>
                  <h3 className="text-base font-bold text-white">All Warehouse Stock Levels are Optimal</h3>
                  <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
                    The autonomous agent analyzed your 30-day velocity. No impending stockouts were detected.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {draftPOs
                    .filter(po => 
                      po.product_name.toLowerCase().includes(searchFilter.toLowerCase()) ||
                      po.sku.toLowerCase().includes(searchFilter.toLowerCase())
                    )
                    .map((po) => {
                      const isApproving = approvingId === po.id;
                      const isSuccess = approvedSuccessMap[po.id];

                      return (
                        <div
                          key={po.id}
                          className={cn(
                            "rounded-2xl border p-5 transition-all duration-300 flex flex-col justify-between",
                            po.urgency === 'CRITICAL'
                              ? "border-rose-500/30 bg-rose-950/10 hover:border-rose-500/50"
                              : "border-amber-500/30 bg-amber-950/10 hover:border-amber-500/50"
                          )}
                        >
                          <div>
                            {/* PO Top Row */}
                            <div className="flex items-start justify-between gap-3 mb-3">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-mono font-bold text-indigo-300">{po.po_number}</span>
                                  <span className={cn(
                                    "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border",
                                    po.urgency === 'CRITICAL'
                                      ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                                      : "bg-amber-500/20 text-amber-300 border-amber-500/40"
                                  )}>
                                    {po.urgency === 'CRITICAL' ? 'Stockout Alert' : 'Reorder Warn'}
                                  </span>
                                </div>
                                <h4 className="text-sm font-bold text-white mt-1 line-clamp-1">{po.product_name}</h4>
                                <p className="text-xs font-mono text-slate-400">SKU: {po.sku}</p>
                              </div>

                              <div className="text-right">
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Total PO Value</span>
                                <p className="text-lg font-black text-white font-mono">{formatCurrency(po.total_amount)}</p>
                              </div>
                            </div>

                            {/* Velocity & Stock stats grid */}
                            <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 mb-4 text-center">
                              <div>
                                <span className="text-[10px] font-semibold text-slate-500 uppercase">Current Stock</span>
                                <p className={cn(
                                  "text-sm font-bold font-mono mt-0.5",
                                  po.current_stock === 0 ? "text-rose-400" : "text-amber-400"
                                )}>
                                  {po.current_stock} pcs
                                </p>
                              </div>
                              <div>
                                <span className="text-[10px] font-semibold text-slate-500 uppercase">Days Left</span>
                                <p className="text-sm font-bold text-white font-mono mt-0.5">
                                  {po.days_remaining === 0 ? 'Depleted' : `~${po.days_remaining} days`}
                                </p>
                              </div>
                              <div>
                                <span className="text-[10px] font-semibold text-slate-500 uppercase">Suggested Order</span>
                                <p className="text-sm font-bold text-indigo-400 font-mono mt-0.5">
                                  +{po.reorder_qty} pcs
                                </p>
                              </div>
                            </div>

                            {/* Logistics Details */}
                            <div className="space-y-1 text-xs text-slate-400 mb-4">
                              <div className="flex items-center justify-between">
                                <span className="flex items-center gap-1.5">
                                  <Building2 className="size-3 text-slate-500" />
                                  <span>Supplier:</span>
                                </span>
                                <span className="text-slate-200 font-medium">{po.supplier}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="flex items-center gap-1.5">
                                  <Package className="size-3 text-slate-500" />
                                  <span>Target Zone:</span>
                                </span>
                                <span className="text-slate-200 font-medium">{po.target_location}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="flex items-center gap-1.5">
                                  <Clock className="size-3 text-slate-500" />
                                  <span>Est. Lead Time:</span>
                                </span>
                                <span className="text-slate-200 font-medium">{po.estimated_lead_days} days</span>
                              </div>
                            </div>
                          </div>

                          {/* 1-Click Approve Action Button */}
                          <button
                            type="button"
                            onClick={() => handleApprovePO(po)}
                            disabled={isApproving || isSuccess}
                            className={cn(
                              "w-full h-11 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all duration-200 shadow-md",
                              isSuccess
                                ? "bg-emerald-600 text-white shadow-emerald-600/30"
                                : po.urgency === 'CRITICAL'
                                ? "bg-gradient-to-r from-rose-600 to-indigo-600 hover:from-rose-500 hover:to-indigo-500 text-white shadow-rose-600/20"
                                : "bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white shadow-indigo-600/20"
                            )}
                          >
                            {isApproving ? (
                              <>
                                <RefreshCw className="size-4 animate-spin" />
                                <span>Approving & Syncing Inventory...</span>
                              </>
                            ) : isSuccess ? (
                              <>
                                <Check className="size-4 text-white" />
                                <span>Approved & Inbound Logged!</span>
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="size-4" />
                                <span>1-Click Approve Purchase Order</span>
                              </>
                            )}
                          </button>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: VELOCITY & DEMAND FORECASTING TABLE */}
          {activeTab === 'velocity' && (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 text-slate-400 uppercase font-mono text-[10px] tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="p-3.5">Product & SKU</th>
                      <th className="p-3.5">Current Stock</th>
                      <th className="p-3.5">Min Safety</th>
                      <th className="p-3.5">30d Velocity</th>
                      <th className="p-3.5">Daily Burn Rate</th>
                      <th className="p-3.5">Days Left</th>
                      <th className="p-3.5">Est. Runout</th>
                      <th className="p-3.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-medium">
                    {predictiveItems
                      .filter(item =>
                        item.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
                        item.sku.toLowerCase().includes(searchFilter.toLowerCase())
                      )
                      .map((item) => (
                        <tr key={item.product_id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="p-3.5">
                            <p className="font-bold text-white">{item.name}</p>
                            <p className="text-[11px] font-mono text-slate-400">{item.sku}</p>
                          </td>
                          <td className="p-3.5 font-mono text-slate-200">
                            {item.current_stock} pcs
                          </td>
                          <td className="p-3.5 font-mono text-slate-400">
                            {item.min_stock_level} pcs
                          </td>
                          <td className="p-3.5 font-mono text-indigo-400 font-bold">
                            {item.units_sold_30d} units
                          </td>
                          <td className="p-3.5 font-mono text-slate-300">
                            {item.daily_burn_rate} /day
                          </td>
                          <td className="p-3.5 font-mono">
                            <span className={cn(
                              "font-bold",
                              item.days_of_inventory <= 3 ? "text-rose-400" :
                              item.days_of_inventory <= 10 ? "text-amber-400" :
                              "text-emerald-400"
                            )}>
                              {item.days_of_inventory === 999 ? '> 90 days' : `${item.days_of_inventory} days`}
                            </span>
                          </td>
                          <td className="p-3.5 text-slate-300">
                            {item.estimated_runout_date}
                          </td>
                          <td className="p-3.5">
                            <span className={cn(
                              "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border",
                              item.urgency === 'CRITICAL'
                                ? "bg-rose-500/20 text-rose-400 border-rose-500/30"
                                : item.urgency === 'WARNING'
                                ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                                : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                            )}>
                              {item.urgency}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: APPROVED PURCHASE ORDERS HISTORY */}
          {activeTab === 'history' && (
            <div className="space-y-3">
              {approvedPOs.length === 0 ? (
                <div className="text-center py-16 px-4 rounded-3xl border border-dashed border-slate-800 bg-slate-950/30">
                  <div className="size-12 rounded-2xl bg-slate-800 text-slate-400 mx-auto flex items-center justify-center mb-3">
                    <History className="size-6" />
                  </div>
                  <h3 className="text-sm font-bold text-white">No Approved Purchase Orders Yet</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    When you click &quot;Approve PO&quot; on any draft, the record and corresponding inbound transaction will appear here.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {approvedPOs.map((po) => (
                    <div
                      key={po.id}
                      className="p-4 rounded-2xl border border-slate-800/80 bg-slate-950/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="size-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                          <CheckCircle2 className="size-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold text-white">{po.po_number}</span>
                            <span className="px-2 py-0.2 rounded text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              Approved
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">
                            Supplier: <span className="text-slate-300 font-medium">{po.supplier}</span> &bull; Approved: {po.approved_at ? new Date(po.approved_at).toLocaleString() : 'Recent'}
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Order Amount</span>
                        <p className="text-base font-bold text-emerald-400 font-mono">{formatCurrency(po.total_amount)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>AI Predictive Engine connected to real-time warehouse transaction stream</span>
          </div>
          <span className="text-[11px] font-mono text-slate-500">Press ESC or click &times; to close</span>
        </div>

      </div>
    </div>,
    document.body
  );
}
