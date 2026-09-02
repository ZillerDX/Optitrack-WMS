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
  x: number;
  y: number;
  width: number;
  height: number;
  capacity: number;
  used: number;
  pct: number;
  items: LayoutInventoryItem[];
  tiers: { tier: number; label: string; bins: { bin: string; item?: LayoutInventoryItem; qty: number }[] }[];
}

export function WarehouseLayoutVisualizer({
  locations,
  inventory,
  selectedZone = 'ALL',
  onSelectZone,
  onQuickInbound,
}: Props) {
  const { formatCurrency } = useCurrencyFormatter();
  const [viewMode, setViewMode] = useState<'2D' | '3D'>('3D');
  const [zoomLevel, setZoomLevel] = useState(1);
  const [heatmapMode, setHeatmapMode] = useState<'density' | 'status'>('density');
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

  // Generate Rack Layouts deterministically based on locations and inventory
  const racks = useMemo(() => {
    const generated: RackData[] = [];
    const RACKS_PER_ZONE = 4; // Each zone has 4 visual rack structures (e.g. Rack A1..A4)

    activeLocations.forEach((loc, zoneIdx) => {
      const zoneName = loc.name;
      const zoneCapacity = Number(loc.capacity) || 300;
      const rackCapacity = Math.round(zoneCapacity / RACKS_PER_ZONE);

      // Find all inventory items located in this zone
      const zoneItems = inventory.filter(i => i.location === zoneName);
      const totalZoneQty = zoneItems.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);

      // Distribute items across racks in this zone
      for (let rIdx = 0; rIdx < RACKS_PER_ZONE; rIdx++) {
        const rackCode = `${zoneName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 5)}-R${rIdx + 1}`;
        
        // Split zone quantity and assign relevant items
        let rackItems: LayoutInventoryItem[] = [];
        let rackQty = 0;

        if (zoneItems.length > 0) {
          // If first rack, assign the dominant item
          if (rIdx === 0) {
            rackItems = zoneItems;
            rackQty = totalZoneQty;
          }
        }

        const pct = rackCapacity > 0 ? Math.min(100, Math.round((rackQty / rackCapacity) * 100)) : 0;

        // Generate 3 visual shelf tiers (Tier 1 = Ground, Tier 2 = Mid, Tier 3 = Top)
        const tiers = [
          {
            tier: 3,
            label: 'Tier 3 (Upper High-Bay)',
            bins: [
              { bin: 'B1', item: rackItems[0], qty: Math.round(rackQty * 0.2) },
              { bin: 'B2', item: rackItems[1], qty: 0 },
            ],
          },
          {
            tier: 2,
            label: 'Tier 2 (Mid Pick-Level)',
            bins: [
              { bin: 'B1', item: rackItems[0], qty: Math.round(rackQty * 0.4) },
              { bin: 'B2', item: rackItems[1], qty: 0 },
            ],
          },
          {
            tier: 1,
            label: 'Tier 1 (Ground Heavy-Flow)',
            bins: [
              { bin: 'B1', item: rackItems[0], qty: Math.round(rackQty * 0.4) },
              { bin: 'B2', item: rackItems[1], qty: 0 },
            ],
          },
        ];

        // Grid coordinates for positioning
        const col = (zoneIdx * 2) + (rIdx % 2);
        const row = Math.floor(rIdx / 2);

        generated.push({
          id: `${zoneName}-${rIdx}`,
          code: rackCode,
          zone: zoneName,
          x: col * 180 + 40,
          y: row * 160 + 60,
          width: 140,
          height: 110,
          capacity: rackCapacity,
          used: rackQty,
          pct,
          items: rackItems,
          tiers,
        });
      }
    });

    return generated;
  }, [activeLocations, inventory]);

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

  const getHeatmapColor = (pct: number) => {
    if (pct === 0) return { fill: 'bg-slate-900/80', border: 'border-slate-800', text: 'text-slate-500', label: 'Empty' };
    if (pct <= 30) return { fill: 'bg-cyan-950/40', border: 'border-cyan-500/40', text: 'text-cyan-400', label: 'Low Density' };
    if (pct <= 75) return { fill: 'bg-emerald-950/40', border: 'border-emerald-500/50', text: 'text-emerald-400', label: 'Optimal' };
    if (pct <= 90) return { fill: 'bg-amber-950/40', border: 'border-amber-500/60', text: 'text-amber-400', label: 'Near Full' };
    return { fill: 'bg-rose-950/50', border: 'border-rose-500/70', text: 'text-rose-400', label: 'Critical' };
  };

  return (
    <div className={cn(
      "rounded-3xl border border-slate-800 bg-slate-950/90 backdrop-blur-xl overflow-hidden flex flex-col transition-all duration-300",
      isFullscreen ? "fixed inset-3 z-50 shadow-2xl" : "relative w-full h-[660px]"
    )}>
      {/* Top Header Bar */}
      <div className="p-4 sm:p-5 border-b border-slate-800/80 bg-slate-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
            <Warehouse className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white tracking-tight">Interactive Warehouse Layout</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20">
                Visual Grid
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Storage Racks, Shelves, Bins & Real-time Density Heatmap
            </p>
          </div>
        </div>

        {/* View Switchers & Controls */}
        <div className="flex items-center flex-wrap gap-2">
          {/* 2D / 3D Toggle */}
          <div className="flex items-center p-1 rounded-xl bg-slate-950 border border-slate-800">
            <button
              type="button"
              onClick={() => setViewMode('2D')}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5",
                viewMode === '2D' ? "bg-blue-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
              )}
            >
              <Layers className="size-3.5" />
              <span>2D Grid</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('3D')}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5",
                viewMode === '3D' ? "bg-blue-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
              )}
            >
              <Box className="size-3.5" />
              <span>3D Isometric</span>
            </button>
          </div>

          {/* SKU Finder */}
          <div className="relative">
            <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Highlight SKU / Item..."
              value={skuSearch}
              onChange={(e) => setSkuSearch(e.target.value)}
              className="h-9 w-40 sm:w-48 pl-8 pr-3 text-xs bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Zoom controls */}
          <div className="flex items-center p-1 rounded-xl bg-slate-950 border border-slate-800">
            <button
              type="button"
              onClick={() => setZoomLevel(prev => Math.min(1.5, prev + 0.1))}
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
              title="Reset Zoom"
            >
              <RotateCcw className="size-3.5" />
            </button>
          </div>

          {/* Fullscreen toggle */}
          <button
            type="button"
            onClick={() => setIsFullscreen(prev => !prev)}
            className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white transition-colors"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
        </div>
      </div>

      {/* Facility Subheader & Heatmap Legend */}
      <div className="px-5 py-2.5 border-b border-slate-800/60 bg-slate-950/60 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Total Utilization:</span>
            <span className="font-mono font-bold text-white">{totalFacilityUsed.toLocaleString()} / {totalFacilityCapacity.toLocaleString()} items</span>
            <span className={cn(
              "px-2 py-0.2 rounded font-mono font-bold text-[10px]",
              facilityPct > 90 ? "bg-rose-500/20 text-rose-400" :
              facilityPct > 75 ? "bg-amber-500/20 text-amber-400" :
              "bg-emerald-500/20 text-emerald-400"
            )}>
              {facilityPct}%
            </span>
          </div>

          <div className="hidden md:flex items-center gap-1.5 text-slate-400">
            <span>Viewing:</span>
            <span className="font-bold text-blue-400">{selectedZone === 'ALL' ? 'All Facility Zones' : selectedZone}</span>
          </div>
        </div>

        {/* Heatmap Legend */}
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
            <Flame className="size-3 text-amber-400" />
            <span>Heatmap:</span>
          </span>
          <div className="flex items-center gap-2 text-[10px] font-mono">
            <span className="flex items-center gap-1 text-slate-400">
              <span className="size-2 rounded-full bg-slate-700" /> 0% Empty
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

      {/* Main Visual Canvas Area */}
      <div className="relative flex-1 bg-slate-950 overflow-hidden flex items-center justify-center p-4">
        {/* Subtle architectural grid pattern */}
        <div 
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, rgba(148, 163, 184, 0.25) 1px, transparent 0)`,
            backgroundSize: '24px 24px',
          }}
        />

        {/* Loading Dock Indicator (North Wall) */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-slate-900/90 border border-slate-800 text-[10px] font-mono uppercase tracking-widest text-slate-400 flex items-center gap-2 shadow-lg">
          <div className="size-2 rounded-full bg-emerald-400 animate-ping" />
          <span>Inbound & Outbound Dock Gates 01 - 04</span>
        </div>

        {/* Interactive Racks Container with Zoom Transform */}
        <div 
          className="transition-transform duration-200 ease-out flex flex-wrap items-center justify-center gap-6 max-w-5xl"
          style={{ transform: `scale(${zoomLevel})` }}
        >
          {racks.length === 0 ? (
            <div className="text-center py-20 text-slate-500">
              <Warehouse className="size-12 mx-auto mb-2 opacity-40" />
              <p className="text-sm font-semibold">No warehouse zones configured</p>
              <p className="text-xs text-slate-600 mt-1">Create a location to view the interactive layout</p>
            </div>
          ) : (
            racks.map((rack) => {
              const theme = getHeatmapColor(rack.pct);
              const isSelected = selectedRack?.id === rack.id;
              const isMatched = isRackMatched(rack);

              return (
                <div
                  key={rack.id}
                  onClick={() => setSelectedRack(rack)}
                  className={cn(
                    "cursor-pointer transition-all duration-300 relative select-none group",
                    viewMode === '3D' ? "perspective-800" : ""
                  )}
                >
                  {/* Highlight Ring if searched */}
                  {isMatched && (
                    <div className="absolute -inset-2 rounded-3xl bg-blue-500/30 border-2 border-blue-400 animate-pulse z-10 pointer-events-none" />
                  )}

                  {/* 3D Isometric Projection Card */}
                  {viewMode === '3D' ? (
                    <div 
                      className={cn(
                        "w-44 p-3.5 rounded-2xl border transition-all duration-300 shadow-xl",
                        "hover:-translate-y-2 hover:shadow-2xl hover:shadow-blue-500/10",
                        theme.fill,
                        isSelected
                          ? "border-blue-500 ring-2 ring-blue-500/40 shadow-blue-500/20"
                          : theme.border
                      )}
                      style={{
                        transform: 'rotateX(20deg) rotateZ(-6deg)',
                        transformStyle: 'preserve-3d',
                      }}
                    >
                      {/* Rack Top Face */}
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-mono font-black text-white">{rack.code}</span>
                        <span className={cn("text-[10px] font-mono font-bold px-1.5 py-0.5 rounded", theme.text)}>
                          {rack.pct}%
                        </span>
                      </div>

                      {/* 3-Tier Isometric Shelf Visualizer */}
                      <div className="space-y-1.5 my-2">
                        {rack.tiers.map((t) => (
                          <div 
                            key={t.tier}
                            className="h-4 rounded bg-slate-950/80 border border-slate-800/80 flex items-center justify-between px-1.5 text-[9px] font-mono"
                          >
                            <span className="text-slate-500">T{t.tier}</span>
                            <div className="flex items-center gap-1">
                              {t.bins.map((b, bIdx) => (
                                <span 
                                  key={bIdx}
                                  className={cn(
                                    "size-2.5 rounded-sm transition-colors",
                                    b.qty > 0 
                                      ? (rack.pct > 75 ? "bg-amber-400" : "bg-emerald-400") 
                                      : "bg-slate-800"
                                  )}
                                  title={`${b.bin}: ${b.qty} items`}
                                />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Rack Bottom / Capacity Bar */}
                      <div className="mt-2.5 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                        <span className="truncate max-w-[80px]">{rack.zone}</span>
                        <span className="font-bold text-white">{rack.used}/{rack.capacity}</span>
                      </div>
                    </div>
                  ) : (
                    /* 2D Top-Down Blueprint Grid */
                    <div 
                      className={cn(
                        "w-40 p-3 rounded-2xl border transition-all duration-200 shadow-md",
                        "hover:border-blue-400 hover:scale-[1.02]",
                        theme.fill,
                        isSelected ? "border-blue-500 ring-2 ring-blue-500/40" : theme.border
                      )}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-mono font-bold text-white">{rack.code}</span>
                        <span className={cn("text-[10px] font-mono font-bold", theme.text)}>
                          {rack.pct}%
                        </span>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full h-2 rounded-full bg-slate-950 border border-slate-800/80 overflow-hidden my-2">
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

                      <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mt-1">
                        <span className="truncate max-w-[70px]">{rack.zone}</span>
                        <span className="text-white font-bold">{rack.used} units</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Selected Rack Inspector Drawer */}
        {selectedRack && (
          <div className="absolute right-4 top-4 bottom-4 w-80 sm:w-96 rounded-3xl bg-slate-900/95 border border-slate-800 shadow-2xl backdrop-blur-2xl p-5 flex flex-col justify-between z-30 animate-in slide-in-from-right-4 duration-200">
            <div>
              {/* Drawer Header */}
              <div className="flex items-start justify-between pb-4 border-b border-slate-800">
                <div>
                  <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-blue-400">
                    Rack Inspection Module
                  </span>
                  <h4 className="text-lg font-black text-white mt-0.5 tracking-tight">{selectedRack.code}</h4>
                  <p className="text-xs text-slate-400">Zone: <span className="text-slate-200 font-bold">{selectedRack.zone}</span></p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedRack(null)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  <X className="size-4" />
                </button>
              </div>

              {/* Utilization Bar */}
              <div className="my-4 p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-slate-400">Occupancy Density</span>
                  <span className="font-mono font-bold text-white">{selectedRack.pct}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-900 overflow-hidden">
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
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mt-2">
                  <span>Current: <strong className="text-white">{selectedRack.used}</strong></span>
                  <span>Max Capacity: <strong className="text-white">{selectedRack.capacity}</strong></span>
                </div>
              </div>

              {/* Shelf Tiers Breakdown */}
              <div className="space-y-2 mb-4">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Shelf Tier Architecture
                </span>
                {selectedRack.tiers.map((t) => (
                  <div key={t.tier} className="p-2.5 rounded-xl bg-slate-950/40 border border-slate-800/60 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-200">{t.label}</p>
                      <p className="text-[10px] font-mono text-slate-500">2 Storage Bins Available</p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-mono font-bold text-emerald-400">
                        {t.bins.reduce((sum, b) => sum + b.qty, 0)} pcs
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Stored Product Items */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Stored Products in Rack ({selectedRack.items.length})
                </span>

                {selectedRack.items.length === 0 ? (
                  <p className="text-xs text-slate-500 italic py-2">No active items registered in this rack.</p>
                ) : (
                  <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                    {selectedRack.items.map((item) => (
                      <div key={item.id} className="p-2 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-white line-clamp-1">{item.product?.name || `Product #${item.product_id}`}</p>
                          <p className="text-[10px] font-mono text-slate-400">SKU: {item.product?.sku || 'N/A'}</p>
                        </div>
                        <span className="text-xs font-mono font-bold text-indigo-400 shrink-0">
                          {item.quantity} pcs
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div className="pt-4 border-t border-slate-800 space-y-2">
              <button
                type="button"
                onClick={() => {
                  if (onQuickInbound) {
                    onQuickInbound(selectedRack.zone, selectedRack.items[0]?.product_id);
                  }
                }}
                className="w-full h-10 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-blue-600/20"
              >
                <Package className="size-4" />
                <span>Quick Inbound to this Rack</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="px-4 py-2.5 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-blue-400 animate-pulse" />
          <span>Interactive 2D/3D Warehouse Grid synced with Supabase inventory</span>
        </div>
        <span className="text-[11px] font-mono text-slate-500">Click any rack for shelf & bin details</span>
      </div>
    </div>
  );
}
