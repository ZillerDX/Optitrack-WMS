'use client';

import Link from 'next/link';
import { PageHeader } from '@/components/app/PageHeader';
import { useCurrentUser, useSignOut } from '@/components/app/AppShell';
import { MonitorIcon, MoonIcon, SunIcon } from '@/components/app/icons';
import { useCurrency } from '@/components/providers/CurrencyProvider';
import { useTheme } from '@/components/providers/ThemeProvider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SegmentedControl } from '@/components/ui/segmented';
import { SUPPORTED_CURRENCIES, type SupportedCurrency } from '@/lib/currencyPreference';
import type { ThemePreference } from '@/lib/theme';

const CURRENCY_NAMES: Record<SupportedCurrency, string> = { USD: 'US dollar', THB: 'Thai baht', EUR: 'Euro' };

export default function SettingsPage() {
  const { preference, setPreference } = useTheme();
  const { currency, setCurrency, format, liveRates } = useCurrency();
  const me = useCurrentUser();
  const signOut = useSignOut();

  return (
    <>
      <PageHeader title="Settings" description="How the app looks on this device, and your account." />

      <div className="grid max-w-3xl gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Light is the default. Your choice is remembered on this device.</CardDescription>
          </CardHeader>
          <CardContent>
            <SegmentedControl<ThemePreference>
              label="Theme"
              value={preference}
              onChange={setPreference}
              options={[
                { value: 'light', label: 'Light', icon: <SunIcon size={16} /> },
                { value: 'dark', label: 'Dark', icon: <MoonIcon size={16} /> },
                { value: 'system', label: 'System', icon: <MonitorIcon size={16} /> },
              ]}
            />
            <p className="mt-3 text-sm text-muted-foreground">System follows the setting of your computer or phone.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Currency</CardTitle>
            <CardDescription>
              Prices are stored in US dollars. This only changes how amounts are shown.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SegmentedControl<SupportedCurrency>
              label="Display currency"
              value={currency}
              onChange={setCurrency}
              options={SUPPORTED_CURRENCIES.map((code) => ({ value: code, label: code }))}
            />
            <p className="mt-3 text-sm text-muted-foreground" data-testid="currency-example">
              {CURRENCY_NAMES[currency]}. For example, a $1,250.00 stock value is shown as{' '}
              <strong className="font-semibold text-foreground">{format(1250)}</strong>
              {!liveRates && ' (using a built-in rate: the live rate could not be loaded)'}.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>
              {me.data ? (
                <>
                  Signed in as <strong className="font-semibold text-foreground">{`${me.data.first_name} ${me.data.last_name}`.trim()}</strong> ({me.data.email}).
                </>
              ) : (
                'Your account details.'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Button asChild variant="outline">
              <Link href="/profile">Edit profile</Link>
            </Button>
            <Button type="button" variant="outline" onClick={() => signOut.mutate()} disabled={signOut.isPending}>
              {signOut.isPending ? 'Signing out...' : 'Sign out'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
