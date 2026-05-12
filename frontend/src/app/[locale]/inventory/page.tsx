"use client";

/**
 * หน้าการจัดการสินค้าคงคลัง
 * ดูและจัดการสินค้าคงคลังในคลังสินค้า
 */

import { useTranslations } from '@/lib/translations';
import { useState, useEffect } from 'react';
import { Package, Search, Filter, TrendingDown, Box, DollarSign, ArrowUpRight, ArrowDownRight, Tag, Trash2, MapPin, Settings2, Save } from 'lucide-react';
import { api } from '@/lib/api';
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
        return 'px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800';
      case 'LOW_STOCK':
        return 'px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800';
      case 'OUT_OF_STOCK':
        return 'px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800';
      default:
        return 'px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800';
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
      <div className="flex h-screen items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4 sm:p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-xl blur-lg opacity-30"></div>
            <div className="relative bg-gradient-to-r from-blue-600 to-cyan-600 p-2.5 sm:p-3 rounded-xl">
              <Package className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
              Inventory
            </h1>
            <p className="text-xs text-slate-500 font-medium">View and manage warehouse inventory.</p>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            {selectedLocation !== 'ALL' && (
                <div className="flex items-center gap-2 px-2.5 py-1.5 bg-white text-blue-700 rounded-xl border border-gray-200 font-semibold text-xs shadow-sm">
                    <MapPin size={12} className="text-blue-500" />
                    {selectedLocation}
                </div>
            )}
            <button
              onClick={openManageLocationsModal}
              className="group relative overflow-hidden bg-white text-slate-700 px-4 py-2 rounded-xl font-medium shadow-sm border border-gray-200 hover:shadow-md transition-all duration-300 hover:scale-105"
            >
               <div className="relative flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-semibold">Manage Locations</span>
              </div>
            </button>
            <button
              onClick={() => setIsCreateLocationModalOpen(true)}
              className="group relative overflow-hidden bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-2 rounded-xl font-medium shadow-sm hover:shadow-md transition-all duration-300 hover:scale-105"
            >
               <div className="relative flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                <span className="text-sm font-semibold">New Location</span>
              </div>
            </button>
        </div>
      </div>

      {/* การ์ดสถิติทันสมัย */}
      <div className="grid gap-4 sm:gap-6 grid-cols-2 lg:grid-cols-4 mb-6 md:mb-8">
        <ModernStatCard
          title="Total item"
          value={stats.totalItems.toLocaleString()}
          icon={Box}
          gradient="from-blue-500 to-cyan-500"
        />
        <ModernStatCard
          title="Low stock item"
          value={stats.lowStockCount.toString()}
          icon={TrendingDown}
          gradient="from-amber-500 to-orange-500"
        />
        <ModernStatCard
          title="Category"
          value={stats.categories.toString()}
          icon={Package}
          gradient="from-emerald-500 to-teal-500"
        />
        <ModernStatCard
          title="Total value (Retail)"
          value={formatCurrency(stats.totalValue)}
          icon={DollarSign}
          gradient="from-violet-500 to-purple-500"
        />
      </div>

      {/* ค้นหาและตัวกรอง */}
      <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row gap-3 sm:gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
          <input
            type="text"
            placeholder={t('action.search') + "..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 sm:pl-12 pr-4 py-2.5 sm:py-3 text-sm sm:text-base border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white shadow-sm hover:shadow-md transition-shadow"
          />
        </div>
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
          <div className="flex items-center gap-2">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-[180px] h-11 sm:h-12 bg-white border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500">
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-gray-500" />
                  <SelectValue placeholder="Category" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Categories</SelectItem>
                {visibleCategories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[160px] h-11 sm:h-12 bg-white border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-gray-500" />
                  <SelectValue placeholder="Status" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Status</SelectItem>
                <SelectItem value="IN_STOCK">In Stock</SelectItem>
                <SelectItem value="LOW_STOCK">Low Stock</SelectItem>
                <SelectItem value="OUT_OF_STOCK">Out of Stock</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* ตารางสินค้าคงคลัง */}
      <div className="bg-white rounded-2xl shadow-lg hover:shadow-xl transition-shadow">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b-2 border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-700 tracking-wider border-none">{t('product.sku')}</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-700 tracking-wider border-none">{t('product.name')}</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-700 tracking-wider border-none">{t('product.category')}</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-700 tracking-wider border-none">{t('product.location')}</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-700 tracking-wider border-none">{t('product.quantity')}</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-700 tracking-wider border-none">{t('product.status')}</th>
                <th className="px-6 py-4 text-right text-xs font-medium text-gray-700 tracking-wider border-none">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredInventory.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                    <Package className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                    <p className="text-lg font-medium">No inventory items found.</p>
                  </td>
                </tr>
              ) : (
                filteredInventory.map((item) => (
                  <tr key={item.id} className="hover:bg-gradient-to-r hover:from-blue-50 hover:to-purple-50 transition-all duration-200">
                    <td className="px-6 py-4 text-sm font-semibold text-gray-900">{item.product.sku}</td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{item.product.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <span className="px-3 py-1.5 text-xs font-semibold rounded-full bg-gradient-to-r from-blue-100 to-cyan-100 text-blue-800 shadow-sm">
                        {item.product.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{item.location}</td>
                    <td className="px-6 py-4 text-sm font-bold text-gray-900">{item.quantity}</td>
                    <td className="px-6 py-4">
                      <span className={getStatusBadge(item.status)}>
                        {getStatusText(item.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleDeleteClick(item.id)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        title="Delete Item"
                      >
                        <Trash2 className="h-5 w-5" />
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
  gradient: string;
}

function ModernStatCard({ title, value, icon: Icon, gradient }: ModernStatCardProps) {
  return (
    <div className="group relative h-full min-h-[112px] overflow-hidden bg-white rounded-xl p-4 sm:p-5 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-1 text-left w-full border border-gray-100">
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-300`}></div>
      <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${gradient} rounded-full -mr-16 -mt-16 opacity-5 group-hover:scale-110 transition-transform duration-500`}></div>

      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] sm:text-xs font-medium text-slate-400 truncate tracking-wide">{title}</p>
            <p className="text-lg sm:text-xl md:text-2xl font-bold text-slate-800 mt-0.5 truncate">{value}</p>
          </div>
          <div className={`bg-gradient-to-br ${gradient} p-2 rounded-lg shadow-md group-hover:scale-110 transition-transform duration-300 ml-2`}>
            <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
          </div>
        </div>
      </div>
    </div>
  );
}