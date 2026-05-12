/**
 * Hook ธุรกรรม
 * จัดการการดึงข้อมูลและการดำเนินการธุรกรรม
 */

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import type { TransactionWithProduct, TransactionCreate } from '@/types';

export function useTransactions() {
  const [transactions, setTransactions] = useState<TransactionWithProduct[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTransactions = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await api.getTransactions();
      setTransactions(data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch transactions');
    } finally {
      setIsLoading(false);
    }
  };

  const getTransactionById = async (
    id: number
  ): Promise<TransactionWithProduct | null> => {
    try {
      setError(null);
      const data = await api.getTransactionById(id);
      return data;
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch transaction');
      return null;
    }
  };

  const createTransaction = async (
    transactionData: TransactionCreate
  ): Promise<TransactionWithProduct | null> => {
    try {
      setError(null);
      const data = await api.createTransaction(transactionData);
      await fetchTransactions();
      return data;
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create transaction');
      return null;
    }
  };

  const getInboundTransactions = () => {
    return transactions.filter(t => t.type === 'INBOUND');
  };

  const getOutboundTransactions = () => {
    return transactions.filter(t => t.type === 'OUTBOUND');
  };

  const getTodayTransactions = () => {
    const today = new Date().toISOString().split('T')[0];
    return transactions.filter(t => t.created_at.startsWith(today));
  };

  const getTotalSalesToday = () => {
    return getTodayTransactions()
      .filter(t => t.type === 'OUTBOUND')
      .reduce((total, t) => total + t.total_price, 0);
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  return {
    transactions,
    isLoading,
    error,
    fetchTransactions,
    getTransactionById,
    createTransaction,
    getInboundTransactions,
    getOutboundTransactions,
    getTodayTransactions,
    getTotalSalesToday,
  };
}