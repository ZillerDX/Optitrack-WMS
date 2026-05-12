"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Package, Lock, Mail, Boxes, TrendingUp, Shield, Zap, CheckCircle2, AlertCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Modal } from '@/components/modals';

export default function LoginPage() {
  const router = useRouter();
  const t = useTranslations('auth');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Forgot Password State
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [isForgotLoading, setIsForgotLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState({ type: '', text: '' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // Call Login API
      const response = await api.login(email, password);

      // Save token and user info
      localStorage.setItem('token', response.access_token);
      localStorage.setItem('user', JSON.stringify(response.user));

      // Redirect to dashboard
      router.push('/dashboard');
    } catch (err: any) {
      console.error('Login failed:', err);
      setError(
        err.response?.data?.detail || 'Invalid email or password. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsForgotLoading(true);
    setForgotMessage({ type: '', text: '' });

    try {
      await api.forgotPassword(forgotEmail);
      setForgotMessage({ 
        type: 'success', 
        text: 'If the email is registered, a reset link has been sent to your inbox.' 
      });
    } catch (err: any) {
      setForgotMessage({ 
        type: 'error', 
        text: 'Failed to process request. Please try again.' 
      });
    } finally {
      setIsForgotLoading(false);
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
          <div className="absolute inset-0 bg-gradient-to-br from-blue-600/20 via-transparent to-indigo-600/20" />
          <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-500/10 rounded-full blur-[120px] animate-pulse" />
          <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/10 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '2s' }} />
        </div>

        {/* Dot Grid */}
        <div className="absolute inset-0 opacity-[0.15]" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '32px 32px' }} />

        <div className="relative z-10 flex flex-col justify-between p-16 w-full">
          {/* Logo */}
          <div className="flex items-center gap-4 group cursor-default">
            <div className="p-3 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 group-hover:bg-white/20 transition-all duration-500">
              <Package className="h-8 w-8 text-blue-400" />
            </div>
            <div className="flex flex-col">
              <span className="text-3xl font-extrabold tracking-tight text-white">
                OptiTrack
              </span>
              <span className="text-xs font-medium text-blue-400 tracking-[0.2em] uppercase">Warehouse OS</span>
            </div>
          </div>

          {/* Main Slogan */}
          <div className="max-w-2xl">
            <h2 className="text-6xl font-black text-white leading-[1.1] tracking-tight mb-8">
              The Next Gen
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-400 to-indigo-400">
                Warehouse Management
              </span>
            </h2>
            <p className="text-slate-400 text-xl leading-relaxed mb-12 max-w-lg">
              Elevate your warehouse management with an intelligent system designed for precision and speed.
            </p>

            {/* Feature Cards */}
            <div className="grid grid-cols-2 gap-6">
              {features.map((feature, idx) => (
                <div
                  key={idx}
                  className={`p-6 bg-white/5 backdrop-blur-sm border border-white/10 rounded-[2rem] hover:bg-white/10 transition-all duration-500 hover:translate-y-[-4px] animate-on-load stagger-${idx + 1}`}
                >
                  <div className="p-3 bg-blue-500/10 rounded-xl w-fit mb-4">
                    <feature.icon className="h-6 w-6 text-blue-400" />
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
            <span>Privacy Policy</span>
          </div>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="flex-1 h-full overflow-y-auto flex items-center justify-center p-8 bg-white relative">
        <div className="w-full max-w-md">
          {/* Login Header */}
          <div className="mb-10">
            <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-3">Sign In</h1>
            <p className="text-slate-500 font-medium">Welcome back! Please enter your details to start.</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-bold text-slate-700 ml-1">
                  Email
                </Label>
                <div className="relative group">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 group-focus-within:text-blue-600 transition-colors" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="h-14 pl-12 bg-slate-50 border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-base font-medium"
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center ml-1">
                  <Label htmlFor="password" className="text-sm font-bold text-slate-700">
                    Password
                  </Label>
                  <button 
                    type="button"
                    onClick={() => setIsForgotModalOpen(true)}
                    className="text-xs font-bold text-blue-600 hover:text-blue-700"
                  >
                    Forgot Password?
                  </button>
                </div>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 group-focus-within:text-blue-600 transition-colors" />
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-14 pl-12 bg-slate-50 border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-base font-medium"
                    required
                    disabled={isLoading}
                  />
                </div>
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
              className="w-full h-14 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-lg font-bold shadow-xl shadow-slate-200 transition-all active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Processing...</span>
                </div>
              ) : (
                "Sign In"
              )}
            </Button>
          </form>

          {/* Sign Up Link */}
          <div className="mt-8 text-center">
            <p className="text-slate-500 font-medium">
              Don&apos;t have an account?{' '}
              <Link 
                href="/signup" 
                className="text-blue-600 font-bold hover:text-blue-700 hover:underline transition-all underline-offset-4"
              >
                Create new account
              </Link>
            </p>
          </div>

          {/* Demo Account */}
          <div className="mt-12 p-6 bg-blue-50/50 border border-blue-100 rounded-[2rem]">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-1.5 bg-blue-100 rounded-lg text-blue-600">
                <Shield className="h-4 w-4" />
              </div>
              <span className="text-sm font-bold text-slate-800">Demo Account</span>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm p-3 bg-white rounded-xl border border-blue-100 shadow-sm">
                <span className="text-slate-500">Account:</span>
                <code className="text-blue-600 font-bold">admin@optitrack.com</code>
              </div>
              <p className="text-[10px] text-center text-slate-400 font-medium uppercase tracking-wider">Password: <span className="text-blue-500">admin123</span></p>
            </div>
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      <Modal
        isOpen={isForgotModalOpen}
        onClose={() => {
          setIsForgotModalOpen(false);
          setForgotMessage({ type: '', text: '' });
          setForgotEmail('');
        }}
        title="Reset Password"
        size="md"
      >
        <div className="p-4">
          <div className="mb-6 text-center">
            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Lock size={32} />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">Forgot your password?</h3>
            <p className="text-sm text-slate-500">Enter your email address and we&apos;ll send you a link to reset your password.</p>
          </div>

          {forgotMessage.text ? (
            <div className={cn(
              "p-4 rounded-xl flex items-start gap-3 mb-6",
              forgotMessage.type === 'success' ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
            )}>
              {forgotMessage.type === 'success' ? <CheckCircle2 size={20} className="shrink-0" /> : <AlertCircle size={20} className="shrink-0" />}
              <p className="text-sm font-bold leading-tight">{forgotMessage.text}</p>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="forgot-email" className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">
                  Email Address
                </Label>
                <div className="relative group">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 group-focus-within:text-blue-600 transition-colors" />
                  <Input
                    id="forgot-email"
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="h-12 pl-12 bg-slate-50 border-slate-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-sm font-medium"
                    required
                    disabled={isForgotLoading}
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-12 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold shadow-lg transition-all"
                disabled={isForgotLoading}
              >
                {isForgotLoading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 size={18} className="animate-spin" />
                    <span>Processing...</span>
                  </div>
                ) : (
                  "Send Reset Link"
                )}
              </Button>
            </form>
          )}

          <div className="mt-6 text-center">
            <button 
              onClick={() => setIsForgotModalOpen(false)}
              className="text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors"
            >
              Back to Login
            </button>
          </div>
        </div>
      </Modal>
    </div>
    </div>
    </div>
  );
}
