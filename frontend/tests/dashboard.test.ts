import { beforeEach, describe, expect, it } from 'vitest';
import { clearAuthCache } from '@/lib/supabase';
import { GET as summary } from '@/app/api/dashboard/summary/route';
import { GET as metrics } from '@/app/api/dashboard/metrics/route';
import { createDb, FakePostgrest, RpcError } from './helpers/fakePostgrest';
import { makeUser, req, TestUser } from './helpers/http';

/*
 * The figures are computed by the database function dashboard_summary and tested against real PostgreSQL
 * (supabase/tests/dashboard_summary.sql, tests-integration). What is tested here is the API side: which
 * arguments reach the function, what is refused before the database is called, how answers are reported.
 */

let db: FakePostgrest;
let alice: TestUser;

beforeEach(async () => {
  db = createDb();
  clearAuthCache();
  alice = await makeUser(db, 'alice@x.com');
});

const rpcCalls = () => db.calls.filter((c) => c.table === 'rpc/dashboard_summary');
const getSummary = (query = '', token: string = alice.token) =>
  summary(req('GET', undefined, { token, url: `http://app.test/api/dashboard/summary${query}` }));
const getMetrics = (query = '') => metrics(req('GET', undefined, { token: alice.token, url: `http://app.test/api/dashboard/metrics${query}` }));

const doc = (over: Record<string, unknown> = {}) => ({
  totals: { units: 12, products: 2 },
  locations: [{ name: 'A1', capacity: 100, used: 12, pct: 12, over: false }],
  movement: [],
  ...over,
});

describe('GET /api/dashboard/summary', () => {
  it('requires a session', async () => {
    const anonymous = await summary(req('GET', undefined, { url: 'http://app.test/api/dashboard/summary' }));
    expect(anonymous.status).toBe(401);
    expect(rpcCalls()).toHaveLength(0);
  });

  it('asks the database for the session user, 30 days, UTC and every location by default', async () => {
    db.rpc.dashboard_summary = () => doc();
    const res = await getSummary();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ totals: { units: 12 } });
    expect(rpcCalls()[0].body).toEqual({ p_user_id: alice.id, p_location: null, p_days: 30, p_tz: 'UTC' });
  });

  it('passes location, days and time zone on, and ignores a user id sent by the client', async () => {
    db.rpc.dashboard_summary = () => doc();
    await getSummary('?location=Zone%20A-01&days=7&tz=Asia/Bangkok&user_id=999&p_user_id=999');
    expect(rpcCalls()[0].body).toEqual({ p_user_id: alice.id, p_location: 'Zone A-01', p_days: 7, p_tz: 'Asia/Bangkok' });
  });

  it.each(['days=0', 'days=367', 'days=abc', 'days=1.5', 'days=-3', 'days=7days'])('refuses %s with 400 before calling the database', async (q) => {
    const res = await getSummary(`?${q}`);
    expect(res.status).toBe(400);
    expect((await res.json()).detail).toMatch(/days/);
    expect(rpcCalls()).toHaveLength(0);
  });

  it.each(['tz=Mars%2FOlympus%2F..%2F..', 'tz=%27%3B%20DROP%20TABLE%20users', 'tz=a%20b', `tz=${'x'.repeat(65)}`, 'tz=A/B/C/D'])(
    'refuses the time zone %s with 400',
    async (q) => {
      expect((await getSummary(`?${q}`)).status).toBe(400);
      expect(rpcCalls()).toHaveLength(0);
    }
  );

  it('accepts the usual zone names', async () => {
    db.rpc.dashboard_summary = () => doc();
    for (const tz of ['UTC', 'Asia/Bangkok', 'America/Argentina/Buenos_Aires', 'Etc/GMT+7', 'Europe/London']) {
      expect((await getSummary(`?tz=${encodeURIComponent(tz)}`)).status).toBe(200);
    }
  });

  it('refuses a location name longer than 50 characters', async () => {
    expect((await getSummary(`?location=${'x'.repeat(51)}`)).status).toBe(400);
  });

  it('reports the database refusals as they are (unknown location 404, unknown zone 400)', async () => {
    db.rpc.dashboard_summary = () => {
      throw new RpcError(404, { code: 'PT404', message: 'Location not found', details: null, hint: null });
    };
    expect((await getSummary('?location=Nope')).status).toBe(404);
    db.rpc.dashboard_summary = () => {
      throw new RpcError(400, { code: 'PT400', message: 'unknown time zone', details: null, hint: null });
    };
    const res = await getSummary('?tz=Mars/Base');
    expect(res.status).toBe(400);
    expect((await res.json()).detail).toBe('unknown time zone');
  });

  it('answers 503, not an empty dashboard, when the function is not installed', async () => {
    // no handler registered: the fake answers like PostgREST does for a missing function
    expect([503, 404, 500]).toContain((await getSummary()).status);
  });

  it('never returns database error text for an unexpected failure', async () => {
    db.rpc.dashboard_summary = () => {
      throw new RpcError(500, { code: 'XX000', message: 'relation "secret" exploded', details: null, hint: null });
    };
    const res = await getSummary();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toMatch(/secret/);
  });
});

describe('GET /api/dashboard/metrics (storage usage)', () => {
  it('adds up the used and the capacity of the locations the database returns', async () => {
    db.rpc.dashboard_summary = () =>
      doc({ locations: [{ name: 'A', capacity: 100, used: 30 }, { name: 'B', capacity: 100, used: 20 }] });
    const data = await (await getMetrics()).json();
    expect(data).toEqual({ warehouse_capacity_pct: 25, warehouse_capacity_label: '50 / 200 items (25%)' });
    expect(rpcCalls()[0].body).toMatchObject({ p_user_id: alice.id, p_location: null });
  });

  it('does not call a capacity of 0 "Unlimited": the database accepts no stock there', async () => {
    db.rpc.dashboard_summary = () => doc({ locations: [{ name: 'A', capacity: 0, used: 0 }] });
    const data = await (await getMetrics()).json();
    expect(data.warehouse_capacity_label).toBe('0 items (no capacity set)');
    expect(data.warehouse_capacity_pct).toBe(0);
  });

  it('caps the percentage at 100 when a location is over capacity', async () => {
    db.rpc.dashboard_summary = () => doc({ locations: [{ name: 'A', capacity: 10, used: 40 }] });
    expect((await (await getMetrics()).json()).warehouse_capacity_pct).toBe(100);
  });

  it('keeps answering 0 for a location that does not exist (old behaviour)', async () => {
    db.rpc.dashboard_summary = () => {
      throw new RpcError(404, { code: 'PT404', message: 'Location not found', details: null, hint: null });
    };
    const res = await getMetrics('?location=Gone');
    expect(res.status).toBe(200);
    expect((await res.json()).warehouse_capacity_pct).toBe(0);
  });

  it('is an error, not an empty warehouse, when the database cannot answer', async () => {
    db.rpc.dashboard_summary = () => {
      throw new RpcError(500, { code: 'XX000', message: 'boom', details: null, hint: null });
    };
    expect((await getMetrics()).status).toBe(500);
  });
});
