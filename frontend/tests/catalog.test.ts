import { beforeEach, describe, expect, it } from 'vitest';
import { clearAuthCache } from '@/lib/supabase';
import { GET as listLocations, POST as createLocation } from '@/app/api/locations/route';
import { DELETE as deleteLocation, PUT as updateLocation } from '@/app/api/locations/[id]/route';
import { GET as listCategories, POST as createCategory } from '@/app/api/categories/route';
import { DELETE as deleteCategory } from '@/app/api/categories/[id]/route';
import { createDb, FakePostgrest, RpcError } from './helpers/fakePostgrest';
import { ctx, makeUser, req, TestUser } from './helpers/http';

let db: FakePostgrest;
let alice: TestUser;
let bob: TestUser;

beforeEach(async () => {
  db = createDb();
  clearAuthCache();
  alice = await makeUser(db, 'alice@x.com');
  bob = await makeUser(db, 'bob@x.com');
});

describe('first-load seeding (used to create duplicates when requests overlapped)', () => {
  it('seeds the default locations exactly once for 5 concurrent first loads', async () => {
    await Promise.all(Array.from({ length: 5 }, () => listLocations(req('GET', undefined, { token: alice.token }))));
    const mine = db.tables.locations.filter((l) => l.owner_id === alice.id);
    expect(mine).toHaveLength(3);
    expect(new Set(mine.map((l) => l.name)).size).toBe(3);
  });

  it('seeds the default categories exactly once for 5 concurrent first loads', async () => {
    await Promise.all(Array.from({ length: 5 }, () => listCategories(req('GET', undefined, { token: alice.token }))));
    const mine = db.tables.categories.filter((c) => c.owner_id === alice.id);
    expect(mine).toHaveLength(5);
    expect(new Set(mine.map((c) => c.name)).size).toBe(5);
  });

  it('seeds per owner, and does not re-seed rows the user already has or deleted', async () => {
    await listLocations(req('GET', undefined, { token: alice.token }));
    await listLocations(req('GET', undefined, { token: bob.token }));
    expect(db.tables.locations).toHaveLength(6);

    const mine = db.tables.locations.filter((l) => l.owner_id === alice.id);
    await deleteLocation(req('DELETE', undefined, { token: alice.token }), ctx(mine[0].id));
    await listLocations(req('GET', undefined, { token: alice.token }));
    expect(db.tables.locations.filter((l) => l.owner_id === alice.id)).toHaveLength(2);
  });

  it('seeds nothing for the anonymous caller', async () => {
    await listLocations(req('GET'));
    expect(db.tables.locations).toHaveLength(0);
  });
});

describe('locations', () => {
  const create = (body: Record<string, unknown>, who = alice) => createLocation(req('POST', body, { token: who.token }));

  it('creates, trims and rejects a duplicate name (409) per owner only', async () => {
    expect((await create({ name: '  Dock 9  ', capacity: 10 })).status).toBe(200);
    expect(db.tables.locations[0]).toMatchObject({ name: 'Dock 9', owner_id: alice.id, capacity: 10 });
    expect((await create({ name: 'Dock 9', capacity: 10 })).status).toBe(409);
    expect((await create({ name: 'Dock 9', capacity: 10 }, bob)).status).toBe(200);
  });

  it.each([[{ name: '' }], [{ name: 'x'.repeat(51) }], [{ name: 'ok', capacity: -1 }], [{ name: 'ok', capacity: 1.5 }], [{}]])(
    'rejects %j with 422',
    async (body) => {
      expect((await create(body)).status).toBe(422);
    }
  );

  describe('PUT /api/locations/[id] (one database transaction: update_location)', () => {
    let id: number;
    const rpcCalls = () => db.calls.filter((c) => c.table === 'rpc/update_location');
    beforeEach(() => {
      id = db.insert('locations', { owner_id: alice.id, name: 'L1', capacity: 5 }).id;
      db.rpc.update_location = () => ({ id, owner_id: alice.id, name: 'Renamed', capacity: 5, description: null });
    });
    const put = (body: Record<string, unknown>, who = alice, target: number | string = id) =>
      updateLocation(req('PUT', body, { token: who.token }), ctx(target));

    it('sends the session user and only the whitelisted fields, and returns the row', async () => {
      const res = await put({ name: '  Renamed ', capacity: 77, description: 'x', owner_id: bob.id, id: 999 });
      expect(res.status).toBe(200);
      expect((await res.json()).name).toBe('Renamed');
      expect(rpcCalls()).toHaveLength(1);
      expect(rpcCalls()[0].body).toEqual({
        p_user_id: alice.id,
        p_location_id: id,
        p_patch: { name: 'Renamed', capacity: 77, description: 'x' },
      });
    });

    it('sends a partial patch untouched', async () => {
      await put({ capacity: 9 });
      expect(rpcCalls()[0].body.p_patch).toEqual({ capacity: 9 });
    });

    it('reports a name that is already taken as 409', async () => {
      db.rpc.update_location = () => {
        throw new RpcError(409, { code: '23505', message: 'duplicate key value violates unique constraint "uq_locations_owner_name"', details: null, hint: null });
      };
      const res = await put({ name: 'L2' });
      expect(res.status).toBe(409);
      expect((await res.json()).detail).toBe('A location with this name already exists');
    });

    it("reports a location that is not the caller's (or missing) as 404", async () => {
      db.rpc.update_location = () => {
        throw new RpcError(404, { code: 'PT404', message: 'Location not found', details: null, hint: null });
      };
      const res = await put({ capacity: 1 }, bob);
      expect(res.status).toBe(404);
      expect(rpcCalls()[0].body.p_user_id).toBe(bob.id);
    });

    it('answers 503 when the database function is missing (migration 0009 not applied)', async () => {
      db.rpc.update_location = () => {
        throw new RpcError(404, { code: 'PGRST202', message: 'Could not find the function public.update_location', details: null, hint: null });
      };
      expect((await put({ capacity: 1 })).status).toBe(503);
    });

    it.each([[{}], [{ name: '' }], [{ capacity: -1 }], [{ description: 'd'.repeat(256) }]])('rejects %j before calling the database', async (body) => {
      expect([400, 422]).toContain((await put(body)).status);
      expect(rpcCalls()).toHaveLength(0);
    });

    it.each(['abc', '0', '-1', '1.5'])('rejects the id %s', async (bad) => {
      expect((await put({ capacity: 1 }, alice, bad)).status).toBe(400);
      expect(rpcCalls()).toHaveLength(0);
    });
  });

  it("cannot delete another owner's location", async () => {
    const id = db.insert('locations', { owner_id: alice.id, name: 'L1', capacity: 5 }).id;
    await deleteLocation(req('DELETE', undefined, { token: bob.token }), ctx(id));
    expect(db.tables.locations).toHaveLength(1);
  });
});

describe('categories', () => {
  it('creates, trims, and rejects duplicates per owner (409)', async () => {
    const create = (name: string, who = alice) => createCategory(req('POST', { name }, { token: who.token }));
    expect((await create(' Tools ')).status).toBe(200);
    expect(db.tables.categories[0].name).toBe('Tools');
    expect((await create('Tools')).status).toBe(409);
    expect((await create('Tools', bob)).status).toBe(200);
    expect((await create('   ')).status).toBe(422);
    expect((await create('x'.repeat(101))).status).toBe(422);
  });

  it("cannot delete another owner's category", async () => {
    const id = db.insert('categories', { owner_id: alice.id, name: 'Tools' }).id;
    await deleteCategory(req('DELETE', undefined, { token: bob.token }), ctx(id));
    expect(db.tables.categories).toHaveLength(1);
  });
});
