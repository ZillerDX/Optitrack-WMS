'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { AuthShell, authLinkClass } from '@/components/auth/AuthShell';
import { FormNotice, TextField } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/apiFetch';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const send = useMutation({
    mutationFn: () => apiFetch<{ message?: string }>('/api/auth/forgot-password', { method: 'POST', json: { email } }),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    send.mutate();
  };

  return (
    <AuthShell
      title="Reset your password"
      description="Enter your email and we will send you a link to choose a new password."
      footer={
        <Link href="/login" className={authLinkClass}>
          Back to sign in
        </Link>
      }
    >
      {send.isSuccess ? (
        <FormNotice tone="success">{send.data.data?.message ?? 'If the email is registered, a reset link has been sent to your inbox.'}</FormNotice>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          {send.error && <FormNotice tone="error">{send.error.message}</FormNotice>}
          <TextField id="email" label="Email" type="email" autoComplete="email" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={send.isPending} />
          <Button type="submit" size="lg" className="h-11 w-full text-[15px] font-semibold" disabled={send.isPending}>
            {send.isPending ? 'Sending...' : 'Send reset link'}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
