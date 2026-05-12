"use client";

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, User, Mail, Upload, CheckCircle2, ArrowLeft, Camera } from 'lucide-react';
import Link from 'next/link';

interface ProfileUser {
  first_name: string;
  last_name: string;
  email: string;
  image_url?: string | null;
  role?: string;
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



  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const getErrorMessage = (err: unknown, fallback: string) => {
    const apiError = err as ApiError;
    return apiError.response?.data?.detail || fallback;
  };

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      const userData = JSON.parse(userStr) as ProfileUser;
      setUser(userData);
      setFirstName(userData.first_name);
      setLastName(userData.last_name);
    }
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    setIsUploading(true);

    try {
      const updatedUser = await api.uploadProfileImage(file) as ProfileUser;
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
      const updatedUser = await api.updateProfile({
        first_name: firstName,
        last_name: lastName
      }) as ProfileUser;

      localStorage.setItem('user', JSON.stringify(updatedUser));
      setUser(updatedUser);
      setSuccess('Profile updated successfully!');
      
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to update profile.'));
    } finally {
      setIsLoading(false);
    }
  };


  if (!user) return null;

  const getImageUrl = (path: string) => {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    return `${API_BASE_URL}${path}`;
  };

  const fullName = `${user.first_name} ${user.last_name}`.trim() || user.email;
  const initials = `${user.first_name.charAt(0)}${user.last_name.charAt(0)}`.toUpperCase() || 'U';
  const profileImageUrl = user.image_url ? getImageUrl(user.image_url) : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
      {/* Header */}
        <div className="relative overflow-hidden rounded-[2rem] bg-slate-950 p-6 sm:p-8 shadow-2xl shadow-slate-900/15">
          <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-blue-500/30 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-32 w-32 rounded-full bg-violet-500/20 blur-3xl" />
          <div className="relative flex items-center gap-4">
            <div className="flex items-center gap-4">
              <Link href="/dashboard">
                <Button variant="ghost" size="icon" className="rounded-full bg-white/10 text-white hover:bg-white/20 hover:text-white">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-blue-200">Profile Center</p>
                <h1 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-4xl">Account Settings</h1>
                <p className="mt-2 max-w-xl text-sm font-medium text-slate-300">Manage your personal information, profile photo, and account security preferences.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_1fr]">
        {/* Profile Card */}
          <div className="space-y-6">
            <div className="overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-xl shadow-slate-200/70">
              <div className="h-28 bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600" />
              <div className="-mt-16 px-6 pb-6 text-center">
                <div className="relative mx-auto mb-4 h-32 w-32">
                  <div className="group relative h-32 w-32 overflow-hidden rounded-[2rem] border-4 border-white bg-white shadow-2xl shadow-indigo-500/20">
                    {profileImageUrl ? (
                      <img
                        src={profileImageUrl}
                        alt={fullName}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-violet-500 to-purple-600 text-5xl font-black text-white">
                        {initials}
                      </div>
                    )}
                    <label htmlFor="profile-upload" className="absolute inset-0 flex cursor-pointer items-center justify-center bg-slate-950/50 text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                      <Camera className="h-8 w-8" />
                    </label>
                  </div>
                  {isUploading && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[2rem] bg-white/80">
                      <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                    </div>
                  )}
                </div>
                <input type="file" id="profile-upload" className="hidden" accept="image/*" onChange={handleFileChange} disabled={isUploading} />
                <h2 className="text-2xl font-black text-slate-950">{fullName}</h2>
                <p className="mt-1 break-all text-sm font-semibold text-slate-500">{user.email}</p>
                <label htmlFor="profile-upload" className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-slate-900/15 transition-all hover:-translate-y-0.5 hover:bg-slate-800">
                  {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {isUploading ? 'Uploading...' : 'Change Photo'}
                </label>
              </div>
            </div>

          </div>

        {/* Edit Forms */}
          <div className="space-y-6">
        {/* Personal Info */}
            <div className="overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-xl shadow-slate-200/70">
              <div className="border-b border-slate-100 bg-gradient-to-r from-white to-blue-50/60 p-6 sm:p-8">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-500/25">
                      <User className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-slate-950">Personal Information</h3>
                      <p className="text-sm font-semibold text-slate-500">Update your name and account identity.</p>
                    </div>
                  </div>
                </div>
              </div>
              <form onSubmit={handleSubmit} className="space-y-6 p-6 sm:p-8">
                {error && (
                  <Alert variant="destructive" className="rounded-2xl py-4">
                    <AlertDescription className="font-bold">{error}</AlertDescription>
                  </Alert>
                )}
                {success && (
                  <Alert className="rounded-2xl border-emerald-200 bg-emerald-50 py-4 text-emerald-700">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <AlertDescription className="font-bold">{success}</AlertDescription>
                  </Alert>
                )}

                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="ml-1 text-sm font-black text-slate-700">First Name</Label>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                      <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="h-[52px] rounded-2xl border-slate-200 bg-slate-50 pl-12 font-semibold transition-all focus:bg-white" required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="ml-1 text-sm font-black text-slate-700">Last Name</Label>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                      <Input value={lastName} onChange={(e) => setLastName(e.target.value)} className="h-[52px] rounded-2xl border-slate-200 bg-slate-50 pl-12 font-semibold transition-all focus:bg-white" required />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="ml-1 text-sm font-black text-slate-700">Email Address</Label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                    <Input value={user.email} className="h-[52px] cursor-not-allowed rounded-2xl border-slate-200 bg-slate-100 pl-12 font-semibold text-slate-500" disabled />
                  </div>
                  <p className="ml-1 text-xs font-bold text-slate-400">Email cannot be modified.</p>
                </div>

                <div className="flex flex-col gap-3 border-t border-slate-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-semibold text-slate-500">Changes are saved securely to your account profile.</p>
                  <Button type="submit" className="h-12 rounded-2xl bg-slate-950 px-8 font-black text-white shadow-xl shadow-slate-900/15 transition-all hover:-translate-y-0.5 hover:bg-slate-800" disabled={isLoading}>
                    {isLoading ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Saving...
                      </span>
                    ) : (
                      'Save Changes'
                    )}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
