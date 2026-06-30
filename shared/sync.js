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

  function headers() {
    return {
      apikey: cfg.key,
      Authorization: "Bearer " + cfg.key,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    };
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

  async function pullOne(ns) {
    const url = `${cfg.url}/rest/v1/app_state?app=eq.${ns}&sync_code=eq.${encodeURIComponent(cfg.code)}&select=data,updated_at`;
    const r = await fetch(url, { headers: headers() });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const rows = await r.json();
    if (!rows.length) return false;
    const remote = rows[0].data || {};
    const local = Store.get(ns);
    const rT = remote._updatedAt || Date.parse(rows[0].updated_at) || 0;
    const lT = local._updatedAt || 0;
    if (rT > lT) { Store.replace(ns, remote, { fromSync: true }); return true; }
    if (lT > rT) { push(ns, local); }          // empurra o nosso, mais recente
    return false;
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
    const r = await fetch(`${u}/rest/v1/app_state?select=app&limit=1`, {
      headers: { apikey: c.key, Authorization: "Bearer " + c.key },
    });
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
