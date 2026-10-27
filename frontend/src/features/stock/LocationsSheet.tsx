'use client';

import { useState, type FormEvent } from 'react';
import { Sheet } from '@/components/ui/sheet';
import { FormNotice, TextField } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Meter } from '@/components/ui/meter';
import { TourTarget } from '@/features/tour/TourTarget';
import { formatNumber } from '@/lib/format';
import { useDeleteLocation, useLocations, useSaveLocation, type LocationRow } from './api';

interface Draft {
  id?: number;
  name: string;
  capacity: string;
  description: string;
}

const EMPTY: Draft = { name: '', capacity: '1000', description: '' };

function LocationForm({ draft, onCancel, onSaved }: { draft: Draft; onCancel: () => void; onSaved: () => void }) {
  const [form, setForm] = useState(draft);
  const save = useSaveLocation();
  const capacity = Number(form.capacity);
  const capacityError = form.capacity.trim() === '' || !Number.isInteger(capacity) || capacity < 0 ? 'Enter a whole number, 0 or more.' : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (capacityError) return;
    save.mutate({ id: form.id, name: form.name.trim(), capacity, description: form.description.trim() }, { onSuccess: onSaved });
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-[12px] border border-border p-4">
      <h3 className="text-sm font-bold">{form.id ? 'Edit location' : 'New location'}</h3>
      {save.error && <FormNotice tone="error">{save.error.message}</FormNotice>}
      <TextField id="location-name" label="Name" maxLength={50} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required disabled={save.isPending} />
      <TextField
        id="location-capacity"
        label="Capacity (units)"
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        value={form.capacity}
        onChange={(e) => setForm({ ...form, capacity: e.target.value })}
        error={capacityError}
        required
        disabled={save.isPending}
      />
      <TextField id="location-description" label="Description (optional)" maxLength={255} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} disabled={save.isPending} />
      <div className="flex gap-2">
        <Button type="submit" disabled={save.isPending || !form.name.trim() || capacityError !== null}>
          {save.isPending ? 'Saving...' : 'Save'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={save.isPending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function LocationItem({ location, used, onEdit }: { location: LocationRow; used: number; onEdit: () => void }) {
  const remove = useDeleteLocation();
  const [confirming, setConfirming] = useState(false);

  return (
    <li className="rounded-[12px] border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{location.name}</p>
          {location.description && <p className="truncate text-sm text-muted-foreground">{location.description}</p>}
        </div>
        <div className="flex shrink-0 gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={onEdit} aria-label={`Edit ${location.name}`}>
            Edit
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(true)} aria-label={`Delete ${location.name}`}>
            Delete
          </Button>
        </div>
      </div>
      <Meter className="mt-3" value={used} max={location.capacity} label={`${location.name} is ${formatNumber(used)} of ${formatNumber(location.capacity)} full`} />
      <p className="mt-1.5 text-xs text-muted-foreground">
        {formatNumber(used)} of {formatNumber(location.capacity)} units
      </p>
      {confirming && (
        <div className="mt-3 space-y-3 rounded-[10px] bg-muted p-3">
          <p className="text-sm">Delete {location.name}? This cannot be undone.</p>
          {remove.error && <FormNotice tone="error">{remove.error.message}</FormNotice>}
          <div className="flex gap-2">
            <Button type="button" variant="destructive" size="sm" disabled={remove.isPending} onClick={() => remove.mutate(location.id, { onSuccess: () => setConfirming(false) })}>
              {remove.isPending ? 'Deleting...' : 'Yes, delete'}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={remove.isPending} onClick={() => setConfirming(false)}>
              Keep it
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

/** Add, rename, resize and delete locations. A location that still holds stock is refused by the server, with its reason shown. */
export function LocationsSheet({ open, onOpenChange, usage }: { open: boolean; onOpenChange: (open: boolean) => void; usage: Record<string, number> }) {
  const locations = useLocations();
  const [draft, setDraft] = useState<Draft | null>(null);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) setDraft(null);
        onOpenChange(next);
      }}
      title="Locations"
      description="Where your stock is kept."
    >
      <div className="space-y-4">
        {draft ? (
          <LocationForm key={draft.id ?? 'new'} draft={draft} onCancel={() => setDraft(null)} onSaved={() => setDraft(null)} />
        ) : (
          <TourTarget steps={['location']} className="w-fit">
            <Button type="button" onClick={() => setDraft(EMPTY)}>
              Add location
            </Button>
          </TourTarget>
        )}
        {locations.isPending && <p className="text-sm text-muted-foreground">Loading...</p>}
        {locations.isError && <FormNotice tone="error">{locations.error.message}</FormNotice>}
        <ul className="space-y-3">
          {locations.data?.map((l) => (
            <LocationItem key={l.id} location={l} used={usage[l.name] ?? 0} onEdit={() => setDraft({ id: l.id, name: l.name, capacity: String(l.capacity), description: l.description ?? '' })} />
          ))}
        </ul>
      </div>
    </Sheet>
  );
}
