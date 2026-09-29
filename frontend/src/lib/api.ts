/**
 * API client. The API is served by this same Next.js app, so requests are same-origin and
 * the session is an httpOnly cookie the browser attaches by itself: no token is stored in
 * or read by JavaScript. `user` in localStorage is only a non-secret UI hint (name, avatar).
 */

import axios, { AxiosInstance } from 'axios';

const apiClient: AxiosInstance = axios.create({
  baseURL: '',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ตัวดักจับการตอบกลับเพื่อจัดการข้อผิดพลาด
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      // ไม่ได้รับอนุญาต - เปลี่ยนเส้นทางไปยังหน้าเข้าสู่ระบบเฉพาะเมื่อไม่ได้อยู่ในหน้า Auth หรือ Endpoint Auth
      const isAuthEndpoint = error.config?.url?.includes('/api/auth/login') || 
                             error.config?.url?.includes('/api/auth/register') || 
                             error.config?.url?.includes('/api/auth/google');
      const isOnAuthPage = typeof window !== 'undefined' && 
                           (window.location.pathname.includes('/login') || window.location.pathname.includes('/signup'));

      if (!isAuthEndpoint && !isOnAuthPage && typeof window !== 'undefined') {
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

// วิธีการ API
export const api = {
  // การยืนยันตัวตน
  login: async (email: string, password: string) => {
    const response = await apiClient.post('/api/auth/login', { email, password });
    return response.data;
  },

  loginWithGoogle: async (credential: string) => {
    const response = await apiClient.post('/api/auth/google', { credential });
    return response.data;
  },

  forgotPassword: async (email: string) => {
    const response = await apiClient.post('/api/auth/forgot-password', { email });
    return response.data;
  },

  resetPassword: async (token: string, newPassword: string) => {
    const response = await apiClient.post('/api/auth/reset-password', { token, new_password: newPassword });
    return response.data;
  },

  logout: async () => {
    const response = await apiClient.post('/api/auth/logout');
    return response.data;
  },

  register: async (data: any) => {
    const response = await apiClient.post('/api/auth/register', data);
    return response.data;
  },

  updateProfile: async (data: any) => {
    const response = await apiClient.put('/api/auth/me', data);
    return response.data;
  },

  uploadProfileImage: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post('/api/auth/upload-image', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // สินค้า
  getProducts: async () => {
    const response = await apiClient.get('/api/products/', { params: { limit: 1000 } });
    return response.data;
  },

  getProductById: async (id: number) => {
    const response = await apiClient.get(`/api/products/${id}`);
    return response.data;
  },

  getProductBySku: async (sku: string) => {
    const response = await apiClient.get(`/api/products/sku/${sku}`);
    return response.data;
  },

  createProduct: async (data: any) => {
    const response = await apiClient.post('/api/products/', data);
    return response.data;
  },

  updateProduct: async (id: number, data: any) => {
    const response = await apiClient.put(`/api/products/${id}`, data);
    return response.data;
  },

  deleteProduct: async (id: number) => {
    const response = await apiClient.delete(`/api/products/${id}`);
    return response.data;
  },

  // สินค้าคงคลัง
  getInventory: async (location?: string) => {
    const params: any = { limit: 1000 };
    if (location && location !== 'ALL') {
      params.location = location;
    }
    const response = await apiClient.get('/api/inventory/', { params });
    return response.data;
  },

  getLocations: async () => {
    const response = await apiClient.get('/api/inventory/locations');
    return response.data;
  },

  getLocationDetails: async () => {
    const response = await apiClient.get('/api/locations/');
    return response.data;
  },

  createLocation: async (data: { name: string; description?: string; capacity: number }) => {
    const response = await apiClient.post('/api/locations/', data);
    return response.data;
  },

  updateLocation: async (id: number, data: { name?: string; description?: string; capacity?: number }) => {
    const response = await apiClient.put(`/api/locations/${id}`, data);
    return response.data;
  },

  deleteLocation: async (id: number) => {
    const response = await apiClient.delete(`/api/locations/${id}`);
    return response.data;
  },

  getStorageMetrics: async (location?: string) => {
    const params = location && location !== 'ALL' ? { location } : {};
    const response = await apiClient.get('/api/dashboard/metrics', { params });
    return response.data;
  },

  getInventoryById: async (id: number) => {
    const response = await apiClient.get(`/api/inventory/${id}`);
    return response.data;
  },

  createInventory: async (data: {
    product_id: number;
    location: string;
    quantity?: number;
    status?: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
  }) => {
    const response = await apiClient.post('/api/inventory/', data);
    return response.data;
  },

  deleteInventory: async (id: number) => {
    const response = await apiClient.delete(`/api/inventory/${id}`);
    return response.data;
  },

  // ธุรกรรม
  getTransactions: async (location?: string) => {
    const params: any = { limit: 1000 };
    if (location && location !== 'ALL') {
      params.location = location;
    }
    const response = await apiClient.get('/api/transactions/', { params });
    return response.data;
  },

  getTransactionById: async (id: number) => {
    const response = await apiClient.get(`/api/transactions/${id}`);
    return response.data;
  },

  createTransaction: async (data: {
    type: 'INBOUND' | 'OUTBOUND' | 'ADJUST';
    quantity: number;
    product_id: number;
    location: string;
    unit_price?: number;
    total_price?: number;
    notes?: string;
    created_at?: string;
  }) => {
    const response = await apiClient.post('/api/transactions/', data);
    return response.data;
  },

  // ===================== AI Chat =====================
  sendChatMessage: async (
    message: string,
    history: { role: string; content: string }[] = []
  ): Promise<{ response: string }> => {
    const response = await apiClient.post('/api/ai/chat', { message, history });
    return response.data;
  },

  // หมวดหมู่
  getCategories: async () => {
    const response = await apiClient.get('/api/categories/');
    return response.data;
  },

  createCategory: async (name: string) => {
    const response = await apiClient.post('/api/categories/', { name });
    return response.data;
  },

  updateCategory: async (id: number, name: string) => {
    const response = await apiClient.put(`/api/categories/${id}`, { name });
    return response.data;
  },

  deleteCategory: async (id: number) => {
    const response = await apiClient.delete(`/api/categories/${id}`);
    return response.data;
  },

  // ===================== Predictive AI & Purchase Orders =====================
  getPredictiveAnalytics: async () => {
    const response = await apiClient.get('/api/ai/predictive');
    return response.data;
  },

  approvePurchaseOrder: async (poData: {
    po_number: string;
    product_id: number;
    product_name: string;
    sku: string;
    supplier?: string;
    reorder_qty: number;
    unit_cost: number;
    total_amount: number;
    target_location?: string;
    notes?: string;
  }) => {
    const response = await apiClient.post('/api/ai/reorder/approve', poData);
    return response.data;
  },

  generateAIAnalyseReport: async () => {
    const response = await apiClient.post('/api/ai/report');
    return response.data;
  },
};

export default apiClient;