'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Sheet } from '@/components/ui/sheet';
import { SegmentedControl } from '@/components/ui/segmented';
import { FormNotice } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { useCurrency } from '@/components/providers/CurrencyProvider';
import { formatDateTime, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useApproveReorder, useChat, useReorderSuggestions, useReport, type ChatTurn, type DraftOrder } from './api';

type Tab = 'ask' | 'reorder' | 'report';

const SUGGESTIONS = ['What is the total inventory value?', 'Which products are running low?', 'Which location is the fullest?'];

function AskTab() {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [text, setText] = useState('');
  const chat = useChat();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [turns, chat.isPending]);

  const send = (message: string) => {
    const clean = message.trim();
    if (!clean || chat.isPending) return;
    const history = turns;
    setTurns([...turns, { role: 'user', content: clean }]);
    setText('');
    chat.mutate({ message: clean, history }, { onSuccess: (reply) => setTurns((t) => [...t, { role: 'assistant', content: reply }]) });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    send(text);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3" aria-live="polite">
        {turns.length === 0 && (
          <div>
            <p className="text-sm text-muted-foreground">Ask about your stock, values or locations. The assistant reads your warehouse data. It can be wrong: check anything you act on.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-border px-3 py-1.5 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={cn('max-w-[92%] whitespace-pre-wrap rounded-[12px] px-3.5 py-2.5 text-sm', t.role === 'user' ? 'ml-auto bg-primary text-primary-foreground' : 'bg-muted')}>
            <span className="sr-only">{t.role === 'user' ? 'You: ' : 'Assistant: '}</span>
            {t.content}
          </div>
        ))}
        {chat.isPending && (
          <div role="status" className="w-fit rounded-[12px] bg-muted px-3.5 py-2.5 text-sm text-muted-foreground">
            Thinking...
          </div>
        )}
        {chat.isError && <FormNotice tone="error">{chat.error.message}</FormNotice>}
        <div ref={endRef} />
      </div>
      <form onSubmit={submit} className="mt-4 flex gap-2 border-t border-border pt-4">
        <label htmlFor="assistant-message" className="sr-only">
          Your question
        </label>
        <input
          id="assistant-message"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={2000}
          placeholder="Ask a question"
          autoComplete="off"
          className="h-11 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button type="submit" size="lg" disabled={chat.isPending || !text.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}

function OrderRow({ order }: { order: DraftOrder }) {
  const { format } = useCurrency();
  const approve = useApproveReorder();
  const [confirming, setConfirming] = useState(false);
  const critical = order.urgency === 'CRITICAL';

  return (
    <li className="rounded-[12px] border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{order.product_name}</p>
          <p className="text-xs text-muted-foreground">
            SKU {order.sku} · {order.supplier}
          </p>
        </div>
        <span className={cn('shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold', critical ? 'bg-danger-bg text-danger' : 'bg-warning-bg text-warning')}>{critical ? 'Urgent' : 'Soon'}</span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {formatNumber(order.current_stock)} in stock{order.days_remaining !== null ? `, about ${formatNumber(order.days_remaining)} days left` : ''}. Suggested order: <strong className="text-foreground">{formatNumber(order.reorder_qty)} units</strong> at {format(order.unit_cost)} ={' '}
        <strong className="text-foreground">{format(order.total_amount)}</strong>.
      </p>
      {approve.isSuccess ? (
        <p role="status" className="mt-3 text-sm font-semibold text-success">
          {approve.data}
        </p>
      ) : confirming ? (
        <div className="mt-3 space-y-3 rounded-[10px] bg-muted p-3">
          <p className="text-sm">
            This records the order and receives {formatNumber(order.reorder_qty)} units into {order.target_location} right away.
          </p>
          {approve.error && <FormNotice tone="error">{approve.error.message}</FormNotice>}
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={approve.isPending} onClick={() => approve.mutate(order)}>
              {approve.isPending ? 'Saving...' : 'Approve and receive'}
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={approve.isPending} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => setConfirming(true)} aria-label={`Review order for ${order.product_name}`}>
          Review order
        </Button>
      )}
    </li>
  );
}

function ReorderTab({ active }: { active: boolean }) {
  const { format } = useCurrency();
  const q = useReorderSuggestions(active);
  if (q.isPending) return <p role="status" className="text-sm text-muted-foreground">Looking at your stock...</p>;
  if (q.isError)
    return (
      <div role="alert" className="space-y-3">
        <FormNotice tone="error">{q.error.message}</FormNotice>
        <Button type="button" size="sm" onClick={() => q.refetch()}>
          Try again
        </Button>
      </div>
    );
  const orders = q.data.draft_purchase_orders;
  return (
    <div className="space-y-4">
      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing needs ordering. {formatNumber(q.data.summary.total_tracked_products)} products are tracked.</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {formatNumber(orders.length)} suggested order{orders.length === 1 ? '' : 's'}, about {format(q.data.summary.total_restock_budget)} in total. Suggestions use the last 30 days of shipments.
          </p>
          <ul className="space-y-3">
            {orders.map((o) => (
              <OrderRow key={o.id} order={o} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function ReportTab() {
  const { format } = useCurrency();
  const report = useReport();
  const r = report.data;
  const items = r && Array.isArray(r.action_items) ? r.action_items : [];
  return (
    <div className="space-y-4">
      {!r && (
        <div>
          <p className="text-sm text-muted-foreground">A health score for the warehouse with the figures behind it.</p>
          <Button type="button" className="mt-3" onClick={() => report.mutate()} disabled={report.isPending}>
            {report.isPending ? 'Generating...' : 'Generate report'}
          </Button>
        </div>
      )}
      {report.isError && <FormNotice tone="error">{report.error.message}</FormNotice>}
      {r && (
        <>
          <div className="flex items-center gap-4 rounded-[12px] border border-border p-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-accent text-2xl font-bold text-accent-foreground" aria-label={`Grade ${r.health_grade}`}>
              {r.health_grade}
            </div>
            <div>
              <p className="font-semibold">Health score {formatNumber(r.health_score)} of 100</p>
              <p className="text-sm text-muted-foreground">Generated {formatDateTime(r.generated_at)}</p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {[
              ['Units in stock', formatNumber(r.metrics.total_units)],
              ['Stock value', format(r.metrics.total_valuation)],
              ['Space used', `${formatNumber(r.metrics.utilization_pct)}%`],
              ['Urgent / soon', `${formatNumber(r.metrics.critical_count)} / ${formatNumber(r.metrics.warning_count)}`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-[10px] bg-muted px-3 py-2.5">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="font-semibold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          {items.length > 0 && (
            <div>
              <h3 className="text-sm font-bold">Suggested actions</h3>
              <ul className="mt-2 space-y-3 text-sm">
                {items.map((a) => (
                  <li key={a.id} className="rounded-[10px] border border-border p-3">
                    <p className="flex items-center gap-2 font-semibold">
                      <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', a.priority === 'HIGH' ? 'bg-danger-bg text-danger' : a.priority === 'MEDIUM' ? 'bg-warning-bg text-warning' : 'bg-muted text-muted-foreground')}>{a.priority}</span>
                      {a.title}
                    </p>
                    <p className="mt-1 text-muted-foreground">{a.description}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <details className="rounded-[10px] border border-border">
            <summary className="cursor-pointer px-3 py-2.5 text-sm font-semibold">Full text</summary>
            <pre className="overflow-x-auto whitespace-pre-wrap border-t border-border p-3 text-xs">{r.report_markdown}</pre>
          </details>
          <Button type="button" variant="outline" size="sm" onClick={() => report.mutate()} disabled={report.isPending}>
            {report.isPending ? 'Generating...' : 'Generate again'}
          </Button>
        </>
      )}
    </div>
  );
}

/** One panel for the three things the assistant does: answer questions, suggest orders, write a report. */
export function AssistantPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [tab, setTab] = useState<Tab>('ask');
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Assistant" description="Questions, reorder suggestions and a report." size="lg">
      <div className="flex min-h-full flex-col gap-4">
        <SegmentedControl<Tab>
          label="Assistant section"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'ask', label: 'Ask' },
            { value: 'reorder', label: 'Reorder' },
            { value: 'report', label: 'Report' },
          ]}
        />
        <div className="flex-1">
          {tab === 'ask' && <AskTab />}
          {tab === 'reorder' && <ReorderTab active={open} />}
          {tab === 'report' && <ReportTab />}
        </div>
      </div>
    </Sheet>
  );
}
