"use client";

/**
 * Professional Transactions Page
 * Featuring advanced filtering, sorting, and modern E-Document detail popups.
 */

import { Suspense, useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { createPortal } from 'react-dom';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Package,
  Plus,
  AlertCircle,
  X,
  ArrowUpDown,
  Filter,
  CheckCircle2,
  Globe,
  FileCode,
  MapPin,
  Activity,
  ArrowUpRight,
  LineChart as LineChartIcon,
  TrendingUp,
  Clock,
  Download,
  Printer
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { Modal, NotificationModal } from '@/components/modals';
import { DatePicker } from '@/components/ui/DatePicker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { 
  parseISO, 
  subDays, 
  format, 
  isWithinInterval, 
  startOfDay, 
  endOfDay,
  eachDayOfInterval,
  isSameDay
} from 'date-fns';   
import { useLocationStore } from '@/store/useLocationStore';
import { DateRangePicker } from '@/components/ui/DateRangePicker';

interface Product {
  id: number;
  sku: string;
  name: string;
  min_stock_level?: number;
  cost_price?: number;
  sell_price?: number;
  supplier?: string;
  category?: string;
  unit?: string;
}

interface Transaction {
  id: number;
  ref_code: string;
  type: 'INBOUND' | 'OUTBOUND';
  quantity: number;
  unit_price: number;
  total_price: number;
  status: string;
  location?: string;
  notes?: string;
  user_id: number;
  product_id: number;
  created_at: string;
  product: Product;
}

interface Inventory {
  id: number;
  product_id: number;
  location: string;
  quantity: number;
  status: string;
  product: Product;
}

interface NotificationState {
  isOpen: boolean;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
}

function TransactionsContent() {    
  const searchParams = useSearchParams();
  const actionParam = searchParams.get('action');
  const productIdParam = searchParams.get('product_id');
  const locationParam = searchParams.get('location');

  const { selectedLocation, setSelectedLocation, locations } = useLocationStore();
  const { formatCurrency } = useCurrencyFormatter();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [loading, setLoading] = useState(true); 
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  const [dateRange, setDateRange] = useState<{start: string, end: string} | null>({
    start: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd')       
  });
  const [sortOrder, setSortOrder] = useState<'latest' | 'oldest'>('latest');
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  const [activeChart, setActiveChart] = useState<{
    title: string;
    data: any[];
    color: string;
    isCurrency?: boolean;
  } | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notification, setNotification] = useState<NotificationState>({
    isOpen: false,
    type: 'success',
    title: '',
    message: ''
  });
  const [formData, setFormData] = useState({    
    type: 'INBOUND' as 'INBOUND' | 'OUTBOUND',  
    product_id: '',
    quantity: '',
    location: '',
    notes: '',
    date: format(new Date(), 'yyyy-MM-dd')      
  });

  const lowStockProducts = useMemo(() => {
    return inventory.filter(
      (item) => item.status === 'LOW_STOCK' || (Number(item.quantity) <= (Number(item.product?.min_stock_level) || 5))
    );
  }, [inventory]);

  // Handle URL navigation params (e.g. ?action=inbound&product_id=3&location=Zone%20B-02)
  useEffect(() => {
    if (actionParam === 'inbound' && productIdParam && products.length > 0) {
      const targetProd = products.find(p => p.id.toString() === productIdParam);
      if (targetProd) {
        if (locationParam && locationParam !== 'ALL') {
          setSelectedLocation(locationParam);
        } else {
          const invItem = inventory.find(i => i.product_id === targetProd.id);
          if (invItem?.location) {
            setSelectedLocation(invItem.location);
          } else if (locations.length > 0 && locations[0] !== 'ALL') {
            setSelectedLocation(locations[0]);
          }
        }

        const invForLoc = inventory.find(i => i.product_id === targetProd.id);
        const currentQty = invForLoc ? invForLoc.quantity : 0;
        const minLevel = targetProd.min_stock_level || 5;
        const restockSuggested = Math.max(1, minLevel * 2 - currentQty);

        setFormData(prev => ({
          ...prev,
          type: 'INBOUND',
          product_id: productIdParam,
          quantity: String(restockSuggested),
          location: locationParam || invForLoc?.location || prev.location,
          notes: `Inbound Restock (Current: ${currentQty}, Min: ${minLevel})`,
          date: format(new Date(), 'yyyy-MM-dd')
        }));
        setIsModalOpen(true);
      }
    }
  }, [actionParam, productIdParam, locationParam, products, inventory, locations, setSelectedLocation]);

  useEffect(() => {
    loadData();
    const intervalId = setInterval(loadData, 30000);
    return () => clearInterval(intervalId);     
  }, [selectedLocation]);

  const loadData = async () => {
    try {
      const [transactionsData, productsData, inventoryData] = await Promise.all([
        api.getTransactions(selectedLocation),  
        api.getProducts(),
        api.getInventory()
      ]);
      setTransactions(Array.isArray(transactionsData) ? transactionsData : []);        
      setProducts(Array.isArray(productsData) ? productsData : []);
      setInventory(Array.isArray(inventoryData) ? inventoryData : []);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load data:', error);
      setLoading(false);
    }
  };

  const showNotification = (type: NotificationState['type'], title: string, message: string) => {
    setNotification({ isOpen: true, type, title, message });
  };

  const getLocationStock = (location: string) => {
    const inv = inventory.find(
      i => i.product_id === parseInt(formData.product_id) && i.location === location
    );
    return inv ? inv.quantity : 0;
  };

  const selectedProduct = useMemo(() => {
    const productId = Number.parseInt(formData.product_id, 10);
    return products.find(product => product.id === productId) || null;
  }, [products, formData.product_id]);

  const selectedLocationStock = useMemo(() => {
    if (!formData.product_id || selectedLocation === 'ALL') return 0;
    const productId = Number.parseInt(formData.product_id, 10);
    const inv = inventory.find(item => item.product_id === productId && item.location === selectedLocation);
    return inv ? inv.quantity : 0;
  }, [inventory, formData.product_id, selectedLocation]);

  const requestedQuantity = Number.parseInt(formData.quantity, 10) || 0;
  const stockAfterTransaction = formData.type === 'INBOUND'
    ? selectedLocationStock + requestedQuantity
    : Math.max(selectedLocationStock - requestedQuantity, 0);
  const outboundShortage = Math.max(requestedQuantity - selectedLocationStock, 0);
  const showTransactionStockInfo = Boolean(selectedProduct);
  const hasOutboundShortage = formData.type === 'OUTBOUND' && showTransactionStockInfo && requestedQuantity > 0 && outboundShortage > 0;
  const stockInfoTone = hasOutboundShortage ? 'red' : formData.type === 'INBOUND' ? 'green' : 'blue';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const targetLocation = selectedLocation !== 'ALL' 
        ? selectedLocation 
        : (formData.location || locations.find(l => l !== 'ALL') || 'Zone A-01');

      if (!targetLocation || targetLocation === 'ALL') {
        showNotification('warning', 'Location Required', 'Please select a specific warehouse zone.');
        setIsSubmitting(false);
        return;
      }

      const quantity = parseInt(formData.quantity);
      if (formData.type === 'OUTBOUND' && getLocationStock(targetLocation) < quantity) {      
        showNotification('error', 'Insufficient Stock', 'Not enough stock at this location.');  
        setIsSubmitting(false);
        return;
      }

      await api.createTransaction({
        type: formData.type,
        product_id: parseInt(formData.product_id),
        quantity: quantity,
        location: targetLocation,
        notes: formData.notes,
        created_at: formData.date ? new Date(formData.date).toISOString() : undefined
      });

      showNotification('success', 'Success', 'Transaction recorded.');
      setFormData({
        type: 'INBOUND',
        product_id: '',
        quantity: '',
        location: '',
        notes: '',
        date: format(new Date(), 'yyyy-MM-dd')  
      });
      setIsModalOpen(false);
      loadData();
    } catch (error: any) {
      showNotification('error', 'Error', 'Failed to create transaction.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredTransactions = useMemo(() => {  
    let result = transactions.filter(tx => {    
      const matchesType = typeFilter === 'ALL' || tx.type === typeFilter;
      let matchesDate = true;
      if (dateRange) {
        matchesDate = isWithinInterval(parseISO(tx.created_at), {
          start: startOfDay(parseISO(dateRange.start)),
          end: endOfDay(parseISO(dateRange.end))
        });
      }
      return matchesType && matchesDate;        
    });

    return result.sort((a, b) => {
      const timeA = new Date(a.created_at).getTime();
      const timeB = new Date(b.created_at).getTime();
      return sortOrder === 'latest' ? timeB - timeA : timeA - timeB;
    });
  }, [transactions, typeFilter, dateRange, sortOrder]);

  const stats = useMemo(() => ({
    totalInbound: filteredTransactions.filter(t => t.type === 'INBOUND').reduce((sum, t) => sum + (Number(t.total_price) || 0), 0),
    totalOutbound: filteredTransactions.filter(t => t.type === 'OUTBOUND').reduce((sum, t) => sum + (Number(t.total_price) || 0), 0),
    count: filteredTransactions.length,
  }), [filteredTransactions]);

    const chartData = useMemo(() => {
    let start, end;
    if (dateRange) {
      start = startOfDay(parseISO(dateRange.start));
      end = endOfDay(parseISO(dateRange.end));
    } else {
      if (filteredTransactions.length === 0) return [];
      const dates = filteredTransactions.map(t => parseISO(t.created_at).getTime());
      start = startOfDay(new Date(Math.min(...dates)));
      end = endOfDay(new Date(Math.max(...dates)));
      if (isSameDay(start, end)) { start = startOfDay(subDays(start, 6)); }
    }
    try {
      const daysInterval = eachDayOfInterval({ start, end });
      return daysInterval.map(day => {
        const dayTransactions = filteredTransactions.filter(t => isSameDay(parseISO(t.created_at), day));
        const inboundValue = dayTransactions.filter(t => t.type === 'INBOUND').reduce((sum, t) => sum + (Number(t.total_price) || 0), 0);
        const outboundValue = dayTransactions.filter(t => t.type === 'OUTBOUND').reduce((sum, t) => sum + (Number(t.total_price) || 0), 0);
        const count = dayTransactions.length;
        return {
          name: format(day, 'MMM dd'),
          inbound: inboundValue,
          outbound: outboundValue,
          transactions: count,
          date: day
        };
      });
    } catch (e) { return []; }
  }, [filteredTransactions, dateRange]);

  const openTransactionChart = (type: 'inbound' | 'outbound' | 'total') => {
    let title = "";
    let dataKey: 'inbound' | 'outbound' | 'transactions' = 'transactions';
    let color = "#3b82f6";
    let isCurrency = false;

    switch(type) {
      case 'inbound':
        title = "Inbound Value Trend";
        dataKey = "inbound";
        color = "#10b981";
        isCurrency = true;
        break;
      case 'outbound':
        title = "Outbound Value Trend";
        dataKey = "outbound";
        color = "#3b82f6";
        isCurrency = true;
        break;
      case 'total':
        title = "Transaction Volume";
        dataKey = "transactions";
        color = "#8b5cf6";
        break;
    }

    setActiveChart({
      title,
      data: chartData.map(d => ({
        name: d.name,
        value: dataKey === 'inbound' ? d.inbound : dataKey === 'outbound' ? d.outbound : d.transactions,
      })),
      color,
      isCurrency
    });
  };

  const formatDate = (dateString: string) => {  
    const date = new Date(dateString);
    return date.toLocaleString('en-US', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const exportToCSV = () => {
    if (filteredTransactions.length === 0) return;
    const headers = ["Ref Code", "Type", "Product", "SKU", "Quantity", "Unit Price", "Total Price", "Location", "Date", "Notes"];
    const rows = filteredTransactions.map(t => [
      t.ref_code,
      t.type,
      `"${t.product?.name || ''}"`,
      t.product?.sku || '',
      t.quantity,
      t.unit_price,
      t.total_price,
      t.location || '',
      format(parseISO(t.created_at), 'yyyy-MM-dd HH:mm'),
      `"${t.notes || ''}"`
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `transactions_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="flex h-screen bg-slate-950 text-slate-400 items-center justify-center font-sans">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-slate-800 border-t-blue-500 rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-xs font-medium tracking-wide">Syncing Warehouse Ledger...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">    
        <div className="flex items-center gap-3">
          <div className="p-2.5 sm:p-3 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400 shadow-lg shadow-violet-500/5">
            <Package className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Warehouse Transaction Ledger
            </h1>
            <p className="text-xs text-slate-400 font-medium">Auditable record of inbound deliveries and outbound dispatches</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="flex items-center gap-2.5">
            <DateRangePicker
              dateRange={dateRange || {start: '', end: ''}}
              onChange={setDateRange}
              className={cn(!dateRange && "opacity-50 grayscale pointer-events-none")}
            />
            <button
              onClick={() => setDateRange(dateRange ? null : {start: format(subDays(new Date(), 30), 'yyyy-MM-dd'), end: format(new Date(), 'yyyy-MM-dd')})}
              className={cn(
                "h-10 px-3.5 rounded-xl text-xs font-semibold transition-all duration-200 border flex items-center justify-center shadow-sm shrink-0",
                !dateRange ? "border-blue-500/30 bg-blue-600 text-white shadow-lg shadow-blue-600/30" : "border-slate-800 bg-slate-900 text-slate-400 hover:text-white hover:border-slate-700"
              )}
            >
              All Time
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportToCSV}
              disabled={filteredTransactions.length === 0}
              className="h-10 px-3 rounded-xl text-xs font-semibold transition-all duration-200 border border-slate-800 bg-slate-900 text-slate-300 hover:text-white hover:border-slate-700 shadow-sm flex items-center gap-1.5 shrink-0 disabled:opacity-40"
              title="Export filtered records to CSV"
            >
              <Download className="h-4 w-4 text-slate-400" />
              <span>Export</span>
            </button>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 h-10 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/30 transition-all shrink-0"
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span>Log Transaction</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid gap-4 sm:gap-5 grid-cols-2 lg:grid-cols-3">
        <ModernStatCard 
          title="Total Inbound Volume" 
          value={formatCurrency(stats.totalInbound)} 
          icon={ArrowDownCircle} 
          accentColor="emerald"
          onClick={() => openTransactionChart('inbound')}
        />
        <ModernStatCard 
          title="Total Outbound Dispatched" 
          value={formatCurrency(stats.totalOutbound)} 
          icon={ArrowUpCircle} 
          accentColor="blue"
          onClick={() => openTransactionChart('outbound')}
        />
        <ModernStatCard 
          title="Total Ledger Entries" 
          value={stats.count.toString()} 
          icon={Package} 
          accentColor="violet"
          onClick={() => openTransactionChart('total')}
        />     
      </div>

      {/* Filters & Sorting Bar */}
      <div className="bg-slate-900/60 p-3 sm:p-4 rounded-2xl border border-slate-800/80 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[150px] bg-slate-950 border-slate-800 text-slate-200 font-semibold text-xs h-10 rounded-xl">
              <div className="flex items-center gap-2"><Filter size={13} className="text-slate-400"/> <SelectValue /></div>
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
              <SelectItem value="ALL">All Types</SelectItem>
              <SelectItem value="INBOUND">Inbound Only</SelectItem>
              <SelectItem value="OUTBOUND">Outbound Only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Sort:</span>
          <button
            onClick={() => setSortOrder(sortOrder === 'latest' ? 'oldest' : 'latest')}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-xl text-xs font-semibold text-slate-300 transition-all group"
          >
            <ArrowUpDown size={13} className="text-blue-400 group-hover:scale-110 transition-transform" />
            <span>{sortOrder === 'latest' ? 'Newest First' : 'Oldest First'}</span>
          </button>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl shadow-xl overflow-hidden backdrop-blur-sm">    
        <div className="overflow-x-auto">       
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-950/90 border-b border-slate-800">
              <tr>
                <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Ref Code</th>
                <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Type</th>
                <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Product</th>
                <th className="px-6 py-3.5 text-right text-[11px] font-bold text-slate-400 uppercase tracking-wider">Qty</th>
                <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Location</th>
                <th className="px-6 py-3.5 text-right text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Amount</th>
                <th className="px-6 py-3.5 text-right text-[11px] font-bold text-slate-400 uppercase tracking-wider">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center text-slate-400">
                    <Package className="h-10 w-10 mx-auto mb-3 text-slate-600" />
                    <p className="text-sm font-semibold text-slate-300">No transactions recorded</p>
                    <p className="text-xs text-slate-500 mt-1">Try expanding your date range filter</p>
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx) => (
                  <tr key={tx.id} onClick={() => setSelectedTx(tx)} className="hover:bg-slate-800/40 cursor-pointer transition-colors font-sans">
                    <td className="px-6 py-3.5">    
                      <span className="text-xs font-bold text-blue-400 font-mono bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                        {tx.ref_code}
                      </span>
                    </td>
                    <td className="px-6 py-3.5">    
                      <div className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border",
                        tx.type === 'INBOUND' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                      )}>
                        {tx.type === 'INBOUND' ? <ArrowDownCircle size={12}/> : <ArrowUpCircle size={12}/>}
                        <span>{tx.type}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3.5">    
                      <div className="flex flex-col min-w-0">
                        <p className="text-sm font-semibold text-white truncate max-w-[240px]">{tx.product.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{tx.product.sku}</p>
                      </div>
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <span className="text-sm font-mono font-bold text-white">{tx.quantity}</span>     
                    </td>
                    <td className="px-6 py-3.5">    
                      <span className="text-xs font-medium text-slate-300 bg-slate-950 px-2 py-0.5 rounded-md border border-slate-800">
                        {tx.location}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <span className="text-sm font-mono font-bold text-slate-200">{formatCurrency(tx.total_price)}</span>
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <p className="text-xs font-mono text-slate-400 whitespace-nowrap">{formatDate(tx.created_at)}</p>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* E-Document Detail Popup */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl bg-slate-900/95 border border-slate-800 rounded-3xl shadow-2xl overflow-y-auto max-h-[92vh] animate-in zoom-in-95 duration-200 text-slate-100 ring-1 ring-white/5 backdrop-blur-xl">
            {/* Header Control */}
            <div className="px-6 py-4 bg-slate-950/60 border-b border-slate-800 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Electronic Ledger Record</span>
              </div>
              <button onClick={() => setSelectedTx(null)} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 sm:p-10">      
              {/* Brand & Type */}
              <div className="flex justify-between items-start mb-8 sm:mb-10">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Globe size={16} className="text-blue-400" />
                    <span className="text-sm font-bold tracking-tight text-white uppercase">OptiTrack digital</span>
                  </div>
                  <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Warehouse Management System</p>
                </div>
                <div className="text-right">    
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Doc type</p>
                  <h2 className={cn("text-lg sm:text-xl font-bold uppercase tracking-tight", selectedTx.type === 'INBOUND' ? 'text-emerald-400' : 'text-blue-400')}>
                    Stock {selectedTx.type.toLowerCase()}
                  </h2>
                </div>
              </div>

              {/* Core Ledger Data */}
              <div className="grid grid-cols-2 gap-6 sm:gap-10 border-y border-slate-800/80 py-6 sm:py-8 mb-8">   
                <div className="space-y-4 sm:space-y-5">     
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Record ID</label>
                    <p className="text-xs font-mono font-semibold text-white bg-slate-950/60 border border-slate-800/80 px-2 py-1 rounded-lg inline-block">{selectedTx.ref_code}</p>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Facility node</label>
                    <div className="flex items-center gap-1.5 text-slate-200">
                      <MapPin size={13} className="text-slate-400" />
                      <span className="text-xs font-medium">{selectedTx.location || 'Central warehouse'}</span>
                    </div>
                  </div>
                </div>
                <div className="space-y-4 sm:space-y-5 text-right">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Entry date</label>
                    <p className="text-xs font-semibold text-white">{format(parseISO(selectedTx.created_at), 'MMMM dd, yyyy')}</p>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Entry time</label>
                    <p className="text-xs font-semibold text-slate-300 font-mono">{format(parseISO(selectedTx.created_at), 'HH:mm:ss')} (Local)</p>       
                  </div>
                </div>
              </div>

              {/* Asset Details */}
              <div className="mb-8">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-3">Itemized Asset</label>
                <div className="bg-slate-950/60 rounded-2xl p-4 sm:p-5 border border-slate-800/80 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white mb-0.5">{selectedTx.product.name}</p>
                    <p className="text-[10px] font-mono font-medium text-slate-400 uppercase tracking-wider">{selectedTx.product.sku}</p>
                  </div>
                  <div className="text-right">  
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">Quantity</p>
                    <p className="text-sm font-bold text-white font-mono">{selectedTx.quantity} units</p>
                  </div>
                </div>
              </div>

              {/* Financial Summary */}
              <div className="flex flex-col items-end pt-2">
                <div className="w-full max-w-[260px] space-y-2.5">
                  <div className="flex justify-between items-center text-xs font-medium text-slate-400">
                    <span>Unit valuation</span> 
                    <span className="text-blue-400 font-mono">{formatCurrency(selectedTx.unit_price)}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs font-medium text-slate-400">
                    <span>System fees</span>    
                    <span className="text-slate-300 font-mono">{formatCurrency(0)}</span>
                  </div>
                  <div className="h-px bg-slate-800/80 my-2"></div>
                  <div className="flex justify-between items-end">
                    <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">Total Value</span>
                    <span className="text-xl sm:text-2xl font-bold tracking-tight text-blue-400 font-mono">{formatCurrency(selectedTx.total_price)}</span>     
                  </div>
                </div>
              </div>

              {/* Footer Audit */}
              <div className="mt-10 pt-5 border-t border-slate-800/80 flex justify-between items-center text-slate-500">
                <div className="flex items-center gap-1.5">
                  <FileCode size={13} />        
                  <span className="text-[9px] font-bold uppercase tracking-wider">Electronic record audit trail</span>
                </div>
                <p className="text-[9px] font-bold uppercase tracking-wider">WMS node verified</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Transaction Chart Popup */}
      {activeChart && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative w-full max-w-3xl bg-slate-900/95 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 text-slate-100 ring-1 ring-white/5 backdrop-blur-xl">
              <button
                onClick={() => setActiveChart(null)}
                className="absolute top-5 right-5 p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all z-10"
              >
                <X size={20} />
              </button>

              <div className="p-6 sm:p-8">
                <div className="flex items-center gap-3.5 mb-6">
                  <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
                    <LineChartIcon size={20} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white tracking-tight">{activeChart.title}</h2>
                    <p className="text-xs text-slate-400 font-medium">Movement trend for selected period</p>
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
                          border: '1px solid #1e293b',
                          borderRadius: '12px',
                          color: '#f8fafc',
                          boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke={activeChart.color}
                        strokeWidth={2.5}
                        dot={{ r: 4, fill: activeChart.color, strokeWidth: 2, stroke: '#0f172a' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-slate-950/60 px-6 py-4 border-t border-slate-800 flex justify-between items-center text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <span className="font-semibold text-slate-300">Live Database Ledger</span>
                </div>
                <p className="text-slate-400">Filtered transaction analytics</p>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* New Transaction Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setFormData({
            type: 'INBOUND',
            product_id: '',
            quantity: '',
            location: '',
            notes: '',
            date: format(new Date(), 'yyyy-MM-dd')
          });
        }}
        title={`New Transaction (${selectedLocation !== 'ALL' ? selectedLocation : (formData.location || 'Select Location')})`}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Urgent Low Stock Restock Banner & Multi-item Shortage Switcher */}
          {formData.type === 'INBOUND' && lowStockProducts.length > 0 && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Urgent Restock Shortage Items ({lowStockProducts.length})</span>
                </div>
                <span className="text-[11px] text-amber-300 font-medium">Click to pre-fill</span>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                {lowStockProducts.map((shortItem) => {
                  const isSelected = formData.product_id === shortItem.product_id.toString();
                  const pName = shortItem.product?.name || `Product #${shortItem.product_id}`;
                  const currentQty = shortItem.quantity;
                  const minLevel = shortItem.product?.min_stock_level || 5;
                  const deficit = Math.max(1, minLevel * 2 - currentQty);

                  return (
                    <button
                      key={shortItem.id}
                      type="button"
                      onClick={() => {
                        setFormData(prev => ({
                          ...prev,
                          type: 'INBOUND',
                          product_id: shortItem.product_id.toString(),
                          quantity: String(deficit),
                          location: shortItem.location || prev.location,
                          notes: `Restock below safety threshold (${currentQty}/${minLevel})`,
                        }));
                        if (shortItem.location && shortItem.location !== 'ALL') {
                          setSelectedLocation(shortItem.location);
                        }
                      }}
                      className={cn(
                        "px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border flex items-center gap-2",
                        isSelected
                          ? "bg-amber-500 border-amber-400 text-slate-950 shadow-md font-bold scale-[1.02]"
                          : "bg-slate-900/90 border-slate-700 text-amber-300 hover:bg-slate-800 hover:border-amber-400/60"
                      )}
                    >
                      <span className="truncate max-w-[160px]">{pName}</span>
                      <span className={cn(
                        "px-1.5 py-0.5 rounded text-[10px] font-mono",
                        isSelected ? "bg-slate-950/20 text-slate-900 font-black" : "bg-amber-500/20 text-amber-400 font-bold"
                      )}>
                        Stock: {currentQty} / {minLevel}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Location Selector if All Locations is selected in sidebar */}
          {selectedLocation === 'ALL' && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                Target Warehouse Zone <span className="text-rose-400">*</span>
              </label>
              <Select 
                value={formData.location || locations.find(l => l !== 'ALL') || 'Zone A-01'} 
                onValueChange={(val) => {
                  setFormData(prev => ({ ...prev, location: val }));
                  setSelectedLocation(val);
                }}
              >
                <SelectTrigger className="w-full h-11 bg-slate-950/80 border border-slate-800 rounded-xl text-slate-100 focus:ring-1 focus:ring-blue-500 text-xs sm:text-sm">
                  <SelectValue placeholder="Select warehouse zone..." />
                </SelectTrigger>
                <SelectContent>
                  {locations.filter(l => l !== 'ALL').map((loc) => (
                    <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2.5">
              Transaction Type <span className="text-rose-400">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <button 
                type="button" 
                onClick={() => setFormData({ ...formData, type: 'INBOUND' })} 
                className={cn(
                  "p-3.5 sm:p-4 rounded-2xl border transition-all duration-200 flex flex-col items-center justify-center gap-2", 
                  formData.type === 'INBOUND' 
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400 shadow-lg shadow-emerald-500/10' 
                    : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                )}
              >
                <ArrowDownCircle className="h-7 w-7 shrink-0" />
                <div className="font-bold text-xs uppercase tracking-wider">Inbound (Stock In)</div>
              </button>
              <button 
                type="button" 
                onClick={() => setFormData({ ...formData, type: 'OUTBOUND' })} 
                className={cn(
                  "p-3.5 sm:p-4 rounded-2xl border transition-all duration-200 flex flex-col items-center justify-center gap-2", 
                  formData.type === 'OUTBOUND' 
                    ? 'border-blue-500 bg-blue-500/10 text-blue-400 shadow-lg shadow-blue-500/10' 
                    : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                )}
              >
                <ArrowUpCircle className="h-7 w-7 shrink-0" />
                <div className="font-bold text-xs uppercase tracking-wider">Outbound (Stock Out)</div>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
              Product <span className="text-rose-400">*</span>
            </label>
            <Select value={formData.product_id} onValueChange={(val) => setFormData({ ...formData, product_id: val })}>
              <SelectTrigger className="w-full h-11 bg-slate-950/80 border border-slate-800 rounded-xl text-slate-100 focus:ring-1 focus:ring-blue-500 text-xs sm:text-sm">
                <SelectValue placeholder="Select product from list..." />
              </SelectTrigger>   
              <SelectContent>{products.map((product) => (<SelectItem key={product.id} value={product.id.toString()}>{product.name} ({product.sku})</SelectItem>))}</SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
              Transaction Date <span className="text-rose-400">*</span>
            </label>
            <DatePicker value={formData.date} onChange={(value) => setFormData({ ...formData, date: value })} className="w-full" />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
              Quantity <span className="text-rose-400">*</span>
            </label>
            <input 
              type="number" 
              required 
              min="1" 
              value={formData.quantity} 
              onChange={(e) => setFormData({ ...formData, quantity: e.target.value })} 
              className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs sm:text-sm font-mono font-medium transition-all" 
              placeholder="Enter quantity"
            />
          </div>

          {showTransactionStockInfo && (
            <div className={cn(
              "rounded-2xl border p-4 backdrop-blur-xl",
              stockInfoTone === 'red' ? "border-rose-500/30 bg-rose-500/10" : stockInfoTone === 'green' ? "border-emerald-500/30 bg-emerald-500/10" : "border-blue-500/30 bg-blue-500/10"
            )}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className={cn(
                    "text-[10px] font-bold uppercase tracking-wider",
                    stockInfoTone === 'red' ? "text-rose-400" : stockInfoTone === 'green' ? "text-emerald-400" : "text-blue-400"
                  )}>Selected item stock</p>
                  <p className="mt-1 text-sm font-bold text-white">{selectedProduct?.name}</p>
                  <p className="text-xs font-medium text-slate-400">{selectedLocation}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Available now</p>
                  <p className="text-2xl font-black tracking-tight text-white font-mono">{selectedLocationStock.toLocaleString()}</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-950/60 border border-slate-800/80 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{formData.type === 'INBOUND' ? 'Inbound qty' : 'Outbound qty'}</p>
                  <p className="mt-1 text-lg font-bold text-white font-mono">{requestedQuantity.toLocaleString()}</p>
                </div>
                <div className="rounded-xl bg-slate-950/60 border border-slate-800/80 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{formData.type === 'INBOUND' ? 'Items after inbound' : 'Items left'}</p>
                  <p className={cn(
                    "mt-1 text-lg font-bold font-mono",
                    stockInfoTone === 'red' ? "text-rose-400" : stockInfoTone === 'green' ? "text-emerald-400" : "text-blue-400"
                  )}>{stockAfterTransaction.toLocaleString()}</p>
                </div>
              </div>
              {hasOutboundShortage && (
                <div className="mt-3 flex items-center gap-2 rounded-xl bg-rose-500/20 border border-rose-500/30 px-3 py-2 text-xs font-semibold text-rose-300">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>Not enough stock. Short by {outboundShortage.toLocaleString()} item{outboundShortage === 1 ? '' : 's'}.</span>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">Notes</label>
            <textarea 
              value={formData.notes} 
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })} 
              className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs sm:text-sm font-medium transition-all" 
              rows={3} 
              placeholder="Remarks..."
            />
          </div>

          <div className="flex gap-3 pt-5 border-t border-slate-800/80">
            <button 
              type="button" 
              onClick={() => setIsModalOpen(false)} 
              className="flex-1 px-4 py-2.5 border border-slate-800 bg-slate-950/60 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl text-xs font-semibold transition-all"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={isSubmitting} 
              className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-all disabled:opacity-50 shadow-lg shadow-blue-600/30"
            >
              {isSubmitting ? 'Recording...' : `Submit ${formData.type}`}
            </button>       
          </div>
          </form>
      </Modal>

      <NotificationModal
        isOpen={notification.isOpen}
        onClose={() => setNotification({ ...notification, isOpen: false })}
        type={notification.type}
        title={notification.title}
        message={notification.message}
      />
    </div>
  );
}

export default function TransactionsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 border-3 border-slate-800 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-xs text-slate-400 font-medium tracking-wide">Syncing Transaction Ledger...</p>
          </div>
        </div>
      }
    >
      <TransactionsContent />
    </Suspense>
  );
}

interface ModernStatCardProps {
  title: string;
  value: string;
  icon: any;
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