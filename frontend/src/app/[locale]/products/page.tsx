"use client";

import { useState, useEffect } from 'react';
import { Plus, Search, Edit, Trash2, Package, ArrowUpRight, ArrowDownRight, Filter, PlusCircle, X, Barcode as BarcodeIcon, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Modal, ConfirmModal, NotificationModal, BarcodeModal } from '@/components/modals';
import { useLocationStore } from '@/store/useLocationStore';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { SUPPORTED_CURRENCIES, type SupportedCurrency } from '@/lib/currency';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface Product {
  id: number;
  sku: string;
  name: string;
  category: string;
  cost_price: number;
  sell_price: number;
  min_stock_level: number;
  unit: string;
  barcode?: string;
  supplier_id?: number;
  reorder_point: number;
  reorder_quantity: number;
}

interface Category {
  id: number;
  name: string;
}

interface InventoryItem {
  product_id: number;
  location: string;
}

interface NotificationState {
  isOpen: boolean;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
}

export default function ProductsPage() {
  const { selectedLocation, locations, fetchLocations } = useLocationStore();
  const { currency, rates, formatCurrency } = useCurrencyFormatter();
  const [products, setProducts] = useState<Product[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showInlineCategory, setShowInlineCategory] = useState(false);
  const [inlineCategoryName, setInlineCategoryName] = useState('');
  const [isCreatingInlineCategory, setIsCreatingInlineCategory] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{isOpen: boolean; product: Product | null}>({
    isOpen: false,
    product: null
  });
  const [deleteCategoryConfirm, setDeleteCategoryConfirm] = useState<{isOpen: boolean; category: Category | null}>({
    isOpen: false,
    category: null
  });
  const [notification, setNotification] = useState<NotificationState>({
    isOpen: false,
    type: 'success',
    title: '',
    message: ''
  });
  const [isBarcodeModalOpen, setIsBarcodeModalOpen] = useState(false);
  const [selectedBarcodeProduct, setSelectedBarcodeProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState({
    sku: '',
    name: '',
    category: '',
    cost_price: '',
    cost_currency: currency,
    sell_price: '',
    sell_currency: currency,
    min_stock_level: '',
    unit: 'pcs',
    location: '',
  });

  // ดึงข้อมูลสินค้าและหมวดหมู่เมื่อเมานต์ + รีเฟรชอัตโนมัติ
  useEffect(() => {
    fetchLocations();
    fetchProducts();
    fetchInventoryItems();
    fetchCategories();

    const intervalId = setInterval(() => {
      fetchProducts();
      fetchInventoryItems();
    }, 30000);

    const handleFocus = () => {
      fetchLocations();
      fetchProducts();
      fetchInventoryItems();
      fetchCategories();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
    };
  }, [selectedLocation]);

  const fetchProducts = async () => {
    try {
      const data = await api.getProducts();
      setProducts(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch products:', error);
      setProducts([]);
      showNotification('error', 'Error', 'Failed to load products');
    }
  };

  const fetchInventoryItems = async () => {
    try {
      const data = await api.getInventory(selectedLocation);
      setInventoryItems(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch inventory:', error);
      setInventoryItems([]);
      showNotification('error', 'Error', 'Failed to load inventory');
    }
  };

  const fetchCategories = async () => {
    try {
      const data = await api.getCategories();
      setCategories(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch categories:', error);
      setCategories([]);
    }
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;

    setIsLoading(true);
    try {
      await api.createCategory(newCategoryName.trim());
      showNotification('success', 'Success!', `Category "${newCategoryName}" has been created.`);
      setNewCategoryName('');
      setIsCategoryModalOpen(false);
      fetchCategories();
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || 'Failed to create category';
      showNotification('error', 'Error', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateInlineCategory = async () => {
    const trimmed = inlineCategoryName.trim();
    if (!trimmed) return;

    setIsCreatingInlineCategory(true);
    try {
      await api.createCategory(trimmed);
      showNotification('success', 'Category Created', `Category "${trimmed}" has been created and saved.`);
      await fetchCategories();
      setFormData(prev => ({ ...prev, category: trimmed }));
      setInlineCategoryName('');
      setShowInlineCategory(false);
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || 'Failed to create category';
      showNotification('error', 'Error', errorMessage);
    } finally {
      setIsCreatingInlineCategory(false);
    }
  };

  const handleDeleteCategoryClick = (category: Category) => {
    setIsCategoryModalOpen(false);
    setDeleteCategoryConfirm({ isOpen: true, category });
  };

  const handleDeleteCategoryConfirm = async () => {
    if (!deleteCategoryConfirm.category) return;

    try {
      await api.deleteCategory(deleteCategoryConfirm.category.id);
      showNotification('success', 'Deleted!', `Category "${deleteCategoryConfirm.category.name}" has been deleted successfully.`);
      fetchCategories();
      // If the deleted category was selected in the filter, reset it
      if (categoryFilter === deleteCategoryConfirm.category.name) {
        setCategoryFilter('ALL');
      }
    } catch (error: any) {
      console.error('Failed to delete category:', error);
      const errorMessage = error.response?.data?.detail || 'Failed to delete category. It may be in use by products.';
      showNotification('error', 'Error', errorMessage);
    } finally {
      setDeleteCategoryConfirm({ isOpen: false, category: null });
    }
  };

  const showNotification = (type: NotificationState['type'], title: string, message: string) => {
    setNotification({ isOpen: true, type, title, message });
  };

  const formatPriceInput = (amount: number) => Number(amount.toFixed(2)).toString();

  const convertUsdToCurrencyInput = (amount: number, selectedCurrency: SupportedCurrency) => {
    const rate = rates[selectedCurrency] || 1;
    return formatPriceInput((Number(amount) || 0) * rate);
  };

  const convertCurrencyInputToUsd = (amount: string, selectedCurrency: SupportedCurrency) => {
    const numericAmount = Number.parseFloat(amount);
    const rate = rates[selectedCurrency] || 1;
    return Number(((Number.isFinite(numericAmount) ? numericAmount : 0) / rate).toFixed(2));
  };

  const convertPriceInputCurrency = (
    amount: string,
    fromCurrency: SupportedCurrency,
    toCurrency: SupportedCurrency
  ) => {
    if (!amount) return '';
    const amountInUsd = convertCurrencyInputToUsd(amount, fromCurrency);
    return convertUsdToCurrencyInput(amountInUsd, toCurrency);
  };

  const handleCostCurrencyChange = (selectedCurrency: SupportedCurrency) => {
    setFormData({
      ...formData,
      cost_price: convertPriceInputCurrency(
        formData.cost_price,
        formData.cost_currency,
        selectedCurrency
      ),
      cost_currency: selectedCurrency,
    });
  };

  const handleSellCurrencyChange = (selectedCurrency: SupportedCurrency) => {
    setFormData({
      ...formData,
      sell_price: convertPriceInputCurrency(
        formData.sell_price,
        formData.sell_currency,
        selectedCurrency
      ),
      sell_currency: selectedCurrency,
    });
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      sku: product.sku,
      name: product.name,
      category: product.category || '',
      cost_price: convertUsdToCurrencyInput(product.cost_price, currency),
      cost_currency: currency,
      sell_price: convertUsdToCurrencyInput(product.sell_price, currency),
      sell_currency: currency,
      min_stock_level: product.min_stock_level.toString(),
      unit: product.unit,
      location: '', // Not editable in edit mode
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editingProduct && (!formData.location || formData.location === 'ALL')) {
      showNotification('warning', 'Location Required', 'Please select a location for the new product.');
      return;
    }

    setIsLoading(true);

    try {
      const { location, cost_currency, sell_currency, ...restFormData } = formData;
      const productData = {
        ...restFormData,
        location: location && location !== 'ALL' ? location : undefined,
        cost_price: convertCurrencyInputToUsd(formData.cost_price, cost_currency),
        sell_price: convertCurrencyInputToUsd(formData.sell_price, sell_currency),
        min_stock_level: parseInt(formData.min_stock_level),
      };

      if (editingProduct) {
        await api.updateProduct(editingProduct.id, productData);
        showNotification('success', 'Success!', `Product "${formData.name}" has been updated successfully.`);
      } else {
        await api.createProduct(productData);
        showNotification('success', 'Success!', `Product "${formData.name}" has been created successfully.`);
      }

      // รีเซ็ตแบบฟอร์มและปิดโมดัล
      resetForm();
      setIsModalOpen(false);
      fetchProducts();
      fetchInventoryItems();
    } catch (error: any) {
      console.error('Failed to save product:', error);
      const errorMessage = error.response?.data?.detail || 'Failed to save product. Please try again.';
      showNotification('error', 'Error', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteClick = (product: Product) => {
    setDeleteConfirm({ isOpen: true, product });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm.product) return;

    try {
      await api.deleteProduct(deleteConfirm.product.id);
      showNotification('success', 'Deleted!', `Product "${deleteConfirm.product.name}" has been deleted successfully.`);
      fetchProducts();
      fetchInventoryItems();
    } catch (error) {
      console.error('Failed to delete product:', error);
      showNotification('error', 'Error', 'Failed to delete product. It may have associated inventory records.');
    } finally {
      setDeleteConfirm({ isOpen: false, product: null });
    }
  };

  const resetForm = () => {
    setFormData({
      sku: '',
      name: '',
      category: '',
      cost_price: '',
      cost_currency: currency,
      sell_price: '',
      sell_currency: currency,
      min_stock_level: '',
      unit: 'pcs',
      location: '',
    });
    setEditingProduct(null);
    setShowInlineCategory(false);
    setInlineCategoryName('');
  };

  const safeProducts = Array.isArray(products) ? products : [];
  const safeInventory = Array.isArray(inventoryItems) ? inventoryItems : [];
  const safeCategories = Array.isArray(categories) ? categories : [];

  const locationScopedProducts = selectedLocation === 'ALL'
    ? safeProducts
    : safeProducts.filter((product) => safeInventory.some((item) => item?.product_id === product?.id));

  const visibleCategories = selectedLocation === 'ALL'
    ? safeCategories
    : safeCategories.filter((category) => locationScopedProducts.some((product) => product?.category === category?.name));

  const filteredProducts = locationScopedProducts.filter(product => {
    if (!product) return false;
    const name = product.name || '';
    const sku = product.sku || '';
    const category = product.category || '';
    const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      category.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategory = categoryFilter === 'ALL' || category === categoryFilter;

    return matchesSearch && matchesCategory;
  });

  // คำนวณสถิติ
  const stats = {
    totalProducts: locationScopedProducts.length,
    activeProducts: locationScopedProducts.filter(p => p.min_stock_level > 0).length,
    totalCategories: new Set(locationScopedProducts.map(p => p.category)).size,
    avgPrice: locationScopedProducts.length > 0
      ? locationScopedProducts.reduce((sum, p) => sum + (Number(p.sell_price) || 0), 0) / locationScopedProducts.length
      : 0,
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 sm:p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 shadow-lg shadow-blue-500/5">
            <Package className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Product Master Catalog
            </h1>
            <p className="text-xs text-slate-400 font-medium">SKU management, unit pricing &amp; margin calculations</p>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <button
            onClick={() => setIsCategoryModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700 text-xs font-semibold shadow-sm transition-all"
          >
            <PlusCircle className="h-4 w-4 text-violet-400" />
            <span>Manage Categories</span>
          </button>
          <button
            onClick={() => {
              resetForm();
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/30 transition-all"
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span>Add Product</span>
          </button>
        </div>
      </div>

      {/* Stat Cards Grid */}
      <div className="grid gap-4 sm:gap-5 grid-cols-2 lg:grid-cols-4">
        <ModernStatCard
          title="Catalog SKUs"
          value={stats.totalProducts.toString()}
          icon={Package}
          accentColor="blue"
        />
        <ModernStatCard
          title="Stock Tracked Items"
          value={stats.activeProducts.toString()}
          icon={Package}
          accentColor="emerald"
        />
        <ModernStatCard
          title="Active Categories"
          value={stats.totalCategories.toString()}
          icon={Package}
          accentColor="violet"
        />
        <ModernStatCard
          title="Average Unit Price"
          value={formatCurrency(stats.avgPrice)}
          icon={Package}
          accentColor="amber"
        />
      </div>

      {/* Search & Category Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search by SKU, product name, or category..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-900/80 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-inner transition-all"
          />
        </div>
        <div className="flex gap-3">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full sm:w-[180px] h-10 bg-slate-900 border-slate-800 text-slate-200 rounded-xl focus:ring-1 focus:ring-blue-500 text-xs">
              <div className="flex items-center gap-2">
                <Filter className="h-3.5 w-3.5 text-slate-400" />
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
        </div>
      </div>

      {/* Products Data Table */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl shadow-xl overflow-hidden backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-950/90 border-b border-slate-800">
              <tr>
                <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">SKU</th>
                <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Product Name</th>
                <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Category</th>
                <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Cost Price</th>
                <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Retail Price</th>
                <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Margin</th>
                <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Unit</th>
                <th className="px-6 py-3.5 text-right text-[11px] font-bold text-slate-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-16 text-center text-slate-400">
                    <Package className="h-10 w-10 mx-auto mb-3 text-slate-600" />
                    <p className="text-sm font-semibold text-slate-300">No products found</p>
                    <p className="text-xs text-slate-500 mt-1">Try adjusting your search terms or category filter</p>
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => {
                  const marginPct = (Number(product.sell_price) > 0 && Number(product.cost_price) > 0)
                    ? Math.round(((Number(product.sell_price) - Number(product.cost_price)) / Number(product.sell_price)) * 100)
                    : null;

                  return (
                    <tr key={product.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-6 py-3.5 text-xs font-mono font-semibold text-blue-400">
                        <span className="bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                          {product.sku}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-sm font-semibold text-white">{product.name}</td>
                      <td className="px-6 py-3.5 text-xs">
                        <span className="px-2.5 py-0.5 font-medium rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                          {product.category || 'Uncategorized'}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-xs font-mono text-slate-400">{formatCurrency(product.cost_price)}</td>
                      <td className="px-6 py-3.5 text-sm font-mono font-bold text-emerald-400">{formatCurrency(product.sell_price)}</td>
                      <td className="px-6 py-3.5 text-xs font-mono">
                        {marginPct !== null ? (
                          <span className={cn(
                            "px-2 py-0.5 rounded-full text-[11px] font-bold border",
                            marginPct >= 30 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                            marginPct > 0 ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                            "bg-rose-500/10 text-rose-400 border-rose-500/20"
                          )}>
                            {marginPct >= 0 ? `+${marginPct}%` : `${marginPct}%`}
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-xs text-slate-400 font-medium">{product.unit}</td>
                      <td className="px-6 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedBarcodeProduct(product);
                              setIsBarcodeModalOpen(true);
                            }}
                            className="p-1.5 text-slate-400 hover:text-violet-400 hover:bg-violet-500/10 rounded-lg transition-all"
                            title="Print Barcode Label"
                          >
                            <BarcodeIcon className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleEdit(product)}
                            className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-all"
                            title="Edit product"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteClick(product)}
                            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"
                            title="Delete product"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* โมดัลสร้าง/แก้ไข */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          resetForm();
        }}
        title={editingProduct ? 'Edit Product' : 'Add New Product'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                SKU <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.sku}
                onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs sm:text-sm font-medium transition-all"
                placeholder="PROD-001"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                Product Name <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs sm:text-sm font-medium transition-all"
                placeholder="Product Name"
              />
            </div>

            {!editingProduct && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                  Location <span className="text-rose-400">*</span>
                </label>
                <Select
                  required
                  value={formData.location}
                  onValueChange={(val) => setFormData({ ...formData, location: val })}
                >
                  <SelectTrigger className="w-full h-11 bg-slate-950/80 border border-slate-800 rounded-xl text-slate-100 focus:ring-1 focus:ring-blue-500 text-xs sm:text-sm">
                    <SelectValue placeholder="Select Location" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.filter(loc => loc !== 'ALL').map((loc) => (
                      <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {locations.filter(loc => loc !== 'ALL').length === 0 && (
                  <p className="text-xs text-amber-400 mt-1">No locations available.</p>
                )}
              </div>
            )}

            <div className={editingProduct ? "sm:col-span-1" : ""}>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Category <span className="text-rose-400">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setShowInlineCategory(!showInlineCategory);
                    if (showInlineCategory) setInlineCategoryName('');
                  }}
                  className="text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
                >
                  <Plus className="h-3.5 w-3.5 shrink-0" />
                  <span>{showInlineCategory ? "Choose Existing" : "Create New Category"}</span>
                </button>
              </div>

              {showInlineCategory ? (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      autoFocus
                      value={inlineCategoryName}
                      onChange={(e) => setInlineCategoryName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleCreateInlineCategory();
                        }
                      }}
                      placeholder="Enter new category name..."
                      className="flex-1 px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs sm:text-sm font-medium transition-all"
                    />
                    <button
                      type="button"
                      disabled={isCreatingInlineCategory || !inlineCategoryName.trim()}
                      onClick={handleCreateInlineCategory}
                      className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-600/30 transition-all disabled:opacity-50 shrink-0 flex items-center gap-1.5"
                    >
                      <Check className="h-3.5 w-3.5 shrink-0" />
                      <span>{isCreatingInlineCategory ? 'Saving...' : 'Save'}</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400">Creates and saves the new category directly to database.</p>
                </div>
              ) : (
                <Select
                  required
                  value={formData.category}
                  onValueChange={(val) => {
                    if (val === '__CREATE_NEW__') {
                      setShowInlineCategory(true);
                    } else {
                      setFormData({ ...formData, category: val });
                    }
                  }}
                >
                  <SelectTrigger className="w-full h-11 bg-slate-950/80 border border-slate-800 rounded-xl text-slate-100 focus:ring-1 focus:ring-blue-500 text-xs sm:text-sm">
                    <SelectValue placeholder="Select Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__CREATE_NEW__" className="text-blue-400 font-semibold border-b border-slate-800 pb-2 mb-1 cursor-pointer">
                      <div className="flex items-center gap-1.5">
                        <Plus className="h-3.5 w-3.5 shrink-0 text-blue-400" />
                        <span>+ Create new category...</span>
                      </div>
                    </SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {categories.length === 0 && !showInlineCategory && (
                <p className="text-xs text-amber-400 mt-1">No categories yet. Click Create New Category above!</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                Unit <span className="text-rose-400">*</span>
              </label>
              <Select
                value={formData.unit}
                onValueChange={(val) => setFormData({ ...formData, unit: val })}
              >
                <SelectTrigger className="w-full h-11 bg-slate-950/80 border border-slate-800 rounded-xl text-slate-100 focus:ring-1 focus:ring-blue-500 text-xs sm:text-sm">
                  <SelectValue placeholder="Select Unit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pcs">Pieces</SelectItem>
                  <SelectItem value="box">Box</SelectItem>
                  <SelectItem value="pack">Pack</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                Cost Price <span className="text-rose-400">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  required
                  value={formData.cost_price}
                  onChange={(e) => setFormData({ ...formData, cost_price: e.target.value })}
                  className="min-w-0 flex-1 px-3.5 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs sm:text-sm font-medium font-mono transition-all"
                  placeholder="100.00"
                />
                <Select
                  value={formData.cost_currency}
                  onValueChange={(val) => handleCostCurrencyChange(val as SupportedCurrency)}
                >
                  <SelectTrigger className="h-11 w-[92px] bg-slate-950/80 border border-slate-800 rounded-xl text-slate-100 focus:ring-1 focus:ring-blue-500 text-xs font-semibold shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_CURRENCIES.map((currencyOption) => (
                      <SelectItem key={currencyOption} value={currencyOption}>
                        {currencyOption}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                Sell Price <span className="text-rose-400">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  required
                  value={formData.sell_price}
                  onChange={(e) => setFormData({ ...formData, sell_price: e.target.value })}
                  className="min-w-0 flex-1 px-3.5 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs sm:text-sm font-medium font-mono transition-all"
                  placeholder="150.00"
                />
                <Select
                  value={formData.sell_currency}
                  onValueChange={(val) => handleSellCurrencyChange(val as SupportedCurrency)}
                >
                  <SelectTrigger className="h-11 w-[92px] bg-slate-950/80 border border-slate-800 rounded-xl text-slate-100 focus:ring-1 focus:ring-blue-500 text-xs font-semibold shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_CURRENCIES.map((currencyOption) => (
                      <SelectItem key={currencyOption} value={currencyOption}>
                        {currencyOption}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                Min Stock Level <span className="text-rose-400">*</span>
              </label>
              <input
                type="number"
                required
                value={formData.min_stock_level}
                onChange={(e) => setFormData({ ...formData, min_stock_level: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs sm:text-sm font-medium font-mono transition-all"
                placeholder="10"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-5 border-t border-slate-800/80">
            <button
              type="button"
              onClick={() => {
                setIsModalOpen(false);
                resetForm();
              }}
              className="flex-1 px-4 py-2.5 border border-slate-800 bg-slate-950/60 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl text-xs font-semibold transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-all disabled:opacity-50 shadow-lg shadow-blue-600/30"
            >
              {isLoading ? 'Saving...' : (editingProduct ? 'Update Product' : 'Create Product')}
            </button>
          </div>
        </form>
      </Modal>

      {/* โมดัลยืนยันการลบ */}
      <ConfirmModal
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, product: null })}
        onConfirm={handleDeleteConfirm}
        title="Delete Product?"
        message={`Are you sure you want to delete "${deleteConfirm.product?.name}"? This action cannot be undone and will also delete all associated inventory records.`}
        type="danger"
        confirmText="Delete Product"
        cancelText="Cancel"
      />

      {/* โมดัลเพิ่มหมวดหมู่ */}
      <Modal
        isOpen={isCategoryModalOpen}
        onClose={() => {
          setIsCategoryModalOpen(false);
          setNewCategoryName('');
        }}
        title="Add New Category"
        size="sm"
      >
        <div className="space-y-5">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
              Category Name <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 text-xs sm:text-sm font-medium transition-all"
              placeholder="e.g., Electronics, Construction, Food"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCreateCategory();
                }
              }}
            />
          </div>

          {categories.length > 0 && (
            <div className="pt-4 border-t border-slate-800/80">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Existing Categories</p>
              <div className="flex flex-wrap gap-2">
                {categories.map((cat) => (
                  <div
                    key={cat.id}
                    className="group flex items-center gap-1.5 pl-3 pr-2 py-1 text-xs font-medium rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20"
                  >
                    <span>{cat.name}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteCategoryClick(cat)}
                      className="p-0.5 rounded-full text-purple-400 hover:bg-rose-500/20 hover:text-rose-400 transition-colors"
                      title="Delete category"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-4 border-t border-slate-800/80">
            <button
              type="button"
              onClick={() => {
                setIsCategoryModalOpen(false);
                setNewCategoryName('');
              }}
              className="flex-1 px-4 py-2.5 border border-slate-800 bg-slate-950/60 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl text-xs font-semibold transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreateCategory}
              disabled={isLoading || !newCategoryName.trim()}
              className="flex-1 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-semibold transition-all disabled:opacity-50 shadow-lg shadow-purple-600/30"
            >
              {isLoading ? 'Creating...' : 'Create Category'}
            </button>
          </div>
        </div>
      </Modal>

      {/* โมดัลยืนยันการลบหมวดหมู่ */}
      <ConfirmModal
        isOpen={deleteCategoryConfirm.isOpen}
        onClose={() => setDeleteCategoryConfirm({ isOpen: false, category: null })}
        onConfirm={handleDeleteCategoryConfirm}
        title="Delete Category?"
        message={`Are you sure you want to delete category "${deleteCategoryConfirm.category?.name}"? This action cannot be undone.`}
        type="danger"
        confirmText="Delete Category"
        cancelText="Cancel"
      />

      {/* Barcode Label Modal */}
      <BarcodeModal
        isOpen={isBarcodeModalOpen}
        onClose={() => {
          setIsBarcodeModalOpen(false);
          setSelectedBarcodeProduct(null);
        }}
        product={selectedBarcodeProduct}
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