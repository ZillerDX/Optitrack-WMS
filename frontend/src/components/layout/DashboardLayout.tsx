import { Sidebar } from "@/components/Sidebar";
import { AIChatWidget } from "@/components/AIChatWidget";

import { UserRole } from "@/types";

interface DashboardLayoutProps {
  children: React.ReactNode;
  userRole: UserRole;
}

export function DashboardLayout({ children, userRole }: DashboardLayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar userRole={userRole} />
      <main className="flex-1 overflow-hidden bg-gray-50">
        <div className="h-full overflow-auto">
          {children}
        </div>
      </main>
      <AIChatWidget />
    </div>
  );
}
