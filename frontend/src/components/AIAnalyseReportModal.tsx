"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Sparkles,
  RefreshCw,
  Copy,
  Check,
  Printer,
  X,
  Activity,
  Package,
  TrendingUp,
  Warehouse,
  DollarSign,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ArrowRight,
  ShieldCheck,
  Clock,
  Compass,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { cn } from '@/lib/utils';

interface ReportMetrics {
  total_units: number;
  total_valuation: number;
  total_cost_basis: number;
  total_capacity: number;
  utilization_pct: number;
  active_products: number;
  critical_count: number;
  warning_count: number;
  projected_margin: number;
  margin_pct: number;
}

interface TopItem {
  id: number;
  name: string;
  sku: string;
  category: string;
  stock: number;
  min_stock: number;
  units_out_30d: number;
  daily_burn: number;
  days_remaining: number;
  status: 'CRITICAL' | 'WARNING' | 'HEALTHY';
}

interface ZoneItem {
  name: string;
  capacity: number;
  used: number;
  pct: number;
  status: string;
}

interface ActionItem {
  id: number;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  description: string;
}

interface ReportData {
  generated_at: string;
  health_score: number;
  health_grade: string;
  metrics: ReportMetrics;
  top_item: TopItem;
  primary_zone: ZoneItem;
  empty_zones: string[];
  zone_breakdown: ZoneItem[];
  action_items: ActionItem[];
  report_markdown: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function AIAnalyseReportModal({ isOpen, onClose }: Props) {
  const { formatCurrency } = useCurrencyFormatter();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<ReportData | null>(null);
  const [copied, setCopied] = useState(false);
  const reportPrintRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch / Generate Report
  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.generateAIAnalyseReport();
      setReport(data);
    } catch (err) {
      console.error('[Failed to generate AI report]:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchReport();
    }
  }, [isOpen, fetchReport]);

  // Lock body scroll
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

  // Escape key handler
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Copy report to clipboard
  const handleCopy = () => {
    if (!report?.report_markdown) return;
    navigator.clipboard.writeText(report.report_markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Print Report
  const handlePrint = () => {
    window.print();
  };

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-200">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/85 backdrop-blur-md transition-opacity duration-300"
      />

      {/* Modal Dialog (Center Guaranteed via my-auto) */}
      <div className="relative my-auto w-full max-w-4xl rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl shadow-black/80 z-10 flex flex-col max-h-[92vh] overflow-hidden backdrop-blur-xl animate-in zoom-in-95 duration-200">
        
        {/* =========================================================
            1. MODAL HEADER BAR
            ========================================================= */}
        <div className="p-5 sm:p-6 border-b border-slate-800 bg-slate-950/60 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="size-11 rounded-2xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-indigo-600 p-0.5 shadow-lg shadow-indigo-600/30 flex items-center justify-center shrink-0">
              <div className="w-full h-full rounded-[14px] bg-slate-950 flex items-center justify-center">
                <Sparkles className="size-5 text-indigo-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg sm:text-xl font-black text-white tracking-tight">
                  AI Operations Intelligence Report
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                  Executive Brief
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Autonomous Warehouse Health, Velocity, Capacity &amp; Financial Diagnostics
              </p>
            </div>
          </div>

          {/* Action Tools & ONLY Top 'X' Close Button */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchReport}
              disabled={loading}
              className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition-colors disabled:opacity-50"
              title="Re-Analyse Report"
            >
              <RefreshCw className={cn("size-4", loading && "animate-spin text-indigo-400")} />
            </button>
            <button
              type="button"
              onClick={handleCopy}
              disabled={loading || !report}
              className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition-colors disabled:opacity-50"
              title="Copy Clean Report Text"
            >
              {copied ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={loading || !report}
              className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition-colors disabled:opacity-50 hidden sm:flex"
              title="Print / Export Report"
            >
              <Printer className="size-4" />
            </button>
            
            {/* ONLY 'X' Close Button - per user directive */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ml-1"
              title="Close"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* =========================================================
            2. MODAL BODY (STRUCTURED EXECUTIVE CARDS)
            ========================================================= */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {loading ? (
            <div className="py-24 flex flex-col items-center justify-center text-center space-y-3">
              <div className="relative size-12 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin" />
                <Sparkles className="size-5 text-indigo-400" />
              </div>
              <p className="text-sm font-bold text-white tracking-tight">Synthesizing Warehouse Operations Data...</p>
              <p className="text-xs text-slate-400 max-w-sm">
                AI is calculating inventory velocity, space bottlenecks, capital exposure, and operational priorities.
              </p>
            </div>
          ) : report ? (
            <div ref={reportPrintRef} className="space-y-6">
              
              {/* TOP BANNER: FACILITY HEALTH GRADE & SCORE */}
              <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-slate-800/90 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "size-14 rounded-2xl border flex flex-col items-center justify-center font-mono shrink-0 shadow-md",
                    report.health_score >= 85
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-emerald-500/10"
                      : report.health_score >= 70
                      ? "bg-amber-500/10 border-amber-500/30 text-amber-400 shadow-amber-500/10"
                      : "bg-rose-500/10 border-rose-500/30 text-rose-400 shadow-rose-500/10"
                  )}>
                    <span className="text-[10px] uppercase tracking-wider font-bold">Grade</span>
                    <span className="text-2xl font-black leading-none">{report.health_grade}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-base font-bold text-white tracking-tight">
                        Facility Operations Health: {report.health_score}/100
                      </h4>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        Live Snapshot
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Analyzed on {new Date(report.generated_at).toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* KPI Metrics Chips */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                  <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Valuation</span>
                    <p className="font-bold text-emerald-400 text-sm">{formatCurrency(report.metrics.total_valuation)}</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Total Stock</span>
                    <p className="font-bold text-white text-sm">{report.metrics.total_units.toLocaleString()} pcs</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Space Used</span>
                    <p className="font-bold text-blue-400 text-sm">{report.metrics.utilization_pct}%</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Shortages</span>
                    <p className={cn("font-bold text-sm", report.metrics.critical_count > 0 ? "text-rose-400" : "text-slate-300")}>
                      {report.metrics.critical_count} items
                    </p>
                  </div>
                </div>
              </div>

              {/* CARD 1: EXECUTIVE OPERATIONS BRIEF */}
              <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800/80 shadow-md">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
                    <Activity className="size-4" />
                  </div>
                  <h4 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                    1. Executive Operations Brief
                  </h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/60">
                    <p className="text-slate-400">Facility Readiness</p>
                    <p className="text-sm font-bold text-emerald-400 mt-1">Grade {report.health_grade} &bull; Stable</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">High structural &amp; operational balance</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/60">
                    <p className="text-slate-400">Total Asset Valuation</p>
                    <p className="text-sm font-bold text-white mt-1">{formatCurrency(report.metrics.total_valuation)}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{report.metrics.total_units.toLocaleString()} units registered on-hand</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/60">
                    <p className="text-slate-400">Aggregate Space Load</p>
                    <p className="text-sm font-bold text-blue-400 mt-1">{report.metrics.utilization_pct}% Occupied</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">Capacity headroom for incoming batches</p>
                  </div>
                </div>
              </div>

              {/* CARD 2: SKU VELOCITY & INVENTORY HEALTH */}
              <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800/80 shadow-md">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                      <TrendingUp className="size-4" />
                    </div>
                    <h4 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                      2. SKU Velocity &amp; Depletion Analysis
                    </h4>
                  </div>
                  <span className="text-xs font-mono text-slate-400">30-Day Run-Rate</span>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-bold text-white tracking-tight">{report.top_item.name}</span>
                      <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                        {report.top_item.sku}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Current On-Hand: <strong className="text-white">{report.top_item.stock.toLocaleString()} units</strong> &bull; Min Safety Level: <strong className="text-white">{report.top_item.min_stock} units</strong>
                    </p>
                  </div>

                  <div className="flex items-center gap-4 text-xs font-mono">
                    <div className="text-right">
                      <span className="text-[10px] text-slate-500 uppercase block">Outbound Velocity</span>
                      <span className="font-bold text-indigo-300">{report.top_item.units_out_30d} units ({report.top_item.daily_burn}/day)</span>
                    </div>
                    <div className="text-right border-l border-slate-800 pl-4">
                      <span className="text-[10px] text-slate-500 uppercase block">Days of Supply</span>
                      <span className="font-bold text-emerald-400">
                        {report.top_item.days_remaining > 365 ? '>365 Days' : `${report.top_item.days_remaining} Days`}
                      </span>
                    </div>
                    <div className="text-right border-l border-slate-800 pl-4">
                      <span className="text-[10px] text-slate-500 uppercase block">Stock Status</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        Optimal
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* CARD 3: SPACE & ZONE OPTIMIZATION */}
              <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800/80 shadow-md">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                    <Warehouse className="size-4" />
                  </div>
                  <h4 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                    3. Space &amp; Zone Optimization
                  </h4>
                </div>

                <div className="space-y-3">
                  {report.zone_breakdown.map((zone) => (
                    <div key={zone.name} className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/60">
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="font-bold text-white font-mono">{zone.name}</span>
                        <div className="flex items-center gap-2 font-mono">
                          <span className="text-slate-400">{zone.used} / {zone.capacity} units</span>
                          <span className={cn(
                            "px-1.5 py-0.5 rounded text-[10px] font-bold",
                            zone.pct > 75 ? "bg-amber-500/20 text-amber-300" :
                            zone.pct > 0 ? "bg-emerald-500/20 text-emerald-300" :
                            "bg-slate-800 text-slate-400"
                          )}>
                            {zone.pct}%
                          </span>
                        </div>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            zone.pct > 75 ? "bg-amber-500" :
                            zone.pct > 0 ? "bg-emerald-500" : "bg-transparent"
                          )}
                          style={{ width: `${zone.pct}%` }}
                        />
                      </div>
                    </div>
                  ))}

                  <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/20 flex items-start gap-2.5 text-xs text-slate-300">
                    <Compass className="size-4 text-blue-400 shrink-0 mt-0.5" />
                    <span>
                      <strong className="text-white">Smart Staging Advice:</strong> Route upcoming bulk inbound shipments to{' '}
                      <strong className="text-blue-300">
                        {report.empty_zones.length > 0 ? report.empty_zones.join(', ') : 'available empty slots'}
                      </strong>{' '}
                      to preserve throughput velocity and avoid congestion in active picking zones.
                    </span>
                  </div>
                </div>
              </div>

              {/* CARD 4: WORKING CAPITAL & FINANCIAL EXPOSURE */}
              <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800/80 shadow-md">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="p-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400">
                    <DollarSign className="size-4" />
                  </div>
                  <h4 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                    4. Working Capital &amp; Financial Exposure
                  </h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
                  <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/60">
                    <p className="text-slate-400 uppercase text-[10px] tracking-wider font-sans">Tied-Up Capital (Cost Basis)</p>
                    <p className="text-base font-bold text-white mt-1">{formatCurrency(report.metrics.total_cost_basis)}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5 font-sans">Wholesale purchase capital</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/60">
                    <p className="text-slate-400 uppercase text-[10px] tracking-wider font-sans">Gross Sales Potential</p>
                    <p className="text-base font-bold text-emerald-400 mt-1">{formatCurrency(report.metrics.total_valuation)}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5 font-sans">Estimated retail value</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/60">
                    <p className="text-slate-400 uppercase text-[10px] tracking-wider font-sans">Unrealized Gross Margin</p>
                    <p className="text-base font-bold text-indigo-400 mt-1">
                      {formatCurrency(report.metrics.projected_margin)}{' '}
                      <span className="text-xs text-emerald-400">(+{report.metrics.margin_pct}%)</span>
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5 font-sans">Projected gross profit</p>
                  </div>
                </div>
              </div>

              {/* CARD 5: PRIORITY STRATEGIC ACTION ITEMS */}
              <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800/80 shadow-md">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
                    <ShieldCheck className="size-4" />
                  </div>
                  <h4 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                    5. Strategic Action Playbook
                  </h4>
                </div>

                <div className="space-y-2.5">
                  {report.action_items.map((item) => (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-start gap-3 text-xs"
                    >
                      <div className="size-6 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 font-bold font-mono flex items-center justify-center shrink-0 mt-0.5">
                        {item.id}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h5 className="font-bold text-white text-xs">{item.title}</h5>
                          <span className={cn(
                            "px-1.5 py-0.2 rounded text-[9px] font-bold uppercase font-mono",
                            item.priority === 'HIGH' ? "bg-rose-500/20 text-rose-300 border border-rose-500/30" :
                            item.priority === 'MEDIUM' ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" :
                            "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                          )}>
                            {item.priority}
                          </span>
                        </div>
                        <p className="text-slate-400 mt-1 leading-relaxed">{item.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          ) : (
            <div className="py-16 text-center text-slate-500">
              <AlertTriangle className="size-10 mx-auto mb-2 text-amber-400/60" />
              <p className="text-sm font-bold text-slate-300">Could not generate AI report</p>
              <p className="text-xs text-slate-500 mt-1">Please verify your connection and try again.</p>
            </div>
          )}
        </div>

        {/* =========================================================
            3. FOOTER TELEMETRY STATUS (NO Close Button)
            ========================================================= */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/90 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-mono text-[11px] text-slate-400">
              OptiTrack Autonomous Warehouse Intelligence &bull; Ready for executive sign-off
            </span>
          </div>
          <span className="text-[11px] font-mono text-slate-500">Press ESC or click &times; to close</span>
        </div>

      </div>
    </div>,
    document.body
  );
}
