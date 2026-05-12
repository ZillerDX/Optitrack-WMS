"use client";

/**
 * Professional Transactions Page
 * Featuring advanced filtering, sorting, and modern E-Document detail popups.
 */

import { useState, useEffect, useMemo } from 'react';
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
  Clock
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

export default function TransactionsPage() {    
  const { selectedLocation } = useLocationStore();
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
    notes: '',
    date: format(new Date(), 'yyyy-MM-dd')      
  });

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
      setTransactions(transactionsData);        
      setProducts(productsData);
      setInventory(inventoryData);
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
      if (selectedLocation === 'ALL') {
        showNotification('warning', 'Location Required', 'Please select a specific location from the sidebar.');
        setIsSubmitting(false);
        return;
      }

      const quantity = parseInt(formData.quantity);
      if (formData.type === 'OUTBOUND' && getLocationStock(selectedLocation) < quantity) {      
        showNotification('error', 'Insufficient Stock', 'Not enough stock at this location.');  
        setIsSubmitting(false);
        return;
      }

      await api.createTransaction({
        type: formData.type,
        product_id: parseInt(formData.product_id),
        quantity: quantity,
        location: selectedLocation,
        notes: formData.notes,
        created_at: formData.date ? new Date(formData.date).toISOString() : undefined
      });

      showNotification('success', 'Success', 'Transaction recorded.');
      setFormData({
        type: 'INBOUND',
        product_id: '',
        quantity: '',
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

  if (loading) {
    return (
      <div className="flex h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 items-center justify-center font-sans">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500 font-bold">Loading history...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4 sm:p-6 font-sans">
      {/* Header */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">    
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl blur-lg opacity-30"></div>
            <div className="relative bg-gradient-to-r from-blue-600 to-purple-600 p-2.5 sm:p-3 rounded-xl">
              <Package className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
              Transactions
            </h1>
            <p className="text-xs text-slate-500 font-medium">History of inbound and outbound movements.</p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-3 lg:ml-auto w-full lg:w-auto">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <DateRangePicker
              dateRange={dateRange || {start: '', end: ''}}
              onChange={setDateRange}
              className={cn("h-11 flex-1 sm:flex-none", !dateRange && "opacity-50 grayscale pointer-events-none")}
            />
            <button
              onClick={() => setDateRange(dateRange ? null : {start: format(subDays(new Date(), 30), 'yyyy-MM-dd'), end: format(new Date(), 'yyyy-MM-dd')})}
              className={cn(
                "h-11 px-4 rounded-2xl text-[13px] font-semibold transition-all duration-200 border flex items-center justify-center shadow-sm shrink-0",
                !dateRange ? "border-transparent bg-gradient-to-r from-blue-600 to-indigo-500 text-white shadow-lg shadow-blue-200/70" : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-600 hover:shadow-md hover:shadow-blue-100/50"
              )}
            >
              All time
            </button>
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="group relative overflow-hidden bg-gradient-to-r from-green-600 to-emerald-600 text-white px-4 h-11 rounded-2xl font-medium shadow-sm hover:shadow-md transition-all duration-300 hover:scale-105 flex items-center justify-center shrink-0 w-full sm:w-auto"
          >
            <div className="relative flex items-center gap-1.5">
              <Plus className="h-4 w-4" />
              <span className="text-[13px]">New Transaction</span>
            </div>
          </button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid gap-4 sm:gap-6 grid-cols-2 lg:grid-cols-3 mb-6">
        <ModernStatCard 
          title="Total inbound" 
          value={formatCurrency(stats.totalInbound)} 
          icon={ArrowDownCircle} 
          gradient="from-emerald-500 to-teal-500" 
          onClick={() => openTransactionChart('inbound')}
        />
        <ModernStatCard 
          title="Total outbound" 
          value={formatCurrency(stats.totalOutbound)} 
          icon={ArrowUpCircle} 
          gradient="from-blue-500 to-cyan-500" 
          onClick={() => openTransactionChart('outbound')}
        />
        <ModernStatCard 
          title="Total transaction" 
          value={stats.count.toString()} 
          icon={Package} 
          gradient="from-violet-500 to-purple-500" 
          onClick={() => openTransactionChart('total')}
        />     
      </div>

      {/* Filters & Sorting */}
      <div className="bg-white p-3 sm:p-4 rounded-xl border border-gray-100 shadow-sm mb-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[140px] bg-slate-50 border-none font-semibold text-xs h-11 rounded-xl">
              <div className="flex items-center gap-2"><Filter size={14} className="text-slate-400"/> <SelectValue /></div>
            </SelectTrigger>
            <SelectContent className="rounded-xl border-gray-100">
              <SelectItem value="ALL">All Types</SelectItem>
              <SelectItem value="INBOUND">Inbound</SelectItem>
              <SelectItem value="OUTBOUND">Outbound</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-4">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest hidden sm:block">Sort by:</p>
          <button
            onClick={() => setSortOrder(sortOrder === 'latest' ? 'oldest' : 'latest')}
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-50 hover:bg-white hover:shadow-md hover:border-blue-100 border-2 border-transparent rounded-xl text-xs font-bold text-slate-700 transition-all group"
          >
            <ArrowUpDown size={14} className="text-blue-500 group-hover:scale-110 transition-transform" />
            {sortOrder === 'latest' ? 'Latest First' : 'Oldest First'}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">    
        <div className="overflow-x-auto">       
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gradient-to-r from-gray-50 to-gray-100 border-b-2 border-gray-200">
                <th className="px-6 py-4 text-xs font-medium text-gray-700 tracking-wider border-none">Ref code</th>
                <th className="px-6 py-4 text-xs font-medium text-gray-700 tracking-wider border-none">Type</th>
                <th className="px-6 py-4 text-xs font-medium text-gray-700 tracking-wider border-none">Product</th>
                <th className="px-6 py-4 text-xs font-medium text-gray-700 tracking-wider text-right border-none">Qty</th>
                <th className="px-6 py-4 text-xs font-medium text-gray-700 tracking-wider border-none">Location</th>
                <th className="px-6 py-4 text-xs font-medium text-gray-700 tracking-wider text-right border-none">Amount</th>
                <th className="px-6 py-4 text-xs font-medium text-gray-700 tracking-wider text-right border-none">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredTransactions.map((tx) => (
                <tr key={tx.id} onClick={() => setSelectedTx(tx)} className="group hover:bg-blue-50/30 cursor-pointer transition-colors font-sans">
                  <td className="px-6 py-4">    
                    <span className="text-[11px] font-bold text-slate-900 font-mono tracking-tight">{tx.ref_code}</span>
                  </td>
                  <td className="px-6 py-4">    
                    <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold", tx.type === 'INBOUND' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600')}>
                      {tx.type === 'INBOUND' ? <ArrowDownCircle size={12}/> : <ArrowUpCircle size={12}/>}
                      {tx.type}
                    </div>
                  </td>
                  <td className="px-6 py-4">    
                    <div className="flex flex-col min-w-0">
                      <p className="text-xs font-semibold text-slate-800 truncate max-w-[200px]">{tx.product.name}</p>
                      <p className="text-[10px] text-slate-400 font-medium uppercase">{tx.product.sku}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-xs font-bold text-slate-700">{tx.quantity}</span>     
                  </td>
                  <td className="px-6 py-4">    
                    <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">{tx.location}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-xs font-bold text-blue-600">{formatCurrency(tx.total_price)}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <p className="text-xs font-medium text-slate-500 whitespace-nowrap">{formatDate(tx.created_at)}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* E-Document Detail Popup */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-300">
          <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-y-auto max-h-[95vh] animate-in zoom-in-95 duration-200">
            {/* Header Control */}
            <div className="px-8 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Electronic record active</span>
              </div>
              <button onClick={() => setSelectedTx(null)} className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-white rounded-lg transition-all border border-transparent hover:border-slate-200">
                <X size={18} />
              </button>
            </div>

            <div className="p-10 lg:p-14">      
              {/* Brand & Type */}
              <div className="flex justify-between items-start mb-12">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <Globe size={16} className="text-slate-900" />
                    <span className="text-sm font-bold tracking-tight text-slate-900 uppercase">OptiTrack digital</span>
                  </div>
                  <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">Warehouse Management System</p>
                </div>
                <div className="text-right">    
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-1">Doc type</p>
                  <h2 className={cn("text-xl font-medium uppercase tracking-tight", selectedTx.type === 'INBOUND' ? 'text-emerald-600' : 'text-blue-600')}>
                    Stock {selectedTx.type.toLowerCase()}
                  </h2>
                </div>
              </div>

              {/* Core Ledger Data */}
              <div className="grid grid-cols-2 gap-12 border-y border-slate-100 py-10 mb-10">   
                <div className="space-y-6">     
                  <div>
                    <label className="text-[9px] font-bold text-slate-300 uppercase tracking-widest block mb-2">Record ID</label>
                    <p className="text-xs font-mono font-semibold text-slate-900">{selectedTx.ref_code}</p>
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-slate-300 uppercase tracking-widest block mb-2">Facility node</label>
                    <div className="flex items-center gap-2 text-slate-700">
                      <MapPin size={12} className="text-slate-300" />
                      <span className="text-xs font-medium">{selectedTx.location || 'Central warehouse'}</span>
                    </div>
                  </div>
                </div>
                <div className="space-y-6 text-right">
                  <div>
                    <label className="text-[9px] font-bold text-slate-300 uppercase tracking-widest block mb-2">Entry date</label>
                    <p className="text-xs font-semibold text-slate-900">{format(parseISO(selectedTx.created_at), 'MMMM dd, yyyy')}</p>
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-slate-300 uppercase tracking-widest block mb-2">Entry time</label>
                    <p className="text-xs font-semibold text-slate-900">{format(parseISO(selectedTx.created_at), 'HH:mm:ss')} (Local)</p>       
                  </div>
                </div>
              </div>

              {/* Asset Details */}
              <div className="mb-12">
                <label className="text-[9px] font-bold text-slate-300 uppercase tracking-widest block mb-4">Itemized asset</label>
                <div className="bg-slate-50/50 rounded-2xl p-6 border border-slate-100 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 mb-0.5">{selectedTx.product.name}</p>
                    <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">{selectedTx.product.sku}</p>
                  </div>
                  <div className="text-right">  
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">Quantity</p>
                    <p className="text-sm font-bold text-slate-900">{selectedTx.quantity} units</p>
                  </div>
                </div>
              </div>

              {/* Financial Summary */}
              <div className="flex flex-col items-end pt-2">
                <div className="w-full max-w-[240px] space-y-3">
                  <div className="flex justify-between items-center text-[11px] font-medium text-slate-400">
                    <span>Unit valuation</span> 
                    <span className="text-blue-600">{formatCurrency(selectedTx.unit_price)}</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px] font-medium text-slate-400">
                    <span>System fees</span>    
                    <span className="text-slate-900">{formatCurrency(0)}</span>
                  </div>
                  <div className="h-px bg-slate-100 my-2"></div>
                  <div className="flex justify-between items-end">
                    <span className="text-[10px] font-bold text-slate-900 uppercase">Total value</span>
                    <span className="text-2xl font-semibold tracking-tighter text-blue-600">{formatCurrency(selectedTx.total_price)}</span>     
                  </div>
                </div>
              </div>

              {/* Footer Audit */}
              <div className="mt-16 pt-8 border-t border-slate-100 flex justify-between items-center opacity-40">
                <div className="flex items-center gap-2">
                  <FileCode size={14} />        
                  <span className="text-[9px] font-bold uppercase tracking-widest">Electronic record audit trail</span>
                </div>
                <p className="text-[9px] font-bold uppercase tracking-widest">WMS node verified</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Transaction Chart Popup */}
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
                    <p className="text-sm text-gray-500 uppercase tracking-wider font-semibold">Movement trend for selected period</p>
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
                <p className="text-xs text-gray-400 italic">Data from filtered transaction history</p>
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
            notes: '',
            date: format(new Date(), 'yyyy-MM-dd')
          });
        }}
        title={`New Transaction (${selectedLocation !== 'ALL' ? selectedLocation : 'Select Location First'})`}
        size="lg"
      >
        {selectedLocation === 'ALL' ? (
          <div className="text-center py-8">    
            <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-gray-900 mb-2 font-sans">Location Required</h3>
            <p className="text-gray-600 mb-4 font-medium font-sans">Please select a specific location from the sidebar.</p>
            <button onClick={() => setIsModalOpen(false)} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-bold">Close</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3 text-medium">Transaction type <span className="text-red-500">*</span></label>
              <div className="grid grid-cols-2 gap-4">
                <button type="button" onClick={() => setFormData({ ...formData, type: 'INBOUND' })} className={cn("p-4 rounded-xl border-2 transition-all", formData.type === 'INBOUND' ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 hover:border-green-300')}>
                  <ArrowDownCircle className="h-8 w-8 mx-auto mb-2" />
                  <div className="font-bold text-sm">INBOUND</div>
                </button>
                <button type="button" onClick={() => setFormData({ ...formData, type: 'OUTBOUND' })} className={cn("p-4 rounded-xl border-2 transition-all", formData.type === 'OUTBOUND' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 hover:border-blue-300')}>
                  <ArrowUpCircle className="h-8 w-8 mx-auto mb-2" />
                  <div className="font-bold text-sm">OUTBOUND</div>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2 text-medium">Product <span className="text-red-500">*</span></label>
              <Select value={formData.product_id} onValueChange={(val) => setFormData({ ...formData, product_id: val })}>
                <SelectTrigger className="w-full h-11 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"><SelectValue placeholder="Select a product..." /></SelectTrigger>   
                <SelectContent>{products.map((product) => (<SelectItem key={product.id} value={product.id.toString()}>{product.name} ({product.sku})</SelectItem>))}</SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2 text-medium">Transaction date <span className="text-red-500">*</span></label>
              <DatePicker value={formData.date} onChange={(value) => setFormData({ ...formData, date: value })} className="w-full" />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2 text-medium">Quantity <span className="text-red-500">*</span></label>
              <input type="number" required min="1" value={formData.quantity} onChange={(e) => setFormData({ ...formData, quantity: e.target.value })} className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" placeholder="Enter quantity"/>
            </div>

            {showTransactionStockInfo && (
              <div className={cn(
                "rounded-2xl border p-4",
                stockInfoTone === 'red' ? "border-red-200 bg-red-50" : stockInfoTone === 'green' ? "border-green-100 bg-green-50" : "border-blue-100 bg-blue-50"
              )}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className={cn(
                      "text-xs font-bold uppercase tracking-wider",
                      stockInfoTone === 'red' ? "text-red-600" : stockInfoTone === 'green' ? "text-green-600" : "text-blue-600"
                    )}>Selected item stock</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{selectedProduct?.name}</p>
                    <p className="text-xs font-medium text-slate-500">{selectedLocation}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold text-slate-500">Available now</p>
                    <p className="text-2xl font-black tracking-tight text-slate-900">{selectedLocationStock.toLocaleString()}</p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-white/80 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{formData.type === 'INBOUND' ? 'Inbound qty' : 'Outbound qty'}</p>
                    <p className="mt-1 text-lg font-bold text-slate-900">{requestedQuantity.toLocaleString()}</p>
                  </div>
                  <div className="rounded-xl bg-white/80 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{formData.type === 'INBOUND' ? 'Items after inbound' : 'Items left'}</p>
                    <p className={cn(
                      "mt-1 text-lg font-bold",
                      stockInfoTone === 'red' ? "text-red-600" : stockInfoTone === 'green' ? "text-green-700" : "text-blue-700"
                    )}>{stockAfterTransaction.toLocaleString()}</p>
                  </div>
                </div>
                {hasOutboundShortage && (
                  <div className="mt-3 flex items-center gap-2 rounded-xl bg-red-100 px-3 py-2 text-xs font-semibold text-red-700">
                    <AlertCircle className="h-4 w-4" />
                    <span>Not enough stock. Short by {outboundShortage.toLocaleString()} item{outboundShortage === 1 ? '' : 's'}.</span>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2 text-medium">Notes</label>
              <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" rows={3} placeholder="Remarks..."/>
            </div>

            <div className="flex gap-3 pt-6 border-t border-gray-200">
              <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 font-medium transition-all text-sm">Cancel</button>
              <button type="submit" disabled={isSubmitting} className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 font-medium transition-all disabled:opacity-50 shadow-lg text-sm">{isSubmitting ? 'Recording...' : `Submit ${formData.type}`}</button>       
            </div>
          </form>
        )}
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

function ModernStatCard({ title, value, icon: Icon, gradient, onClick }: { title: string, value: string, icon: any, gradient: string, onClick?: () => void }) {
  return (
    <button onClick={onClick} className="group relative h-full min-h-[112px] overflow-hidden bg-white rounded-xl p-4 sm:p-5 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-1 text-left w-full border border-gray-100 font-sans">
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-300`}></div>  
      <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${gradient} rounded-full -mr-16 -mt-16 opacity-5 group-hover:scale-110 transition-transform duration-500`}></div>     
      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0 flex-1">      
            <p className="text-[10px] sm:text-xs font-medium text-slate-400 truncate tracking-wide">{title}</p>
            <p className="text-lg sm:text-xl md:text-2xl font-bold text-blue-600 mt-0.5 truncate">{value}</p>
          </div>
          <div className={`bg-gradient-to-br ${gradient} p-2 rounded-lg shadow-md group-hover:scale-110 transition-transform duration-300 ml-2`}><Icon className="h-4 w-4 sm:h-5 sm:w-5 text-white" /></div>
        </div>
        
        <div className="flex items-center gap-1.5 text-[9px] font-medium text-blue-500 uppercase tracking-wider">
          <span>View Trend</span>
          <ArrowUpRight size={10} />
        </div>
      </div>
    </button>
  );
}