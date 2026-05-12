import { Package, Boxes, TrendingUp, Shield, Zap } from 'lucide-react';

interface AuthLayoutProps {
  children: React.ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  const features = [
    { icon: Boxes, title: 'Real-time Inventory', desc: 'Track stock levels instantly' },
    { icon: TrendingUp, title: 'Smart Analytics', desc: 'Data-driven insights' },
    { icon: Shield, title: 'Secure Access', desc: 'Role-based permissions' },
    { icon: Zap, title: 'Fast Operations', desc: 'Streamlined workflows' },
  ];

  return (
    <div className="flex min-h-screen">
      {/* แผงด้านซ้าย - การสร้างแบรนด์ */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        {/* พื้นหลังเคลื่อนไหว */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50"></div>
          {/* ลูกแก้วลอย */}
          <div className="absolute top-20 left-20 w-72 h-72 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse" style={{ animationDelay: '1s' }}></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-cyan-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-pulse" style={{ animationDelay: '2s' }}></div>
        </div>

        {/* เนื้อหา */}
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          {/* โลโก้ */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-cyan-400 rounded-xl blur-lg opacity-50"></div>
              <div className="relative bg-gradient-to-r from-blue-500 to-cyan-500 p-3 rounded-xl">
                <Package className="h-8 w-8 text-white" />
              </div>
            </div>
            <span className="text-3xl font-bold bg-gradient-to-r from-white to-blue-200 bg-clip-text text-transparent">
              OptiTrack
            </span>
          </div>

          {/* เนื้อหาหลัก */}
          <div className="space-y-8">
            <div className="space-y-4">
              <h2 className="text-5xl font-bold text-white leading-tight">
                Warehouse
                <br />
                <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-indigo-400 bg-clip-text text-transparent">
                  Management
                </span>
                <br />
                Made Simple
              </h2>
              <p className="text-blue-200 text-lg max-w-md">
                Track inventory, manage transactions, and optimize your warehouse operations with our intelligent platform.
              </p>
            </div>

            {/* ตารางคุณสมบัติ */}
            <div className="grid grid-cols-2 gap-4">
              {features.map((feature, idx) => (
                <div
                  key={idx}
                  className="group bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-4 hover:bg-white/10 transition-all duration-300"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-lg group-hover:from-blue-500/30 group-hover:to-cyan-500/30 transition-colors">
                      <feature.icon className="h-5 w-5 text-cyan-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white text-sm">{feature.title}</h3>
                      <p className="text-blue-300 text-xs mt-0.5">{feature.desc}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* สถิติ */}
            <div className="flex gap-8">
              <div>
                <div className="text-4xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                  99.9%
                </div>
                <div className="text-blue-300 text-sm">Uptime</div>
              </div>
              <div>
                <div className="text-4xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                  24/7
                </div>
                <div className="text-blue-300 text-sm">Availability</div>
              </div>
              <div>
                <div className="text-4xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                  500+
                </div>
                <div className="text-blue-300 text-sm">Warehouses</div>
              </div>
            </div>
          </div>

          {/* ส่วนท้าย */}
          <div className="text-blue-400/60 text-sm">
            © 2024 OptiTrack WMS. All rights reserved.
          </div>
        </div>
      </div>

      {/* แผงด้านขวา - แบบฟอร์มเข้าสู่ระบบ */}
      <div className="flex-1 flex items-center justify-center p-8 bg-gradient-to-br from-slate-50 via-white to-blue-50">
        {children}
      </div>
    </div>
  );
}
