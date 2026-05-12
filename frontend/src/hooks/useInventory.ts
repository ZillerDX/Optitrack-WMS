/**
 * Hook สินค้าคงคลัง
 * จัดการการดึงข้อมูลและการดำเนินการสินค้าคงคลัง
 */

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import type { InventoryWithProduct } from '@/types';

export function useInventory() {
  const [inventory, setInventory] = useState<InventoryWithProduct[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInventory = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await api.getInventory();
      setInventory(data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch inventory');
    } finally {
      setIsLoading(false);
    }
  };

  const getInventoryById = async (id: number): Promise<InventoryWithProduct | null> => {
    try {
      setError(null);
      const data = await api.getInventoryById(id);
      return data;
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch inventory item');
      return null;
    }
  };

  const getLowStockItems = () => {
    return inventory.filter(item => item.status === 'LOW_STOCK');
  };

  const getOutOfStockItems = () => {
    return inventory.filter(item => item.status === 'OUT_OF_STOCK');
  };

  const getInventoryByLocation = (location: string) => {
    return inventory.filter(item => item.location === location);
  };

  const getTotalInventoryValue = () => {
    return inventory.reduce((total, item) => {
      return total + (item.product.cost_price * item.quantity);
    }, 0);
  };

  const deleteInventory = async (id: number): Promise<boolean> => {
    try {
      setError(null);
      await api.deleteInventory(id);
      await fetchInventory();
      return true;
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete inventory item');
      return false;
    }
  };

  useEffect(() => {
    fetchInventory();
  }, []);

  return {
    inventory,
    isLoading,
    error,
    fetchInventory,
    getInventoryById,
    getLowStockItems,
    getOutOfStockItems,
    getInventoryByLocation,
    getTotalInventoryValue,
    deleteInventory,
  };
}