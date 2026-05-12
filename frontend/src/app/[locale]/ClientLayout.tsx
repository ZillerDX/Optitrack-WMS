"use client";

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { AIChatWidget } from '@/components/AIChatWidget';
import { PageTransition } from '@/components/PageTransition';
import { Menu, Package } from 'lucide-react';
import { useUIStore } from '@/store/useUIStore';
import { cn } from '@/lib/utils';
import '../globals.css';

export default function ClientLayout({
  children
}: {
  children: React.ReactNode;
  params: {locale: string};
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [userRole, setUserRole] = useState<'ADMIN'>('ADMIN');
  const [user, setUser] = useState<any>(null);
  const { toggleMobileMenu } = useUIStore();

  // หน้าที่ไม่ควรแสดงแถบด้านข้าง
  const isLoginPage = pathname?.includes('/login') || pathname?.includes('/signup');

  // แสดงเค้าโครงแบบแยกเดี่ยวสำหรับการเข้าสู่ระบบและเส้นทางมือถือ
  const isStandalonePage = isStandalonePageCheck(pathname);

  function isStandalonePageCheck(path: string | null) {
      if (!path) return false;
      return path.includes('/login') || path.includes('/signup');
  }

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');

    // การป้องกันการยืนยันตัวตน
    if (!token && !isLoginPage) {
      router.push('/login');
      return;
    }

    // เปลี่ยนเส้นทางผู้ใช้ที่เข้าสู่ระบบแล้วจากหน้าเข้าสู่ระบบ
    if (token && isLoginPage) {
        router.push('/dashboard');
        return;
    }

    if (userStr) {
      try {
        const userData = JSON.parse(userStr);
        setUser(userData);
        // ทุกคนที่ลงทะเบียนตอนนี้จะเป็น ADMIN
        setUserRole('ADMIN');
      } catch (e) {
        console.error('Failed to parse user:', e);
      }
    }
  }, [pathname, router, isLoginPage]);

  if (isStandalonePage) {
    return (
      <PageTransition>
        {children}
      </PageTransition>
    );
  }

  // ดึงชื่อหน้าจาก pathname
  const getPageTitle = () => {
    if (pathname?.includes('/dashboard')) return 'Dashboard';
    if (pathname?.includes('/inventory')) return 'Inventory';
    if (pathname?.includes('/products')) return 'Products';
    if (pathname?.includes('/transactions')) return 'Transactions';
    if (pathname?.includes('/profile')) return 'Profile';
    return 'OptiTrack';
  };

  return (
    <div className="flex h-screen bg-slate-900 overflow-hidden">
      <Sidebar userRole={userRole} user={user} />
      
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile Header */}
        <header className="lg:hidden flex items-center justify-between h-16 px-4 bg-slate-900 text-white shadow-md z-30 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={toggleMobileMenu}
              className="p-2 -ml-2 hover:bg-slate-800 rounded-lg transition-colors"
              aria-label="Toggle menu"
            >
              <Menu className="h-6 w-6" />
            </button>
            <div className="flex items-center gap-2">
              <div className="bg-gradient-to-r from-blue-500 to-indigo-500 p-1 rounded-md">
                <Package className="h-4 w-4 text-white" />
              </div>
              <span className="font-bold tracking-tight">{getPageTitle()}</span>
            </div>
          </div>
          {user?.image_url && (
            <img
              src={user.image_url.startsWith('http') ? user.image_url : `http://localhost:8000${user.image_url}`}
              alt="User"
              className="w-8 h-8 rounded-full object-cover border-2 border-slate-700"
            />
          )}
        </header>

        <main className="flex-1 overflow-auto bg-slate-900 p-0 sm:p-0">
          <div className="w-full min-h-full">
            <PageTransition>
              {children}
            </PageTransition>
          </div>
        </main>
      </div>
      
      <AIChatWidget />
    </div>
  );
}