/**
 * A small in-memory stand-in for the parts of Supabase PostgREST the API layer uses,
 * installed as `globalThis.fetch`. It is intentionally strict about the things the
 * code under test depends on (unique constraints, on_conflict, `!inner` embeds) and
 * ignores everything else (ordering, pagination).
 */

type Row = Record<string, any>;

export interface TableSpec {
  /** Column sets that must be unique, e.g. [['owner_id', 'name']]. */
  unique?: string[][];
  /** Values filled in when a column is missing on insert. */
  defaults?: () => Row;
}

export interface Call {
  method: string;
  table: string;
  url: string;
  prefer: string;
  body: any;
}

type RpcHandler = (args: any, db: FakePostgrest) => any;

const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict']);

export class FakePostgrest {
  tables: Record<string, Row[]> = {};
  specs: Record<string, TableSpec> = {};
  calls: Call[] = [];
  rpc: Record<string, RpcHandler> = {};
  /** Make every request fail (simulates an outage). */
  failAll = false;
  private nextId = 1;

  constructor(specs: Record<string, TableSpec>) {
    this.specs = specs;
    for (const name of Object.keys(specs)) this.tables[name] = [];
  }

  install() {
    globalThis.fetch = (async (input: any, init: any = {}) => this.handle(String(input), init)) as any;
  }

  insert(table: string, row: Row): Row {
    const full = { id: this.nextId++, ...(this.specs[table].defaults?.() ?? {}), ...row };
    this.tables[table].push(full);
    return full;
  }

  find(table: string, where: Row): Row[] {
    return this.tables[table].filter((r) => Object.entries(where).every(([k, v]) => r[k] === v));
  }

  private response(body: any, status = 200) {
    const text = body === undefined ? '' : JSON.stringify(body);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => (text ? JSON.parse(text) : null),
      text: async () => text,
    };
  }

  private matchesFilters(row: Row, url: URL, table: string): boolean {
    for (const [key, value] of url.searchParams.entries()) {
      if (RESERVED.has(key) || key.includes('.')) continue;
      if (!(key in row) && !this.specs[table]) continue;
      if (value.startsWith('eq.')) {
        if (String(row[key]) !== decodeURIComponent(value.slice(3))) return false;
      } else if (value.startsWith('in.(')) {
        const list = value.slice(4, -1).split(',').map((v) => decodeURIComponent(v));
        if (!list.includes(String(row[key]))) return false;
      }
    }
    return true;
  }

  /** Resolve `alias:table!inner(cols)` embeds, applying `alias.col=eq.x` filters. */
  private embed(rows: Row[], table: string, url: URL): Row[] {
    const select = url.searchParams.get('select') ?? '*';
    const parts: string[] = [];
    let depth = 0;
    let buf = '';
    for (const ch of select) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) {
        parts.push(buf);
        buf = '';
      } else buf += ch;
    }
    parts.push(buf);

    const embeds = parts
      .map((p) => p.match(/^(?:(\w+):)?(\w+)(!inner)?\(.*\)$/))
      .filter(Boolean) as RegExpMatchArray[];
    if (embeds.length === 0) return rows;

    const out: Row[] = [];
    for (const row of rows) {
      const copy: Row = { ...row };
      let keep = true;
      for (const [, alias, target, inner] of embeds) {
        const name = alias ?? target;
        const fk = `${name}_id`;
        const child = this.tables[target]?.find((t) => t.id === row[fk]) ?? null;
        let ok = child !== null;
        for (const [key, value] of url.searchParams.entries()) {
          if (key.startsWith(`${name}.`) && value.startsWith('eq.')) {
            const col = key.slice(name.length + 1);
            if (!child || String(child[col]) !== value.slice(3)) ok = false;
          }
        }
        copy[name] = ok ? child : null;
        if (inner && !ok) keep = false;
      }
      if (keep) out.push(copy);
    }
    return out;
  }

  private violatesUnique(table: string, row: Row, ignore?: Row): boolean {
    return (this.specs[table].unique ?? []).some((cols) =>
      this.tables[table].some((r) => r !== ignore && cols.every((c) => r[c] === row[c]))
    );
  }

  private async handle(rawUrl: string, init: any) {
    const url = new URL(rawUrl);
    const method = (init.method ?? 'GET').toUpperCase();
    const prefer: string = init.headers?.Prefer ?? 'return=representation';
    const body = init.body ? JSON.parse(init.body) : undefined;
    const path = url.pathname.replace(/^\/rest\/v1\//, '');
    this.calls.push({ method, table: path, url: rawUrl, prefer, body });

    if (this.failAll) return this.response({ message: 'down' }, 503);

    if (path.startsWith('rpc/')) {
      const handler = this.rpc[path.slice(4)];
      if (!handler) return this.response({ message: 'function not found' }, 404);
      return this.response(handler(body, this));
    }

    const table = path;
    if (!this.tables[table]) return this.response({ message: `unknown table ${table}` }, 404);
    const minimal = prefer.includes('return=minimal');

    if (method === 'GET') {
      const rows = this.tables[table].filter((r) => this.matchesFilters(r, url, table));
      return this.response(this.embed(rows, table, url));
    }

    if (method === 'POST') {
      const rows: Row[] = Array.isArray(body) ? body : [body];
      const created: Row[] = [];
      for (const input of rows) {
        const candidate = { ...(this.specs[table].defaults?.() ?? {}), ...input };
        if (this.violatesUnique(table, candidate)) {
          if (prefer.includes('ignore-duplicates') && url.searchParams.get('on_conflict')) continue;
          return this.response({ code: '23505', message: 'duplicate key value' }, 409);
        }
        created.push(this.insert(table, input));
      }
      return this.response(minimal ? undefined : created, 201);
    }

    if (method === 'PATCH') {
      const rows = this.tables[table].filter((r) => this.matchesFilters(r, url, table));
      for (const row of rows) {
        const next = { ...row, ...body };
        if (this.violatesUnique(table, next, row)) return this.response({ code: '23505' }, 409);
      }
      for (const row of rows) Object.assign(row, body);
      return this.response(minimal ? undefined : rows);
    }

    if (method === 'DELETE') {
      const doomed = this.tables[table].filter((r) => this.matchesFilters(r, url, table));
      this.tables[table] = this.tables[table].filter((r) => !doomed.includes(r));
      return this.response(minimal ? undefined : doomed);
    }

    return this.response({ message: 'unsupported' }, 400);
  }
}

/** The tables the application uses, with the constraints the migrations create. */
export function createDb(): FakePostgrest {
  const db = new FakePostgrest({
    users: {
      unique: [['email']],
      defaults: () => ({ is_active: true, token_version: 0, image_url: null }),
    },
    products: { unique: [['owner_id', 'sku']] },
    locations: { unique: [['owner_id', 'name']], defaults: () => ({ capacity: 0, description: null }) },
    categories: { unique: [['owner_id', 'name']] },
    inventory: { unique: [['product_id', 'location']] },
    transactions: { unique: [['ref_code']], defaults: () => ({ created_at: new Date().toISOString() }) },
    purchase_orders: { unique: [['po_number']] },
    rate_limits: {},
  });

  // Mirrors backend/supabase/migrations/rate_limits.sql (fixed window, atomic).
  db.rpc.rate_limit_hit = ({ p_key, p_window_seconds, p_max }, self) => {
    const now = Date.now();
    let row = self.tables.rate_limits.find((r) => r.key === p_key);
    if (!row || now - row.window_start >= p_window_seconds * 1000) {
      if (row) Object.assign(row, { count: 1, window_start: now });
      else row = self.insert('rate_limits', { key: p_key, count: 1, window_start: now });
    } else row.count += 1;
    const allowed = row.count <= p_max;
    const retry = Math.max(1, Math.ceil((row.window_start + p_window_seconds * 1000 - now) / 1000));
    return [{ allowed, retry_after: allowed ? 0 : retry }];
  };

  db.install();
  return db;
}
