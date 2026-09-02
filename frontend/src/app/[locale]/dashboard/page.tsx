"use client";

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { 
  Package, 
  TrendingUp, 
  AlertTriangle, 
  Activity, 
  ArrowUpRight, 
  ArrowDownRight, 
  LayoutDashboard, 
  Clock, 
  X, 
  LineChart as LineChartIcon, 
  PieChart as PieChartIcon, 
  BarChart3,
  Warehouse,
  ShieldAlert,
  ArrowRight,
  Sparkles
} from 'lucide-react';
import { AIAnalyseReportModal } from '@/components/AIAnalyseReportModal';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  PieChart, 
  Pie, 
  Cell,
  type TooltipProps
} from 'recharts';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { 
  format, 
  subDays, 
  isWithinInterval, 
  parseISO, 
  eachDayOfInterval, 
  startOfDay, 
  endOfDay, 
  isSameDay
} from 'date-fns';   

import { useLocationStore } from '@/store/useLocationStore';
import { DateRangePicker } from '@/components/ui/DateRangePicker';

interface DashboardStats {
  total_products: number;
  total_inventory_value: number;
  low_stock_count: number;
  total_transactions: number;
}

interface Transaction {
  id: number;
  ref_code: string;
  type: 'INBOUND' | 'OUTBOUND';
  quantity: number;
  unit_price: number;
  total_price: number;
  created_at: string;
  product_id: number;
  product: {
    name: string;
    sku: string;
    category: string;
    sell_price: number;
  };
}

interface ProductDistributionItem {
  name: string;
  value: number;
  percentage: number;
  capacity?: number;
}

interface LocationDetail {
  id: number;
  name: string;
  description?: string;
  capacity: number;
}

export default function DashboardPage() {       
  const router = useRouter();
  const { selectedLocation, locations } = useLocationStore();
  const { formatCurrency } = useCurrencyFormatter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dateRange, setDateRange] = useState<{start: string, end: string} | null>({ 
    start: format(subDays(new Date(), 30), "yyyy-MM-dd"), 
    end: format(new Date(), "yyyy-MM-dd") 
  });

  const [chartData, setChartData] = useState<any[]>([]);
  const [categoryData, setCategoryData] = useState<ProductDistributionItem[]>([]);
  const [topProductsData, setTopProductsData] = useState<any[]>([]);
  const [storageMetrics, setStorageMetrics] = useState<{
    warehouse_capacity_pct: number;
    warehouse_capacity_label: string;
  } | null>(null);

  const [isAIReportModalOpen, setIsAIReportModalOpen] = useState(false);

  // State for Chart Popup
  const [activeChart, setActiveChart] = useState<{
    title: string;
    data: any[];
    color: string;
    isCurrency?: boolean;
  } | null>(null);

  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [allInventory, setAllInventory] = useState<any[]>([]);
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [locationDetails, setLocationDetails] = useState<LocationDetail[]>([]);

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  useEffect(() => {
    fetchBaseData();
  }, [selectedLocation, locations]);

  useEffect(() => {
    if (allTransactions.length > 0 || allProducts.length > 0 || locationDetails.length > 0) {
      processData();
    }
  }, [dateRange, allTransactions, allInventory, allProducts, locationDetails]);

  const fetchBaseData = async () => {
    setIsLoading(true);
    try {
      const [products, transactions, inventory, locations] = await Promise.all([
        api.getProducts(),
        api.getTransactions(selectedLocation),  
        api.getInventory(selectedLocation),
        api.getLocationDetails()
      ]);
      setAllProducts(Array.isArray(products) ? products : []);
      setAllTransactions(Array.isArray(transactions) ? transactions : []);
      setAllInventory(Array.isArray(inventory) ? inventory : []);
      setLocationDetails(Array.isArray(locations) ? locations : []);

      // Fetch storage & health metrics from backend
      try {
        const metrics = await api.getStorageMetrics(selectedLocation);
        setStorageMetrics(metrics);
      } catch (err) {
        console.error('Failed to load storage metrics:', err);
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const processData = () => {
    let start, end;
    if (dateRange) {
      start = startOfDay(parseISO(dateRange.start));
      end = endOfDay(parseISO(dateRange.end));  
    } else {
      if (allTransactions.length === 0) {       
        start = startOfDay(subDays(new Date(), 30));
        end = endOfDay(new Date());
      } else {
        const dates = allTransactions.map(t => parseISO(t.created_at).getTime());
        start = startOfDay(new Date(Math.min(...dates)));
        end = endOfDay(new Date(Math.max(...dates)));
        if (isSameDay(start, end)) { start = startOfDay(subDays(start, 6)); }
      }
    }

    const filteredTransactions = allTransactions.filter((t) => {
      const date = parseISO(t.created_at);      
      return isWithinInterval(date, { start, end });
    });

    const totalProducts = selectedLocation === 'ALL'
      ? allProducts.length
      : new Set(allInventory.map((i: any) => i.product_id)).size;

    const lowStockCount = allInventory.filter((i: any) => i.status === 'LOW_STOCK').length;
    const totalRetailValue = allInventory.reduce((sum: number, i: any) =>
      sum + ((Number(i.quantity) || 0) * (Number(i.product?.sell_price) || 0)), 0
    );

    setStats({
      total_products: totalProducts,
      total_inventory_value: totalRetailValue,
      low_stock_count: lowStockCount,
      total_transactions: filteredTransactions.length
    });

    try {
      const daysInterval = eachDayOfInterval({ start, end });
      const newChartData = daysInterval.map(day => {
        const dayTransactions = filteredTransactions.filter(t => isSameDay(parseISO(t.created_at), day));
        const inbound = dayTransactions.filter(t => t.type === 'INBOUND').reduce((sum, t) => sum + t.quantity, 0);
        const outbound = dayTransactions.filter(t => t.type === 'OUTBOUND').reduce((sum, t) => sum + t.quantity, 0);
        const value = dayTransactions.reduce((sum, t) => sum + (Number(t.total_price) || 0), 0);
        return { name: format(day, 'MMM dd'), inbound, outbound, total: inbound + outbound, value, date: day };
      });
      setChartData(newChartData);
    } catch (e) {
      setChartData([]);
    }

    const totalUnits = allInventory.reduce(
      (sum: number, item: any) => sum + (Number(item.quantity) || 0),
      0
    );

    if (selectedLocation === 'ALL') {
      const locationInventoryMap: Record<string, number> = {};

      locationDetails.forEach((location) => {
        locationInventoryMap[location.name] = 0;
      });

      allInventory.forEach(item => {
        const locationName = item.location || 'Unknown location';
        const quantity = Number(item.quantity) || 0;
        if (quantity <= 0) return;
        locationInventoryMap[locationName] = (locationInventoryMap[locationName] || 0) + quantity;
      });

      setCategoryData(
        Object.entries(locationInventoryMap)
          .map(([name, value]) => ({
            name,
            value,
            percentage: totalUnits > 0 ? Number(((value / totalUnits) * 100).toFixed(1)) : 0,
            capacity: locationDetails.find((location) => location.name === name)?.capacity ?? 0,
          }))
          .sort((a, b) => b.value - a.value)
      );
    } else {
      const productInventoryMap: Record<string, number> = {};
      allInventory.forEach(item => {
          const productName = item.product?.name || "Unknown product";
          const quantity = Number(item.quantity) || 0;
          if (quantity <= 0) return;
          productInventoryMap[productName] = (productInventoryMap[productName] || 0) + quantity;
      });
      setCategoryData(
        Object.entries(productInventoryMap)
          .map(([name, value]) => ({
            name,
            value,
            percentage: totalUnits > 0 ? Number(((value / totalUnits) * 100).toFixed(1)) : 0,
          }))
          .sort((a, b) => b.value - a.value)
      );
    }

    const productMovement: Record<string, { name: string, quantity: number }> = {};
    filteredTransactions.forEach(t => {
        const pid = t.product_id.toString();    
        if (!productMovement[pid]) productMovement[pid] = { name: t.product?.name || "Unknown", quantity: 0 };
        productMovement[pid].quantity += t.quantity;
    });
    setTopProductsData(Object.values(productMovement).sort((a, b) => b.quantity - a.quantity).slice(0, 5));

    setRecentTransactions([...filteredTransactions].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 10));
  };

  const renderProductDistributionTooltip = ({
    active,
    payload,
  }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) {
      return null;
    }

    const item = payload[0]?.payload as ProductDistributionItem | undefined;
    if (!item) {
      return null;
    }

    return (
      <div className="rounded-xl border border-slate-100 bg-white px-3 py-2 shadow-lg">
        <p className="text-xs font-semibold text-slate-800">{item.name}</p>
        <p className="mt-1 text-[11px] font-medium text-slate-500">{item.value} units</p>
        <p className="text-[11px] font-medium text-blue-600">{item.percentage}% of total stock</p>
        {selectedLocation === 'ALL' && (
          <p className="text-[11px] font-medium text-violet-600">Capacity: {item.capacity ?? 0} units</p>
        )}
      </div>
    );
  };

  const distributionLegendItems = categoryData.slice(0, 6);
  const getDistributionColor = (index: number, total: number) => {
    if (total <= COLORS.length) {
      return COLORS[index % COLORS.length];
    }

    const hue = Math.round((index / Math.max(total, 1)) * 360);
    return `hsl(${hue} 75% 55%)`;
  };

  const openStockChart = (type: 'products' | 'value' | 'lowstock' | 'activity') => {
    let title = "";
    let dataKey = "";
    let color = "#3b82f6";
    let isCurrency = false;

    switch(type) {
      case 'products':
        title = "Inventory Unit Growth";        
        dataKey = "total";
        color = "#3b82f6";
        break;
      case 'value':
        title = "Transaction Value Trend";      
        dataKey = "value";
        color = "#10b981";
        isCurrency = true;
        break;
      case 'lowstock':
        title = "Outbound Volume (Demand)";     
        dataKey = "outbound";
        color = "#f59e0b";
        break;
      case 'activity':
        title = "Operation Volume";
        dataKey = "total";
        color = "#8b5cf6";
        break;
    }

    setActiveChart({
      title,
      data: chartData.map(d => ({ name: d.name, value: d[dataKey] })),
      color,
      isCurrency
    });
  };

  const lowStockItems = allInventory.filter(
    (i: any) => i.status === 'LOW_STOCK' || (Number(i.quantity) <= (Number(i.product?.min_stock_level) || 5))
  );

  if (isLoading && allTransactions.length === 0) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-3 border-slate-800 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-xs text-slate-400 font-medium tracking-wide">Syncing Warehouse Analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">    
        <div className="flex items-center gap-3">
          <div className="p-2.5 sm:p-3 rounded-xl bg-blue-600/10 border border-blue-500/20 text-blue-400 shadow-lg shadow-blue-500/5">
            <LayoutDashboard className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Warehouse Command Center
            </h1>
            <p className="text-xs text-slate-400">Live operational overview &amp; inventory analytics</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          {selectedLocation !== 'ALL' && (    
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 text-blue-400 rounded-xl border border-slate-800 font-semibold text-xs shadow-sm">
              <Package size={13} className="text-blue-500" />
              <span>Zone: {selectedLocation}</span>
            </div>
          )}

          {/* 1-Click AI Analyse Report Button */}
          <button
            type="button"
            onClick={() => setIsAIReportModalOpen(true)}
            className="flex items-center gap-2 h-10 px-4 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all hover:scale-[1.02] shrink-0"
          >
            <Sparkles className="size-4 text-indigo-200" />
            <span>AI Analyse Report</span>
          </button>

          <div className="flex items-center gap-2.5">
            <DateRangePicker
              dateRange={dateRange || {start: '', end: ''}}
              onChange={setDateRange}
              className={cn(!dateRange && "opacity-50 grayscale pointer-events-none")}
            />
            <button
              onClick={() => setDateRange(dateRange ? null : {start: format(subDays(new Date(), 30), 'yyyy-MM-dd'), end: format(new Date(), 'yyyy-MM-dd')})}
              className={cn(
                "h-10 px-3.5 rounded-xl text-xs font-semibold transition-all duration-200 border flex items-center justify-center shadow-sm",
                !dateRange 
                  ? "border-blue-500/30 bg-blue-600 text-white shadow-lg shadow-blue-600/30" 
                  : "border-slate-800 bg-slate-900 text-slate-400 hover:text-white hover:border-slate-700"
              )}
            >
              All Time
            </button>
          </div>
        </div>
      </div>

      {/* Urgent Action Center (Operator Ergonomic Feature) */}
      {lowStockItems.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
                <ShieldAlert className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300">
                  Urgent Restock Action Required ({lowStockItems.length} items below safety threshold)
                </h3>
              </div>
            </div>
            <button
              onClick={() => router.push('/inventory')}
              className="text-xs font-medium text-amber-400 hover:text-amber-300 flex items-center gap-1 transition-colors"
            >
              <span>View All Shortages</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {lowStockItems.map((item: any) => (
              <div
                key={item.id}
                className="p-3 rounded-xl bg-slate-900/90 border border-amber-500/20 flex items-center justify-between gap-3 shadow-md hover:border-amber-500/40 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-white truncate">{item.product?.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-mono text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.2 rounded">
                      {item.product?.sku}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Stock: <strong className="text-rose-400">{item.quantity}</strong> / {item.product?.min_stock_level || 5}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => router.push(`/transactions?action=inbound&product_id=${item.product_id}&location=${encodeURIComponent(item.location || '')}`)}
                  className="px-2.5 py-1 text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-sm shrink-0 transition-colors"
                >
                  Inbound
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main KPI Grid */}
      <div className="grid gap-4 sm:gap-5 grid-cols-2 lg:grid-cols-4">
        <ModernStatCard
          title="Total Catalog SKUs"
          value={(stats?.total_products || 0).toString()}
          icon={Package}
          accentColor="blue"
          onClick={() => openStockChart('products')}
        />
        <ModernStatCard
          title="Total Valuation (Retail)"
          value={formatCurrency(stats?.total_inventory_value || 0)}
          icon={TrendingUp}
          accentColor="emerald"
          onClick={() => openStockChart('value')}
        />
        <ModernStatCard
          title="Low Stock Warnings"
          value={(stats?.low_stock_count || 0).toString()}
          icon={AlertTriangle}
          accentColor="amber"
          onClick={() => openStockChart('lowstock')}
        />
        <ModernStatCard
          title="Total Operations Logged"
          value={(stats?.total_transactions || 0).toString()}
          icon={Activity}
          accentColor="violet"
          onClick={() => openStockChart('activity')}
        />
      </div>

      {/* Primary Analytics Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Movement Chart */}
        <div className="lg:col-span-2 bg-slate-900/60 rounded-2xl p-5 border border-slate-800/80 backdrop-blur-sm shadow-xl">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">Stock Movement Velocity</h3>
              <p className="text-xs text-slate-400">Inbound vs Outbound unit volume</p>
            </div>
            <div className="flex gap-4">        
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-500/50"></span>
                <span>INBOUND</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-400">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-400 shadow-sm shadow-blue-500/50"></span>
                <span>OUTBOUND</span>
              </div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={290}>
            <BarChart data={chartData} barGap={6}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
              <XAxis dataKey="name" fontSize={11} axisLine={false} tickLine={false} tick={{fill: '#64748b'}} />
              <YAxis fontSize={11} axisLine={false} tickLine={false} tick={{fill: '#64748b'}} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  borderColor: '#334155',
                  borderRadius: '12px',
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
                  color: '#f8fafc',
                  fontSize: '12px'
                }}
              />
              <Bar dataKey="inbound" fill="#10b981" radius={[4, 4, 0, 0]} barSize={10} />        
              <Bar dataKey="outbound" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={10} />       
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Category & Location Distribution */}
        <div className="bg-slate-900/60 rounded-2xl p-5 border border-slate-800/80 backdrop-blur-sm shadow-xl flex flex-col justify-between">       
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-blue-500/10 rounded-lg text-blue-400 border border-blue-500/20">
                <PieChartIcon size={16} />
              </div>
              <h3 className="text-sm font-bold text-white">
                {selectedLocation === 'ALL' ? 'Zone Capacity Distribution' : 'Product Share'}
              </h3>
            </div>
          </div>

          <div className="h-[250px] flex items-center justify-center">
            {categoryData.length > 0 ? (
              <div className="flex h-full w-full flex-col">
                <div className="h-[170px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={75}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {categoryData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={getDistributionColor(index, categoryData.length)} />
                        ))}
                      </Pie>
                      <Tooltip content={renderProductDistributionTooltip} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 pt-2 text-[11px] font-medium text-slate-300">
                  {distributionLegendItems.map((item, index) => (
                    <div key={`${item.name}-${index}`} className="flex items-center gap-2 min-w-0">
                      <span
                        className="h-2 w-2 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: getDistributionColor(index, categoryData.length) }}
                      />
                      <span className="truncate">{item.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-slate-500">
                {selectedLocation === 'ALL' ? 'No inventory across warehouse zones' : 'No products in this zone'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Secondary Analytics Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Movers */}
        <div className="bg-slate-900/60 rounded-2xl p-5 border border-slate-800/80 backdrop-blur-sm shadow-xl">       
          <div className="flex items-center gap-2.5 mb-4">
            <div className="p-1.5 bg-blue-500/10 rounded-lg text-blue-400 border border-blue-500/20">
              <BarChart3 size={16} />
            </div>
            <h3 className="text-sm font-bold text-white">Top Velocity Products</h3>
          </div>
          <div className="space-y-4">
            {topProductsData.map((item, idx) => (
              <div key={idx} className="space-y-1.5">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="truncate pr-4 text-slate-300">{item.name}</span>
                  <span className="text-blue-400 font-mono">{item.quantity} units</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">     
                  <div
                    className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full rounded-full transition-all duration-700"
                    style={{ width: `${(item.quantity / (topProductsData[0]?.quantity || 1)) * 100}%` }}
                  />
                </div>
              </div>
            ))}
            {topProductsData.length === 0 && <p className="text-center text-slate-500 py-8 text-xs">No activity in this interval</p>}
          </div>
        </div>

        {/* Storage & Health */}
        <div className="bg-slate-900/60 rounded-2xl p-5 border border-slate-800/80 backdrop-blur-sm shadow-xl">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="p-1.5 bg-emerald-500/10 rounded-lg text-emerald-400 border border-emerald-500/20">
              <Warehouse size={16} />
            </div>
            <h3 className="text-sm font-bold text-white">Warehouse Rack Capacity</h3>
          </div>
          <div className="space-y-4">
            <div className="p-4 bg-slate-950/80 rounded-xl border border-slate-800 shadow-inner">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Space Utilization</span>
                <span className={cn(
                  "text-lg font-bold font-mono",
                  (storageMetrics?.warehouse_capacity_pct ?? 0) >= 90 ? "text-rose-400" :
                  (storageMetrics?.warehouse_capacity_pct ?? 0) >= 75 ? "text-amber-400" : "text-emerald-400"
                )}>
                  {storageMetrics?.warehouse_capacity_pct ?? 0}%
                </span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-700",
                    (storageMetrics?.warehouse_capacity_pct ?? 0) >= 90 ? "bg-rose-500 shadow-lg shadow-rose-500/50" :
                    (storageMetrics?.warehouse_capacity_pct ?? 0) >= 75 ? "bg-amber-500 shadow-lg shadow-amber-500/50" : "bg-emerald-500 shadow-lg shadow-emerald-500/50"
                  )}
                  style={{ width: `${Math.min(storageMetrics?.warehouse_capacity_pct ?? 0, 100)}%` }}
                />
              </div>
              <p className="text-[11px] font-medium text-slate-400 mt-2">{storageMetrics?.warehouse_capacity_label ?? '0% Used'}</p>
            </div>
          </div>
        </div>

        {/* Recent Operations Log */}
        <div className="bg-slate-900/60 rounded-2xl p-5 border border-slate-800/80 backdrop-blur-sm shadow-xl overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-violet-500/10 rounded-lg text-violet-400 border border-violet-500/20">
                <Clock size={16} />
              </div>
              <h3 className="text-sm font-bold text-white">Live Activity Feed</h3>
            </div>
            <span className="text-[10px] text-slate-500 font-mono">Real-time</span>
          </div>
          <div className="space-y-2 overflow-y-auto max-h-[300px] pr-1">       
            {recentTransactions.map((tx) => (   
              <div key={tx.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-800/60 transition-colors border border-slate-800/50">
                <div className={cn(
                  "p-1.5 rounded-lg text-xs font-bold shrink-0",
                  tx.type === 'INBOUND' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                )}>   
                  {tx.type === 'INBOUND' ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate text-slate-200">{tx.product?.name}</p>
                  <p className="text-[10px] text-slate-400 font-mono">{tx.type} • {tx.quantity} units</p>
                </div>
                <p className="text-[10px] font-mono text-slate-500">{format(parseISO(tx.created_at), 'HH:mm')}</p>
              </div>
            ))}
            {recentTransactions.length === 0 && <p className="text-center text-slate-500 py-8 text-xs">No recent transactions</p>}
          </div>
        </div>
      </div>

      {/* Stock Chart Modal */}
      {activeChart && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
            <button
              onClick={() => setActiveChart(null)}
              className="absolute top-5 right-5 p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all z-10"
            >
              <X size={20} />
            </button>

            <div className="p-6 sm:p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
                  <LineChartIcon size={20} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">{activeChart.title}</h2>
                  <p className="text-xs text-slate-400">Historical performance analytics</p>
                </div>
              </div>

              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={activeChart.data}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#64748b', fontSize: 11 }}
                      dy={10}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#64748b', fontSize: 11 }}
                      tickFormatter={(val) => activeChart.isCurrency ? formatCurrency(Number(val)) : Number(val).toLocaleString()}
                    />
                    <Tooltip
                      formatter={(value) => activeChart.isCurrency ? formatCurrency(Number(value)) : Number(value).toLocaleString()}
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        borderColor: '#334155',
                        borderRadius: '12px',
                        color: '#f8fafc',
                        fontSize: '12px'
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke={activeChart.color}
                      strokeWidth={3}
                      dot={{ r: 4, fill: activeChart.color, strokeWidth: 2, stroke: '#0f172a' }}
                      activeDot={{ r: 6, strokeWidth: 0 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-slate-950 px-6 py-3 border-t border-slate-800 flex justify-between items-center text-xs text-slate-400">
              <div className="flex items-center gap-2">      
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="font-semibold uppercase tracking-wider text-[10px] text-emerald-400">Live Synchronized</span>
              </div>
              <p className="text-[11px] text-slate-500 font-mono">Calculated from warehouse ledger records</p>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* AI Operations Intelligence Report Modal */}
      <AIAnalyseReportModal
        isOpen={isAIReportModalOpen}
        onClose={() => setIsAIReportModalOpen(false)}
      />
    </div>
  );
}

interface ModernStatCardProps {
  title: string;
  value: string;
  icon: React.ElementType;
  accentColor: 'blue' | 'emerald' | 'amber' | 'violet';
  onClick?: () => void;
}

function ModernStatCard({ title, value, icon: Icon, accentColor, onClick }: ModernStatCardProps) {
  const colorMap = {
    blue: {
      border: 'hover:border-blue-500/40',
      iconBg: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
      glow: 'from-blue-600/10',
      tag: 'text-blue-400'
    },
    emerald: {
      border: 'hover:border-emerald-500/40',
      iconBg: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
      glow: 'from-emerald-600/10',
      tag: 'text-emerald-400'
    },
    amber: {
      border: 'hover:border-amber-500/40',
      iconBg: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
      glow: 'from-amber-600/10',
      tag: 'text-amber-400'
    },
    violet: {
      border: 'hover:border-violet-500/40',
      iconBg: 'bg-violet-500/10 border-violet-500/20 text-violet-400',
      glow: 'from-violet-600/10',
      tag: 'text-violet-400'
    }
  };

  const scheme = colorMap[accentColor];

  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative overflow-hidden bg-slate-900/80 rounded-2xl p-4 sm:p-5 border border-slate-800/90 text-left w-full transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl backdrop-blur-sm",
        scheme.border
      )}
    >
      <div className={cn("absolute inset-0 bg-gradient-to-br to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500", scheme.glow)}></div>

      <div className="relative flex flex-col justify-between h-full space-y-3">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">      
            <p className="text-[11px] font-medium text-slate-400 truncate tracking-wide">{title}</p>
            <p className="text-xl sm:text-2xl font-bold text-white mt-1 truncate tracking-tight font-mono">{value}</p>
          </div>
          <div className={cn("p-2 rounded-xl border shadow-md ml-2 shrink-0 transition-transform duration-300 group-hover:scale-110", scheme.iconBg)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>

        <div className={cn("flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider", scheme.tag)}>
          <span>View Trend</span>
          <ArrowUpRight size={12} />
        </div>
      </div>
    </button>
  );
}