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
  FileText,
  TrendingUp,
  ShieldCheck,
  AlertTriangle,
  Layers,
  DollarSign,
  Activity,
  Warehouse,
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
}

interface ReportData {
  generated_at: string;
  health_score: number;
  health_grade: string;
  metrics: ReportMetrics;
  zone_breakdown: any[];
  velocity_items: any[];
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
    const textToCopy = `=== OPTITRACK WMS - EXECUTIVE AI OPERATIONS REPORT ===\nGenerated: ${new Date(report.generated_at).toLocaleString()}\nHealth Grade: ${report.health_grade} (${report.health_score}/100)\n\n${report.report_markdown}`;
    navigator.clipboard.writeText(textToCopy);
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
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-md transition-opacity duration-300"
      />

      {/* Modal Dialog (Center Guaranteed via my-auto) */}
      <div className="relative my-auto w-full max-w-4xl rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl shadow-black/80 z-10 flex flex-col max-h-[90vh] overflow-hidden backdrop-blur-xl animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-800 bg-slate-950/50 flex items-start justify-between gap-4">
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
                  Executive v2.0
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                1-Click Autonomous Warehouse Health, Velocity, Space &amp; Financial Analysis
              </p>
            </div>
          </div>

          {/* Action Tools & Top X Close Button */}
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
              title="Copy Report to Clipboard"
            >
              {copied ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={loading || !report}
              className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition-colors disabled:opacity-50 hidden sm:flex"
              title="Print / Save PDF"
            >
              <Printer className="size-4" />
            </button>
            {/* ONLY X Button - per user directive */}
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

        {/* Modal Body Area */}
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
              {/* Executive KPI Score Banner */}
              <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-slate-800/80 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  {/* Health Score Pill */}
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
                  <div className="p-2 rounded-xl bg-slate-950/80 border border-slate-800">
                    <span className="text-[10px] text-slate-500 uppercase">Valuation</span>
                    <p className="font-bold text-emerald-400">{formatCurrency(report.metrics.total_valuation)}</p>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-950/80 border border-slate-800">
                    <span className="text-[10px] text-slate-500 uppercase">Total Stock</span>
                    <p className="font-bold text-white">{report.metrics.total_units.toLocaleString()} pcs</p>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-950/80 border border-slate-800">
                    <span className="text-[10px] text-slate-500 uppercase">Space Used</span>
                    <p className="font-bold text-blue-400">{report.metrics.utilization_pct}%</p>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-950/80 border border-slate-800">
                    <span className="text-[10px] text-slate-500 uppercase">Shortages</span>
                    <p className={cn("font-bold", report.metrics.critical_count > 0 ? "text-rose-400" : "text-slate-300")}>
                      {report.metrics.critical_count} items
                    </p>
                  </div>
                </div>
              </div>

              {/* Main AI Report Narrative */}
              <div className="p-5 sm:p-6 rounded-2xl bg-slate-950/70 border border-slate-800/80 prose prose-invert max-w-none prose-sm">
                <div className="whitespace-pre-line text-xs sm:text-sm text-slate-300 leading-relaxed font-sans space-y-4">
                  {report.report_markdown}
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

        {/* Footer info only (NO Close Button per user directive) */}
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
