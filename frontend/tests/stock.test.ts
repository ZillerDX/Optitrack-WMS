import { beforeEach, describe, expect, it } from 'vitest';
import { clearAuthCache } from '@/lib/supabase';
import { applyStockMovement } from '@/lib/stock';
import { POST as createTransaction } from '@/app/api/transactions/route';
import { POST as approveReorder } from '@/app/api/ai/reorder/approve/route';
import { GET as listInventory, POST as createInventory } from '@/app/api/inventory/route';
import { DELETE as deleteInventory, PUT as updateInventory } from '@/app/api/inventory/[id]/route';
import { createDb, FakePostgrest } from './helpers/fakePostgrest';
import { ctx, makeUser, req, TestUser } from './helpers/http';

let db: FakePostgrest;
let alice: TestUser;
let bob: TestUser;
let product: any; // alice's: cost 5, sell 9, min stock 3
let bobsProduct: any;

const stockAt = (owner: number, name: string) => db.tables.inventory.find((i) => i.product_id === (owner === alice.id ? product.id : bobsProduct.id) && i.location === name);

beforeEach(async () => {
  db = createDb();
  clearAuthCache();
  alice = await makeUser(db, 'alice@x.com');
  bob = await makeUser(db, 'bob@x.com');
  product = db.insert('products', { owner_id: alice.id, sku: 'P1', name: 'P1', cost_price: 5, sell_price: 9, min_stock_level: 3 });
  bobsProduct = db.insert('products', { owner_id: bob.id, sku: 'P1', name: 'P1', cost_price: 1, sell_price: 2, min_stock_level: 0 });
  db.insert('locations', { owner_id: alice.id, name: 'A1', capacity: 20 });
  db.insert('locations', { owner_id: bob.id, name: 'B1', capacity: 100 });
  db.insert('inventory', { product_id: product.id, location: 'A1', quantity: 8, status: 'IN_STOCK' });
});

describe('applyStockMovement', () => {
  const move = (over: Record<string, unknown> = {}) =>
    applyStockMovement({ userId: alice.id, productId: product.id, location: 'A1', type: 'INBOUND', quantity: 1, ...over } as any);

  it("refuses another owner's product (404) and leaves stock untouched", async () => {
    const r = await move({ productId: bobsProduct.id });
    expect(r).toMatchObject({ ok: false, status: 404 });
    expect(db.tables.inventory).toHaveLength(1);
  });

  it("refuses another owner's location", async () => {
    expect(await move({ location: 'B1' })).toMatchObject({ ok: false, status: 400 });
    expect(await move({ location: 'nowhere' })).toMatchObject({ ok: false, status: 400 });
  });

  it('rejects OUTBOUND beyond available stock instead of clamping to zero', async () => {
    expect(await move({ type: 'OUTBOUND', quantity: 9 })).toMatchObject({ ok: false, status: 400 });
    expect(stockAt(alice.id, 'A1')!.quantity).toBe(8);
  });

  it('rejects OUTBOUND where there is no stock row at all', async () => {
    db.insert('locations', { owner_id: alice.id, name: 'A2', capacity: 5 });
    expect(await move({ type: 'OUTBOUND', location: 'A2' })).toMatchObject({ ok: false, status: 400 });
  });

  it('enforces location capacity for INBOUND and ADJUST', async () => {
    expect(await move({ quantity: 13 })).toMatchObject({ ok: false, status: 400 }); // 8 + 13 > 20
    expect(await move({ type: 'ADJUST', quantity: 21 })).toMatchObject({ ok: false, status: 400 });
    expect(await move({ quantity: 12 })).toMatchObject({ ok: true });
    expect(stockAt(alice.id, 'A1')!.quantity).toBe(20);
  });

  it('prices INBOUND/ADJUST at cost and OUTBOUND at the sell price, from the product', async () => {
    expect(await move({ type: 'INBOUND' })).toMatchObject({ unitPrice: 5 });
    expect(await move({ type: 'OUTBOUND' })).toMatchObject({ unitPrice: 9 });
    expect(await move({ type: 'ADJUST', quantity: 4 })).toMatchObject({ unitPrice: 5 });
  });

  it('derives the stock status from the quantity and the product minimum', async () => {
    await move({ type: 'OUTBOUND', quantity: 6 }); // 2 < min 3
    expect(stockAt(alice.id, 'A1')!.status).toBe('LOW_STOCK');
    await move({ type: 'OUTBOUND', quantity: 2 });
    expect(stockAt(alice.id, 'A1')!.status).toBe('OUT_OF_STOCK');
    await move({ quantity: 10 });
    expect(stockAt(alice.id, 'A1')!.status).toBe('IN_STOCK');
  });

  it('revert() restores the previous quantity, or removes a row it created', async () => {
    const changed = await move({ quantity: 5 });
    expect(stockAt(alice.id, 'A1')!.quantity).toBe(13);
    if (changed.ok) await changed.revert();
    expect(stockAt(alice.id, 'A1')!.quantity).toBe(8);

    db.insert('locations', { owner_id: alice.id, name: 'A2', capacity: 50 });
    const created = await move({ location: 'A2', quantity: 4 });
    expect(stockAt(alice.id, 'A2')).toBeDefined();
    if (created.ok) await created.revert();
    expect(stockAt(alice.id, 'A2')).toBeUndefined();
  });

  it('answers 409 when another writer changed the row in between (compare-and-swap)', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any, init: any) => {
      if ((init?.method ?? 'GET') === 'PATCH' && String(url).includes('inventory')) {
        db.tables.inventory[0].quantity += 1; // the concurrent writer wins first
      }
      return realFetch(url, init);
    }) as any;
    expect(await move({ quantity: 1 })).toMatchObject({ ok: false, status: 409 });
    expect(db.tables.inventory[0].quantity).toBe(9); // only the other writer's change
  });
});

describe('POST /api/transactions', () => {
  const tx = (over: Record<string, unknown> = {}, who = alice) =>
    createTransaction(req('POST', { type: 'INBOUND', quantity: 2, product_id: product.id, location: 'A1', ...over }, { token: who.token }));

  it('records the movement with server-side price, status and reference', async () => {
    const res = await tx({ unit_price: 0.01, total_price: 0.01, status: 'CANCELLED', ref_code: 'MINE' });
    expect(res.status).toBe(201);
    const saved = db.tables.transactions[0];
    expect(saved).toMatchObject({ unit_price: 5, total_price: 10, status: 'COMPLETED', user_id: alice.id });
    expect(saved.ref_code).toMatch(/^TXN-\d{8}-[0-9A-F]{6}$/);
    expect(stockAt(alice.id, 'A1')!.quantity).toBe(10);
  });

  it("cannot move another owner's product or use their location", async () => {
    expect((await tx({ product_id: bobsProduct.id })).status).toBe(404);
    expect((await tx({ location: 'B1' })).status).toBe(400);
    expect((await tx({}, bob)).status).toBe(404); // alice's product from bob's session
    expect(db.tables.transactions).toHaveLength(0);
  });

  it.each([
    [{ type: 'SELL' }],
    [{ quantity: 0 }],
    [{ quantity: -3 }],
    [{ quantity: 1.5 }],
    [{ product_id: 'x' }],
    [{ location: '' }],
    [{ notes: 'n'.repeat(501) }],
    [{ created_at: 'not a date' }],
  ])('rejects invalid input %j with 400/422 and writes nothing', async (over) => {
    expect([400, 422]).toContain((await tx(over)).status);
    expect(db.tables.transactions).toHaveLength(0);
    expect(stockAt(alice.id, 'A1')!.quantity).toBe(8);
  });

  it('undoes the stock change when the transaction cannot be recorded', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any, init: any) => {
      if (String(url).includes('/transactions') && init?.method === 'POST') {
        return { ok: false, status: 500, json: async () => ({}), text: async () => 'boom' } as any;
      }
      return realFetch(url, init);
    }) as any;
    const res = await tx({ quantity: 4 });
    expect(res.status).toBe(500);
    expect(stockAt(alice.id, 'A1')!.quantity).toBe(8);
    expect(JSON.stringify(await res.json())).not.toContain('boom');
  });

  it('requires a session', async () => {
    expect((await createTransaction(req('POST', {}))).status).toBe(401);
  });
});

describe('POST /api/ai/reorder/approve', () => {
  const approve = (over: Record<string, unknown> = {}, who = alice) =>
    approveReorder(req('POST', { product_id: product.id, reorder_qty: 3, target_location: 'A1', unit_cost: 0.01, total_amount: 0.03, ...over }, { token: who.token }));

  it('receives stock at the product cost (client cost ignored) and stores the PO', async () => {
    const res = await approve({ po_number: 'PO-1' });
    expect(res.status).toBe(200);
    expect(stockAt(alice.id, 'A1')!.quantity).toBe(11);
    expect(db.tables.transactions[0]).toMatchObject({ ref_code: 'PO-1', type: 'INBOUND', unit_price: 5, total_price: 15 });
    expect(db.tables.purchase_orders[0]).toMatchObject({ po_number: 'PO-1', total_amount: 15, user_id: alice.id });
  });

  it("refuses another owner's product and location", async () => {
    expect((await approve({ product_id: bobsProduct.id })).status).toBe(404);
    expect((await approve({ target_location: 'B1' })).status).toBe(400);
    expect(db.tables.transactions).toHaveLength(0);
  });

  it('undoes the stock when the PO number is already used', async () => {
    await approve({ po_number: 'PO-1' });
    const again = await approve({ po_number: 'PO-1' });
    expect(again.status).toBe(409);
    expect(stockAt(alice.id, 'A1')!.quantity).toBe(11); // only the first receipt
  });

  it.each([[{ reorder_qty: 0 }], [{ reorder_qty: -1 }], [{ reorder_qty: 'x' }], [{ target_location: '' }]])(
    'rejects invalid input %j',
    async (over) => {
      expect((await approve(over)).status).toBe(400);
    }
  );
});

describe('/api/inventory', () => {
  const create = (over: Record<string, unknown> = {}, who = alice) =>
    createInventory(req('POST', { product_id: product.id, location: 'A2', quantity: 4, ...over }, { token: who.token }));

  beforeEach(() => {
    db.insert('locations', { owner_id: alice.id, name: 'A2', capacity: 10 });
  });

  it('creates a row and derives the status server-side (client status ignored)', async () => {
    const res = await create({ status: 'OUT_OF_STOCK' });
    expect(res.status).toBe(201);
    expect(stockAt(alice.id, 'A2')).toMatchObject({ quantity: 4, status: 'IN_STOCK' });
  });

  it.each([[{ quantity: -5 }], [{ quantity: 1.2 }], [{ quantity: 'lots' }], [{ location: '' }], [{ product_id: 0 }]])(
    'rejects invalid input %j (negative stock used to be accepted)',
    async (over) => {
      expect([400, 422]).toContain((await create(over)).status);
      expect(stockAt(alice.id, 'A2')).toBeUndefined();
    }
  );

  it("cannot use another owner's product or location", async () => {
    expect((await create({ product_id: bobsProduct.id })).status).toBe(404);
    expect((await create({ location: 'B1' })).status).toBe(400);
  });

  it('answers 409 for an existing row and enforces capacity', async () => {
    expect((await create()).status).toBe(201);
    expect((await create()).status).toBe(409);
    db.insert('products', { owner_id: alice.id, sku: 'P2', name: 'P2', cost_price: 1, sell_price: 2, min_stock_level: 0 });
    const over = await createInventory(req('POST', { product_id: db.tables.products.at(-1)!.id, location: 'A2', quantity: 7 }, { token: alice.token }));
    expect(over.status).toBe(400); // 4 + 7 > 10
  });

  it('lists only the caller\'s rows', async () => {
    db.insert('inventory', { product_id: bobsProduct.id, location: 'B1', quantity: 5, status: 'IN_STOCK' });
    const rows = await (await listInventory(req('GET', undefined, { token: alice.token }))).json();
    expect(rows.map((r: any) => r.location)).toEqual(['A1']);
  });
});

describe('PUT/DELETE /api/inventory/[id] (cross-tenant)', () => {
  it('cannot edit or delete another tenant\'s stock, answering 404 like a missing row', async () => {
    const id = db.tables.inventory[0].id;
    const put = await updateInventory(req('PUT', { quantity: 999 }, { token: bob.token }), ctx(id));
    const del = await deleteInventory(req('DELETE', undefined, { token: bob.token }), ctx(id));
    const missing = await updateInventory(req('PUT', { quantity: 1 }, { token: bob.token }), ctx(424242));
    expect([put.status, del.status, missing.status]).toEqual([404, 404, 404]);
    expect(db.tables.inventory[0].quantity).toBe(8);
  });

  it('lets the owner edit whitelisted fields only', async () => {
    const id = db.tables.inventory[0].id;
    const res = await updateInventory(req('PUT', { quantity: 5, product_id: bobsProduct.id, id: 77 }, { token: alice.token }), ctx(id));
    expect(res.status).toBe(200);
    expect(db.tables.inventory[0]).toMatchObject({ id, product_id: product.id, quantity: 5 });
  });

  it.each([[{ quantity: -1 }], [{ status: 'WEIRD' }], [{ location: '' }], [{}]])('rejects %j', async (body) => {
    const id = db.tables.inventory[0].id;
    expect((await updateInventory(req('PUT', body, { token: alice.token }), ctx(id))).status).toBe(400);
  });
});
