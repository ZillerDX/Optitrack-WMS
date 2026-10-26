'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { AuthShell, authLinkClass } from '@/components/auth/AuthShell';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { FormNotice, TextField } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/apiFetch';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [googleError, setGoogleError] = useState<string | null>(null);

  const login = useMutation({
    mutationFn: () => apiFetch<{ user: unknown }>('/api/auth/login', { method: 'POST', json: { email, password } }),
    onSuccess: ({ data }) => {
      try {
        window.localStorage.setItem('user', JSON.stringify(data.user)); // a hint the pages not yet redesigned keep
      } catch {
        // storage blocked: the session cookie is what counts
      }
      router.push('/dashboard');
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setGoogleError(null);
    login.mutate();
  };

  return (
    <AuthShell
      title="Sign in"
      description="Welcome back. Enter your details to continue."
      footer={
        <>
          New here?{' '}
          <Link href="/signup" className={authLinkClass}>
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {params.get('registered') && <FormNotice tone="success">Your account is ready. Sign in to continue.</FormNotice>}
        {params.get('reset') && <FormNotice tone="success">Your password was changed. Sign in with the new one.</FormNotice>}
        {(login.error || googleError) && <FormNotice tone="error">{login.error?.message ?? googleError}</FormNotice>}

        <TextField id="email" label="Email" type="email" autoComplete="email" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={login.isPending} />
        <TextField
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={login.isPending}
          labelAction={
            <Link href="/forgot-password" className={`${authLinkClass} text-[13px]`}>
              Forgot password?
            </Link>
          }
        />
        <Button type="submit" size="lg" className="h-11 w-full text-[15px] font-semibold" disabled={login.isPending}>
          {login.isPending ? 'Signing in...' : 'Sign in'}
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
      <GoogleSignInButton mode="signin" onError={setGoogleError} />
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
