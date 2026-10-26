"use client";

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Lock, Package } from 'lucide-react';

function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      await api.resetPassword(token, password);
      setDone(true);
      setTimeout(() => router.push('/login'), 2500);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Could not reset password. Please request a new link.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="space-y-6">
        <Alert variant="destructive">
          <AlertDescription>This reset link is missing its token. Please request a new one.</AlertDescription>
        </Alert>
        <Link href="/login" className="text-sm font-bold text-indigo-600 hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-4">
        <Alert>
          <AlertDescription>Your password has been reset. Redirecting to sign in…</AlertDescription>
        </Alert>
        <Link href="/login" className="text-sm font-bold text-indigo-600 hover:underline">
          Go to sign in now
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="password" className="text-sm font-bold text-slate-700 ml-1">New password</Label>
        <div className="relative group">
          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            maxLength={72}
            className="h-14 pl-12 bg-slate-50 text-slate-900 border-slate-200 rounded-2xl text-base font-semibold"
            required
            disabled={isLoading}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm" className="text-sm font-bold text-slate-700 ml-1">Confirm new password</Label>
        <div className="relative group">
          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
          <Input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            maxLength={72}
            className="h-14 pl-12 bg-slate-50 text-slate-900 border-slate-200 rounded-2xl text-base font-semibold"
            required
            disabled={isLoading}
          />
        </div>
      </div>

      <Button type="submit" className="w-full h-14 rounded-2xl text-base font-bold" disabled={isLoading}>
        {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Reset password'}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 p-6 font-sans">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-sm border border-slate-200 p-8 sm:p-10">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2.5 bg-indigo-50 rounded-xl">
            <Package className="h-6 w-6 text-indigo-600" />
          </div>
          <span className="text-xl font-extrabold tracking-tight text-slate-900">OptiTrack</span>
        </div>
        <h1 className="text-3xl font-black text-slate-900 tracking-tight mb-2">Set a new password</h1>
        <p className="text-slate-500 font-medium mb-8">Choose a new password for your account.</p>
        <Suspense fallback={null}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
