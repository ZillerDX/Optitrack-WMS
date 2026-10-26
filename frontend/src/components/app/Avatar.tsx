import { cn } from '@/lib/utils';

interface AvatarUser {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  image_url?: string | null;
}

function initialsOf(user: AvatarUser | undefined): string {
  if (!user) return '';
  const letters = `${user.first_name?.[0] ?? ''}${user.last_name?.[0] ?? ''}`.trim();
  return (letters || user.email?.[0] || '?').toUpperCase();
}

/** The user's picture, or their initials. Decorative: the name is always shown next to it. */
export function Avatar({ user, size = 34, className }: { user: AvatarUser | undefined; size?: number; className?: string }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };
  if (user?.image_url) {
    // a data URL stored with the account: next/image has nothing to optimise
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={user.image_url} alt="" style={style} className={cn('shrink-0 rounded-full object-cover', className)} />;
  }
  return (
    <div aria-hidden="true" style={style} className={cn('flex shrink-0 items-center justify-center rounded-full bg-accent font-semibold text-accent-foreground', className)}>
      {initialsOf(user)}
    </div>
  );
}
