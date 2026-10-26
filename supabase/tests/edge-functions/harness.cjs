// Runs the REAL Edge Function code (cancel-booking, modify-booking) against an in-memory fake of Supabase and Paystack.
// See README.md in this folder.
const ts = require('typescript');
const fs = require('fs');
const path = require('path');
const FN = path.join(__dirname, '..', '..', 'functions');

// ---- in-memory fake Supabase ------------------------------------------------------------------------------------------------
function makeDb(tables) {
  const log = { updates: [], inserts: [], rpcs: [], invokes: [] };
  function builder(table) {
    const state = { filters: [], mode: 'select', patch: null, row: null };
    const run = () => {
      let rows = (tables[table] ?? []).slice();
      for (const f of state.filters) {
        if (f.type === 'eq') rows = rows.filter((r) => r[f.col] === f.val);
        if (f.type === 'ilike') rows = rows.filter((r) => String(r[f.col] ?? '').toLowerCase() === String(f.val).toLowerCase());
        if (f.type === 'in') rows = rows.filter((r) => f.vals.includes(r[f.col]));
        if (f.type === 'gte') rows = rows.filter((r) => r[f.col] >= f.val);
        if (f.type === 'lte') rows = rows.filter((r) => r[f.col] <= f.val);
      }
      if (state.mode === 'update') {
        const ids = rows.map((r) => r.id);
        log.updates.push({ table, patch: state.patch, ids });
        rows.forEach((r) => Object.assign(r, state.patch));
        return { data: null, error: null };
      }
      if (state.mode === 'insert') {
        log.inserts.push({ table, row: state.row });
        const row = { id: 'ins-' + log.inserts.length, ...state.row };
        (tables[table] ??= []).push(row);
        state.inserted = row;
        return { data: row, error: null };
      }
      return { data: rows, error: null };
    };
    const b = {
      select() { return b; },
      limit() { return b; },
      order() { return b; },
      or() { return b; },
      eq(col, val) { state.filters.push({ type: 'eq', col, val }); return b; },
      ilike(col, val) { state.filters.push({ type: 'ilike', col, val }); return b; },
      in(col, vals) { state.filters.push({ type: 'in', col, vals }); return b; },
      gte(col, val) { state.filters.push({ type: 'gte', col, val }); return b; },
      lte(col, val) { state.filters.push({ type: 'lte', col, val }); return b; },
      update(patch) { state.mode = 'update'; state.patch = patch; return b; },
      insert(row) { state.mode = 'insert'; state.row = row; return b; },
      single() { const r = run(); const row = Array.isArray(r.data) ? r.data[0] : r.data; return Promise.resolve(row ? { data: row, error: null } : { data: null, error: { message: 'no rows' } }); },
      maybeSingle() { const r = run(); const row = Array.isArray(r.data) ? r.data[0] : r.data; return Promise.resolve({ data: row ?? null, error: null }); },
      then(res, rej) { return Promise.resolve(run()).then(res, rej); },
    };
    return b;
  }
  const client = (userId) => ({
    from: builder,
    auth: { getUser: async () => (userId ? { data: { user: { id: userId } }, error: null } : { data: { user: null }, error: { message: 'bad' } }) },
    rpc: async (name, args) => { log.rpcs.push({ name, args }); return { data: null, error: null }; },
    functions: { invoke: async (name, opts) => { log.invokes.push({ name, body: opts?.body }); return { data: {}, error: null }; } },
  });
  return { client, log };
}

// ---- load an Edge Function with its imports stubbed ---------------------------------------------------------------------------
function loadFunction(rel, deps) {
  const src = fs.readFileSync(path.join(FN, rel), 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { module: 'CommonJS', target: 'ES2022' } }).outputText;
  const m = { exports: {} };
  const req = (spec) => {
    if (spec.includes('supabase-js')) return { createClient: deps.createClient };
    if (spec.endsWith('_shared/modifyPricing.ts')) return loadShared('_shared/modifyPricing.ts');
    if (spec.endsWith('_shared/time.ts')) return loadShared('_shared/time.ts');
    if (spec.endsWith('_shared/cronAuth.ts')) return { getInternalSecret: async () => null };
    if (spec.endsWith('_shared/balancePayment.ts') || spec.endsWith('_shared/confirmPayment.ts')) return loadWithFetch(spec.split('/').pop(), deps);
    return {};
  };
  let handler;
  const Deno = { serve: (h) => { handler = h; }, env: { get: (k) => deps.env[k] } };
  new Function('module', 'exports', 'require', 'Deno', 'fetch', js)(m, m.exports, req, Deno, deps.fetch);
  return handler;
}
const sharedCache = {};
function loadShared(rel) {
  if (sharedCache[rel]) return sharedCache[rel];
  const src = fs.readFileSync(path.join(FN, rel), 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { module: 'CommonJS', target: 'ES2022' } }).outputText;
  const m = { exports: {} };
  new Function('module', 'exports', js)(m, m.exports);
  return (sharedCache[rel] = m.exports);
}

// Shared modules that call Paystack (confirmPayment.ts, balancePayment.ts): loaded fresh per test so they see that test's fake fetch.
function loadWithFetch(file, deps) {
  const src = fs.readFileSync(path.join(FN, '_shared', file), 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { module: 'CommonJS', target: 'ES2022' } }).outputText;
  const m = { exports: {} };
  const req = (spec) => (spec.endsWith('confirmPayment.ts') ? loadWithFetch('confirmPayment.ts', deps) : {});
  new Function('module', 'exports', 'require', 'fetch', js)(m, m.exports, req, deps.fetch);
  return m.exports;
}

module.exports = { makeDb, loadFunction };
