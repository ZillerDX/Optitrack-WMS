"use client";

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Loader2, 
  User, 
  Mail, 
  Upload, 
  CheckCircle2, 
  ArrowLeft, 
  Camera, 
  ShieldCheck, 
  Sliders, 
  Warehouse, 
  Coins, 
  Check, 
  KeyRound,
  BadgeCheck
} from 'lucide-react';
import Link from 'next/link';
import { useCurrencyStore } from '@/store/useCurrencyStore';
import { useLocationStore } from '@/store/useLocationStore';
import { SUPPORTED_CURRENCIES, type SupportedCurrency } from '@/lib/currency';

interface ProfileUser {
  id?: number;
  first_name: string;
  last_name: string;
  email: string;
  image_url?: string | null;
  role?: string;
  is_active?: boolean;
}

interface ApiError {
  response?: {
    data?: {
      detail?: string;
    };
  };
}

export default function ProfilePage() {
  const [user, setUser] = useState<ProfileUser | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const { currency, setCurrency } = useCurrencyStore();
  const { selectedLocation, setSelectedLocation, locations, fetchLocations } = useLocationStore();

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const getErrorMessage = (err: unknown, fallback: string) => {
    const apiError = err as ApiError;
    return apiError.response?.data?.detail || fallback;
  };

  useEffect(() => {
    fetchLocations();
    const userStr = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
    if (userStr) {
      try {
        const userData = JSON.parse(userStr) as ProfileUser;
        setUser(userData);
        setFirstName(userData.first_name || '');
        setLastName(userData.last_name || '');
      } catch (e) {
        console.error('Failed to parse user data:', e);
      }
    }
  }, [fetchLocations]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    setIsUploading(true);

    try {
      const updatedUser = (await api.uploadProfileImage(file)) as ProfileUser;
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setUser(updatedUser);
      setSuccess('Profile picture updated successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: unknown) {
      console.error('Upload failed:', err);
      setError(getErrorMessage(err, 'Failed to upload image.'));
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    try {
      const updatedUser = (await api.updateProfile({
        first_name: firstName,
        last_name: lastName,
      })) as ProfileUser;

      const mergedUser = { ...(user || {}), ...updatedUser, first_name: firstName, last_name: lastName };
      localStorage.setItem('user', JSON.stringify(mergedUser));
      setUser(mergedUser);
      setSuccess('Profile updated successfully!');

      setTimeout(() => {
        setSuccess('');
      }, 3000);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to update profile.'));
    } finally {
      setIsLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        <div className="flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
          <span>Loading profile...</span>
        </div>
      </div>
    );
  }

  const getImageUrl = (path: string) => {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    return `${API_BASE_URL}${path}`;
  };

  const fullName = `${user.first_name} ${user.last_name}`.trim() || user.email;
  const initials = `${user.first_name?.charAt(0) || ''}${user.last_name?.charAt(0) || ''}`.toUpperCase() || 'U';
  const profileImageUrl = user.image_url ? getImageUrl(user.image_url) : null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-10 w-10 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
              aria-label="Back to dashboard"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 shadow-lg shadow-blue-500/5 shrink-0">
            <Sliders className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Account & System Settings</h1>
            <p className="text-xs text-slate-400 font-medium">Manage your personal profile, credentials, and warehouse preferences</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span>Active Session</span>
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <BadgeCheck className="h-3.5 w-3.5 shrink-0" />
            <span>{user.role || 'ADMIN'}</span>
          </span>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 max-w-7xl mx-auto">
        {/* Left Column: Identity & Security Profile */}
        <div className="lg:col-span-4 space-y-6">
          {/* Identity Card */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 backdrop-blur-md overflow-hidden shadow-xl">
            <div className="h-28 bg-gradient-to-r from-blue-900/40 via-indigo-900/40 to-slate-900 border-b border-slate-800/80 relative">
              <div className="absolute inset-0 bg-grid-white/[0.03] bg-[size:16px_16px]" />
            </div>
            
            <div className="-mt-14 px-6 pb-6 text-center flex flex-col items-center">
              <div className="relative mb-4">
                <div className="group relative h-28 w-28 overflow-hidden rounded-2xl border-4 border-slate-900 bg-slate-800 shadow-2xl ring-1 ring-slate-800">
                  {profileImageUrl ? (
                    <img
                      src={profileImageUrl}
                      alt={fullName}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-tr from-blue-600 to-indigo-600 text-3xl font-black text-white">
                      {initials}
                    </div>
                  )}
                  <label 
                    htmlFor="profile-upload" 
                    className="absolute inset-0 flex cursor-pointer items-center justify-center bg-slate-950/60 text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100 backdrop-blur-xs"
                    title="Change profile picture"
                  >
                    <Camera className="h-6 w-6" />
                  </label>
                </div>
                {isUploading && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-slate-950/80">
                    <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
                  </div>
                )}
              </div>

              <input 
                type="file" 
                id="profile-upload" 
                className="hidden" 
                accept="image/*" 
                onChange={handleFileChange} 
                disabled={isUploading} 
              />

              <h2 className="text-lg font-bold text-white tracking-tight">{fullName}</h2>
              <p className="mt-0.5 text-xs text-slate-400 font-mono break-all">{user.email}</p>

              <div className="mt-4 flex items-center gap-2">
                <label 
                  htmlFor="profile-upload" 
                  className="inline-flex cursor-pointer items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-xs font-semibold shadow-sm transition-all active:scale-95"
                >
                  {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" /> : <Upload className="h-3.5 w-3.5 shrink-0" />}
                  <span>{isUploading ? 'Uploading...' : 'Change Photo'}</span>
                </label>
              </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="border-t border-slate-800/80 p-4 bg-slate-950/40 grid grid-cols-2 gap-3 text-center">
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/60">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Access Role</span>
                <span className="text-sm font-bold text-blue-400 mt-0.5 block">{user.role || 'ADMIN'}</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/60">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Account Type</span>
                <span className="text-sm font-bold text-emerald-400 mt-0.5 block">Verified</span>
              </div>
            </div>
          </div>

          {/* Security & Access Overview */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 backdrop-blur-md p-5 shadow-xl space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-slate-800">
              <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shrink-0">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Security & Permissions</h3>
                <p className="text-[11px] text-slate-400">Multi-tenant isolation status</p>
              </div>
            </div>

            <div className="space-y-2.5 text-xs text-slate-300">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/60">
                <span className="text-slate-400">Auth Method</span>
                <span className="font-semibold text-white">
                  {user.email?.includes('gmail.com') ? 'Google OAuth 2.0 / JWT' : 'Standard Password / JWT'}
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/60">
                <span className="text-slate-400">Warehouse Access</span>
                <span className="font-semibold text-emerald-400">All Zones (Unrestricted)</span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/60">
                <span className="text-slate-400">Database Connection</span>
                <span className="font-semibold text-blue-400">Supabase ap-southeast-1</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Editable Profile & Preferences */}
        <div className="lg:col-span-8 space-y-6">
          {/* Profile Form Card */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 backdrop-blur-md shadow-xl overflow-hidden">
            <div className="p-5 sm:p-6 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 shrink-0">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Personal Information</h3>
                  <p className="text-xs text-slate-400">Update your identity and display name across OptiTrack</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5">
              {error && (
                <Alert variant="destructive" className="bg-red-500/10 border-red-500/20 text-red-300 rounded-xl py-3">
                  <AlertDescription className="text-xs font-semibold">{error}</AlertDescription>
                </Alert>
              )}

              {success && (
                <Alert className="bg-emerald-500/10 border-emerald-500/20 text-emerald-300 rounded-xl py-3">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  <AlertDescription className="text-xs font-semibold ml-2">{success}</AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-300">First Name</Label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none shrink-0" />
                    <Input 
                      value={firstName} 
                      onChange={(e) => setFirstName(e.target.value)} 
                      className="h-11 rounded-xl border-slate-800 bg-slate-950/80 pl-10 text-white placeholder:text-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm font-medium"
                      placeholder="First name"
                      required 
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-300">Last Name</Label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none shrink-0" />
                    <Input 
                      value={lastName} 
                      onChange={(e) => setLastName(e.target.value)} 
                      className="h-11 rounded-xl border-slate-800 bg-slate-950/80 pl-10 text-white placeholder:text-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm font-medium"
                      placeholder="Last name"
                      required 
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-300">Email Address (Read-only)</Label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none shrink-0" />
                  <Input 
                    value={user.email} 
                    className="h-11 cursor-not-allowed rounded-xl border-slate-800 bg-slate-950/40 pl-10 text-slate-400 font-mono text-sm" 
                    disabled 
                  />
                </div>
                <p className="text-[11px] text-slate-500">Your account email address is tied to your primary identity and cannot be edited directly.</p>
              </div>

              <div className="pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3">
                <span className="text-xs text-slate-400">Changes are synchronized securely with your cloud profile.</span>
                <Button 
                  type="submit" 
                  className="w-full sm:w-auto h-11 px-6 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-lg shadow-blue-600/25 transition-all active:scale-95 text-xs" 
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                      Saving...
                    </span>
                  ) : (
                    'Save Changes'
                  )}
                </Button>
              </div>
            </form>
          </div>

          {/* Warehouse & Display Preferences Card */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 backdrop-blur-md shadow-xl p-5 sm:p-6 space-y-5">
            <div className="flex items-center gap-3 pb-4 border-b border-slate-800">
              <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shrink-0">
                <Warehouse className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Warehouse & Currency Preferences</h3>
                <p className="text-xs text-slate-400">Configure your default valuation currency and primary warehouse zone</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Currency Selector */}
              <div className="space-y-2 p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                <div className="flex items-center gap-2 text-slate-300">
                  <Coins className="h-4 w-4 text-amber-400 shrink-0" />
                  <span className="text-xs font-bold uppercase tracking-wider">Display Currency</span>
                </div>
                <p className="text-[11px] text-slate-400">Currency used for catalog pricing and inventory valuation</p>
                <div className="flex gap-2 pt-1">
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCurrency(c)}
                      className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all border ${
                        currency === c
                          ? 'bg-blue-600 border-blue-500 text-white shadow-md shadow-blue-600/20'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* Location Selector */}
              <div className="space-y-2 p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                <div className="flex items-center gap-2 text-slate-300">
                  <Warehouse className="h-4 w-4 text-blue-400 shrink-0" />
                  <span className="text-xs font-bold uppercase tracking-wider">Default Warehouse Zone</span>
                </div>
                <p className="text-[11px] text-slate-400">Filter transactions and inventory data by default</p>
                <div className="pt-1">
                  <select
                    value={selectedLocation}
                    onChange={(e) => setSelectedLocation(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-800 bg-slate-900 px-3 text-xs font-semibold text-white focus:border-blue-500 focus:outline-none"
                  >
                    <option value="ALL">All Warehouse Zones</option>
                    {locations.map((loc) => (
                      <option key={loc} value={loc}>
                        {loc}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}