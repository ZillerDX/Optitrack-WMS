/**
 * ตัวช่วยการแปลอย่างง่าย (ภาษาอังกฤษเท่านั้น)
 */

const translations: Record<string, string> = {
  // ทั่วไป
  'common.loading': 'Loading...',
  'common.error': 'Error',
  'common.success': 'Success',
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'common.edit': 'Edit',
  'common.search': 'Search',
  'common.filter': 'Filter',
  'common.actions': 'Actions',

  // เข้าสู่ระบบ
  'login.title': 'Login',
  'login.email': 'Email',
  'login.password': 'Password',
  'login.submit': 'Login',
  'login.error': 'Invalid credentials',

  // แดชบอร์ด
  'dashboard.title': 'Dashboard',
  'dashboard.totalProducts': 'Total Products',
  'dashboard.totalValue': 'Total Inventory Value',
  'dashboard.lowStock': 'Low Stock Items',
  'dashboard.transactions': 'Transactions Today',

  // สินค้าคงคลัง
  'inventory.title': 'Inventory',
  'inventory.product': 'Product',
  'inventory.location': 'Location',
  'inventory.quantity': 'Quantity',
  'inventory.status': 'Status',

  // คอลัมน์ตารางสินค้า
  'product.sku': 'SKU',
  'product.name': 'Name',
  'product.category': 'Category',
  'product.location': 'Location',
  'product.quantity': 'Quantity',
  'product.status': 'Status',

  // สถานะ
  'status.inStock': 'In Stock',
  'status.lowStock': 'Low Stock',
  'status.outOfStock': 'Out of Stock',

  // การดำเนินการ
  'action.search': 'Search',

  // สินค้า
  'products.title': 'Products',
  'products.sku': 'SKU',
  'products.name': 'Name',
  'products.price': 'Price',
  'products.stock': 'Stock Level',
  'products.add': 'Add Product',

  // ธุรกรรม
  'transactions.title': 'Transactions',
  'transactions.refCode': 'Reference Code',
  'transactions.type': 'Type',
  'transactions.quantity': 'Quantity',
  'transactions.date': 'Date',
  'transactions.inbound': 'Inbound',
  'transactions.outbound': 'Outbound',
  'transactions.adjust': 'Adjust',
  'dateRangePicker.selectDate': 'Select date',
  'dateRangePicker.dateRange': 'Date range',
  'dateRangePicker.chooseOnCalendar': 'Choose on the calendar',
  'dateRangePicker.start': 'Start',
  'dateRangePicker.end': 'End',
  'dateRangePicker.today': 'Today',
  'dateRangePicker.last7Days': '7 days',
  'dateRangePicker.last30Days': '30 days',
  'dateRangePicker.thisMonth': 'Month',
  'dateRangePicker.selectedRange': 'Selected range',
  'dateRangePicker.done': 'Done',
};

export function useTranslations(namespace?: string) {
  return function t(key: string): string {
    const fullKey = namespace ? `${namespace}.${key}` : key;
    return translations[fullKey] || key;
  };
}