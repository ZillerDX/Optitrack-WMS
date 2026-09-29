import { beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { clearAuthCache, supabaseRest } from '@/lib/supabase';
import { POST as register } from '@/app/api/auth/register/route';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as logout } from '@/app/api/auth/logout/route';
import { GET as listProducts, POST as createProduct } from '@/app/api/products/route';
import { GET as listLocations, POST as createLocation } from '@/app/api/locations/route';
import { GET as listCategories, POST as createCategory } from '@/app/api/categories/route';
import { GET as listInventory, POST as createInventory } from '@/app/api/inventory/route';
import { PUT as updateInventory } from '@/app/api/inventory/[id]/route';
import { POST as createTransaction } from '@/app/api/transactions/route';
import { POST as approveReorder } from '@/app/api/ai/reorder/approve/route';

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

  it('reorder approval writes stock, transaction and PO together; a repeated PO number changes nothing', async () => {
    const u = await signup('a@x.com');
    const p = await seedWarehouse(u.token);
    const approve = (po: string) =>
      approveReorder(call('POST', { product_id: p, reorder_qty: 3, target_location: 'A1', po_number: po, unit_cost: 0.01, supplier: 'Acme' }, u.token));

    const ok = await approve('PO-1');
    expect(ok.status).toBe(200);
    const data = await ok.json();
    expect(data.purchase_order).toMatchObject({ po_number: 'PO-1', status: 'APPROVED', total_amount: 15, supplier: 'Acme' });
    expect(data.transaction).toMatchObject({ ref_code: 'PO-1', unit_price: 5 });

    const dup = await approve('PO-1');
    expect(dup.status).toBe(409);
    expect((await rows(`inventory?product_id=eq.${p}`))[0].quantity).toBe(3);
    expect(await rows('purchase_orders?select=id')).toHaveLength(1);
    expect(await rows('transactions?select=id')).toHaveLength(1);
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

  it('POST /api/inventory: negative quantity refused, duplicate 409, capacity enforced', async () => {
    const u = await signup('a@x.com');
    const p = await seedWarehouse(u.token, 'P1', 'A1', 10);
    const make = (quantity: number) => createInventory(call('POST', { product_id: p, location: 'A1', quantity }, u.token));
    expect((await make(-5)).status).toBe(422);
    expect((await make(11)).status).toBe(400);
    expect((await make(4)).status).toBe(201);
    expect((await make(1)).status).toBe(409);
  });
});
