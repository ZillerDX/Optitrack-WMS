import { beforeEach, describe, expect, it } from 'vitest';
import { clearAuthCache } from '@/lib/supabase';
import { POST as createTransaction } from '@/app/api/transactions/route';
import { POST as approveReorder } from '@/app/api/ai/reorder/approve/route';
import { GET as listInventory, POST as createInventory } from '@/app/api/inventory/route';
import { DELETE as deleteInventory, PUT as updateInventory } from '@/app/api/inventory/[id]/route';
import { createDb, FakePostgrest, RpcError } from './helpers/fakePostgrest';
import { ctx, makeUser, req, TestUser } from './helpers/http';

/*
 * The stock RULES (ownership, no clamping, capacity, pricing, rollback, concurrency) are in the
 * database functions and are tested against real PostgreSQL by supabase/tests/stock_movements.sql and
 * stock_concurrency.sh. What is tested here is the API side of that contract: what is sent, what is
 * refused before the database is called, and how the database's answers are reported.
 */

let db: FakePostgrest;
let alice: TestUser;
let bob: TestUser;
let product: any; // alice's: cost 5, sell 9, min stock 3
let bobsProduct: any;

const stockAt = (owner: number, name: string) => db.tables.inventory.find((i) => i.product_id === (owner === alice.id ? product.id : bobsProduct.id) && i.location === name);
const rpcCalls = (name: string) => db.calls.filter((c) => c.table === `rpc/${name}`);

/** What the real function returns on success. */
const movementResult = (over: Record<string, unknown> = {}) => ({
  transaction: { id: 1, ref_code: 'TXN-20260101-ABC123', type: 'INBOUND', quantity: 2, unit_price: 5, total_price: 10, status: 'COMPLETED', location: 'A1', ...over },
  inventory: { id: 1, product_id: 1, location: 'A1', quantity: 10, status: 'IN_STOCK' },
});

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
  db.rpc.apply_stock_movement = () => movementResult();
  db.rpc.approve_reorder = () => ({ ...movementResult({ ref_code: 'PO-1' }), purchase_order: { id: 9, po_number: 'PO-1', status: 'APPROVED' } });
});

const dbError = (status: number, code: string, message: string) => {
  throw new RpcError(status, { code, message, details: null, hint: null });
};

describe('POST /api/transactions', () => {
  const tx = (over: Record<string, unknown> = {}, who = alice) =>
    createTransaction(req('POST', { type: 'INBOUND', quantity: 2, product_id: product.id, location: 'A1', ...over }, { token: who.token }));

  it('sends the session user and only the movement fields to the database, and returns 201 with the row', async () => {
    const res = await tx({ notes: 'cycle count', created_at: '2024-01-02T03:04:05Z' });
    expect(res.status).toBe(201);
    expect((await res.json()).ref_code).toBe('TXN-20260101-ABC123');
    expect(rpcCalls('apply_stock_movement')).toHaveLength(1);
    expect(rpcCalls('apply_stock_movement')[0].body).toEqual({
      p_user_id: alice.id,
      p_product_id: product.id,
      p_location: 'A1',
      p_type: 'INBOUND',
      p_quantity: 2,
      p_notes: 'cycle count',
      p_created_at: '2024-01-02T03:04:05.000Z',
    });
  });

  it('never forwards a user id, price, status or reference sent by the client', async () => {
    await tx({ user_id: bob.id, p_user_id: bob.id, unit_price: 0.01, total_price: 0.01, status: 'CANCELLED', ref_code: 'MINE' });
    const sent = rpcCalls('apply_stock_movement')[0].body;
    expect(sent.p_user_id).toBe(alice.id);
    expect(Object.keys(sent).sort()).toEqual(['p_created_at', 'p_location', 'p_notes', 'p_product_id', 'p_quantity', 'p_type', 'p_user_id']);
  });

  it('requires a session', async () => {
    expect((await createTransaction(req('POST', {}))).status).toBe(401);
    expect(rpcCalls('apply_stock_movement')).toHaveLength(0);
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
  ])('refuses invalid input %j before calling the database', async (over) => {
    expect([400, 422]).toContain((await tx(over)).status);
    expect(rpcCalls('apply_stock_movement')).toHaveLength(0);
  });

  it("reports the database's refusals with their status and message", async () => {
    db.rpc.apply_stock_movement = () => dbError(400, 'PT400', 'Insufficient stock. Available: 8, Requested: 9');
    const res = await tx({ type: 'OUTBOUND', quantity: 9 });
    expect(res.status).toBe(400);
    expect((await res.json()).detail).toBe('Insufficient stock. Available: 8, Requested: 9');

    db.rpc.apply_stock_movement = () => dbError(404, 'PT404', `Product with ID ${bobsProduct.id} not found or access denied`);
    expect((await tx({ product_id: bobsProduct.id })).status).toBe(404);
  });

  it('turns a unique violation into a generic 409', async () => {
    db.rpc.apply_stock_movement = () => dbError(409, '23505', 'duplicate key value violates unique constraint "transactions_ref_code_key"');
    const res = await tx();
    expect(res.status).toBe(409);
    expect(JSON.stringify(await res.json())).not.toMatch(/constraint|transactions_ref_code/);
  });

  it('answers 503 (not a stack trace) when the migration has not been applied', async () => {
    db.rpc.apply_stock_movement = () => dbError(404, 'PGRST202', 'Could not find the function public.apply_stock_movement');
    const res = await tx();
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toMatch(/PGRST202|function/i);
  });

  it('hides unexpected database errors', async () => {
    db.rpc.apply_stock_movement = () => dbError(500, 'XX000', 'relation "secret_table" is corrupted');
    const res = await tx();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toMatch(/secret_table|corrupted|XX000/);
  });

  it('does not touch the tables itself any more (one call, no follow-up writes)', async () => {
    await tx();
    expect(db.calls.filter((c) => c.method !== 'GET' && !c.table.startsWith('rpc/')).length).toBe(0);
  });
});

describe('POST /api/ai/reorder/approve', () => {
  const approve = (over: Record<string, unknown> = {}, who = alice) =>
    approveReorder(req('POST', { product_id: product.id, reorder_qty: 3, target_location: 'A1', po_number: 'PO-1', unit_cost: 0.01, total_amount: 0.03, supplier: 'Acme', ...over }, { token: who.token }));

  it('sends the session user and ignores a client-supplied cost', async () => {
    const res = await approve({ user_id: bob.id });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ success: true, purchase_order: { po_number: 'PO-1' }, transaction: { ref_code: 'PO-1' } });
    const sent = rpcCalls('approve_reorder')[0].body;
    expect(sent).toMatchObject({ p_user_id: alice.id, p_product_id: product.id, p_location: 'A1', p_quantity: 3, p_po_number: 'PO-1', p_supplier: 'Acme' });
    expect(JSON.stringify(sent)).not.toMatch(/0\.01|0\.03|unit_cost|total/);
  });

  it('makes up a PO number when none is given', async () => {
    await approve({ po_number: undefined });
    expect(rpcCalls('approve_reorder')[0].body.p_po_number).toMatch(/^PO-\d+$/);
  });

  it.each([[{ reorder_qty: 0 }], [{ reorder_qty: -1 }], [{ reorder_qty: 'x' }], [{ target_location: '' }], [{ product_id: 0 }]])(
    'refuses invalid input %j before calling the database',
    async (over) => {
      expect((await approve(over)).status).toBe(400);
      expect(rpcCalls('approve_reorder')).toHaveLength(0);
    }
  );

  it('reports refusals, duplicate PO numbers and outages like the transactions route', async () => {
    db.rpc.approve_reorder = () => dbError(404, 'PT404', 'Product with ID 1 not found or access denied');
    expect((await approve()).status).toBe(404);
    db.rpc.approve_reorder = () => dbError(409, '23505', 'duplicate key value violates unique constraint "purchase_orders_po_number_key"');
    const dup = await approve();
    expect(dup.status).toBe(409);
    expect(JSON.stringify(await dup.json())).not.toMatch(/purchase_orders_po_number_key/);
    db.rpc.approve_reorder = () => dbError(500, 'XX000', 'boom');
    expect((await approve()).status).toBe(500);
  });

  it('requires a session', async () => {
    expect((await approveReorder(req('POST', {}))).status).toBe(401);
  });
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
