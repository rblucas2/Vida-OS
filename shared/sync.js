/* =====================================================================
   sync.js — sincronização gratuita e opcional via Supabase (REST)
   Modelo simples "blob por app" (last-write-wins):
     tabela app_state(app text, sync_code text, data jsonb,
                      updated_at timestamptz, primary key(app, sync_code))
   - Sem cartão de crédito. Free tier do Supabase chega de sobra.
   - O utilizador cola, nas Definições, o URL + chave anónima + um código.
   - O mesmo "código de sincronização" liga telemóvel e PC.
   ===================================================================== */
(function (global) {
  const CFG_NS = "sys";
  let cfg = null;           // { url, key, code }
  let status = "off";       // off | ready | syncing | error
  const pushTimers = {};
  const statusCbs = new Set();

  function setStatus(s, detail) { status = s; statusCbs.forEach((f) => f(s, detail)); }

  function loadCfg() {
    const sys = Store.get(CFG_NS);
    const c = sys.sync || {};
    cfg = (c.url && c.key && c.code) ? { url: c.url.replace(/\/$/, ""), key: c.key, code: c.code } : null;
    setStatus(cfg ? "ready" : "off");
    return cfg;
  }

  // Só envia "Authorization: Bearer" quando a chave é um JWT (anon legacy "eyJ…").
  // Para as novas chaves publishable ("sb_…") basta o apikey.
  function authFor(key) { const h = { apikey: key }; if (key && key.indexOf("eyJ") === 0) h.Authorization = "Bearer " + key; return h; }
  function headers() {
    return Object.assign({ "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }, authFor(cfg.key));
  }

  const apps = ["los", "fin", "nut"];

  async function push(ns, data) {
    if (!cfg || !apps.includes(ns)) return;
    clearTimeout(pushTimers[ns]);
    pushTimers[ns] = setTimeout(async () => {
      try {
        setStatus("syncing");
        const body = [{ app: ns, sync_code: cfg.code, data, updated_at: new Date(data._updatedAt || Date.now()).toISOString() }];
        const r = await fetch(`${cfg.url}/rest/v1/app_state`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
        if (!r.ok) throw new Error("HTTP " + r.status + " " + (await r.text()));
        setStatus("ready");
      } catch (e) { console.warn("sync push", e); setStatus("error", e.message); }
    }, 1200);
  }

  // Quais os campos que são listas-por-id e objetos-por-chave (para merge sem perdas)
  const ID_ARRAYS = { fin: ["transactions", "assets", "recurring"], nut: ["foods", "meals"], los: ["habits", "pillars"] };
  const KEYED_OBJ = { fin: ["budgets", "categoryRules", "nwHistory"], nut: ["diary", "workoutDays", "weightLog"], los: ["days", "habitLog", "reviews"] };

  /** Merge sem perdas: base = estado mais recente; acrescenta itens/chaves que só existem no outro. */
  function mergeStates(ns, local, remote) {
    const remoteNewer = (remote._updatedAt || 0) >= (local._updatedAt || 0);
    const newer = remoteNewer ? remote : local, older = remoteNewer ? local : remote;
    const out = JSON.parse(JSON.stringify(newer));
    (ID_ARRAYS[ns] || []).forEach((key) => {
      const arr = Array.isArray(out[key]) ? out[key] : []; const ids = new Set(arr.map((x) => x && x.id));
      (older[key] || []).forEach((x) => { if (x && !ids.has(x.id)) arr.push(x); });
      out[key] = arr;
    });
    (KEYED_OBJ[ns] || []).forEach((key) => {
      const obj = out[key] && typeof out[key] === "object" ? out[key] : {}; const old = older[key] || {};
      for (const k in old) if (!(k in obj)) obj[k] = old[k];
      out[key] = obj;
    });
    out._updatedAt = Math.max(local._updatedAt || 0, remote._updatedAt || 0);
    return out;
  }
  const stripVol = (o) => { const c = { ...o }; delete c._updatedAt; return JSON.stringify(c); };

  async function pullOne(ns) {
    const url = `${cfg.url}/rest/v1/app_state?app=eq.${ns}&sync_code=eq.${encodeURIComponent(cfg.code)}&select=data,updated_at`;
    const r = await fetch(url, { headers: headers() });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const rows = await r.json();
    const local = Store.get(ns);
    if (!rows.length) { if (Object.keys(local).length) push(ns, local); return false; }
    const remote = rows[0].data || {};
    const merged = mergeStates(ns, local, remote);
    const changedLocal = JSON.stringify(merged) !== JSON.stringify(local);
    if (changedLocal) Store.replace(ns, merged, { fromSync: true });   // atualiza local + re-render
    if (stripVol(merged) !== stripVol(remote)) push(ns, merged);       // devolve à cloud as adições do outro lado
    return changedLocal;
  }

  async function pullAll() {
    if (!cfg) return;
    try {
      setStatus("syncing");
      let changed = 0;
      for (const ns of apps) { if (await pullOne(ns)) changed++; }
      setStatus("ready");
      return changed;
    } catch (e) { console.warn("sync pull", e); setStatus("error", e.message); }
  }

  async function test(c) {
    const u = c.url.replace(/\/$/, "");
    const r = await fetch(`${u}/rest/v1/app_state?select=app&limit=1`, { headers: authFor(c.key) });
    if (!r.ok) throw new Error("HTTP " + r.status + " — verifica URL/chave e se a tabela 'app_state' existe.");
    return true;
  }

  const Sync = {
    init() {
      loadCfg();
      if (cfg) { pullAll(); setInterval(pullAll, 60000); }
      // Re-sincroniza ao voltar à app
      document.addEventListener("visibilitychange", () => { if (!document.hidden && cfg) pullAll(); });
      window.addEventListener("online", () => { if (cfg) pullAll(); });
    },
    push,
    pullAll,
    test,
    reload() { loadCfg(); if (cfg) pullAll(); },
    onStatus(cb) { statusCbs.add(cb); cb(status); return () => statusCbs.delete(cb); },
    get status() { return status; },
    get enabled() { return !!cfg; },
    sqlSchema:
`-- Cola isto no SQL Editor do teu projeto Supabase (gratuito) e clica RUN:
create table if not exists app_state (
  app text not null,
  sync_code text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (app, sync_code)
);
alter table app_state enable row level security;
create policy "acesso por codigo" on app_state
  for all using (true) with check (true);`,
  };

  global.Sync = Sync;
})(window);
