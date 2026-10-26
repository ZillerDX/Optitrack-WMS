'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { AuthShell, authLinkClass } from '@/components/auth/AuthShell';
import { FormNotice, TextField } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/apiFetch';
import { PASSWORD_MIN_LENGTH } from '@/lib/validation';

function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const mismatch = confirm.length > 0 && confirm !== password ? 'The two passwords do not match.' : null;

  const reset = useMutation({
    mutationFn: () => apiFetch('/api/auth/reset-password', { method: 'POST', json: { token, new_password: password } }),
    onSuccess: () => router.push('/login?reset=true'),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!mismatch) reset.mutate();
  };

  const back = (
    <Link href="/login" className={authLinkClass}>
      Back to sign in
    </Link>
  );

  if (!token) {
    return (
      <AuthShell title="Set a new password" footer={back}>
        <FormNotice tone="error">This reset link is missing its token. Request a new one.</FormNotice>
        <p className="mt-4 text-sm">
          <Link href="/forgot-password" className={authLinkClass}>
            Send me a new link
          </Link>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Set a new password" description="Choose a new password for your account." footer={back}>
      <form onSubmit={onSubmit} className="space-y-4">
        {reset.error && <FormNotice tone="error">{reset.error.message}</FormNotice>}
        <TextField id="password" label="New password" type="password" autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} maxLength={72} hint={`At least ${PASSWORD_MIN_LENGTH} characters.`} value={password} onChange={(e) => setPassword(e.target.value)} required disabled={reset.isPending} />
        <TextField id="confirm" label="Confirm new password" type="password" autoComplete="new-password" maxLength={72} error={mismatch} value={confirm} onChange={(e) => setConfirm(e.target.value)} required disabled={reset.isPending} />
        <Button type="submit" size="lg" className="h-11 w-full text-[15px] font-semibold" disabled={reset.isPending}>
          {reset.isPending ? 'Saving...' : 'Reset password'}
        </Button>
      </form>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetForm />
    </Suspense>
  );
}
