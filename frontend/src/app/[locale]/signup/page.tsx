"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Package, Lock, Mail, Boxes, TrendingUp, Shield, Zap, User } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function SignUpPage() {
  const router = useRouter();
  const t = useTranslations('auth');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // Call Register API
      await api.register({
        first_name: firstName,
        last_name: lastName,
        email,
        password,
        role: 'ADMIN' // Default role
      });

      // Navigate to login page with success param
      router.push('/login?registered=true');
    } catch (err: any) {
      console.error('Registration failed:', err);
      setError(
        err.response?.data?.detail || 'Registration failed. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const features = [
    { icon: Boxes, title: 'Real-time Inventory', desc: 'Track stock levels instantly' },
    { icon: TrendingUp, title: 'Intelligent Analytics', desc: 'Data-driven insights' },
    { icon: Shield, title: 'Secure Access', desc: 'Role-based permissions' },
    { icon: Zap, title: 'Fast Operations', desc: 'Streamlined workflows' },
  ];

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
    <div style={{ transform: 'scale(0.82)', transformOrigin: 'top left', width: '122vw', height: '122vh' }}>
    <div className="flex h-full overflow-hidden bg-slate-50 font-sans">
      {/* Left Side - Brand & Features */}
      <div className="hidden lg:flex lg:w-3/5 relative overflow-hidden bg-[#0F172A]">
        {/* Layered Background */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/20 via-transparent to-blue-600/20" />
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/10 rounded-full blur-[120px] animate-pulse" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-500/10 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '2s' }} />
        </div>

        {/* Dot Grid */}
        <div className="absolute inset-0 opacity-[0.15]" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '32px 32px' }} />

        <div className="relative z-10 flex flex-col justify-between p-16 w-full">
          {/* Logo */}
          <div className="flex items-center gap-4 group cursor-default">
            <div className="p-3 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 group-hover:bg-white/20 transition-all duration-500">
              <Package className="h-8 w-8 text-indigo-400" />
            </div>
            <div className="flex flex-col">
              <span className="text-3xl font-extrabold tracking-tight text-white">
                OptiTrack
              </span>
              <span className="text-xs font-medium text-indigo-400 tracking-[0.2em] uppercase">Warehouse OS</span>
            </div>
          </div>

          {/* Main Slogan */}
          <div className="max-w-2xl">
            <h2 className="text-6xl font-black text-white leading-[1.1] tracking-tight mb-8">
              Join the
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-blue-400">
                Next Generation
              </span>
              <br />
              of Warehousing
            </h2>
            <p className="text-slate-400 text-xl leading-relaxed mb-12 max-w-lg">
              Start managing your warehouse professionally with the most advanced technology.
            </p>

            {/* Feature Cards */}
            <div className="grid grid-cols-2 gap-6">
              {features.map((feature, idx) => (
                <div
                  key={idx}
                  className="p-6 bg-white/5 backdrop-blur-sm border border-white/10 rounded-[2rem] hover:bg-white/10 transition-all duration-500 hover:translate-y-[-4px]"
                >
                  <div className="p-3 bg-indigo-500/10 rounded-xl w-fit mb-4">
                    <feature.icon className="h-6 w-6 text-indigo-400" />
                  </div>
                  <h3 className="font-bold text-white mb-1">{feature.title}</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Footer Brand */}
          <div className="flex items-center gap-6 text-slate-500 text-sm">
            <span>© 2026 OptiTrack Inc.</span>
            <div className="w-1 h-1 rounded-full bg-slate-700" />
            <span>Terms of Service</span>
          </div>
        </div>
      </div>

      {/* Right Side - Sign Up Form */}
      <div className="flex-1 h-full overflow-y-auto flex items-center justify-center p-8 bg-white relative">
        <div className="w-full max-w-md">
          {/* Sign Up Header */}
          <div className="mb-10">
            <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-3">Create Account</h1>
            <p className="text-slate-500 font-medium">Get started with the smart warehouse management system.</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-5">
              {/* Name */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName" className="text-sm font-bold text-slate-700 ml-1">
                    First Name
                  </Label>
                  <div className="relative group">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                    <Input
                      id="firstName"
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="John"
                      className="h-14 pl-12 bg-slate-50 border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-base font-medium"
                      required
                      disabled={isLoading}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName" className="text-sm font-bold text-slate-700 ml-1">
                    Last Name
                  </Label>
                  <div className="relative group">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                    <Input
                      id="lastName"
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Doe"
                      className="h-14 pl-12 bg-slate-50 border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-base font-medium"
                      required
                      disabled={isLoading}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-bold text-slate-700 ml-1">
                  Email
                </Label>
                <div className="relative group">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="h-14 pl-12 bg-slate-50 border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-base font-medium"
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-bold text-slate-700 ml-1">
                  Password
                </Label>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-14 pl-12 bg-slate-50 border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-base font-medium"
                    required
                    disabled={isLoading}
                    minLength={6}
                  />
                </div>
                <p className="text-[10px] text-slate-400 ml-1">Password must be at least 6 characters long.</p>
              </div>
            </div>

            {error && (
              <Alert variant="destructive" className="bg-red-50 border-none rounded-2xl py-4 animate-in fade-in slide-in-from-top-2">
                <AlertDescription className="text-red-600 font-bold flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-600" />
                  {error}
                </AlertDescription>
              </Alert>
            )}

            <Button
              type="submit"
              className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-lg font-bold shadow-xl shadow-indigo-100 transition-all active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Creating account...</span>
                </div>
              ) : (
                "Sign Up"
              )}
            </Button>
          </form>

          {/* Sign In Link */}
          <div className="mt-8 text-center">
            <p className="text-slate-500 font-medium">
              Already have an account?{' '}
              <Link 
                href="/login" 
                className="text-indigo-600 font-bold hover:text-indigo-700 hover:underline transition-all underline-offset-4"
              >
                Sign In
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
    </div>
    </div>
  );
}