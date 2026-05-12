/**
 * หน้าหลัก - เปลี่ยนเส้นทางไปยังแดชบอร์ด
 */

import { redirect } from 'next/navigation';

export default function RootPage() {
  // เปลี่ยนเส้นทางไปยังแดชบอร์ด (สัมพันธ์กับภาษาท้องถิ่นปัจจุบัน)
  redirect('dashboard');
}