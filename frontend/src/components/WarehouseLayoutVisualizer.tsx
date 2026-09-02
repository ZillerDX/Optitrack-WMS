"use client";

import { useState, useMemo } from 'react';
import {
  Layers,
  Box,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Warehouse,
  Search,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Filter,
  X,
  ArrowRight,
  TrendingUp,
  Package,
  Truck,
  Compass,
  Radio,
  Eye,
  ShieldCheck,
  Cpu,
} from 'lucide-react';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { cn } from '@/lib/utils';

export interface LayoutInventoryItem {
  id: number;
  product_id: number;
  location: string;
  quantity: number;
  status: string;
  product?: {
    id: number;
    sku: string;
    name: string;
    category?: string;
    sell_price?: number;
    cost_price?: number;
    min_stock_level?: number;
  };
}

export interface LayoutLocation {
  id: number;
  name: string;
  capacity: string | number;
  description?: string;
}

interface Props {
  locations: LayoutLocation[];
  inventory: LayoutInventoryItem[];
  selectedZone?: string;
  onSelectZone?: (zoneName: string) => void;
  onQuickInbound?: (location: string, productId?: number) => void;
}

interface RackData {
  id: string;
  code: string;
  zone: string;
  rackIndex: number;
  capacity: number;
  used: number;
  pct: number;
  items: LayoutInventoryItem[];
  tiers: {
    tier: number;
    label: string;
    subLabel: string;
    heightName: string;
    bins: {
      bin: string;
      code: string;
      item?: LayoutInventoryItem;
      qty: number;
      isOccupied: boolean;
    }[];
  }[];
}

export function WarehouseLayoutVisualizer({
  locations,
  inventory,
  selectedZone = 'ALL',
  onSelectZone,
  onQuickInbound,
}: Props) {
  const { formatCurrency } = useCurrencyFormatter();
  const [viewMode, setViewMode] = useState<'3D' | '2D'>('3D');
  const [zoomLevel, setZoomLevel] = useState(1);
  const [selectedTierFilter, setSelectedTierFilter] = useState<'ALL' | 1 | 2 | 3>('ALL');
  const [selectedRack, setSelectedRack] = useState<RackData | null>(null);
  const [skuSearch, setSkuSearch] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Active locations to display (filtered or all)
  const activeLocations = useMemo(() => {
    if (selectedZone && selectedZone !== 'ALL') {
      return locations.filter(l => l.name === selectedZone);
    }
    return locations;
  }, [locations, selectedZone]);

  // Overall facility metrics
  const totalFacilityCapacity = useMemo(() => {
    return activeLocations.reduce((sum, l) => sum + (Number(l.capacity) || 0), 0);
  }, [activeLocations]);

  const totalFacilityUsed = useMemo(() => {
    return inventory
      .filter(i => activeLocations.some(l => l.name === i.location))
      .reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
  }, [inventory, activeLocations]);

  const facilityPct = totalFacilityCapacity > 0
    ? Math.min(100, Math.round((totalFacilityUsed / totalFacilityCapacity) * 100))
    : 0;

  // Generate Rack Layouts deterministically based on locations and real inventory
  const racksByZone = useMemo(() => {
    const map = new Map<string, RackData[]>();
    const RACKS_PER_ZONE = 4;

    activeLocations.forEach((loc) => {
      const zoneName = loc.name;
      const zoneCapacity = Number(loc.capacity) || 300;
      const rackCapacity = Math.max(10, Math.round(zoneCapacity / RACKS_PER_ZONE));

      // Find all inventory items in this zone
      const zoneItems = inventory.filter(i => i.location === zoneName);
      const totalZoneQty = zoneItems.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);

      const zoneRacks: RackData[] = [];

      for (let rIdx = 0; rIdx < RACKS_PER_ZONE; rIdx++) {
        const cleanName = zoneName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 5).toUpperCase();
        const rackCode = `${cleanName}-R${rIdx + 1}`;

        let rackItems: LayoutInventoryItem[] = [];
        let rackQty = 0;

        if (zoneItems.length > 0) {
          // If only 1 product or high qty, allocate to first 2 racks
          if (rIdx === 0) {
            rackItems = zoneItems;
            rackQty = Math.min(rackCapacity, totalZoneQty);
          } else if (rIdx === 1 && totalZoneQty > rackCapacity) {
            rackItems = zoneItems;
            rackQty = Math.min(rackCapacity, totalZoneQty - rackCapacity);
          }
        }

        const pct = rackCapacity > 0 ? Math.min(100, Math.round((rackQty / rackCapacity) * 100)) : 0;

        // 3 Industrial Tiers
        const tiers = [
          {
            tier: 3,
            label: 'Tier 3 (High-Bay)',
            subLabel: 'Pallet Buffer Overstock',
            heightName: 'High Elevation (3.8m)',
            bins: [
              {
                bin: 'B1',
                code: `${rackCode}-T3-B1`,
                item: rackItems[0],
                qty: Math.round(rackQty * 0.2),
                isOccupied: Math.round(rackQty * 0.2) > 0,
              },
              {
                bin: 'B2',
                code: `${rackCode}-T3-B2`,
                item: rackItems[1],
                qty: 0,
                isOccupied: false,
              },
            ],
          },
          {
            tier: 2,
            label: 'Tier 2 (Pick-Level)',
            subLabel: 'Active Hand Pick Face',
            heightName: 'Ergonomic Reach (1.8m)',
            bins: [
              {
                bin: 'B1',
                code: `${rackCode}-T2-B1`,
                item: rackItems[0],
                qty: Math.round(rackQty * 0.4),
                isOccupied: Math.round(rackQty * 0.4) > 0,
              },
              {
                bin: 'B2',
                code: `${rackCode}-T2-B2`,
                item: rackItems[1],
                qty: 0,
                isOccupied: false,
              },
            ],
          },
          {
            tier: 1,
            label: 'Tier 1 (Ground Floor)',
            subLabel: 'Heavy-Flow Skid Base',
            heightName: 'Ground Base (0.2m)',
            bins: [
              {
                bin: 'B1',
                code: `${rackCode}-T1-B1`,
                item: rackItems[0],
                qty: Math.round(rackQty * 0.4),
                isOccupied: Math.round(rackQty * 0.4) > 0,
              },
              {
                bin: 'B2',
                code: `${rackCode}-T1-B2`,
                item: rackItems[1],
                qty: 0,
                isOccupied: false,
              },
            ],
          },
        ];

        zoneRacks.push({
          id: `${zoneName}-${rIdx}`,
          code: rackCode,
          zone: zoneName,
          rackIndex: rIdx + 1,
          capacity: rackCapacity,
          used: rackQty,
          pct,
          items: rackItems,
          tiers,
        });
      }

      map.set(zoneName, zoneRacks);
    });

    return map;
  }, [activeLocations, inventory]);

  // Search matching rack highlight
  const isRackMatched = (rack: RackData) => {
    if (!skuSearch.trim()) return false;
    const term = skuSearch.toLowerCase();
    return rack.items.some(
      item =>
        item.product?.sku?.toLowerCase().includes(term) ||
        item.product?.name?.toLowerCase().includes(term)
    );
  };

  const getHeatmapTheme = (pct: number) => {
    if (pct === 0) {
      return {
        fill: 'bg-slate-900/60',
        border: 'border-slate-800',
        text: 'text-slate-500',
        label: 'Empty',
        glow: 'shadow-none',
        beamColor: '#334155',
        boxGlow: 'bg-slate-800/40 border-slate-700/50',
      };
    }
    if (pct <= 30) {
      return {
        fill: 'bg-cyan-950/40',
        border: 'border-cyan-500/40',
        text: 'text-cyan-400',
        label: 'Low',
        glow: 'shadow-lg shadow-cyan-500/10',
        beamColor: '#06b6d4',
        boxGlow: 'bg-cyan-500/20 border-cyan-400/40 text-cyan-300',
      };
    }
    if (pct <= 75) {
      return {
        fill: 'bg-emerald-950/40',
        border: 'border-emerald-500/50',
        text: 'text-emerald-400',
        label: 'Optimal',
        glow: 'shadow-lg shadow-emerald-500/15',
        beamColor: '#10b981',
        boxGlow: 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300',
      };
    }
    if (pct <= 90) {
      return {
        fill: 'bg-amber-950/50',
        border: 'border-amber-500/60',
        text: 'text-amber-400',
        label: 'Near Full',
        glow: 'shadow-lg shadow-amber-500/20',
        beamColor: '#f59e0b',
        boxGlow: 'bg-amber-500/25 border-amber-400/50 text-amber-300',
      };
    }
    return {
      fill: 'bg-rose-950/60',
      border: 'border-rose-500/70',
      text: 'text-rose-400',
      label: 'Critical',
      glow: 'shadow-xl shadow-rose-500/30',
      beamColor: '#f43f5e',
      boxGlow: 'bg-rose-500/30 border-rose-400/60 text-rose-300 animate-pulse',
    };
  };

  return (
    <div className={cn(
      "rounded-3xl border border-slate-800 bg-slate-950 text-slate-100 shadow-2xl overflow-hidden flex flex-col transition-all duration-300 font-sans",
      isFullscreen ? "fixed inset-2 sm:inset-4 z-50" : "relative w-full min-h-[720px]"
    )}>
      {/* 1. TOP TELEMETRY & COMMAND HUD */}
      <div className="p-4 sm:p-5 border-b border-slate-800/80 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Title & Facility Meta */}
        <div className="flex items-center gap-3.5">
          <div className="relative size-11 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 p-0.5 shadow-lg shadow-blue-600/20 flex items-center justify-center">
            <div className="w-full h-full rounded-[14px] bg-slate-950 flex items-center justify-center">
              <Warehouse className="size-5 text-blue-400" />
            </div>
            <div className="absolute -bottom-1 -right-1 size-3.5 rounded-full bg-emerald-500 border-2 border-slate-950 animate-ping" />
            <div className="absolute -bottom-1 -right-1 size-3.5 rounded-full bg-emerald-500 border-2 border-slate-950" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base sm:text-lg font-black text-white tracking-tight">
                OptiTrack Warehouse Digital Twin
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20">
                SCADA v2.4
              </span>
            </div>
            <p className="text-xs text-slate-400 flex items-center gap-2">
              <span>Interactive Racks, Shelves, Bins &amp; Heatmap</span>
              <span className="text-slate-600">•</span>
              <span className="text-emerald-400 font-mono text-[11px] font-bold">Telemetry Live</span>
            </p>
          </div>
        </div>

        {/* Live Facility Telemetry Badges */}
        <div className="flex items-center flex-wrap gap-2.5">
          {/* Facility Utilization Ring Gauge */}
          <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 font-mono">
            <div className="relative size-6 flex items-center justify-center">
              <svg className="size-full -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-slate-800"
                  strokeWidth="3.5"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className={facilityPct > 90 ? "text-rose-500" : facilityPct > 75 ? "text-amber-500" : "text-emerald-400"}
                  strokeDasharray={`${facilityPct}, 100`}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
            </div>
            <div className="text-left">
              <p className="text-[9px] uppercase tracking-wider text-slate-400 font-sans">Utilization</p>
              <p className="text-xs font-bold text-white leading-none">
                {facilityPct}% <span className="text-[10px] text-slate-400 font-normal">({totalFacilityUsed}/{totalFacilityCapacity})</span>
              </p>
            </div>
          </div>

          {/* 2D / 3D Mode Toggle */}
          <div className="flex items-center p-1 rounded-xl bg-slate-900 border border-slate-800 shadow-inner">
            <button
              type="button"
              onClick={() => setViewMode('3D')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5",
                viewMode === '3D' ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md" : "text-slate-400 hover:text-white"
              )}
            >
              <Box className="size-3.5" />
              <span>3D Isometric</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('2D')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5",
                viewMode === '2D' ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md" : "text-slate-400 hover:text-white"
              )}
            >
              <Layers className="size-3.5" />
              <span>2D CAD Grid</span>
            </button>
          </div>

          {/* SKU Finder */}
          <div className="relative">
            <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search SKU or Item..."
              value={skuSearch}
              onChange={(e) => setSkuSearch(e.target.value)}
              className="h-9 w-36 sm:w-44 pl-8 pr-3 text-xs bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Zoom controls */}
          <div className="flex items-center p-1 rounded-xl bg-slate-900 border border-slate-800">
            <button
              type="button"
              onClick={() => setZoomLevel(prev => Math.min(1.4, prev + 0.1))}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors"
              title="Zoom In"
            >
              <ZoomIn className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoomLevel(prev => Math.max(0.7, prev - 0.1))}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors"
              title="Zoom Out"
            >
              <ZoomOut className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoomLevel(1)}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors"
              title="Reset View"
            >
              <RotateCcw className="size-3.5" />
            </button>
          </div>

          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={() => setIsFullscreen(prev => !prev)}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
        </div>
      </div>

      {/* 2. ZONE QUICK SWITCHER & HEATMAP SUB-HEADER */}
      <div className="px-5 py-2.5 border-b border-slate-800/60 bg-slate-950/70 flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Zone Selector Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mr-1 flex items-center gap-1">
            <Filter className="size-3" />
            <span>Zone:</span>
          </span>
          <button
            type="button"
            onClick={() => onSelectZone && onSelectZone('ALL')}
            className={cn(
              "px-2.5 py-1 rounded-lg text-xs font-bold transition-all shrink-0",
              selectedZone === 'ALL'
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
            )}
          >
            All Facility Zones ({locations.length})
          </button>
          {locations.map((loc) => {
            const isSel = selectedZone === loc.name;
            return (
              <button
                key={loc.id}
                type="button"
                onClick={() => onSelectZone && onSelectZone(loc.name)}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-bold transition-all shrink-0 flex items-center gap-1.5",
                  isSel
                    ? "bg-blue-600 text-white shadow-sm"
                    : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
                )}
              >
                <span>{loc.name}</span>
              </button>
            );
          })}
        </div>

        {/* Tier Filter & Heatmap Legend */}
        <div className="flex items-center gap-4">
          {/* Tier Level Selector */}
          <div className="hidden sm:flex items-center gap-1 text-[11px] text-slate-400">
            <span className="text-slate-500 font-bold uppercase text-[9px]">Level:</span>
            {(['ALL', 3, 2, 1] as const).map((tVal) => (
              <button
                key={tVal}
                type="button"
                onClick={() => setSelectedTierFilter(tVal)}
                className={cn(
                  "px-2 py-0.5 rounded font-mono font-bold transition-all",
                  selectedTierFilter === tVal
                    ? "bg-indigo-600 text-white"
                    : "text-slate-400 hover:text-white bg-slate-900 border border-slate-800"
                )}
              >
                {tVal === 'ALL' ? 'All Tiers' : `T${tVal}`}
              </button>
            ))}
          </div>

          {/* Heatmap Legend */}
          <div className="flex items-center gap-2 text-[10px] font-mono">
            <span className="text-slate-500 font-bold uppercase flex items-center gap-1">
              <Flame className="size-3 text-amber-400" />
              <span>Heatmap:</span>
            </span>
            <span className="flex items-center gap-1 text-slate-400">
              <span className="size-2 rounded-full bg-slate-700" /> 0%
            </span>
            <span className="flex items-center gap-1 text-cyan-400">
              <span className="size-2 rounded-full bg-cyan-400" /> &le;30%
            </span>
            <span className="flex items-center gap-1 text-emerald-400">
              <span className="size-2 rounded-full bg-emerald-400" /> 31-75%
            </span>
            <span className="flex items-center gap-1 text-amber-400">
              <span className="size-2 rounded-full bg-amber-400" /> 76-90%
            </span>
            <span className="flex items-center gap-1 text-rose-400">
              <span className="size-2 rounded-full bg-rose-400 animate-pulse" /> &gt;90%
            </span>
          </div>
        </div>
      </div>

      {/* 3. ARCHITECTURAL WAREHOUSE FLOOR CANVAS */}
      <div className="relative flex-1 bg-slate-950 overflow-hidden flex items-center justify-center p-6 min-h-[580px]">
        {/* Subtle CAD / Blueprint Floor Grid */}
        <div
          className="absolute inset-0 pointer-events-none opacity-25"
          style={{
            backgroundImage: viewMode === '2D'
              ? `linear-gradient(to right, rgba(56, 189, 248, 0.15) 1px, transparent 1px), linear-gradient(to bottom, rgba(56, 189, 248, 0.15) 1px, transparent 1px)`
              : `radial-gradient(circle at 1px 1px, rgba(148, 163, 184, 0.3) 1px, transparent 0)`,
            backgroundSize: viewMode === '2D' ? '28px 28px' : '32px 32px',
          }}
        />

        {/* Industrial North Wall: Inbound / Outbound Dock Doors */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2.5 z-10">
          <div className="px-4 py-1.5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl backdrop-blur-md flex items-center gap-4 text-xs font-mono">
            <div className="flex items-center gap-2 text-emerald-400 font-bold">
              <Truck className="size-4" />
              <span>DOCK GATES 01 - 04</span>
              <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <div className="h-3 w-px bg-slate-800" />
            <span className="text-[11px] text-slate-400">MAIN FORKLIFT TRANSIT AISLE</span>
            <div className="h-3 w-px bg-slate-800" />
            <div className="flex items-center gap-1 text-slate-500 text-[10px]">
              <Compass className="size-3" />
              <span>NORTH FACING</span>
            </div>
          </div>
        </div>

        {/* Main Warehouse Floor Layout with Dynamic Zoom */}
        <div
          className="transition-transform duration-300 ease-out flex flex-col items-center justify-center gap-12 w-full max-w-6xl py-8"
          style={{ transform: `scale(${zoomLevel})` }}
        >
          {activeLocations.length === 0 ? (
            <div className="text-center py-20 text-slate-500">
              <Warehouse className="size-16 mx-auto mb-3 opacity-30 text-slate-400" />
              <p className="text-base font-bold text-slate-300">No Warehouse Locations Configured</p>
              <p className="text-xs text-slate-500 mt-1">Create a location to render the interactive layout.</p>
            </div>
          ) : (
            Array.from(racksByZone.entries()).map(([zoneName, racks]) => {
              const zoneUsed = racks.reduce((sum, r) => sum + r.used, 0);
              const zoneCap = racks.reduce((sum, r) => sum + r.capacity, 0);
              const zonePct = zoneCap > 0 ? Math.min(100, Math.round((zoneUsed / zoneCap) * 100)) : 0;
              const isCold = zoneName.toLowerCase().includes('cold') || zoneName.toLowerCase().includes('freeze');

              return (
                <div
                  key={zoneName}
                  className={cn(
                    "relative w-full rounded-3xl p-6 transition-all duration-300 border",
                    isCold
                      ? "bg-cyan-950/20 border-cyan-500/30 shadow-2xl shadow-cyan-950/20"
                      : "bg-slate-900/30 border-slate-800/80 shadow-2xl"
                  )}
                >
                  {/* Zone Perimeter Header Ribbon */}
                  <div className="flex items-center justify-between mb-6 pb-3 border-b border-slate-800/80">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "size-3 rounded-full",
                        isCold ? "bg-cyan-400 animate-pulse" : "bg-blue-500"
                      )} />
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-mono font-black tracking-wide text-white uppercase">
                            ZONE: {zoneName}
                          </h4>
                          {isCold && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                              -20&deg;C COLD VAULT
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                          Total Storage Payload: <strong className="text-white">{zoneUsed}</strong> / {zoneCap} units ({zonePct}%)
                        </p>
                      </div>
                    </div>

                    {/* Industrial Hazard Stripe Badge */}
                    <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-xl bg-slate-950 border border-slate-800 text-[10px] font-mono text-slate-400">
                      <span className="inline-block size-2 rounded-full bg-amber-400" />
                      <span>CLEARANCE AISLE 3.5M</span>
                    </div>
                  </div>

                  {/* Racks Grid within this Zone */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {racks.map((rack) => {
                      const theme = getHeatmapTheme(rack.pct);
                      const isSelected = selectedRack?.id === rack.id;
                      const isMatched = isRackMatched(rack);

                      return (
                        <div
                          key={rack.id}
                          onClick={() => setSelectedRack(rack)}
                          className={cn(
                            "cursor-pointer group select-none transition-all duration-300 relative",
                            isSelected && "scale-[1.03]"
                          )}
                        >
                          {/* Highlight Spotlight if SKU Search matches */}
                          {isMatched && (
                            <div className="absolute -inset-2.5 rounded-3xl bg-blue-500/20 border-2 border-blue-400 animate-pulse z-20 pointer-events-none shadow-lg shadow-blue-500/30" />
                          )}

                          {/* =========================================
                              VIEW 1: PRO-GRADE 3D ISOMETRIC RACK MODEL
                              ========================================= */}
                          {viewMode === '3D' ? (
                            <div
                              className={cn(
                                "relative rounded-2xl p-4 border transition-all duration-300 backdrop-blur-md overflow-hidden",
                                theme.fill,
                                isSelected
                                  ? "border-blue-500 ring-2 ring-blue-500/50 shadow-2xl shadow-blue-500/20 -translate-y-2"
                                  : `${theme.border} hover:-translate-y-1.5 hover:shadow-xl`
                              )}
                              style={{
                                transform: 'rotateX(22deg) rotateZ(-6deg)',
                                transformStyle: 'preserve-3d',
                              }}
                            >
                              {/* Industrial Steel Frame Pillars (Left & Right Upright Columns) */}
                              <div className="absolute top-2 bottom-2 left-1.5 w-1 bg-gradient-to-b from-blue-500 via-blue-600 to-slate-800 rounded-full opacity-60" />
                              <div className="absolute top-2 bottom-2 right-1.5 w-1 bg-gradient-to-b from-blue-500 via-blue-600 to-slate-800 rounded-full opacity-60" />

                              {/* Rack Header Bar */}
                              <div className="flex items-center justify-between mb-3 pl-1.5 pr-1.5">
                                <div className="flex items-center gap-1.5">
                                  <div className="size-2 rounded-full bg-blue-400" />
                                  <span className="text-xs font-mono font-black text-white tracking-wider">{rack.code}</span>
                                </div>
                                <span className={cn(
                                  "text-[10px] font-mono font-black px-2 py-0.5 rounded-md border",
                                  theme.text,
                                  theme.border,
                                  theme.fill
                                )}>
                                  {rack.pct}%
                                </span>
                              </div>

                              {/* 3-Tier Isometric Shelf Decks */}
                              <div className="space-y-2 my-2 px-1">
                                {rack.tiers
                                  .filter(t => selectedTierFilter === 'ALL' || selectedTierFilter === t.tier)
                                  .map((t) => (
                                    <div
                                      key={t.tier}
                                      className="p-2 rounded-xl bg-slate-950/80 border border-slate-800/90 relative group-hover:border-slate-700 transition-colors"
                                    >
                                      {/* Deck Structural Beam */}
                                      <div className="flex items-center justify-between text-[9px] font-mono text-slate-400 mb-1.5">
                                        <span className="font-bold text-slate-300">T{t.tier}</span>
                                        <span className="text-[9px] text-slate-500">{t.subLabel}</span>
                                      </div>

                                      {/* 3D Pallet Crates / Cargo Slots */}
                                      <div className="grid grid-cols-2 gap-1.5">
                                        {t.bins.map((bin) => (
                                          <div
                                            key={bin.bin}
                                            className={cn(
                                              "h-7 rounded-lg border flex items-center justify-between px-2 text-[10px] font-mono transition-all",
                                              bin.isOccupied
                                                ? theme.boxGlow
                                                : "bg-slate-900/60 border-slate-800 text-slate-600"
                                            )}
                                          >
                                            <span className="text-[9px]">{bin.bin}</span>
                                            {bin.isOccupied ? (
                                              <span className="font-bold font-mono text-[10px]">{bin.qty} pcs</span>
                                            ) : (
                                              <span className="text-[8px] uppercase tracking-widest text-slate-600">MT</span>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                              </div>

                              {/* Rack Base Floor Plate / Capacity Meter */}
                              <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono text-slate-400 px-1">
                                <span>Payload:</span>
                                <span className="font-bold text-white font-mono">
                                  {rack.used} <span className="text-slate-500 font-normal">/ {rack.capacity}</span>
                                </span>
                              </div>
                            </div>
                          ) : (
                            /* =========================================
                               VIEW 2: HIGH-TECH 2D CAD ARCHITECTURAL GRID
                               ========================================= */
                            <div
                              className={cn(
                                "rounded-2xl p-4 border transition-all duration-200 shadow-md",
                                theme.fill,
                                isSelected
                                  ? "border-blue-500 ring-2 ring-blue-500/40 scale-[1.02]"
                                  : `${theme.border} hover:border-blue-400`
                              )}
                            >
                              {/* CAD Blueprint Header */}
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-mono font-bold text-white tracking-tight">{rack.code}</span>
                                <span className={cn("text-[10px] font-mono font-bold", theme.text)}>
                                  {rack.pct}%
                                </span>
                              </div>

                              {/* Technical Blueprint Slot Matrix */}
                              <div className="grid grid-cols-2 gap-1.5 my-2.5 p-1.5 bg-slate-950 rounded-xl border border-slate-800/90 font-mono text-[9px]">
                                <div className={cn("p-1.5 rounded text-center border", rack.pct > 75 ? "bg-amber-500/20 border-amber-500/40 text-amber-300" : rack.pct > 0 ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300" : "bg-slate-900 border-slate-800 text-slate-600")}>
                                  T3-HIGH
                                </div>
                                <div className={cn("p-1.5 rounded text-center border", rack.pct > 75 ? "bg-amber-500/20 border-amber-500/40 text-amber-300" : rack.pct > 0 ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300" : "bg-slate-900 border-slate-800 text-slate-600")}>
                                  T3-RESV
                                </div>
                                <div className={cn("p-1.5 rounded text-center border", rack.pct > 30 ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300" : "bg-slate-900 border-slate-800 text-slate-600")}>
                                  T2-PICK
                                </div>
                                <div className={cn("p-1.5 rounded text-center border", rack.pct > 30 ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300" : "bg-slate-900 border-slate-800 text-slate-600")}>
                                  T1-BASE
                                </div>
                              </div>

                              {/* Progress bar */}
                              <div className="w-full h-2 rounded-full bg-slate-950 border border-slate-800 overflow-hidden mb-2">
                                <div
                                  className={cn(
                                    "h-full rounded-full transition-all duration-500",
                                    rack.pct > 90 ? "bg-rose-500" :
                                    rack.pct > 75 ? "bg-amber-500" :
                                    rack.pct > 30 ? "bg-emerald-500" :
                                    rack.pct > 0 ? "bg-cyan-500" : "bg-transparent"
                                  )}
                                  style={{ width: `${rack.pct}%` }}
                                />
                              </div>

                              <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                                <span>Density Units:</span>
                                <span className="font-bold text-white">{rack.used} / {rack.capacity}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* =========================================
            SLIDE-OUT RACK INSPECTION DRAWER
            ========================================= */}
        {selectedRack && (
          <div className="absolute right-4 top-4 bottom-4 w-80 sm:w-96 rounded-3xl bg-slate-900/95 border border-slate-800 shadow-2xl backdrop-blur-2xl p-5 flex flex-col justify-between z-30 animate-in slide-in-from-right-5 duration-200">
            <div>
              {/* Drawer Header */}
              <div className="flex items-start justify-between pb-4 border-b border-slate-800">
                <div>
                  <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-widest text-blue-400">
                    <Radio className="size-3 animate-pulse text-blue-400" />
                    <span>Telemetry Inspector</span>
                  </div>
                  <h4 className="text-xl font-black text-white mt-0.5 tracking-tight font-mono">
                    {selectedRack.code}
                  </h4>
                  <p className="text-xs text-slate-400">
                    Zone: <span className="text-slate-200 font-bold">{selectedRack.zone}</span> &bull; Bay #{selectedRack.rackIndex}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedRack(null)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  <X className="size-4" />
                </button>
              </div>

              {/* Real-time Occupancy Gauge */}
              <div className="my-4 p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800">
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="text-slate-400 font-medium">Rack Occupancy Density</span>
                  <span className="font-mono font-black text-sm text-white">{selectedRack.pct}%</span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-slate-900 border border-slate-800 overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-300",
                      selectedRack.pct > 90 ? "bg-rose-500" :
                      selectedRack.pct > 75 ? "bg-amber-500" :
                      selectedRack.pct > 30 ? "bg-emerald-500" :
                      selectedRack.pct > 0 ? "bg-cyan-500" : "bg-transparent"
                    )}
                    style={{ width: `${selectedRack.pct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mt-2.5">
                  <span>Current: <strong className="text-white">{selectedRack.used} units</strong></span>
                  <span>Capacity: <strong className="text-white">{selectedRack.capacity} units</strong></span>
                </div>
              </div>

              {/* Shelf Tiers Structural Breakdown */}
              <div className="space-y-2 mb-4">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Cpu className="size-3 text-indigo-400" />
                  <span>Shelf Tier Breakdown (T1 - T3)</span>
                </span>
                {selectedRack.tiers.map((t) => (
                  <div key={t.tier} className="p-2.5 rounded-xl bg-slate-950/50 border border-slate-800/80 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-200">{t.label}</p>
                      <p className="text-[10px] font-mono text-slate-500">{t.heightName}</p>
                    </div>
                    <div className="text-right font-mono">
                      <span className="text-xs font-bold text-emerald-400">
                        {t.bins.reduce((sum, b) => sum + b.qty, 0)} pcs
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Stored Product Items */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Stored SKU Manifest ({selectedRack.items.length})
                </span>

                {selectedRack.items.length === 0 ? (
                  <div className="text-center py-5 px-3 rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 text-slate-500 text-xs">
                    No registered inventory records in this rack bay.
                  </div>
                ) : (
                  <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                    {selectedRack.items.map((item) => (
                      <div key={item.id} className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-white line-clamp-1">{item.product?.name || `Product #${item.product_id}`}</p>
                          <p className="text-[10px] font-mono text-slate-400">SKU: {item.product?.sku || 'N/A'}</p>
                        </div>
                        <div className="text-right shrink-0 font-mono">
                          <span className="text-xs font-bold text-indigo-400">{item.quantity} pcs</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Quick Inbound Shortcut Button */}
            <div className="pt-4 border-t border-slate-800 space-y-2">
              <button
                type="button"
                onClick={() => {
                  if (onQuickInbound) {
                    onQuickInbound(selectedRack.zone, selectedRack.items[0]?.product_id);
                  }
                }}
                className="w-full h-10 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-600/20"
              >
                <Package className="size-4" />
                <span>Quick Inbound to this Rack</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 4. FOOTER TELEMETRY STATUS */}
      <div className="px-4 py-2.5 border-t border-slate-800 bg-slate-950 flex flex-wrap items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-mono text-[11px]">Synced with Supabase Live Data stream</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] font-mono text-slate-500">
          <span>Click any rack for deep telemetry inspection</span>
        </div>
      </div>
    </div>
  );
}
