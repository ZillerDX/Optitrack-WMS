"use client";

/**
 * หน้าการจัดการสินค้าคงคลัง
 * ดูและจัดการสินค้าคงคลังในคลังสินค้า
 */

import { useTranslations } from '@/lib/translations';
import { useState, useEffect } from 'react';
import { Package, Search, Filter, TrendingDown, Box, DollarSign, ArrowUpRight, ArrowDownRight, Tag, Trash2, MapPin, Settings2, Save, Warehouse } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Modal, NotificationModal, ConfirmModal } from '@/components/modals';
import { useLocationStore } from '@/store/useLocationStore';

interface Product {
  id: number;
  sku: string;
  name: string;
  category: string;
  sell_price: number;
}

interface InventoryItem {
  id: number;
  product_id: number;
  location: string;
  quantity: number;
  status: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
  product: Product;
}

interface Category {
  id: number;
  name: string;
}

interface LocationDetail {
  id: number;
  name: string;
  description?: string;
  capacity: number;
}

interface ManagedLocationForm {
  id: number;
  originalName: string;
  name: string;
  description: string;
  capacity: string;
}

interface NotificationState {
  isOpen: boolean;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
}

export default function InventoryPage() {
  const t = useTranslations();
  const { formatCurrency } = useCurrencyFormatter();
  const { selectedLocation, fetchLocations, setSelectedLocation } = useLocationStore();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  
  // Modals
  const [isCreateLocationModalOpen, setIsCreateLocationModalOpen] = useState(false);
  const [isManageLocationsModalOpen, setIsManageLocationsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isLocationDeleteModalOpen, setIsLocationDeleteModalOpen] = useState(false);
  
  const [itemToDelete, setItemToDelete] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLocationActionSubmitting, setIsLocationActionSubmitting] = useState(false);
  const [activeLocationId, setActiveLocationId] = useState<number | null>(null);
  const [managedLocations, setManagedLocations] = useState<ManagedLocationForm[]>([]);
  const [locationToDelete, setLocationToDelete] = useState<ManagedLocationForm | null>(null);
  
  // Forms
  const [locationFormData, setLocationFormData] = useState({
    name: '',
    description: '',
    capacity: '',
  });

  const [notification, setNotification] = useState<NotificationState>({
    isOpen: false,
    type: 'success',
    title: '',
    message: ''
  });

  useEffect(() => {
    loadInventory();
    loadCategories();
    loadProducts();
    fetchLocations(); // Ensure locations are loaded

    // รีเฟรชอัตโนมัติทุก 5 วินาที
    const intervalId = setInterval(() => {
      loadInventory();
    }, 5000);

    // รีเฟรชเมื่อหน้าต่างได้รับโฟกัส
    const handleFocus = () => {
      loadInventory();
      loadCategories();
      loadProducts();
      fetchLocations();
    };
    window.addEventListener('focus', handleFocus);

    // การทำความสะอาด
    return () => {
      clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
    };
  }, [selectedLocation, fetchLocations]);

  const loadInventory = async () => {
    try {
      const data = await api.getInventory(selectedLocation);
      setInventory(data);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load inventory:', error);
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const data = await api.getCategories();
      setCategories(data);
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  };

  const loadProducts = async () => {
    try {
      const data = await api.getProducts();
      setProducts(data);
    } catch (error) {
      console.error('Failed to load products:', error);
    }
  };

  const loadLocationDetails = async () => {
    try {
      const data: LocationDetail[] = await api.getLocationDetails();
      return data.map((location) => ({
        id: location.id,
        originalName: location.name,
        name: location.name,
        description: location.description || '',
        capacity: location.capacity.toString(),
      }));
    } catch (error) {
      console.error('Failed to load location details:', error);
      showNotification('error', 'Error', 'Failed to load location details.');
      return [];
    }
  };

  const openManageLocationsModal = async () => {
    const locationData = await loadLocationDetails();
    setManagedLocations(locationData);
    setIsManageLocationsModalOpen(true);
  };

  const handleDeleteClick = (id: number) => {
    setItemToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    
    try {
      await api.deleteInventory(itemToDelete);
      showNotification('success', 'Item Deleted', 'Inventory item has been removed.');
      loadInventory();
    } catch (error: any) {
      console.error('Failed to delete item:', error);
      const errorDetail = error.response?.data?.detail || 'Failed to delete item.';
      showNotification('error', 'Error', errorDetail);
    } finally {
      setIsDeleteModalOpen(false);
      setItemToDelete(null);
    }
  };

  const handleCreateLocation = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!locationFormData.capacity.trim()) {
      showNotification('error', 'Error', 'Capacity (Max items) is required.');
      return;
    }

    const parsedCapacity = parseInt(locationFormData.capacity, 10);
    if (Number.isNaN(parsedCapacity) || parsedCapacity < 0) {
      showNotification('error', 'Error', 'Capacity must be a valid non-negative number.');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.createLocation({
        name: locationFormData.name,
        description: locationFormData.description || undefined,
        capacity: parsedCapacity,
      });
      showNotification('success', 'Location Created', 'New warehouse location created successfully.');
      setIsCreateLocationModalOpen(false);
      setLocationFormData({ name: '', description: '', capacity: '' });
      await fetchLocations();
    } catch (error: any) {
      console.error('Failed to create location:', error);
      const errorDetail = error.response?.data?.detail || 'Failed to create location.';
      showNotification('error', 'Error', errorDetail);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleManagedLocationChange = (
    locationId: number,
    field: 'name' | 'description' | 'capacity',
    value: string
  ) => {
    setManagedLocations((prev) =>
      prev.map((location) =>
        location.id === locationId
          ? {
              ...location,
              [field]: field === 'name' ? value.toUpperCase() : value,
            }
          : location
      )
    );
  };

  const handleUpdateLocation = async (location: ManagedLocationForm) => {
    const trimmedName = location.name.trim();
    const trimmedDescription = location.description.trim();

    if (!trimmedName) {
      showNotification('error', 'Error', 'Location name is required.');
      return;
    }

    if (!location.capacity.trim()) {
      showNotification('error', 'Error', 'Capacity (Max items) is required.');
      return;
    }

    const parsedCapacity = parseInt(location.capacity, 10);
    if (Number.isNaN(parsedCapacity) || parsedCapacity < 0) {
      showNotification('error', 'Error', 'Capacity must be a valid non-negative number.');
      return;
    }

    setIsLocationActionSubmitting(true);
    setActiveLocationId(location.id);

    try {
      const updatedLocation = await api.updateLocation(location.id, {
        name: trimmedName,
        description: trimmedDescription || undefined,
        capacity: parsedCapacity,
      });

      const refreshedLocations = await loadLocationDetails();
      setManagedLocations(refreshedLocations);
      await fetchLocations();

      if (selectedLocation === location.originalName && updatedLocation.name !== location.originalName) {
        setSelectedLocation(updatedLocation.name);
      } else {
        await loadInventory();
      }

      showNotification('success', 'Location Updated', `Location '${updatedLocation.name}' updated successfully.`);
    } catch (error: any) {
      console.error('Failed to update location:', error);
      const errorDetail = error.response?.data?.detail || 'Failed to update location.';
      showNotification('error', 'Error', errorDetail);
    } finally {
      setIsLocationActionSubmitting(false);
      setActiveLocationId(null);
    }
  };

  const handleLocationDeleteClick = (location: ManagedLocationForm) => {
    setLocationToDelete(location);
    setIsLocationDeleteModalOpen(true);
  };

  const confirmLocationDelete = async () => {
    if (!locationToDelete) return;

    setIsLocationActionSubmitting(true);
    setActiveLocationId(locationToDelete.id);

    try {
      await api.deleteLocation(locationToDelete.id);
      const deletedLocationName = locationToDelete.originalName;
      const refreshedLocations = await loadLocationDetails();
      setManagedLocations(refreshedLocations);
      await fetchLocations();

      if (selectedLocation === deletedLocationName) {
        setSelectedLocation('ALL');
      } else {
        await loadInventory();
      }

      showNotification('success', 'Location Deleted', `Location '${deletedLocationName}' deleted successfully.`);
    } catch (error: any) {
      console.error('Failed to delete location:', error);
      const errorDetail = error.response?.data?.detail || 'Failed to delete location.';
      showNotification('error', 'Error', errorDetail);
    } finally {
      setIsLocationActionSubmitting(false);
      setActiveLocationId(null);
      setLocationToDelete(null);
      setIsLocationDeleteModalOpen(false);
    }
  };

  const showNotification = (type: NotificationState['type'], title: string, message: string) => {
    setNotification({ isOpen: true, type, title, message });
  };

  const visibleCategories = categories.filter((category) =>
    inventory.some((item) => item.product.category === category.name)
  );

  useEffect(() => {
    if (categoryFilter !== 'ALL' && !visibleCategories.some((category) => category.name === categoryFilter)) {
      setCategoryFilter('ALL');
    }
  }, [categoryFilter, visibleCategories]);

  // กรองสินค้าคงคลังตามการค้นหา สถานะ และหมวดหมู่
  const filteredInventory = inventory.filter(item => {
    const matchesSearch =
      item.product.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.location.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'ALL' || item.status === statusFilter;
    const matchesCategory = categoryFilter === 'ALL' || item.product.category === categoryFilter;

    return matchesSearch && matchesStatus && matchesCategory;
  });

  // คำนวณสถิติ
  const stats = {
    totalItems: inventory.reduce((sum, item) => sum + (item.quantity || 0), 0),
    lowStockCount: inventory.filter(item => item.status === 'LOW_STOCK').length,
    categories: new Set(inventory.map(item => item.product.category)).size,
    totalValue: inventory.reduce((sum, item) => sum + ((item.quantity || 0) * (item.product.sell_price || 0)), 0),
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'IN_STOCK':
        return 'px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      case 'LOW_STOCK':
        return 'px-2.5 py-0.5 text-xs font-semibold rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse';
      case 'OUT_OF_STOCK':
        return 'px-2.5 py-0.5 text-xs font-semibold rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20';
      default:
        return 'px-2.5 py-0.5 text-xs font-semibold rounded-full bg-slate-800 text-slate-400 border border-slate-700';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'IN_STOCK':
        return t('status.inStock');
      case 'LOW_STOCK':
        return t('status.lowStock');
      case 'OUT_OF_STOCK':
        return t('status.outOfStock');
      default:
        return status;
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-400">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-slate-800 border-t-blue-500 rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-xs font-medium">Loading Warehouse Inventory...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 sm:p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shadow-lg shadow-cyan-500/5">
            <Package className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Warehouse Inventory
            </h1>
            <p className="text-xs text-slate-400 font-medium">Real-time stock levels, location tracking &amp; capacity</p>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          {selectedLocation !== 'ALL' && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 text-cyan-400 rounded-xl border border-slate-800 font-semibold text-xs shadow-sm">
              <MapPin size={13} className="text-cyan-500" />
              <span>Zone: {selectedLocation}</span>
            </div>
          )}
          <button
            onClick={openManageLocationsModal}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700 text-xs font-semibold shadow-sm transition-all"
          >
            <Settings2 className="h-4 w-4 text-blue-400" />
            <span>Manage Locations</span>
          </button>
          <button
            onClick={() => setIsCreateLocationModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/30 transition-all"
          >
            <MapPin className="h-4 w-4" />
            <span>+ New Location</span>
          </button>
        </div>
      </div>

      {/* การ์ดสถิติทันสมัย */}
      {/* Stat Cards Grid */}
      <div className="grid gap-4 sm:gap-5 grid-cols-2 lg:grid-cols-4">
        <ModernStatCard
          title="Total Stock Units"
          value={stats.totalItems.toLocaleString()}
          icon={Box}
          accentColor="blue"
        />
        <ModernStatCard
          title="Low Stock Items"
          value={stats.lowStockCount.toString()}
          icon={TrendingDown}
          accentColor="amber"
        />
        <ModernStatCard
          title="Active Categories"
          value={stats.categories.toString()}
          icon={Package}
          accentColor="emerald"
        />
        <ModernStatCard
          title="Inventory Valuation"
          value={formatCurrency(stats.totalValue)}
          icon={DollarSign}
          accentColor="violet"
        />
      </div>

      {/* Visual Rack & Location Capacity Meters */}
      {managedLocations.length > 0 && (
        <div className="bg-slate-900/60 backdrop-blur-sm border border-slate-800/80 rounded-2xl p-4 sm:p-5 shadow-xl">
          <div className="flex items-center justify-between mb-3.5">
            <div className="flex items-center gap-2">
              <Warehouse className="w-4 h-4 text-blue-400" />
              <h2 className="text-sm font-bold text-white tracking-tight">Warehouse Location Capacity Utilization</h2>
            </div>
            <span className="text-xs text-slate-400">Click a zone card to filter table</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {managedLocations.map((loc) => {
              const isSelected = selectedLocation === loc.name;
              const used = inventory
                .filter(i => i.location === loc.name)
                .reduce((sum, i) => sum + (i.quantity || 0), 0);
              const cap = parseInt(loc.capacity, 10) || 0;
              const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;
              const tone = pct > 90 ? 'rose' : pct > 75 ? 'amber' : 'emerald';
              return (
                <div
                  key={loc.id}
                  onClick={() => setSelectedLocation(isSelected ? 'ALL' : loc.name)}
                  className={cn(
                    "p-3 rounded-xl border cursor-pointer transition-all duration-200 select-none",
                    isSelected 
                      ? "border-blue-500 ring-2 ring-blue-500/20 bg-blue-500/10 shadow-lg shadow-blue-500/10" 
                      : "border-slate-800/80 hover:border-slate-700 bg-slate-950/70 hover:bg-slate-900/80"
                  )}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-slate-200 truncate">{loc.name}</span>
                    <span className={cn(
                      "text-[10px] font-bold px-1.5 py-0.5 rounded font-mono border",
                      tone === 'rose' ? "bg-rose-500/10 text-rose-400 border-rose-500/20" : 
                      tone === 'amber' ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : 
                      "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    )}>
                      {pct}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mb-2">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500", 
                        tone === 'rose' ? "bg-rose-500 shadow-sm shadow-rose-500/50" : 
                        tone === 'amber' ? "bg-amber-500 shadow-sm shadow-amber-500/50" : 
                        "bg-emerald-500 shadow-sm shadow-emerald-500/50"
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                    <span>{used.toLocaleString()} units</span>
                    <span>Cap {cap.toLocaleString()}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search by SKU, product name, location..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-900/80 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-inner transition-all"
          />
        </div>
        <div className="flex gap-3">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full sm:w-[170px] h-10 bg-slate-900 border-slate-800 text-slate-200 rounded-xl focus:ring-1 focus:ring-blue-500 text-xs">
              <div className="flex items-center gap-2">
                <Tag className="h-3.5 w-3.5 text-slate-400" />
                <SelectValue placeholder="Category" />
              </div>
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
              <SelectItem value="ALL">All Categories</SelectItem>
              {visibleCategories.map((cat) => (
                <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[150px] h-10 bg-slate-900 border-slate-800 text-slate-200 rounded-xl focus:ring-1 focus:ring-blue-500 text-xs">
              <div className="flex items-center gap-2">
                <Filter className="h-3.5 w-3.5 text-slate-400" />
                <SelectValue placeholder="Status" />
              </div>
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
              <SelectItem value="ALL">All Status</SelectItem>
              <SelectItem value="IN_STOCK">In Stock</SelectItem>
              <SelectItem value="LOW_STOCK">Low Stock</SelectItem>
              <SelectItem value="OUT_OF_STOCK">Out of Stock</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Inventory Data Table */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl shadow-xl overflow-hidden backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-950/90 border-b border-slate-800">
              <tr>
                <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">{t('product.sku')}</th>
                <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">{t('product.name')}</th>
                <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">{t('product.category')}</th>
                <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">{t('product.location')}</th>
                <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">{t('product.quantity')}</th>
                <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">{t('product.status')}</th>
                <th className="px-6 py-3.5 text-right text-[11px] font-bold text-slate-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredInventory.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center text-slate-400">
                    <Package className="h-10 w-10 mx-auto mb-3 text-slate-600" />
                    <p className="text-sm font-semibold text-slate-300">No inventory records found</p>
                    <p className="text-xs text-slate-500 mt-1">Try adjusting your filters or search keywords</p>
                  </td>
                </tr>
              ) : (
                filteredInventory.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-6 py-3.5 text-xs font-mono font-semibold text-blue-400">
                      <span className="bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                        {item.product.sku}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-sm font-semibold text-white">{item.product.name}</td>
                    <td className="px-6 py-3.5 text-xs">
                      <span className="px-2.5 py-0.5 font-medium rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                        {item.product.category}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-xs font-medium text-slate-300">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-950 text-slate-300 border border-slate-800">
                        <MapPin size={11} className="text-slate-500" />
                        {item.location}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-sm font-mono font-bold text-white">{item.quantity}</td>
                    <td className="px-6 py-3.5">
                      <span className={getStatusBadge(item.status)}>
                        {getStatusText(item.status)}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <button
                        onClick={() => handleDeleteClick(item.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"
                        title="Delete Item"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* โมดัลสร้างสถานที่ใหม่ */}
      <Modal
        isOpen={isCreateLocationModalOpen}
        onClose={() => {
          setIsCreateLocationModalOpen(false);
          setLocationFormData({ name: '', description: '', capacity: '' });
        }}
        title="Create New Location"
        size="md"
      >
        <form onSubmit={handleCreateLocation} className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Location Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={locationFormData.name}
              onChange={(e) => setLocationFormData({ ...locationFormData, name: e.target.value.toUpperCase() })}
              className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g. WAREHOUSE-C, SHELF-22"
            />
            <p className="text-xs text-gray-500 mt-1">Enter a unique location name.</p>
          </div>
          
           <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Description <span className="text-gray-400 font-normal">(Optional)</span>
            </label>
            <input
              type="text"
              value={locationFormData.description}
              onChange={(e) => setLocationFormData({ ...locationFormData, description: e.target.value })}
              className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g. Storage for electronics"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Capacity <span className="text-red-500">*</span> <span className="text-gray-400 font-normal">(Max items)</span>
            </label>
            <input
              type="number"
              min="0"
              required
              value={locationFormData.capacity}
              onChange={(e) => setLocationFormData({ ...locationFormData, capacity: e.target.value })}
              className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g. 500"
            />
            <p className="text-xs text-gray-500 mt-1">Maximum number of items this location can hold. Used for warehouse capacity metrics.</p>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={() => setIsCreateLocationModalOpen(false)}
              className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 font-medium transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl hover:from-blue-700 hover:to-cyan-700 font-medium transition-all disabled:opacity-50 shadow-lg"
            >
              {isSubmitting ? 'Creating...' : 'Create Location'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isManageLocationsModalOpen}
        onClose={() => {
          setIsManageLocationsModalOpen(false);
          setManagedLocations([]);
          setLocationToDelete(null);
        }}
        title="Manage Locations"
        size="lg"
      >
        <div className="space-y-4">
          {managedLocations.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center text-sm font-medium text-gray-500">
              No warehouse locations available.
            </div>
          ) : (
            managedLocations.map((location) => (
              <div key={location.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Location Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={location.name}
                      onChange={(e) => handleManagedLocationChange(location.id, 'name', e.target.value)}
                      className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Description <span className="text-gray-400 font-normal">(Optional)</span>
                    </label>
                    <input
                      type="text"
                      value={location.description}
                      onChange={(e) => handleManagedLocationChange(location.id, 'description', e.target.value)}
                      className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Capacity <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={location.capacity}
                      onChange={(e) => handleManagedLocationChange(location.id, 'capacity', e.target.value)}
                      className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs text-gray-500">
                    {location.originalName !== location.name.trim() && location.name.trim() ? `Renaming from ${location.originalName}` : `Current location: ${location.originalName}`}
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => handleLocationDeleteClick(location)}
                      disabled={isLocationActionSubmitting}
                      className="px-4 py-2.5 border-2 border-red-200 text-red-600 rounded-xl hover:bg-red-50 font-medium transition-all disabled:opacity-50"
                    >
                      <span className="flex items-center gap-2">
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateLocation(location)}
                      disabled={isLocationActionSubmitting}
                      className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl hover:from-blue-700 hover:to-cyan-700 font-medium transition-all disabled:opacity-50 shadow-lg"
                    >
                      <span className="flex items-center gap-2">
                        <Save className="h-4 w-4" />
                        {isLocationActionSubmitting && activeLocationId === location.id ? 'Saving...' : 'Save Changes'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </Modal>

      {/* โมดัลการแจ้งเตือน */}
      <NotificationModal
        isOpen={notification.isOpen}
        onClose={() => setNotification({ ...notification, isOpen: false })}
        type={notification.type}
        title={notification.title}
        message={notification.message}
      />

      {/* โมดัลยืนยันการลบ */}
      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={confirmDelete}
        title="Delete Inventory Item"
        message="Are you sure you want to delete this inventory item? This action cannot be undone."
        type="danger"
        confirmText="Delete"
      />

      <ConfirmModal
        isOpen={isLocationDeleteModalOpen}
        onClose={() => {
          setIsLocationDeleteModalOpen(false);
          setLocationToDelete(null);
        }}
        onConfirm={confirmLocationDelete}
        title="Delete Location"
        message={locationToDelete ? `Are you sure you want to delete '${locationToDelete.originalName}'? This action cannot be undone.` : 'Are you sure you want to delete this location?'}
        type="danger"
        confirmText="Delete Location"
        isLoading={isLocationActionSubmitting}
      />
    </div>
  );
}

interface ModernStatCardProps {
  title: string;
  value: string;
  icon: React.ElementType;
  accentColor: 'blue' | 'emerald' | 'amber' | 'violet';
}

function ModernStatCard({ title, value, icon: Icon, accentColor }: ModernStatCardProps) {
  const colorMap = {
    blue: {
      border: 'hover:border-blue-500/40',
      iconBg: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
      glow: 'from-blue-600/10'
    },
    emerald: {
      border: 'hover:border-emerald-500/40',
      iconBg: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
      glow: 'from-emerald-600/10'
    },
    amber: {
      border: 'hover:border-amber-500/40',
      iconBg: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
      glow: 'from-amber-600/10'
    },
    violet: {
      border: 'hover:border-violet-500/40',
      iconBg: 'bg-violet-500/10 border-violet-500/20 text-violet-400',
      glow: 'from-violet-600/10'
    }
  };

  const scheme = colorMap[accentColor];

  return (
    <div
      className={cn(
        "group relative overflow-hidden bg-slate-900/80 rounded-2xl p-4 sm:p-5 border border-slate-800/90 text-left w-full transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl backdrop-blur-sm",
        scheme.border
      )}
    >
      <div className={cn("absolute inset-0 bg-gradient-to-br to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500", scheme.glow)}></div>

      <div className="relative flex flex-col justify-between h-full space-y-2">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-slate-400 truncate tracking-wide">{title}</p>
            <p className="text-xl sm:text-2xl font-bold text-white mt-1 truncate tracking-tight font-mono">{value}</p>
          </div>
          <div className={cn("p-2 rounded-xl border shadow-md ml-2 shrink-0 transition-transform duration-300 group-hover:scale-110", scheme.iconBg)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </div>
    </div>
  );
}