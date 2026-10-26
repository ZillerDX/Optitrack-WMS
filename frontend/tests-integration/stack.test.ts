import { beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { clearAuthCache, supabaseRest } from '@/lib/supabase';
import { POST as register } from '@/app/api/auth/register/route';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as logout } from '@/app/api/auth/logout/route';
import { GET as listProducts, POST as createProduct } from '@/app/api/products/route';
import { DELETE as deleteProduct } from '@/app/api/products/[id]/route';
import { GET as listLocations, POST as createLocation } from '@/app/api/locations/route';
import { GET as listCategories, POST as createCategory } from '@/app/api/categories/route';
import { GET as listInventory, POST as createInventory } from '@/app/api/inventory/route';
import { DELETE as deleteInventory, PUT as updateInventory } from '@/app/api/inventory/[id]/route';
import { DELETE as deleteLocation, PUT as updateLocation } from '@/app/api/locations/[id]/route';
import { POST as createTransaction } from '@/app/api/transactions/route';
import { POST as approveReorder } from '@/app/api/ai/reorder/approve/route';
import { GET as predictive } from '@/app/api/ai/predictive/route';
import { POST as aiReport } from '@/app/api/ai/report/route';
import { POST as aiChat } from '@/app/api/ai/chat/route';
import { GET as dashboardSummary } from '@/app/api/dashboard/summary/route';
import { GET as dashboardMetrics } from '@/app/api/dashboard/metrics/route';
import { GET as listTransactions } from '@/app/api/transactions/route';

let ip = 0;
const headers = (extra: Record<string, string> = {}) => ({
  'content-type': 'application/json',
  'x-forwarded-for': `10.9.${Math.floor(++ip / 250)}.${ip % 250}`, // a fresh address per call: no rate-limit interference
  ...extra,
});
const call = (method: string, body: unknown, token?: string, extra: Record<string, string> = {}) =>
  new NextRequest('http://app.test/api/x', {
    method,
    headers: headers({ ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ctx = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) });
const rows = async (path: string) => (await (await supabaseRest(path)).json()) as any[];

async function reset() {
  for (const [table, filter] of [
    ['transactions', 'id=gt.0'], ['inventory', 'id=gt.0'], ['purchase_orders', 'id=gt.0'], ['products', 'id=gt.0'],
    ['locations', 'id=gt.0'], ['categories', 'id=gt.0'], ['rate_limits', 'key=not.is.null'], ['users', 'id=gt.0'],
  ]) {
    const res = await supabaseRest(`${table}?${filter}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    if (!res.ok) throw new Error(`reset ${table}: ${res.status} ${await res.text()}`);
  }
}

/** Register through the real route, then sign in through the real route; returns the session token. */
async function signup(email: string): Promise<{ id: number; token: string }> {
  const r = await register(call('POST', { email, password: 'correct-horse-1', first_name: 'T', last_name: 'U' }));
  if (r.status !== 200) throw new Error(`register ${r.status} ${await r.text()}`);
  const l = await login(call('POST', { email, password: 'correct-horse-1' }));
  if (l.status !== 200) throw new Error(`login ${l.status} ${await l.text()}`);
  const cookie = l.headers.getSetCookie().find((c) => /session=/.test(c))!;
  return { id: (await l.json()).user.id, token: decodeURIComponent(cookie.split(';')[0].split('=').slice(1).join('=')) };
}

async function seedWarehouse(token: string, sku = 'P1', location = 'A1', capacity = 20) {
  expect((await createLocation(call('POST', { name: location, capacity }, token))).status).toBe(200);
  const p = await createProduct(call('POST', { sku, name: sku, cost_price: 5, sell_price: 9, min_stock_level: 3 }, token));
  expect(p.status).toBe(200);
  return (await p.json()).id as number;
}

const move = (token: string, productId: number, type: string, quantity: number, location = 'A1') =>
  createTransaction(call('POST', { type, quantity, product_id: productId, location }, token));

beforeEach(async () => {
  clearAuthCache();
  await reset();
});

describe('sessions against the real database', () => {
  it('register -> login gives a cookie that authenticates; logout revokes it', async () => {
    const u = await signup('a@x.com');
    expect((await listProducts(call('GET', undefined, u.token))).status).toBe(200);

    expect((await logout(call('POST', undefined, u.token))).status).toBe(200);
    clearAuthCache();
    expect((await listProducts(call('GET', undefined, u.token))).status).toBe(401);
    expect((await rows('users?select=token_version'))[0].token_version).toBe(1);
  });

  it('a duplicate email is refused by the database as well', async () => {
    await signup('a@x.com');
    const again = await register(call('POST', { email: 'a@x.com', password: 'correct-horse-1', first_name: 'T', last_name: 'U' }));
    expect(again.status).toBe(400);
    expect(await rows('users?select=id')).toHaveLength(1);
  });
});

describe('PostgREST behaviour the app relies on', () => {
  it('idempotent seeding: 5 concurrent first loads create the defaults once (on_conflict + ignore-duplicates)', async () => {
    const u = await signup('a@x.com');
    await Promise.all(Array.from({ length: 5 }, () => listLocations(call('GET', undefined, u.token))));
    await Promise.all(Array.from({ length: 5 }, () => listCategories(call('GET', undefined, u.token))));
    expect(await rows('locations?select=name')).toHaveLength(3);
    expect(await rows('categories?select=name')).toHaveLength(5);
  });

  it('unique violations come back as 409 and the routes report them', async () => {
    const u = await signup('a@x.com');
    await seedWarehouse(u.token);
    expect((await createLocation(call('POST', { name: 'A1', capacity: 5 }, u.token))).status).toBe(409);
    expect((await createCategory(call('POST', { name: 'Tools' }, u.token))).status).toBe(200);
    expect((await createCategory(call('POST', { name: 'Tools' }, u.token))).status).toBe(409);
    expect((await createProduct(call('POST', { sku: 'P1', name: 'x', cost_price: 1, sell_price: 2 }, u.token))).status).toBe(409);
  });

  it('a missing function is PGRST202 (what the 503 mapping depends on)', async () => {
    const res = await supabaseRest('rpc/no_such_function', { method: 'POST', body: '{}' });
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('PGRST202');
  });

  it('RAISE ... USING ERRCODE = PT4xx becomes that HTTP status with the message', async () => {
    const u = await signup('a@x.com');
    const res = await supabaseRest('rpc/apply_stock_movement', {
      method: 'POST',
      body: JSON.stringify({ p_user_id: u.id, p_product_id: 999999, p_location: 'A1', p_type: 'INBOUND', p_quantity: 1 }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe('PT404');
    expect(body.message).toMatch(/not found or access denied/);
  });

  it('!inner embeds filter by the joined row (tenant isolation of inventory)', async () => {
    const a = await signup('a@x.com');
    const b = await signup('b@x.com');
    const pa = await seedWarehouse(a.token);
    await seedWarehouse(b.token);
    await move(a.token, pa, 'INBOUND', 4);
    const mine = await (await listInventory(call('GET', undefined, a.token))).json();
    const theirs = await (await listInventory(call('GET', undefined, b.token))).json();
    expect(mine).toHaveLength(1);
    expect(mine[0].product.owner_id).toBe(a.id);
    expect(theirs).toHaveLength(0);
  });
});

describe('row level security and privileges', () => {
  const asRole = (key: string, path: string, init: RequestInit = {}) =>
    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, {
      ...init,
      headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
    });

  it('the public anon key can neither read nor write any table', async () => {
    await signup('a@x.com');
    const anon = process.env.INTEGRATION_ANON_KEY!;
    for (const table of ['users', 'products', 'inventory', 'transactions', 'locations', 'categories', 'purchase_orders', 'rate_limits']) {
      const res = await asRole(anon, `${table}?select=*`);
      const body = res.ok ? await res.json() : null;
      expect(res.ok ? body : res.status, `anon read of ${table}`).toSatisfy((v: unknown) => (Array.isArray(v) ? v.length === 0 : [401, 403].includes(v as number)));
    }
    const write = await asRole(anon, 'users', { method: 'POST', body: JSON.stringify({ email: 'evil@x.com', password_hash: 'x', first_name: 'E', last_name: 'V', role: 'ADMIN', is_active: true }) });
    expect(write.ok).toBe(false);
    expect(await rows('users?select=email&email=eq.evil@x.com')).toHaveLength(0);
  });

  it('anon cannot call the stock or rate-limit functions', async () => {
    const anon = process.env.INTEGRATION_ANON_KEY!;
    for (const [fn, args] of [
      ['apply_stock_movement', { p_user_id: 1, p_product_id: 1, p_location: 'A1', p_type: 'INBOUND', p_quantity: 1 }],
      ['approve_reorder', { p_user_id: 1, p_product_id: 1, p_location: 'A1', p_quantity: 1, p_po_number: 'X' }],
      ['rate_limit_hit', { p_key: 'k', p_window_seconds: 60, p_max: 1 }],
    ] as const) {
      const res = await asRole(anon, `rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });
      expect(res.ok, `${fn} as anon`).toBe(false);
      expect([401, 403, 404]).toContain(res.status);
    }
  });

  it('rate_limit_hit counts and refuses through the real endpoint', async () => {
    const hit = async () => (await (await supabaseRest('rpc/rate_limit_hit', { method: 'POST', body: JSON.stringify({ p_key: 'itest', p_window_seconds: 60, p_max: 2 }) })).json())[0];
    expect((await hit()).allowed).toBe(true);
    expect((await hit()).allowed).toBe(true);
    const third = await hit();
    expect(third.allowed).toBe(false);
    expect(third.retry_after).toBeGreaterThan(0);
  });
});

describe('stock movements end to end', () => {
  it('records INBOUND and OUTBOUND with server-side prices and updates the stock row', async () => {
    const u = await signup('a@x.com');
    const p = await seedWarehouse(u.token);

    const inbound = await move(u.token, p, 'INBOUND', 8);
    expect(inbound.status).toBe(201);
    expect(await inbound.json()).toMatchObject({ type: 'INBOUND', quantity: 8, unit_price: 5, total_price: 40, status: 'COMPLETED', user_id: u.id });
    const outbound = await move(u.token, p, 'OUTBOUND', 6);
    expect(await outbound.json()).toMatchObject({ unit_price: 9, total_price: 54 });

    expect((await rows(`inventory?product_id=eq.${p}`))[0]).toMatchObject({ quantity: 2, status: 'LOW_STOCK' });
    expect(await rows('transactions?select=id')).toHaveLength(2);
  });

  it('refusals: over-stock, capacity, foreign product/location, bad input', async () => {
    const a = await signup('a@x.com');
    const b = await signup('b@x.com');
    const pa = await seedWarehouse(a.token);
    const pb = await seedWarehouse(b.token, 'P1', 'B1', 100);
    await move(a.token, pa, 'INBOUND', 8);

    const over = await move(a.token, pa, 'OUTBOUND', 9);
    expect(over.status).toBe(400);
    expect((await over.json()).detail).toBe('Insufficient stock. Available: 8, Requested: 9');
    expect((await move(a.token, pa, 'INBOUND', 13)).status).toBe(400); // capacity 20
    expect((await move(a.token, pb, 'INBOUND', 1)).status).toBe(404); // someone else's product
    expect((await move(a.token, pa, 'INBOUND', 1, 'B1')).status).toBe(400); // someone else's location
    expect((await move(b.token, pa, 'INBOUND', 1)).status).toBe(404);

    expect((await rows(`inventory?product_id=eq.${pa}`))[0].quantity).toBe(8);
    expect(await rows('transactions?select=id')).toHaveLength(1);
  });

  it('40 simultaneous shipments of a product that has 10 units: exactly 10 succeed', async () => {
    const u = await signup('a@x.com');
    const p = await seedWarehouse(u.token, 'P1', 'A1', 1000);
    await move(u.token, p, 'INBOUND', 10);

    const results = await Promise.all(Array.from({ length: 40 }, () => move(u.token, p, 'OUTBOUND', 1)));
    const codes = results.map((r) => r.status);
    expect(codes.filter((c) => c === 201)).toHaveLength(10);
    expect(codes.filter((c) => c === 400)).toHaveLength(30);
    expect((await rows(`inventory?product_id=eq.${p}`))[0].quantity).toBe(0);
    expect(await rows('transactions?type=eq.OUTBOUND&select=id')).toHaveLength(10);
  });

  it('30 simultaneous receipts into a location with room for 12: exactly 12 succeed', async () => {
    const u = await signup('a@x.com');
    const p = await seedWarehouse(u.token, 'P1', 'A1', 12);
    const results = await Promise.all(Array.from({ length: 30 }, () => move(u.token, p, 'INBOUND', 1)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(12);
    expect((await rows(`inventory?product_id=eq.${p}`))[0].quantity).toBe(12);
  });

  it('reorder approval writes stock, transaction and PO together; the PO number is made by the server', async () => {
    const u = await signup('a@x.com');
    const p = await seedWarehouse(u.token);
    const approve = (po?: string, token = u.token, product = p) =>
      approveReorder(call('POST', { product_id: product, reorder_qty: 3, target_location: 'A1', po_number: po, unit_cost: 0.01, supplier: 'Acme' }, token));

    const ok = await approve('PO-CHOSEN-BY-CLIENT');
    expect(ok.status).toBe(200);
    const data = await ok.json();
    expect(data.purchase_order.po_number).toMatch(/^PO-\d{8}-[0-9A-F]{8}$/);
    expect(data.purchase_order).toMatchObject({ status: 'APPROVED', total_amount: 15, supplier: 'Acme' });
    expect(data.transaction).toMatchObject({ ref_code: data.purchase_order.po_number, unit_price: 5 });

    // approving the same draft again is a second purchase order, not a 409 (the client cannot pick or probe numbers)
    const again = await approve('PO-CHOSEN-BY-CLIENT');
    expect(again.status).toBe(200);
    expect((await again.json()).purchase_order.po_number).not.toBe(data.purchase_order.po_number);
    expect((await rows(`inventory?product_id=eq.${p}`))[0].quantity).toBe(6);
    expect(await rows('purchase_orders?select=id')).toHaveLength(2);
    expect(await rows('transactions?select=id')).toHaveLength(2);
    expect(await rows('purchase_orders?po_number=eq.PO-CHOSEN-BY-CLIENT')).toHaveLength(0);
  });

  it('PO numbers and reference codes are per tenant: the same number in two tenants is fine, twice in one is refused', async () => {
    const a = await signup('a@x.com');
    const b = await signup('b@x.com');
    const pa = await seedWarehouse(a.token);
    const pb = await seedWarehouse(b.token);
    // the same reference code, sent to the movement endpoint's database function through the shared RPC client
    const rpc = (user: number, product: number, ref: string) =>
      supabaseRest('rpc/apply_stock_movement', {
        method: 'POST',
        body: JSON.stringify({ p_user_id: user, p_product_id: product, p_location: 'A1', p_type: 'INBOUND', p_quantity: 1, p_ref_code: ref }),
      });
    const ua = (await rows(`users?email=eq.a@x.com`))[0].id;
    const ub = (await rows(`users?email=eq.b@x.com`))[0].id;
    expect((await rpc(ua, pa, 'SAME-REF')).status).toBe(200);
    expect((await rpc(ub, pb, 'SAME-REF')).status).toBe(200);
    expect((await rpc(ua, pa, 'SAME-REF')).status).toBe(409);
    expect(await rows('transactions?ref_code=eq.SAME-REF')).toHaveLength(2);
  });
});

describe('AI endpoints against the real database', () => {
  it('predictive, report and chat read the same stock (all locations) and the same 30-day velocity', async () => {
    const u = await signup('a@x.com');
    const p = await seedWarehouse(u.token, 'P1', 'A1', 1000);
    expect((await createLocation(call('POST', { name: 'A2', capacity: 1000 }, u.token))).status).toBe(200);
    await move(u.token, p, 'INBOUND', 200, 'A1');
    await move(u.token, p, 'INBOUND', 100, 'A2');
    // 120 OUTBOUND movements of 2 units = 240 units shipped (160 from A1, 80 from A2), all inside the window
    for (let i = 0; i < 120; i++) expect((await move(u.token, p, 'OUTBOUND', 2, i < 80 ? 'A1' : 'A2')).status).toBe(201);

    const pred = await predictive(call('GET', undefined, u.token));
    expect(pred.status).toBe(200);
    const item = (await pred.json()).predictive_items[0];
    // 300 - 240 = 60 on hand over both locations; 240 / 30 = 8 a day; 60 / 8 = 7.5 -> 8 days
    expect(item).toMatchObject({ current_stock: 60, units_sold_30d: 240, daily_burn_rate: 8, days_of_inventory: 8, urgency: 'WARNING' });

    const rep = await aiReport(call('POST', {}, u.token));
    expect(rep.status).toBe(200);
    expect((await rep.json()).velocity_items[0]).toMatchObject({ stock: 60, units_out_30d: 240, daily_burn: 8, days_remaining: 8, status: 'WARNING' });

    const chat = await aiChat(call('POST', { message: 'forecast the stockout risk' }, u.token)); // no provider key: built-in answer
    expect(chat.status).toBe(200);
    expect((await chat.json()).response).toMatch(/P1/);
  });

  it('shipments older than 30 days do not count, and another tenant\'s do not either', async () => {
    const a = await signup('a@x.com');
    const b = await signup('b@x.com');
    const pa = await seedWarehouse(a.token, 'P1', 'A1', 1000);
    const pb = await seedWarehouse(b.token, 'P1', 'A1', 1000);
    await move(a.token, pa, 'INBOUND', 100);
    await move(b.token, pb, 'INBOUND', 100);
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    expect((await createTransaction(call('POST', { type: 'OUTBOUND', quantity: 50, product_id: pa, location: 'A1', created_at: old }, a.token))).status).toBe(201);
    expect((await move(b.token, pb, 'OUTBOUND', 30)).status).toBe(201);
    const item = (await (await predictive(call('GET', undefined, a.token))).json()).predictive_items[0];
    expect(item).toMatchObject({ current_stock: 50, units_sold_30d: 0 });
  });
});

describe('inventory endpoints against the real database', () => {
  it("a tenant cannot edit another tenant's stock row (404) and validation is enforced", async () => {
    const a = await signup('a@x.com');
    const b = await signup('b@x.com');
    const pa = await seedWarehouse(a.token);
    await move(a.token, pa, 'INBOUND', 5);
    const row = (await rows(`inventory?product_id=eq.${pa}`))[0];

    expect((await updateInventory(call('PUT', { quantity: 999 }, b.token), ctx(row.id))).status).toBe(404);
    expect((await updateInventory(call('PUT', { quantity: -1 }, a.token), ctx(row.id))).status).toBe(400);
    expect((await updateInventory(call('PUT', { quantity: 7 }, a.token), ctx(row.id))).status).toBe(200);
    expect((await rows(`inventory?id=eq.${row.id}`))[0].quantity).toBe(7);
  });

  it('PUT /api/inventory/[id] is an ADJUST movement: the history explains the stock, the status follows it', async () => {
    const u = await signup('a@x.com');
    const p = await seedWarehouse(u.token, 'P1', 'A1', 20);
    await move(u.token, p, 'INBOUND', 5);
    const row = (await rows(`inventory?product_id=eq.${p}`))[0];
    const put = (body: unknown) => updateInventory(call('PUT', body, u.token), ctx(row.id));

    const ok = await put({ quantity: 12 });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ quantity: 12, status: 'IN_STOCK' });
    expect((await put({ quantity: 2 })).status).toBe(200);
    expect((await rows(`inventory?id=eq.${row.id}`))[0]).toMatchObject({ quantity: 2, status: 'LOW_STOCK' });
    expect((await put({ quantity: 0 })).status).toBe(200);
    expect((await rows(`inventory?id=eq.${row.id}`))[0]).toMatchObject({ quantity: 0, status: 'OUT_OF_STOCK' });

    const adjusts = (await rows(`transactions?product_id=eq.${p}&type=eq.ADJUST&order=id.asc`)).map((t) => t.quantity);
    expect(adjusts).toEqual([7, -10, -2]); // the signed change: 5 -> 12, 12 -> 2, 2 -> 0

    // over capacity is refused and changes nothing
    const over = await put({ quantity: 21 });
    expect(over.status).toBe(400);
    expect((await over.json()).detail).toMatch(/capacity exceeded/);
    expect((await rows(`inventory?id=eq.${row.id}`))[0].quantity).toBe(0);
    expect(await rows(`transactions?product_id=eq.${p}&type=eq.ADJUST`)).toHaveLength(3);

    // status and location cannot be written directly
    expect((await put({ status: 'IN_STOCK' })).status).toBe(400);
    expect((await put({ location: 'Z9' })).status).toBe(400);
  });

  it('renaming a location moves its stock and history with it, atomically, for that tenant only', async () => {
    const a = await signup('a@x.com');
    const b = await signup('b@x.com');
    const pa = await seedWarehouse(a.token, 'P1', 'A1', 20);
    const pb = await seedWarehouse(b.token, 'P1', 'A1', 20);
    await createLocation(call('POST', { name: 'Taken', capacity: 5 }, a.token));
    await move(a.token, pa, 'INBOUND', 8);
    await move(b.token, pb, 'INBOUND', 3);
    const locId = (await rows(`locations?owner_id=eq.${a.id}&name=eq.A1`))[0].id;
    const rename = (body: unknown, token = a.token) => updateLocation(call('PUT', body, token), ctx(locId));

    // a taken name is 409 and changes nothing
    expect((await rename({ name: 'Taken' })).status).toBe(409);
    expect((await rows(`inventory?product_id=eq.${pa}`))[0].location).toBe('A1');

    // another tenant cannot rename it
    expect((await rename({ name: 'Mine now' }, b.token)).status).toBe(404);

    const ok = await rename({ name: ' Zone 1 ', capacity: 30 });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ name: 'Zone 1', capacity: 30 });
    expect((await rows(`inventory?product_id=eq.${pa}`))[0]).toMatchObject({ location: 'Zone 1', quantity: 8 });
    expect((await rows(`transactions?product_id=eq.${pa}`)).map((t) => t.location)).toEqual(['Zone 1']);
    // Bob's identically named location, stock and history are untouched
    expect((await rows(`inventory?product_id=eq.${pb}`))[0]).toMatchObject({ location: 'A1', quantity: 3 });
    expect((await rows(`transactions?product_id=eq.${pb}`)).map((t) => t.location)).toEqual(['A1']);

    // the stock is still usable under the new name
    expect((await move(a.token, pa, 'OUTBOUND', 2, 'Zone 1')).status).toBe(201);
    expect((await rows(`inventory?product_id=eq.${pa}`))[0].quantity).toBe(6);
  });

  it('deleting a product keeps its history, zeroes its stock, frees the SKU and the shelf', async () => {
    const u = await signup('a@x.com');
    const b = await signup('b@x.com');
    const p = await seedWarehouse(u.token, 'P1', 'A1', 20);
    await move(u.token, p, 'INBOUND', 12);
    await move(u.token, p, 'OUTBOUND', 2);
    const del = (id: number, token = u.token) => deleteProduct(call('DELETE', undefined, token), ctx(id));

    expect((await del(p, b.token)).status).toBe(404); // not Bob's
    expect((await del(p)).status).toBe(200);
    expect((await del(p)).status).toBe(404); // already deleted

    // gone from the list and from the stock, but the row and the history remain
    expect((await (await listProducts(call('GET', undefined, u.token))).json()).map((x: any) => x.id)).not.toContain(p);
    expect(await rows(`inventory?product_id=eq.${p}`)).toHaveLength(0);
    expect((await rows(`products?id=eq.${p}`))[0]).toMatchObject({ name: 'P1', sku: `P1-deleted${p}` });
    const types = (await rows(`transactions?product_id=eq.${p}&order=id.asc`)).map((t) => `${t.type}:${t.quantity}`);
    expect(types).toEqual(['INBOUND:12', 'OUTBOUND:2', 'ADJUST:-10']);

    // no more movements on it, the SKU can be reused, and the shelf is empty again
    expect((await move(u.token, p, 'INBOUND', 1)).status).toBe(404);
    const again = await createProduct(call('POST', { sku: 'P1', name: 'New P1', cost_price: 5, sell_price: 9, min_stock_level: 3 }, u.token));
    expect(again.status).toBe(200);
    expect((await move(u.token, (await again.json()).id, 'INBOUND', 20)).status).toBe(201);
  });

  it('DELETE /api/inventory/[id] records the units it removes and frees the shelf', async () => {
    const a = await signup('a@x.com');
    const b = await signup('b@x.com');
    const p = await seedWarehouse(a.token, 'P1', 'A1', 20);
    await move(a.token, p, 'INBOUND', 12);
    const row = (await rows(`inventory?product_id=eq.${p}`))[0];
    const del = (token: string, id: number) => deleteInventory(call('DELETE', undefined, token), ctx(id));

    expect((await del(b.token, row.id)).status).toBe(404); // not Bob's
    expect((await rows(`inventory?id=eq.${row.id}`))[0].quantity).toBe(12);

    expect((await del(a.token, row.id)).status).toBe(200);
    expect(await rows(`inventory?id=eq.${row.id}`)).toHaveLength(0);
    const history = (await rows(`transactions?product_id=eq.${p}&order=id.asc`)).map((t) => `${t.type}:${t.quantity}`);
    expect(history).toEqual(['INBOUND:12', 'ADJUST:-12']); // the history adds up to zero stock

    expect((await del(a.token, row.id)).status).toBe(404); // already gone
    expect((await move(a.token, p, 'INBOUND', 20)).status).toBe(201); // the shelf is free again
  });

  it('DELETE /api/locations/[id] is refused while stock is on it; once empty it goes, the history keeps the name', async () => {
    const a = await signup('a@x.com');
    const b = await signup('b@x.com');
    const p = await seedWarehouse(a.token, 'P1', 'A1', 20);
    await move(a.token, p, 'INBOUND', 6);
    const loc = (await rows('locations?name=eq.A1&order=id.asc'))[0];
    const del = (token: string) => deleteLocation(call('DELETE', undefined, token), ctx(loc.id));

    expect((await del(b.token)).status).toBe(404); // not Bob's, and he cannot tell it exists
    const refused = await del(a.token);
    expect(refused.status).toBe(409);
    expect((await refused.json()).detail).toMatch(/still holds 6 units/);
    expect(await rows(`locations?id=eq.${loc.id}`)).toHaveLength(1);
    expect((await rows(`inventory?product_id=eq.${p}`))[0].quantity).toBe(6);

    const row = (await rows(`inventory?product_id=eq.${p}`))[0];
    expect((await updateInventory(call('PUT', { quantity: 0 }, a.token), ctx(row.id))).status).toBe(200);
    expect((await del(a.token)).status).toBe(200);
    expect(await rows(`locations?id=eq.${loc.id}`)).toHaveLength(0);
    expect(await rows(`inventory?product_id=eq.${p}`)).toHaveLength(0);
    const history = (await rows(`transactions?product_id=eq.${p}&order=id.asc`)).map((t) => `${t.type}:${t.quantity}@${t.location}`);
    expect(history).toEqual(['INBOUND:6@A1', 'ADJUST:-6@A1']);

    // a new location with the same name starts empty
    expect((await createLocation(call('POST', { name: 'A1', capacity: 20 }, a.token))).status).toBe(200);
    expect(await rows(`inventory?product_id=eq.${p}`)).toHaveLength(0);
  });

  it('POST /api/inventory: negative quantity refused, duplicate 409, capacity enforced', async () => {
    const u = await signup('a@x.com');
    const p = await seedWarehouse(u.token, 'P1', 'A1', 10);
    const make = (quantity: number) => createInventory(call('POST', { product_id: p, location: 'A1', quantity }, u.token));
    expect((await make(-5)).status).toBe(422);
    expect((await make(11)).status).toBe(400);
    expect((await make(4)).status).toBe(201);
    expect((await make(1)).status).toBe(409);
  });

  it('POST /api/inventory with units is an INBOUND movement: it is in the history and cannot overfill the location', async () => {
    const u = await signup('a@x.com');
    const p = await seedWarehouse(u.token, 'P1', 'A1', 10);
    const res = await createInventory(call('POST', { product_id: p, location: 'A1', quantity: 4 }, u.token));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ product_id: p, location: 'A1', quantity: 4, status: 'IN_STOCK' });
    const history = await rows(`transactions?product_id=eq.${p}&order=id.asc`);
    expect(history.map((t) => `${t.type}:${t.quantity}`)).toEqual(['INBOUND:4']);
    expect(history[0].notes).toBe('Initial stock');

    // an empty row has nothing to record
    const q = (await (await createProduct(call('POST', { sku: 'P2', name: 'P2', cost_price: 1, sell_price: 2, min_stock_level: 0 }, u.token))).json()).id;
    expect((await createInventory(call('POST', { product_id: q, location: 'A1', quantity: 0 }, u.token))).status).toBe(201);
    expect(await rows(`transactions?product_id=eq.${q}`)).toHaveLength(0);

    // 8 sessions each try to put 3 units of different products into the 6 free places: the lock lets two through
    const ids: number[] = [];
    for (let i = 0; i < 8; i++) {
      ids.push((await (await createProduct(call('POST', { sku: `C${i}`, name: `C${i}`, cost_price: 1, sell_price: 2, min_stock_level: 0 }, u.token))).json()).id);
    }
    const codes = (await Promise.all(ids.map((id) => createInventory(call('POST', { product_id: id, location: 'A1', quantity: 3 }, u.token))))).map((r) => r.status);
    expect(codes.filter((c) => c === 201)).toHaveLength(2);
    const total = (await rows('inventory?select=quantity')).reduce((sum, r) => sum + r.quantity, 0);
    expect(total).toBe(10);
  });
});

describe('lists and dashboard over more than 1000 rows (real PostgREST)', () => {
  const bulk = async (table: string, rowsToInsert: unknown[]) => {
    const res = await supabaseRest(table, { method: 'POST', body: JSON.stringify(rowsToInsert), headers: { Prefer: 'return=minimal' } });
    if (!res.ok) throw new Error(`bulk ${table}: ${res.status} ${await res.text()}`);
  };
  const userId = async (email: string) => (await rows(`users?email=eq.${email}`))[0].id as number;

  /** 1,100 products with 2 units each at one location (cost 3, price 5). */
  async function bigWarehouse(email = 'big@x.com') {
    const u = await signup(email);
    const owner = await userId(email);
    expect((await createLocation(call('POST', { name: 'BIG', capacity: 100000 }, u.token))).status).toBe(200);
    await bulk(
      'products',
      Array.from({ length: 1100 }, (_, n) => ({
        owner_id: owner, sku: `S${n}`, name: n === 7 ? '50%_off bolt' : `Product ${n}`, category: n % 2 ? 'Odd' : 'Even',
        cost_price: 3, sell_price: 5, min_stock_level: n % 10 === 0 ? 5 : 1,
      }))
    );
    const ids = (await rows(`products?owner_id=eq.${owner}&select=id&order=id.asc&limit=2000`)).map((p) => p.id as number);
    await bulk('inventory', ids.map((id) => ({ product_id: id, location: 'BIG', quantity: 2, status: 'IN_STOCK' })));
    return { u, owner, ids };
  }

  it('GET /api/products: default cap, X-Total-Count, X-Truncated, paging, search and category', async () => {
    const { u } = await bigWarehouse();
    const all = await listProducts(call('GET', undefined, u.token));
    expect((await all.json()).length).toBe(1000);
    expect(all.headers.get('x-total-count')).toBe('1100');
    expect(all.headers.get('x-truncated')).toBe('true');

    const page = await listProducts(new NextRequest('http://app.test/api/products?limit=50&offset=1060', { headers: headers({ authorization: `Bearer ${u.token}` }) }));
    expect((await page.json()).length).toBe(40);
    expect(page.headers.get('x-total-count')).toBe('1100');
    expect(page.headers.get('x-truncated')).toBeNull();

    const get = async (query: string) => {
      const res = await listProducts(new NextRequest(`http://app.test/api/products${query}`, { headers: headers({ authorization: `Bearer ${u.token}` }) }));
      return { res, body: (await res.json()) as any[] };
    };
    // SKU search, name search, and wildcards typed by the user are literal
    expect((await get('?q=S1099')).body.map((p) => p.sku)).toEqual(['S1099']);
    expect((await get('?q=product%201099')).res.headers.get('x-total-count')).toBe('1'); // "Product 1099", case-insensitive
    expect((await get('?q=product%2055')).res.headers.get('x-total-count')).toBe('11'); // "contains": Product 55 and 550-559
    expect((await get(`?q=${encodeURIComponent('50%_off')}`)).body.map((p) => p.sku)).toEqual(['S7']);
    expect((await get(`?q=${encodeURIComponent('%')}`)).res.headers.get('x-total-count')).toBe('1'); // only the one name with a real %
    expect((await get(`?q=${encodeURIComponent('_')}`)).res.headers.get('x-total-count')).toBe('1');
    expect((await get(`?q=${encodeURIComponent('x"),sku.eq.S1,(y')}`)).res.status).toBe(200); // cannot break the filter
    expect((await get('?category=Even')).res.headers.get('x-total-count')).toBe('550');
    expect((await get('?category=Even&q=S10')).res.headers.get('x-total-count')).toBe(String(
      Array.from({ length: 1100 }, (_, n) => n).filter((n) => n % 2 === 0 && `S${n}`.includes('S10')).length
    ));
  });

  it('another tenant sees none of it, and its counts are its own', async () => {
    await bigWarehouse('big@x.com');
    const other = await signup('small@x.com');
    const res = await listProducts(call('GET', undefined, other.token));
    expect(await res.json()).toEqual([]);
    expect(res.headers.get('x-total-count')).toBe('0');
  });

  it('GET /api/transactions: type, product and date filters, paging and a stable order', async () => {
    const u = await signup('tx@x.com');
    const p = await seedWarehouse(u.token, 'P1', 'A1', 100000);
    const q = await (await createProduct(call('POST', { sku: 'P2', name: 'P2', cost_price: 1, sell_price: 2, min_stock_level: 0 }, u.token))).json();
    const day = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
    const make = (type: string, quantity: number, product: number, created_at: string) =>
      createTransaction(call('POST', { type, quantity, product_id: product, location: 'A1', created_at }, u.token));
    for (let i = 0; i < 12; i++) expect((await make('INBOUND', 10, p, day(5))).status).toBe(201); // same instant: order must still be stable
    expect((await make('OUTBOUND', 3, p, day(2))).status).toBe(201);
    expect((await make('INBOUND', 4, q.id, day(1))).status).toBe(201);
    expect((await make('ADJUST', 50, p, day(0.5))).status).toBe(201);

    const get = async (query: string) => {
      const res = await listTransactions(new NextRequest(`http://app.test/api/transactions${query}`, { headers: headers({ authorization: `Bearer ${u.token}` }) }));
      return { res, body: (await res.json()) as any[] };
    };
    expect((await get('')).res.headers.get('x-total-count')).toBe('15');
    expect((await get('?type=OUTBOUND')).body).toHaveLength(1);
    expect((await get('?type=ADJUST')).body[0]).toMatchObject({ type: 'ADJUST', stock_after: 50 });
    expect((await get(`?product_id=${q.id}`)).body).toHaveLength(1);
    const since = day(3).slice(0, 10);
    expect((await get(`?from=${since}`)).res.headers.get('x-total-count')).toBe('3'); // OUTBOUND, q's receipt, the ADJUST
    expect((await get(`?from=${since}&type=INBOUND`)).body).toHaveLength(1);
    expect((await get(`?to=${day(4).slice(0, 10)}`)).res.headers.get('x-total-count')).toBe('12');

    // paging walks the same rows without gaps or repeats, even for rows with the same created_at
    const seen: number[] = [];
    for (const offset of [0, 5, 10]) {
      const { body } = await get(`?limit=5&offset=${offset}`);
      seen.push(...body.map((t) => t.id));
    }
    expect(seen).toHaveLength(15);
    expect(new Set(seen).size).toBe(15);
    expect((await get('?limit=0')).res.status).toBe(400);
    expect((await get('?type=SELL')).res.status).toBe(400);
  });

  it('GET /api/dashboard/summary adds up all 1100 stock rows (a list is cut at 1000) and the metrics agree', async () => {
    const { u } = await bigWarehouse();
    const res = await dashboardSummary(new NextRequest('http://app.test/api/dashboard/summary?days=7&tz=Asia/Bangkok', { headers: headers({ authorization: `Bearer ${u.token}` }) }));
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.totals).toMatchObject({ units: 2200, products: 1100, products_with_stock: 1100 });
    expect(Number(d.totals.cost_basis)).toBe(6600);
    expect(Number(d.totals.market_value)).toBe(11000);
    expect(d.stock_status).toMatchObject({ low_stock: 110, healthy: 990, out_of_stock: 0 });
    expect(d.window).toMatchObject({ days: 7, tz: 'Asia/Bangkok' });
    expect(d.movement).toHaveLength(7);
    expect(d.locations).toEqual([{ name: 'BIG', capacity: 100000, used: 2200, pct: 2, over: false }]);

    const m = await (await dashboardMetrics(call('GET', undefined, u.token))).json();
    expect(m).toEqual({ warehouse_capacity_pct: 2, warehouse_capacity_label: '2200 / 100000 items (2%)' });

    // ADJUST is neither inbound nor outbound volume
    const some = (await rows('products?select=id&limit=1'))[0].id;
    expect((await createTransaction(call('POST', { type: 'ADJUST', quantity: 9, product_id: some, location: 'BIG' }, u.token))).status).toBe(201);
    const after = await (await dashboardSummary(call('GET', undefined, u.token))).json();
    expect(after.totals.units).toBe(2207);
    expect(after.adjustments).toMatchObject({ count: 1, net_units: 7, legacy: 0 });
    expect(after.movement.reduce((sum: number, e: any) => sum + e.inbound_units + e.outbound_units, 0)).toBe(0);
  });

  it('GET /api/dashboard/summary: bad input is a 400, an unknown location a 404, another tenant gets its own numbers', async () => {
    const { u } = await bigWarehouse();
    const get = (query: string, token = u.token) =>
      dashboardSummary(new NextRequest(`http://app.test/api/dashboard/summary${query}`, { headers: headers({ authorization: `Bearer ${token}` }) }));
    expect((await get('?days=0')).status).toBe(400);
    expect((await get('?tz=Mars/Base')).status).toBe(400); // well-formed but unknown: refused by the database
    expect((await get('?location=Nope')).status).toBe(404);
    expect((await get('?location=BIG')).status).toBe(200);
    const other = await signup('other@x.com');
    expect((await get('?location=BIG', other.token)).status).toBe(404); // not their location
    const mine = await (await get('', other.token)).json();
    expect(mine.totals).toMatchObject({ units: 0, products: 0 });
  });
});

describe('input limits against the real database', () => {
  it('a value too large for the money column is a clear 400, not a 500', async () => {
    const u = await signup('a@x.com');
    expect((await createLocation(call('POST', { name: 'BIG', capacity: 999_999_999 }, u.token))).status).toBe(200);
    expect((await createLocation(call('POST', { name: 'TOO-BIG', capacity: 1_000_000_000 }, u.token))).status).toBe(422);
    const p = (await (await createProduct(call('POST', { sku: 'GOLD', name: 'Gold bar', cost_price: 99_999_999, sell_price: 99_999_999, min_stock_level: 0 }, u.token))).json()).id;
    const res = await move(u.token, p, 'INBOUND', 500_000, 'BIG');
    expect(res.status).toBe(400);
    expect((await res.json()).detail).toMatch(/too large/);
    expect(await rows('transactions?select=id')).toHaveLength(0);
    expect(await rows(`inventory?product_id=eq.${p}`)).toHaveLength(0);
  });

  it('created_at outside the believable window is refused; one inside is stored', async () => {
    const u = await signup('a@x.com');
    const p = await seedWarehouse(u.token, 'P1', 'A1', 100);
    const at = (iso: string) => createTransaction(call('POST', { type: 'INBOUND', quantity: 1, product_id: p, location: 'A1', created_at: iso }, u.token));
    expect((await at('1970-01-01T00:00:00Z')).status).toBe(400);
    expect((await at('9999-12-31T00:00:00Z')).status).toBe(400);
    const when = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    expect((await at(when)).status).toBe(201);
    expect(new Date((await rows(`transactions?product_id=eq.${p}`))[0].created_at).toISOString()).toBe(when);
  });

  it('login and register answer 400 for malformed input instead of 500', async () => {
    expect((await login(call('POST', { email: 123, password: { x: 1 } }))).status).toBe(400);
    expect((await register(call('POST', { email: 'nope', password: 'longenough1', first_name: 'A', last_name: 'B' }))).status).toBe(400);
    expect((await register(call('POST', { email: 'a@x.com', password: 'p'.repeat(73), first_name: 'A', last_name: 'B' }))).status).toBe(400);
  });
});
