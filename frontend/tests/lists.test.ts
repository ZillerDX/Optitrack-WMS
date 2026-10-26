import { beforeEach, describe, expect, it } from 'vitest';
import { clearAuthCache } from '@/lib/supabase';
import { GET as listProducts } from '@/app/api/products/route';
import { GET as listInventory } from '@/app/api/inventory/route';
import { GET as listTransactions } from '@/app/api/transactions/route';
import { createDb, FakePostgrest } from './helpers/fakePostgrest';
import { makeUser, req, TestUser } from './helpers/http';

let db: FakePostgrest;
let alice: TestUser;
let bob: TestUser;

beforeEach(async () => {
  db = createDb();
  clearAuthCache();
  alice = await makeUser(db, 'alice@x.com');
  bob = await makeUser(db, 'bob@x.com');
});

const product = (owner: number, n: number) =>
  db.insert('products', { owner_id: owner, sku: `P${n}`, name: `Product ${n}`, cost_price: 1, sell_price: 2, min_stock_level: 0 });
const get = (route: typeof listProducts, query = '', who = alice) =>
  route(req('GET', undefined, { token: who.token, url: `http://app.test/api/x${query}` }));
const dbCalls = () => db.calls.filter((c) => !['users', 'rate_limits'].includes(c.table) && !c.table.startsWith('rpc'));

describe.each([
  ['products', listProducts],
  ['inventory', listInventory],
  ['transactions', listTransactions],
] as const)('GET /api/%s: paging contract', (name, route) => {
  it.each(['limit=0', 'limit=1001', 'limit=abc', 'limit=-5', 'offset=-1', 'offset=x'])('answers 400 for %s before reading anything', async (q) => {
    const res = await get(route, `?${q}`);
    expect(res.status).toBe(400);
    expect((await res.json()).detail).toMatch(/limit|offset/);
    expect(dbCalls()).toHaveLength(0);
  });

  it('always sends a count request and a limit to the database', async () => {
    await get(route);
    const call = dbCalls().find((c) => c.table === name)!;
    expect(call.prefer).toContain('count=exact');
    expect(call.url).toMatch(/[?&]limit=1000(&|$)/);
    expect(call.url).toMatch(/[?&]offset=0(&|$)/);
  });

  it('requires a session', async () => {
    expect((await route(req('GET', undefined, { url: 'http://app.test/api/x' }))).status).toBe(401);
  });
});

describe('GET /api/products', () => {
  it('returns an array with X-Total-Count, and only the caller\'s rows', async () => {
    for (let i = 0; i < 3; i++) product(alice.id, i);
    product(bob.id, 99);
    const res = await get(listProducts);
    expect(res.status).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
    expect(res.headers.get('x-total-count')).toBe('3');
    expect(res.headers.get('x-truncated')).toBeNull();
  });

  it('pages on request, and a page is not "truncated"', async () => {
    for (let i = 0; i < 25; i++) product(alice.id, i);
    const res = await get(listProducts, '?limit=10&offset=20');
    expect((await res.json()).length).toBe(5);
    expect(res.headers.get('x-total-count')).toBe('25');
    expect(res.headers.get('x-truncated')).toBeNull();
  });

  it('says X-Truncated when the default cap cut a long list', async () => {
    for (let i = 0; i < 1200; i++) product(alice.id, i);
    const res = await get(listProducts);
    expect((await res.json()).length).toBe(1000);
    expect(res.headers.get('x-total-count')).toBe('1200');
    expect(res.headers.get('x-truncated')).toBe('true');
  });

  it('sends the search and category filters to the database, safely quoted', async () => {
    await get(listProducts, `?q=${encodeURIComponent('50%_off","x')}&category=${encodeURIComponent('Tools & Parts')}`);
    const raw = dbCalls().find((c) => c.table === 'products')!.url;
    const url = decodeURIComponent(raw);
    expect(url).toContain('&category=eq.Tools & Parts');
    expect(raw).not.toMatch(/%(?![0-9A-F]{2})/); // nothing raw: the search term is percent-encoded
    // 50%_off","x  ->  % and _ literal (\\% \\_), the quote escaped (\"), still one quoted value
    expect(url).toContain('&or=(name.ilike."*50\\\\%\\\\_off\\",\\"x*",sku.ilike.');
  });

  it('refuses a search that is too long', async () => {
    expect((await get(listProducts, `?q=${'x'.repeat(101)}`)).status).toBe(400);
  });
});

describe('GET /api/transactions', () => {
  it('sends type, product and date filters to the database', async () => {
    await get(listTransactions, '?type=ADJUST&product_id=7&from=2026-10-01&to=2026-10-31&location=A1');
    const url = decodeURIComponent(dbCalls().find((c) => c.table === 'transactions')!.url);
    expect(url).toContain('&type=eq.ADJUST');
    expect(url).toContain('&product_id=eq.7');
    expect(url).toContain('&created_at=gte.2026-10-01T00:00:00.000Z');
    expect(url).toContain('&created_at=lte.2026-10-31T23:59:59.999Z');
    expect(url).toContain('&location=eq.A1');
    expect(url).toContain('order=created_at.desc,id.desc'); // a stable order for paging
  });

  it.each(['type=SELL', 'product_id=0', 'from=nope', 'from=2026-10-31&to=2026-10-01'])('answers 400 for %s', async (q) => {
    const res = await get(listTransactions, `?${q}`);
    expect(res.status).toBe(400);
    expect(dbCalls().filter((c) => c.table === 'transactions')).toHaveLength(0);
  });
});

describe('GET /api/inventory', () => {
  it('filters by product and keeps the embed that scopes rows to the caller', async () => {
    await get(listInventory, '?product_id=3&location=A1');
    const url = decodeURIComponent(dbCalls().find((c) => c.table === 'inventory')!.url);
    expect(url).toContain('&product_id=eq.3');
    expect(url).toContain('&location=eq.A1');
    expect(url).toContain(`product.owner_id=eq.${alice.id}`);
  });
});
