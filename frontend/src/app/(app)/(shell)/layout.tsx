import { AppShell } from '@/components/app/AppShell';

/** Signed-in pages of the redesigned app: the sidebar / bottom bar around the page. */
export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
