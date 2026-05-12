/**
 * Hook สินค้า
 * จัดการการดึงข้อมูลและการดำเนินการสินค้า
 */

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import type { Product, ProductCreate, ProductUpdate } from '@/types';

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await api.getProducts();
      setProducts(data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch products');
    } finally {
      setIsLoading(false);
    }
  };

  const getProductById = async (id: number): Promise<Product | null> => {
    try {
      setError(null);
      const data = await api.getProductById(id);
      return data;
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch product');
      return null;
    }
  };

  const getProductBySku = async (sku: string): Promise<Product | null> => {
    try {
      setError(null);
      const data = await api.getProductBySku(sku);
      return data;
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Product not found');
      return null;
    }
  };

  const createProduct = async (productData: ProductCreate): Promise<Product | null> => {
    try {
      setError(null);
      const data = await api.createProduct(productData);
      await fetchProducts();
      return data;
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create product');
      return null;
    }
  };

  const updateProduct = async (
    id: number,
    productData: ProductUpdate
  ): Promise<Product | null> => {
    try {
      setError(null);
      const data = await api.updateProduct(id, productData);
      await fetchProducts();
      return data;
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update product');
      return null;
    }
  };

  const deleteProduct = async (id: number): Promise<boolean> => {
    try {
      setError(null);
      await api.deleteProduct(id);
      await fetchProducts();
      return true;
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete product');
      return false;
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  return {
    products,
    isLoading,
    error,
    fetchProducts,
    getProductById,
    getProductBySku,
    createProduct,
    updateProduct,
    deleteProduct,
  };
}