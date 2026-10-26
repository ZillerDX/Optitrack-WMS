'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDayString, formatNumber } from '@/lib/format';
import type { DashboardSummary } from './api';

const axisStyle = { fontSize: 12, fill: 'hsl(var(--muted-foreground))' } as const;

function ChartTooltip({ active, payload, label, valueFormat }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string; valueFormat: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-md">
      {label && <p className="mb-1 font-semibold">{label}</p>}
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-muted-foreground">
          <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="font-semibold text-foreground">{valueFormat(Number(p.value))}</span>
        </p>
      ))}
    </div>
  );
}

/** Units received and shipped per day. The data table below is for screen readers; the picture is hidden from them. */
export function MovementChart({ data }: { data: DashboardSummary['movement'] }) {
  const rows = data.map((d) => ({ day: formatDayString(d.day), Received: Number(d.inbound_units), Shipped: Number(d.outbound_units) }));
  const received = rows.reduce((s, r) => s + r.Received, 0);
  const shipped = rows.reduce((s, r) => s + r.Shipped, 0);
  return (
    <figure className="m-0">
      <div aria-hidden="true" className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barGap={2}>
            <CartesianGrid vertical={false} stroke="hsl(var(--chart-grid))" />
            <XAxis dataKey="day" tick={axisStyle} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
            <YAxis tick={axisStyle} tickLine={false} axisLine={false} allowDecimals={false} width={44} />
            <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} content={<ChartTooltip valueFormat={(v) => `${formatNumber(v)} units`} />} />
            <Bar dataKey="Received" fill="hsl(var(--chart-1))" radius={[3, 3, 0, 0]} maxBarSize={18} isAnimationActive={false} />
            <Bar dataKey="Shipped" fill="hsl(var(--chart-2))" radius={[3, 3, 0, 0]} maxBarSize={18} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ background: 'hsl(var(--chart-1))' }} />
          Received {formatNumber(received)}
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ background: 'hsl(var(--chart-2))' }} />
          Shipped {formatNumber(shipped)}
        </span>
      </figcaption>
      <table className="sr-only">
        <caption>Units received and shipped per day</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Received</th>
            <th scope="col">Shipped</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.day}>
              <th scope="row">{r.day}</th>
              <td>{r.Received}</td>
              <td>{r.Shipped}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Stock value (selling price) per category, largest first. */
export function CategoryChart({ data, formatMoney, formatCompact }: { data: DashboardSummary['by_category']; formatMoney: (v: number) => string; formatCompact: (v: number) => string }) {
  const rows = data.slice(0, 7).map((c) => ({ category: c.category, Value: Number(c.market_value) }));
  return (
    <figure className="m-0">
      <div aria-hidden="true" style={{ height: Math.max(120, rows.length * 40 + 24) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid horizontal={false} stroke="hsl(var(--chart-grid))" />
            <XAxis type="number" tick={axisStyle} tickLine={false} axisLine={false} tickFormatter={(v) => formatCompact(Number(v))} />
            <YAxis type="category" dataKey="category" tick={axisStyle} tickLine={false} axisLine={false} width={96} />
            <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} content={<ChartTooltip valueFormat={formatMoney} />} />
            <Bar dataKey="Value" fill="hsl(var(--chart-1))" radius={[0, 3, 3, 0]} barSize={18} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Stock value per category</caption>
        <thead>
          <tr>
            <th scope="col">Category</th>
            <th scope="col">Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.category}>
              <th scope="row">{r.category}</th>
              <td>{formatMoney(r.Value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
