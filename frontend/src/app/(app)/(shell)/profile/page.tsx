'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/app/PageHeader';
import { ME_QUERY_KEY, initials, useCurrentUser, type CurrentUser } from '@/components/app/AppShell';
import { Avatar } from '@/components/app/Avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormNotice, TextField } from '@/components/ui/field';
import { apiFetch } from '@/lib/apiFetch';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export default function ProfilePage() {
  const me = useCurrentUser();
  const queryClient = useQueryClient();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [saved, setSaved] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (me.data) {
      setFirstName(me.data.first_name ?? '');
      setLastName(me.data.last_name ?? '');
    }
  }, [me.data]);

  // the shell reads the same query, so a saved change shows in the sidebar at once (U10)
  const remember = (user: CurrentUser) => queryClient.setQueryData(ME_QUERY_KEY, (old: CurrentUser | undefined) => ({ ...(old ?? user), ...user }));

  const save = useMutation({
    mutationFn: () => apiFetch<CurrentUser>('/api/auth/me', { method: 'PUT', json: { first_name: firstName.trim(), last_name: lastName.trim() } }),
    onSuccess: ({ data }) => {
      remember(data);
      setSaved(true);
    },
  });

  const upload = useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.append('file', file);
      return apiFetch<CurrentUser>('/api/auth/upload-image', { method: 'POST', body });
    },
    onSuccess: ({ data }) => remember(data),
  });

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    setImageError(null);
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError('The image is larger than 2 MB. Choose a smaller one.');
      return;
    }
    upload.mutate(file);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSaved(false);
    save.mutate();
  };

  const user = me.data;
  const changed = user ? firstName.trim() !== (user.first_name ?? '') || lastName.trim() !== (user.last_name ?? '') : false;

  return (
    <>
      <PageHeader title="Profile" description="Your name and picture." />
      <div className="grid max-w-3xl gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Picture</CardTitle>
            <CardDescription>JPG, PNG, WEBP or GIF, up to 2 MB.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-4">
            <Avatar user={user} size={64} />
            <div>
              <input ref={fileRef} id="profile-image" aria-hidden="true" tabIndex={-1} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={onFile} className="sr-only" />
              <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={upload.isPending}>
                {upload.isPending ? 'Uploading...' : 'Choose a picture'}
              </Button>
            </div>
            {(imageError || upload.error) && <FormNotice tone="error">{imageError ?? upload.error?.message}</FormNotice>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Name</CardTitle>
            <CardDescription>{user ? `Signed in as ${user.email}. The email cannot be changed here.` : 'Your account.'}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              {saved && !save.isPending && <FormNotice tone="success">Saved. {initials(user)} is how you appear in the sidebar.</FormNotice>}
              {save.error && <FormNotice tone="error">{save.error.message}</FormNotice>}
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField id="profile-first" label="First name" maxLength={100} value={firstName} onChange={(e) => { setFirstName(e.target.value); setSaved(false); }} required disabled={save.isPending} />
                <TextField id="profile-last" label="Last name" maxLength={100} value={lastName} onChange={(e) => { setLastName(e.target.value); setSaved(false); }} required disabled={save.isPending} />
              </div>
              <Button type="submit" disabled={save.isPending || !changed || !firstName.trim() || !lastName.trim()}>
                {save.isPending ? 'Saving...' : 'Save changes'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-sm text-muted-foreground">
          Theme and display currency are in{' '}
          <Link href="/settings" className="font-semibold text-primary underline-offset-4 hover:underline">
            Settings
          </Link>
          .
        </p>
      </div>
    </>
  );
}
