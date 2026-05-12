"use client";

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
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
  Warehouse
} from 'lucide-react';
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
      setAllProducts(products);
      setAllTransactions(transactions);
      setAllInventory(inventory);
      setLocationDetails(locations);

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

  if (isLoading && allTransactions.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-slate-600 font-bold">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4 sm:p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">    
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl blur-lg opacity-30"></div>
            <div className="relative bg-gradient-to-r from-blue-600 to-indigo-600 p-2.5 sm:p-3 rounded-xl">
              <LayoutDashboard className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent tracking-tight">
              Dashboard
            </h1>
            <p className="text-xs text-slate-500 font-medium">Overview of your inventory and transactions.</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            {selectedLocation !== 'ALL' && (    
                <div className="flex items-center gap-2 px-2.5 py-1.5 bg-white text-blue-700 rounded-xl border border-gray-200 font-semibold text-xs shadow-sm">
                    <Package size={12} className="text-blue-500" />
                    {selectedLocation}
                </div>
            )}
            <div className="flex items-center gap-3">
            <DateRangePicker
              dateRange={dateRange || {start: '', end: ''}}
              onChange={setDateRange}
              className={cn("h-11", !dateRange && "opacity-50 grayscale pointer-events-none")}
            />
            <button
              onClick={() => setDateRange(dateRange ? null : {start: format(subDays(new Date(), 30), 'yyyy-MM-dd'), end: format(new Date(), 'yyyy-MM-dd')})}
              className={cn(
                "h-11 px-4 rounded-2xl text-xs font-semibold transition-all duration-200 border flex items-center justify-center shadow-sm",
                !dateRange ? "border-transparent bg-gradient-to-r from-blue-600 to-indigo-500 text-white shadow-lg shadow-blue-200/70" : "border-slate-200/80 bg-white/90 text-slate-600 hover:border-blue-200 hover:text-blue-600 hover:shadow-md hover:shadow-blue-100/50"
              )}
            >
              All time
            </button>
          </div>
        </div>
      </div>

      {/* Main KPI Grid */}
      <div className="grid gap-4 sm:gap-6 grid-cols-2 lg:grid-cols-4 mb-6 md:mb-8">
        <div className="animate-on-load stagger-1 h-full">
          <ModernStatCard
            title="Total product"
            value={(stats?.total_products || 0).toString()}
            icon={Package}
            gradient="from-blue-500 to-cyan-500"
            onClick={() => openStockChart('products')}
          />
        </div>
        <div className="animate-on-load stagger-2 h-full">
          <ModernStatCard
            title="Inventory value (Retail)"
            value={formatCurrency(stats?.total_inventory_value || 0)}
            icon={TrendingUp}
            gradient="from-emerald-500 to-teal-500"
            onClick={() => openStockChart('value')}
          />
        </div>
        <div className="animate-on-load stagger-3 h-full">
          <ModernStatCard
            title="Low stock item"
            value={(stats?.low_stock_count || 0).toString()}
            icon={AlertTriangle}
            gradient="from-amber-500 to-orange-500"
            onClick={() => openStockChart('lowstock')}
          />
        </div>
        <div className="animate-on-load stagger-4 h-full">
          <ModernStatCard
            title="Total transaction"
            value={(stats?.total_transactions || 0).toString()}
            icon={Activity}
            gradient="from-violet-500 to-purple-500"
            onClick={() => openStockChart('activity')}
          />
        </div>
      </div>

      {/* Primary Analytics Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6 md:mb-8">
        {/* Main Movement Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm p-4 sm:p-6 border border-gray-100 animate-on-load stagger-5">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight">Inventory flow</h3>
              <p className="text-xs font-medium text-slate-400">Inbound vs Outbound activity</p>
            </div>
            <div className="flex gap-4">        
                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span> IN
                </div>
                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span> OUT
                </div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} barGap={8}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="name" fontSize={10} fontWeight="500" axisLine={false} tickLine={false} tick={{fill: '#94a3b8'}} />
              <YAxis fontSize={10} fontWeight="500" axisLine={false} tickLine={false} tick={{fill: '#94a3b8'}} />
              <Tooltip
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', padding: '12px', fontSize: '12px' }}
              />
              <Bar dataKey="inbound" fill="#10b981" radius={[2, 2, 0, 0]} barSize={8} />        
              <Bar dataKey="outbound" fill="#3b82f6" radius={[2, 2, 0, 0]} barSize={8} />       
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Category Distribution */}
        <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 border border-gray-100 animate-on-load" style={{animationDelay: '0.3s'}}>       
          <div className="flex items-center gap-3 mb-6">
            <div className="p-1.5 bg-slate-50 rounded-lg text-slate-600 border border-slate-100"><PieChartIcon size={16}/></div>
            <h3 className="text-base font-bold text-gray-900">{selectedLocation === 'ALL' ? 'Locations' : 'Products'}</h3>
          </div>
          <div className="h-[280px]">
            {categoryData.length > 0 ? (
              <div className="flex h-full flex-col">
                <div className="h-[190px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={3}
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
                <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 pt-2 text-[11px] font-medium text-slate-600">
                  {distributionLegendItems.map((item, index) => (
                    <div key={`${item.name}-${index}`} className="flex items-center gap-2 min-w-0">
                      <span
                        className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: getDistributionColor(index, categoryData.length) }}
                      />
                      <span className="truncate">{item.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-xs font-medium text-slate-400">
                {selectedLocation === 'ALL' ? 'No inventory across locations' : 'No products in this location'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Secondary Analytics Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Products */}
        <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 border border-gray-100 animate-on-load" style={{animationDelay: '0.35s'}}>       
          <div className="flex items-center gap-3 mb-6">
            <div className="p-1.5 bg-slate-50 rounded-lg text-slate-600 border border-slate-100"><BarChart3 size={16}/></div>
            <h3 className="text-base font-bold text-gray-900">Top movers</h3>
          </div>
          <div className="space-y-5">
            {topProductsData.map((item, idx) => (
                <div key={idx}>
                    <div className="flex justify-between text-xs font-semibold text-gray-700 mb-1.5">
                        <span className="truncate pr-4">{item.name}</span>
                        <span className="text-blue-600">{item.quantity} units</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">     
                        <div
                            className="bg-blue-500 h-full rounded-full transition-all duration-1000"
                            style={{ width: `${(item.quantity / (topProductsData[0]?.quantity || 1)) * 100}%` }}
                        ></div>
                    </div>
                </div>
            ))}
            {topProductsData.length === 0 && <p className="text-center text-gray-400 py-10 text-xs">No activity in this range</p>}
          </div>
        </div>

        {/* Storage & Health Metrics */}
        <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 border border-gray-100 animate-on-load" style={{animationDelay: '0.4s'}}>
          <div className="flex items-center gap-3 mb-6">
            <div className="p-1.5 bg-slate-50 rounded-lg text-slate-600 border border-slate-100"><Warehouse size={16}/></div>
            <h3 className="text-base font-bold text-gray-900">Storage & Health</h3>
          </div>
          <div className="space-y-5">
            {/* Warehouse Capacity */}
            <div className="p-4 bg-blue-50/50 rounded-xl border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Warehouse size={14} className="text-blue-600" />
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Warehouse Capacity</p>
                </div>
                <p className="text-lg font-bold text-blue-600">{storageMetrics?.warehouse_capacity_pct ?? 0}%</p>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-700",
                    (storageMetrics?.warehouse_capacity_pct ?? 0) >= 90 ? "bg-red-500" :
                    (storageMetrics?.warehouse_capacity_pct ?? 0) >= 70 ? "bg-amber-500" : "bg-blue-500"
                  )}
                  style={{ width: `${Math.min(storageMetrics?.warehouse_capacity_pct ?? 0, 100)}%` }}
                />
              </div>
              <p className="text-[10px] font-medium text-gray-400 mt-1.5">{storageMetrics?.warehouse_capacity_label ?? '0% Used'}</p>
            </div>

          </div>
        </div>

        {/* Recent Operations */}
        <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 border border-gray-100 overflow-hidden animate-on-load" style={{animationDelay: '0.45s'}}>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-base font-bold text-gray-900">Recent logs</h3>
            <Clock size={16} className="text-gray-400" />
          </div>
          <div className="space-y-2 overflow-y-auto max-h-[350px] pr-2 custom-scrollbar">       
            {recentTransactions.map((tx) => (   
              <div key={tx.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-100">
                <div className={`p-1.5 rounded-md ${tx.type === 'INBOUND' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>   
                  {tx.type === 'INBOUND' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate text-gray-800">{tx.product?.name}</p>
                  <p className="text-[10px] font-medium text-gray-400">{tx.type} • {tx.quantity} units</p>
                </div>
                <p className="text-[10px] font-medium text-gray-400">{format(parseISO(tx.created_at), 'HH:mm')}</p>
              </div>
            ))}
            {recentTransactions.length === 0 && <p className="text-center text-gray-400 py-10 text-xs">No recent activity</p>}
          </div>
        </div>
      </div>

      {/* Stock Chart Popup */}
      {activeChart && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative w-full max-w-3xl bg-white rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
              <button
                onClick={() => setActiveChart(null)}
                className="absolute top-6 right-6 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all z-10"
              >
                <X size={24} />
              </button>

              <div className="p-8">
                <div className="flex items-center gap-4 mb-8">
                  <div className="p-3 rounded-xl bg-slate-50">
                    <LineChartIcon className="text-slate-600" size={24} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">{activeChart.title}</h2>
                    <p className="text-sm text-gray-500 uppercase tracking-wider font-semibold">Performance trend for selected period</p>
                  </div>
                </div>

                <div className="h-[350px] w-full pr-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={activeChart.data}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                      <XAxis
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#94a3b8', fontSize: 12 }}
                        dy={10}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#94a3b8', fontSize: 12 }}
                        tickFormatter={(val) => activeChart.isCurrency ? formatCurrency(Number(val)) : Number(val).toLocaleString()}
                      />
                      <Tooltip
                        formatter={(value) => activeChart.isCurrency ? formatCurrency(Number(value)) : Number(value).toLocaleString()}
                        contentStyle={{
                          backgroundColor: '#fff',
                          border: 'none',
                          borderRadius: '12px',
                          boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke={activeChart.color}
                        strokeWidth={3}
                        dot={{ r: 4, fill: activeChart.color, strokeWidth: 2, stroke: '#fff' }}
                        activeDot={{ r: 6, strokeWidth: 0 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-slate-50 p-6 border-t border-gray-100 flex justify-between items-center">
                <div className="flex gap-2">      
                  <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
                  <span className="text-xs font-semibold text-gray-600 uppercase tracking-tight">Live Database Sync</span>
                </div>
                <p className="text-xs text-gray-400 italic">Values are calculated from real transaction history</p>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

interface ModernStatCardProps {
  title: string;
  value: string;
  icon: React.ElementType;
  gradient: string;
  onClick?: () => void;
}

function ModernStatCard({ title, value, icon: Icon, gradient, onClick }: ModernStatCardProps) {
  return (
    <button
      onClick={onClick}
      className="group relative h-full min-h-[112px] overflow-hidden bg-white rounded-xl p-4 sm:p-5 shadow-sm hover:shadow-lg text-left w-full border border-gray-100"
      style={{ transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}
    >
      <div
        className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-5`}
        style={{ transition: 'opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}
      ></div>
      <div
        className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${gradient} rounded-full -mr-16 -mt-16 opacity-5 group-hover:scale-125`}
        style={{ transition: 'transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)' }}
      ></div>     

      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0 flex-1">      
            <p className="text-[10px] sm:text-xs font-medium text-slate-400 truncate tracking-wide">{title}</p>
            <p className="text-lg sm:text-xl md:text-2xl font-bold text-slate-800 mt-0.5 truncate">{value}</p>
          </div>
          <div
            className={`bg-gradient-to-br ${gradient} p-2 rounded-lg shadow-md group-hover:scale-110 ml-2`}
            style={{ transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}
          >
            <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-[9px] font-medium text-blue-500 uppercase tracking-wider">
          <span>View Trend</span>
          <ArrowUpRight size={10} />
        </div>
      </div>
    </button>
  );
}