'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { AuthShell, authLinkClass } from '@/components/auth/AuthShell';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { FormNotice, TextField } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/apiFetch';
import { PASSWORD_MIN_LENGTH } from '@/lib/validation';

export default function SignUpPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [googleError, setGoogleError] = useState<string | null>(null);

  const register = useMutation({
    mutationFn: () => apiFetch('/api/auth/register', { method: 'POST', json: { first_name: firstName.trim(), last_name: lastName.trim(), email, password } }),
    onSuccess: () => router.push('/login?registered=true'),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setGoogleError(null);
    register.mutate();
  };

  return (
    <AuthShell
      title="Create your account"
      description="It takes a minute. No card needed."
      footer={
        <>
          Already have an account?{' '}
          <Link href="/login" className={authLinkClass}>
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {(register.error || googleError) && <FormNotice tone="error">{register.error?.message ?? googleError}</FormNotice>}
        <div className="grid grid-cols-2 gap-3">
          <TextField id="first_name" label="First name" autoComplete="given-name" maxLength={100} value={firstName} onChange={(e) => setFirstName(e.target.value)} required disabled={register.isPending} />
          <TextField id="last_name" label="Last name" autoComplete="family-name" maxLength={100} value={lastName} onChange={(e) => setLastName(e.target.value)} required disabled={register.isPending} />
        </div>
        <TextField id="email" label="Email" type="email" autoComplete="email" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={register.isPending} />
        <TextField
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          maxLength={72}
          hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={register.isPending}
        />
        <Button type="submit" size="lg" className="h-11 w-full text-[15px] font-semibold" disabled={register.isPending}>
          {register.isPending ? 'Creating account...' : 'Create account'}
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
      <GoogleSignInButton mode="signup" onError={setGoogleError} />
    </AuthShell>
  );
}
