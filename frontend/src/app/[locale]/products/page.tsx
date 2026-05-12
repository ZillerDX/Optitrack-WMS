"use client";

import { useState, useEffect } from 'react';
import { Plus, Search, Edit, Trash2, Package, ArrowUpRight, ArrowDownRight, Filter, PlusCircle, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Modal, ConfirmModal, NotificationModal } from '@/components/modals';
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
      setProducts(data);
    } catch (error) {
      console.error('Failed to fetch products:', error);
      showNotification('error', 'Error', 'Failed to load products');
    }
  };

  const fetchInventoryItems = async () => {
    try {
      const data = await api.getInventory(selectedLocation);
      setInventoryItems(data);
    } catch (error) {
      console.error('Failed to fetch inventory:', error);
      showNotification('error', 'Error', 'Failed to load inventory');
    }
  };

  const fetchCategories = async () => {
    try {
      const data = await api.getCategories();
      setCategories(data);
    } catch (error) {
      console.error('Failed to fetch categories:', error);
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
        cost_price: convertCurrencyInputToUsd(formData.cost_price, cost_currency),
        sell_price: convertCurrencyInputToUsd(formData.sell_price, sell_currency),
        min_stock_level: parseInt(formData.min_stock_level),
      };

      if (editingProduct) {
        await api.updateProduct(editingProduct.id, productData);
        showNotification('success', 'Success!', `Product "${formData.name}" has been updated successfully.`);
      } else {
        const newProduct = await api.createProduct(productData);
        
        // Create initial inventory record at the specified location
        if (location && location !== 'ALL') {
          try {
            await api.createInventory({
              product_id: newProduct.id,
              location: location,
              quantity: 0,
              status: 'OUT_OF_STOCK'
            });
          } catch (invError) {
            console.error('Failed to create initial inventory:', invError);
            // Non-fatal, product is created
          }
        }
        
        showNotification('success', 'Success!', `Product "${formData.name}" has been created successfully.`);
      }

      // รีเซ็ตแบบฟอร์มและปิดโมดัล
      resetForm();
      setIsModalOpen(false);
      fetchProducts();
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
      location: selectedLocation === 'ALL' ? '' : selectedLocation,
    });
    setEditingProduct(null);
  };

  const locationScopedProducts = selectedLocation === 'ALL'
    ? products
    : products.filter((product) => inventoryItems.some((item) => item.product_id === product.id));

  const visibleCategories = selectedLocation === 'ALL'
    ? categories
    : categories.filter((category) => locationScopedProducts.some((product) => product.category === category.name));

  const filteredProducts = locationScopedProducts.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (product.category && product.category.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesCategory = categoryFilter === 'ALL' || product.category === categoryFilter;

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
              Products
            </h1>
            <p className="text-xs text-slate-500 font-medium">Manage your product catalog and pricing.</p>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <button
              onClick={() => setIsCategoryModalOpen(true)}
              className="group relative overflow-hidden bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-4 h-10 rounded-xl font-medium shadow-sm hover:shadow-md transition-all duration-300 hover:scale-105"
            >
              <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-20 transition-opacity"></div>
              <div className="relative flex items-center gap-1.5 sm:gap-2">
                <PlusCircle className="h-4 w-4" />
                <span className="text-sm font-semibold">Add Category</span>
              </div>
            </button>
            <button
              onClick={() => {
                resetForm();
                setIsModalOpen(true);
              }}
              className="group relative overflow-hidden bg-gradient-to-r from-green-600 to-emerald-600 text-white px-4 h-10 rounded-xl font-medium shadow-sm hover:shadow-md transition-all duration-300 hover:scale-105"
            >
              <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-20 transition-opacity"></div>
              <div className="relative flex items-center gap-1.5 sm:gap-2">
                <Plus className="h-4 w-4" />
                <span className="text-sm font-semibold">Add Product</span>
              </div>
            </button>
        </div>
      </div>

      {/* การ์ดสถิติทันสมัย */}
      <div className="grid gap-4 sm:gap-6 grid-cols-2 lg:grid-cols-4 mb-6 md:mb-8">
        <ModernStatCard
          title="Total product"
          value={stats.totalProducts.toString()}
          icon={Package}
          gradient="from-blue-500 to-cyan-500"
        />
        <ModernStatCard
          title="Active product"
          value={stats.activeProducts.toString()}
          icon={Package}
          gradient="from-emerald-500 to-teal-500"
        />
        <ModernStatCard
          title="Category"
          value={stats.totalCategories.toString()}
          icon={Package}
          gradient="from-violet-500 to-purple-500"
        />
        <ModernStatCard
          title="Avg price"
          value={formatCurrency(stats.avgPrice)}
          icon={Package}
          gradient="from-amber-500 to-orange-500"
        />
      </div>

      {/* ค้นหาและตัวกรองหมวดหมู่ */}
      <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row gap-3 sm:gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search products..."
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
                  <Filter className="h-4 w-4 text-gray-500" />
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
        </div>
      </div>

      {/* ตารางสินค้า */}
      <div className="bg-white rounded-2xl shadow-lg hover:shadow-xl transition-shadow">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b-2 border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-700 tracking-wider border-none">Sku</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-700 tracking-wider border-none">Name</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-700 tracking-wider border-none">Category</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-700 tracking-wider border-none">Cost price</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-700 tracking-wider border-none">Sell price</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-700 tracking-wider border-none">Unit</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-700 tracking-wider border-none">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                    <Package className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                    <p className="text-lg font-medium">No products found.</p>
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => (
                  <tr key={product.id} className="hover:bg-gradient-to-r hover:from-blue-50 hover:to-purple-50 transition-all duration-200">
                    <td className="px-6 py-4 text-sm font-semibold text-gray-900">{product.sku}</td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{product.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <span className="px-3 py-1.5 text-xs font-semibold rounded-full bg-gradient-to-r from-blue-100 to-cyan-100 text-blue-800 shadow-sm">
                        {product.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{formatCurrency(product.cost_price)}</td>
                    <td className="px-6 py-4 text-sm font-bold text-green-600">{formatCurrency(product.sell_price)}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{product.unit}</td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(product)}
                          className="group p-2 text-blue-600 hover:bg-gradient-to-r hover:from-blue-500 hover:to-cyan-500 hover:text-white rounded-lg transition-all duration-200 hover:scale-110 shadow-sm hover:shadow-md"
                          title="Edit product"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteClick(product)}
                          className="group p-2 text-red-600 hover:bg-gradient-to-r hover:from-red-500 hover:to-pink-500 hover:text-white rounded-lg transition-all duration-200 hover:scale-110 shadow-sm hover:shadow-md"
                          title="Delete product"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
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
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                SKU <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.sku}
                onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="PROD-001"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Product Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Product Name"
              />
            </div>

            {!editingProduct && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Location <span className="text-red-500">*</span>
                </label>
                <Select
                  required
                  value={formData.location}
                  onValueChange={(val) => setFormData({ ...formData, location: val })}
                >
                  <SelectTrigger className="w-full h-11 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500">
                    <SelectValue placeholder="Select Location" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.filter(loc => loc !== 'ALL').map((loc) => (
                      <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {locations.filter(loc => loc !== 'ALL').length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">No locations available.</p>
                )}
              </div>
            )}

            <div className={editingProduct ? "sm:col-span-1" : ""}>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Category <span className="text-red-500">*</span>
              </label>
              <Select
                required
                value={formData.category}
                onValueChange={(val) => setFormData({ ...formData, category: val })}
              >
                <SelectTrigger className="w-full h-11 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500">
                  <SelectValue placeholder="Select Category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {categories.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">No categories yet. Add one first!</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Unit <span className="text-red-500">*</span>
              </label>
              <Select
                value={formData.unit}
                onValueChange={(val) => setFormData({ ...formData, unit: val })}
              >
                <SelectTrigger className="w-full h-11 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500">
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
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Cost Price <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  required
                  value={formData.cost_price}
                  onChange={(e) => setFormData({ ...formData, cost_price: e.target.value })}
                  className="min-w-0 flex-1 px-4 py-2.5 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="100.00"
                />
                <Select
                  value={formData.cost_currency}
                  onValueChange={(val) => handleCostCurrencyChange(val as SupportedCurrency)}
                >
                  <SelectTrigger className="h-11 w-[92px] border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500">
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
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Sell Price <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  required
                  value={formData.sell_price}
                  onChange={(e) => setFormData({ ...formData, sell_price: e.target.value })}
                  className="min-w-0 flex-1 px-4 py-2.5 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="150.00"
                />
                <Select
                  value={formData.sell_currency}
                  onValueChange={(val) => handleSellCurrencyChange(val as SupportedCurrency)}
                >
                  <SelectTrigger className="h-11 w-[92px] border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500">
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
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Min Stock Level <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                required
                value={formData.min_stock_level}
                onChange={(e) => setFormData({ ...formData, min_stock_level: e.target.value })}
                className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="10"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={() => {
                setIsModalOpen(false);
                resetForm();
              }}
              className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 font-medium transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 font-medium transition-all disabled:opacity-50 shadow-lg"
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
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Category Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
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
            <div className="pt-4 border-t border-gray-200">
              <p className="text-sm font-medium text-gray-600 mb-2">Existing Categories:</p>
              <div className="flex flex-wrap gap-2">
                {categories.map((cat) => (
                  <div
                    key={cat.id}
                    className="group flex items-center gap-1 pl-3 pr-2 py-1 text-xs font-medium rounded-full bg-gradient-to-r from-purple-100 to-indigo-100 text-purple-800 border border-purple-200"
                  >
                    <span>{cat.name}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteCategoryClick(cat)}
                      className="p-0.5 rounded-full text-purple-600 hover:bg-purple-200 hover:text-red-600 transition-colors"
                      title="Delete category"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={() => {
                setIsCategoryModalOpen(false);
                setNewCategoryName('');
              }}
              className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 font-medium transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreateCategory}
              disabled={isLoading || !newCategoryName.trim()}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl hover:from-purple-700 hover:to-indigo-700 font-medium transition-all disabled:opacity-50 shadow-lg"
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