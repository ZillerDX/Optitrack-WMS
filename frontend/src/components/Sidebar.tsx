"use client";

/**
 * คอมโพเนนต์แถบนำทางด้านข้าง
 * เมนูนำทางหลักสำหรับแอปพลิเคชัน
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  LogOut,
  Boxes,
  ChevronRight,
  MapPin,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLocationStore } from '@/store/useLocationStore';
import { useUIStore } from '@/store/useUIStore';
import { useCurrencyStore } from '@/store/useCurrencyStore';
import { api } from '@/lib/api';
import { SUPPORTED_CURRENCIES } from '@/lib/currency';
import type { UserRole } from '@/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SidebarProps {
  userRole: UserRole;
  user?: {
    first_name: string;
    last_name: string;
    email: string;
    image_url?: string;
  };
}

export function Sidebar({ userRole, user }: SidebarProps) {
  const pathname = usePathname();
  const { isMobileMenuOpen, setIsMobileMenuOpen } = useUIStore();
  const { selectedLocation, setSelectedLocation, locations, fetchLocations } = useLocationStore();
  const { currency, setCurrency, fetchRates } = useCurrencyStore();

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const displayName = user ? `${user.first_name} ${user.last_name}` : 'Administrator';
  const displayEmail = user ? user.email : 'ADMIN Access';
  const initial = user ? user.first_name.charAt(0).toUpperCase() : 'A';

  // Resolve image URL
  const getImageUrl = (path?: string) => {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    return `${API_BASE_URL}${path}`;
  };

  // ปิดเมนูบนมือถือเมื่อมีการเปลี่ยนเส้นทาง
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname, setIsMobileMenuOpen]);

  // ปิดเมนูบนมือถือเมื่อปรับขนาดหน้าต่างเป็นเดสก์ท็อป
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [setIsMobileMenuOpen]);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  useEffect(() => {
    fetchRates();
  }, [fetchRates]);

  const navigation = [
    {
      name: 'Dashboard',
      href: '/dashboard',
      icon: LayoutDashboard,
      roles: ['ADMIN'],
      gradient: 'from-blue-500 to-indigo-500',
    },
    {
      name: 'Inventory',
      href: '/inventory',
      icon: Boxes,
      roles: ['ADMIN'],
      gradient: 'from-cyan-500 to-blue-500',
    },
    {
      name: 'Products',
      href: '/products',
      icon: Package,
      roles: ['ADMIN'],
      gradient: 'from-emerald-500 to-teal-500',
    },
    {
      name: 'Transactions',
      href: '/transactions',
      icon: ShoppingCart,
      roles: ['ADMIN'],
      gradient: 'from-violet-500 to-purple-500',
    },
  ];

  const filteredNavigation = navigation.filter((item) =>
    item.roles.includes(userRole)
  );

  const SidebarContent = () => (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ส่วนโลโก้ */}
      <div className="relative px-3 lg:px-4 py-3 lg:py-4 flex-shrink-0">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 to-indigo-600/10"></div>
        <div className="relative flex items-center gap-2">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-lg blur-lg opacity-50"></div>
            <div className="relative bg-gradient-to-r from-blue-500 to-indigo-500 p-1.5 rounded-lg">
              <Package className="h-4 w-4 text-white" />
            </div>
          </div>
          <div>
            <h1 className="text-base font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
              OptiTrack
            </h1>
            <p className="text-[10px] text-slate-400 font-medium">WMS</p>
          </div>
        </div>
      </div>

      {/* เส้นคั่น */}
      <div className="mx-4 h-px bg-gradient-to-r from-transparent via-slate-700 to-transparent flex-shrink-0"></div>

      {/* Location Selector */}
      <div className="px-3 lg:px-4 py-2 flex-shrink-0">
        <p className="px-1 mb-2 text-[10px] lg:text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Warehouse location
        </p>
        <Select value={selectedLocation} onValueChange={setSelectedLocation}>
          <SelectTrigger className="w-full bg-slate-800 border-slate-700 text-slate-200 focus:ring-blue-500 h-10">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-blue-400" />
              <SelectValue placeholder="Select Location" />
            </div>
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
            <SelectItem value="ALL" className="focus:bg-slate-700 focus:text-white">All Locations</SelectItem>
            {locations.map((loc) => (
              <SelectItem key={loc} value={loc} className="focus:bg-slate-700 focus:text-white">
                {loc}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* เส้นคั่น */}
      <div className="mx-4 h-px bg-gradient-to-r from-transparent via-slate-700 to-transparent mt-2 flex-shrink-0"></div>

      <div className="px-3 lg:px-4 py-2 flex-shrink-0">
        <p className="px-1 mb-2 text-[10px] lg:text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Currency
        </p>
        <Select value={currency} onValueChange={setCurrency}>
          <SelectTrigger className="w-full bg-slate-800 border-slate-700 text-slate-200 focus:ring-blue-500 h-10">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-blue-400" />
              <SelectValue placeholder="Select Currency" />
            </div>
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
            {SUPPORTED_CURRENCIES.map((item) => (
              <SelectItem key={item} value={item} className="focus:bg-slate-700 focus:text-white">
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mx-4 h-px bg-gradient-to-r from-transparent via-slate-700 to-transparent mt-2 flex-shrink-0"></div>

      {/* การนำทาง */}
      <nav className="flex-1 px-2 lg:px-3 py-3 lg:py-4 space-y-1 overflow-y-auto min-h-0">
        {filteredNavigation.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={() => setIsMobileMenuOpen(false)}
              className={cn(
                'group relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all duration-300 ease-out',
                isActive
                  ? 'text-white'
                  : 'text-slate-400 hover:text-white'
              )}
            >
              {/* พื้นหลังเมื่อเปิดใช้งาน */}
              {isActive && (
                <div className={cn("absolute inset-0 bg-gradient-to-r rounded-xl opacity-90 shadow-lg", item.gradient)}>
                  <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent rounded-xl"></div>
                </div>
              )}

              {/* พื้นหลังเมื่อวางเมาส์เหนือ */}
              {!isActive && (
                <div className="absolute inset-0 bg-slate-800/50 rounded-xl opacity-0 group-hover:opacity-100 transition-all duration-300 ease-out group-hover:scale-[1.02]"></div>
              )}

              {/* ไอคอน */}
              <div className={cn(
                'relative z-10 p-1.5 lg:p-2 rounded-lg transition-all duration-300 ease-out',
                isActive
                  ? 'bg-white/20'
                  : 'bg-slate-800 group-hover:bg-slate-700 group-hover:scale-105'
              )}>
                <item.icon className={cn(
                  'h-4 w-4 lg:h-5 lg:w-5 transition-colors',
                  isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'
                )} />
              </div>

              {/* ข้อความ */}
              <span className="relative z-10 flex-1 text-sm">{item.name}</span>

              {/* ตัวบ่งชี้ลูกศร */}
              {isActive && (
                <ChevronRight className="relative z-10 h-4 w-4 text-white/70" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* ส่วนผู้ใช้และการออกจากระบบ */}
      <div className="px-3 lg:px-4 py-3 lg:py-4 flex-shrink-0">
        <div className="mx-0 mb-3 lg:mb-4 h-px bg-gradient-to-r from-transparent via-slate-700 to-transparent"></div>

        {/* ป้ายกำกับบทบาทผู้ใช้ */}
        <Link
          href="/profile"
          className="block mb-3 lg:mb-4 px-2 lg:px-3 py-2 lg:py-3 bg-slate-800/50 rounded-xl hover:bg-slate-800 transition-colors group"
        >
          <div className="flex items-center gap-2 lg:gap-3">
            <div className="relative">
              {user?.image_url ? (
                <img
                  src={getImageUrl(user.image_url) || ''}
                  alt={displayName}
                  className="w-8 h-8 lg:w-10 lg:h-10 rounded-xl object-cover"
                />
              ) : (
                <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-xl flex items-center justify-center font-bold text-white text-sm lg:text-base bg-gradient-to-br from-violet-500 to-purple-600">
                  {initial}
                </div>
              )}
              <div className="absolute -bottom-0.5 -right-0.5 w-2.5 lg:w-3 h-2.5 lg:h-3 rounded-full border-2 border-slate-900 bg-emerald-500"></div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs lg:text-sm font-semibold text-white truncate group-hover:text-blue-400 transition-colors">
                {displayName}
              </p>
              <p className="text-[10px] lg:text-xs text-slate-400 truncate">{displayEmail}</p>
            </div>
          </div>
        </Link>

        {/* ปุ่มออกจากระบบ */}
        <button
          onClick={async () => {
            try {
              await api.logout();
            } catch (e) {
              console.error('Logout failed:', e);
            }
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/login';
          }}
          className="group relative w-full flex items-center gap-2 lg:gap-3 rounded-xl px-3 lg:px-4 py-2.5 lg:py-3 text-sm font-medium text-slate-400 hover:text-white transition-all duration-200 overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-red-500/10 to-pink-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-xl"></div>
          <div className="relative z-10 p-1.5 lg:p-2 rounded-lg bg-slate-800 group-hover:bg-red-500/20 transition-colors">
            <LogOut className="h-4 w-4 lg:h-5 lg:w-5 group-hover:text-red-400 transition-colors" />
          </div>
          <span className="relative z-10 group-hover:text-red-400 transition-colors text-sm">Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* โอเวอร์เลย์บนมือถือ */}
      {isMobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* แถบด้านข้างบนมือถือ */}
      <div className={cn(
        "lg:hidden fixed inset-y-0 left-0 z-50 w-64 flex flex-col bg-slate-900 shadow-2xl transform transition-transform duration-300 ease-in-out border-r border-slate-800",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <SidebarContent />
      </div>

      {/* แถบด้านข้างบนเดสก์ท็อป */}
      <div className="hidden lg:flex h-full w-60 xl:w-64 flex-col bg-slate-900 border-r border-slate-800 flex-shrink-0 overflow-hidden">
        <SidebarContent />
      </div>
    </>
  );
}