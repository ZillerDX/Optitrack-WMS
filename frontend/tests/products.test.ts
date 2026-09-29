import { beforeEach, describe, expect, it } from 'vitest';
import { clearAuthCache } from '@/lib/supabase';
import { parseProductInput } from '@/lib/productInput';
import { GET as listProducts, POST as createProduct } from '@/app/api/products/route';
import { DELETE as deleteProduct, PUT as updateProduct } from '@/app/api/products/[id]/route';
import { createDb, FakePostgrest, RpcError } from './helpers/fakePostgrest';
import { ctx, makeUser, req, TestUser } from './helpers/http';

let db: FakePostgrest;
let alice: TestUser;
let bob: TestUser;

const valid = { sku: 'SKU-1', name: 'Widget', cost_price: 10, sell_price: 15 };

beforeEach(async () => {
  db = createDb();
  clearAuthCache();
  alice = await makeUser(db, 'alice@x.com');
  bob = await makeUser(db, 'bob@x.com');
});

describe('parseProductInput', () => {
  it('requires sku, name and both prices on create', () => {
    expect(parseProductInput({}, { partial: false }).ok).toBe(false);
    expect(parseProductInput({ ...valid, sku: '  ' }, { partial: false }).ok).toBe(false);
    expect(parseProductInput({ ...valid, name: undefined }, { partial: false }).ok).toBe(false);
    expect(parseProductInput({ ...valid, sell_price: undefined }, { partial: false }).ok).toBe(false);
    expect(parseProductInput(valid, { partial: false }).ok).toBe(true);
  });

  it('rejects a sell price below cost and negative / non-numeric prices', () => {
    expect(parseProductInput({ ...valid, sell_price: 5 }, { partial: false }).ok).toBe(false);
    expect(parseProductInput({ ...valid, cost_price: -1 }, { partial: false }).ok).toBe(false);
    expect(parseProductInput({ ...valid, cost_price: 'abc' }, { partial: false }).ok).toBe(false);
    expect(parseProductInput({ ...valid, cost_price: NaN }, { partial: false }).ok).toBe(false);
  });

  it('never returns columns it does not know (owner_id, id, ...)', () => {
    const r = parseProductInput({ ...valid, owner_id: 99, id: 7, token_version: 1 }, { partial: false });
    expect(r.ok && Object.keys(r.data).sort()).toEqual(['cost_price', 'min_stock_level', 'name', 'sell_price', 'sku', 'unit']);
  });

  it('only allows https product image URLs', () => {
    expect(parseProductInput({ ...valid, image_url: 'javascript:alert(1)' }, { partial: false }).ok).toBe(false);
    expect(parseProductInput({ ...valid, image_url: 'http://x.com/a.png' }, { partial: false }).ok).toBe(false);
    expect(parseProductInput({ ...valid, image_url: 'https://x.com/a.png' }, { partial: false }).ok).toBe(true);
  });

  it('partial updates only contain what was sent', () => {
    const r = parseProductInput({ name: 'New' }, { partial: true });
    expect(r.ok && r.data).toEqual({ name: 'New' });
  });
});

describe('POST /api/products', () => {
  it('creates a product owned by the caller', async () => {
    const res = await createProduct(req('POST', { ...valid, owner_id: bob.id }, { token: alice.token }));
    expect(res.status).toBe(200);
    expect(db.tables.products[0].owner_id).toBe(alice.id); // owner_id in the body is ignored
  });

  it('returns 401 without a session', async () => {
    expect((await createProduct(req('POST', valid))).status).toBe(401);
  });

  it('rejects invalid input with 422 and stores nothing', async () => {
    const res = await createProduct(req('POST', { ...valid, sell_price: 1 }, { token: alice.token }));
    expect(res.status).toBe(422);
    expect(db.tables.products).toHaveLength(0);
  });

  it('answers 409 for a duplicate SKU of the same owner, but allows it for another owner', async () => {
    await createProduct(req('POST', valid, { token: alice.token }));
    expect((await createProduct(req('POST', valid, { token: alice.token }))).status).toBe(409);
    expect((await createProduct(req('POST', valid, { token: bob.token }))).status).toBe(200);
  });

  it('still returns 409 when the database (unique index) rejects a lost race', async () => {
    // Make the pre-check miss, as it would for two simultaneous requests.
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any, init: any) => {
      if (String(url).includes('products?owner_id=eq.') && String(url).includes('&sku=eq.')) {
        return { ok: true, status: 200, json: async () => [], text: async () => '[]' } as any;
      }
      return realFetch(url, init);
    }) as any;
    db.insert('products', { owner_id: alice.id, ...valid });
    expect((await createProduct(req('POST', valid, { token: alice.token }))).status).toBe(409);
  });

  it('creates the initial stock row only at one of the caller\'s own locations', async () => {
    db.insert('locations', { owner_id: bob.id, name: 'Bobs-Dock', capacity: 10 });
    db.insert('locations', { owner_id: alice.id, name: 'Dock', capacity: 10 });

    const foreign = await createProduct(req('POST', { ...valid, location: 'Bobs-Dock' }, { token: alice.token }));
    expect(foreign.status).toBe(400);
    expect(db.tables.inventory).toHaveLength(0);
    expect(db.tables.products).toHaveLength(0);

    const own = await createProduct(req('POST', { ...valid, location: 'Dock' }, { token: alice.token }));
    expect(own.status).toBe(200);
    expect(db.tables.inventory).toEqual([expect.objectContaining({ location: 'Dock', quantity: 0 })]);
  });
});

describe('PUT/DELETE /api/products/[id]', () => {
  let productId: number;
  beforeEach(() => {
    productId = db.insert('products', { owner_id: alice.id, sku: 'A', name: 'A', cost_price: 10, sell_price: 20, min_stock_level: 0 }).id;
    db.insert('products', { owner_id: alice.id, sku: 'B', name: 'B', cost_price: 1, sell_price: 2, min_stock_level: 0 });
  });

  it('updates only whitelisted fields; owner_id / id cannot be changed', async () => {
    const res = await updateProduct(req('PUT', { name: 'Renamed', owner_id: bob.id, id: 999 }, { token: alice.token }), ctx(productId));
    expect(res.status).toBe(200);
    expect(db.tables.products[0]).toMatchObject({ id: productId, owner_id: alice.id, name: 'Renamed' });
  });

  it("cannot touch another owner's product", async () => {
    const res = await updateProduct(req('PUT', { name: 'Hacked' }, { token: bob.token }), ctx(productId));
    expect(res.status).toBe(404);
    expect(db.tables.products[0].name).toBe('A');
  });

  it('cannot edit a deleted product (404)', async () => {
    db.tables.products[0].deleted_at = '2026-01-01T00:00:00Z';
    expect((await updateProduct(req('PUT', { name: 'Zombie' }, { token: alice.token }), ctx(productId))).status).toBe(404);
    expect(db.tables.products[0].name).toBe('A');
  });

  describe('DELETE (soft delete through delete_product)', () => {
    const rpcCalls = () => db.calls.filter((c) => c.table === 'rpc/delete_product');
    const del = (who = alice, target: number | string = productId) => deleteProduct(req('DELETE', undefined, { token: who.token }), ctx(target));

    it('calls the database function with the session user and never deletes rows itself', async () => {
      db.rpc.delete_product = () => ({ id: productId, deleted_at: '2026-01-01T00:00:00Z' });
      expect((await del()).status).toBe(200);
      expect(rpcCalls()).toHaveLength(1);
      expect(rpcCalls()[0].body).toEqual({ p_user_id: alice.id, p_product_id: productId });
      expect(db.calls.filter((c) => c.method === 'DELETE')).toHaveLength(0);
      expect(db.tables.products.some((p) => p.id === productId)).toBe(true);
    });

    it("answers 404 for another owner's, a missing or an already deleted product", async () => {
      db.rpc.delete_product = () => {
        throw new RpcError(404, { code: 'PT404', message: `Product with ID ${productId} not found or access denied`, details: null, hint: null });
      };
      expect((await del(bob)).status).toBe(404);
      expect(rpcCalls()[0].body.p_user_id).toBe(bob.id);
    });

    it('answers 503 when the function is missing (migration 0010 not applied)', async () => {
      db.rpc.delete_product = () => {
        throw new RpcError(404, { code: 'PGRST202', message: 'Could not find the function public.delete_product', details: null, hint: null });
      };
      expect((await del()).status).toBe(503);
    });

    it.each(['abc', '0', '-3', '1.5'])('rejects the id %s before calling the database', async (bad) => {
      expect((await del(alice, bad)).status).toBe(400);
      expect(rpcCalls()).toHaveLength(0);
    });

    it('requires a session', async () => {
      expect((await deleteProduct(req('DELETE'), ctx(productId))).status).toBe(401);
      expect(rpcCalls()).toHaveLength(0);
    });
  });

  it('enforces sell >= cost when only one of the two prices changes', async () => {
    expect((await updateProduct(req('PUT', { sell_price: 5 }, { token: alice.token }), ctx(productId))).status).toBe(422);
    expect((await updateProduct(req('PUT', { cost_price: 50 }, { token: alice.token }), ctx(productId))).status).toBe(422);
    expect((await updateProduct(req('PUT', { sell_price: 30 }, { token: alice.token }), ctx(productId))).status).toBe(200);
    expect(db.tables.products[0].sell_price).toBe(30);
  });

  it('rejects renaming a SKU to one that already exists', async () => {
    expect((await updateProduct(req('PUT', { sku: 'B' }, { token: alice.token }), ctx(productId))).status).toBe(409);
    expect((await updateProduct(req('PUT', { sku: 'A' }, { token: alice.token }), ctx(productId))).status).toBe(200); // itself
  });

  it('rejects an empty or invalid update', async () => {
    expect((await updateProduct(req('PUT', {}, { token: alice.token }), ctx(productId))).status).toBe(422);
    expect((await updateProduct(req('PUT', { name: 'x' }, { token: alice.token }), ctx('abc'))).status).toBe(400);
  });

  it('never leaks database error text', async () => {
    db.failAll = true;
    const res = await updateProduct(req('PUT', { name: 'x' }, { token: alice.token }), ctx(productId));
    expect(JSON.stringify(await res.json())).not.toMatch(/down|supabase|postgres/i);
  });
});

describe('GET /api/products', () => {
  it('hides deleted products', async () => {
    db.insert('products', { owner_id: alice.id, sku: 'LIVE', name: 'Live', cost_price: 1, sell_price: 2 });
    db.insert('products', { owner_id: alice.id, sku: 'GONE', name: 'Gone', cost_price: 1, sell_price: 2, deleted_at: '2026-01-01T00:00:00Z' });
    const rows = await (await listProducts(req('GET', undefined, { token: alice.token }))).json();
    expect(rows.map((r: any) => r.sku)).toEqual(['LIVE']);
  });

  it('lists only the caller\'s products', async () => {
    db.insert('products', { owner_id: alice.id, sku: 'A', name: 'A', cost_price: 1, sell_price: 2 });
    db.insert('products', { owner_id: bob.id, sku: 'B', name: 'B', cost_price: 1, sell_price: 2 });
    const rows = await (await listProducts(req('GET', undefined, { token: alice.token }))).json();
    expect(rows.map((r: any) => r.sku)).toEqual(['A']);
  });
});
