/* =====================================================================
   sync.js — sincronização PRIVADA telemóvel ↔ PC via Supabase.
   - Login com email + palavra-passe (Supabase Auth). Só existe a tua conta
     (os registos novos ficam desligados no Supabase).
   - Tabela user_state com Row Level Security: cada linha só pode ser lida
     ou escrita pelo dono (auth.uid() = user_id). A chave pública sozinha
     não dá acesso a nada.
   - Uma linha por app e por namespace (ex: "fisico.nut", "fisico.gym").
   - Merge sem perdas entre dispositivos (tombstones para apagados).
   ===================================================================== */
(function (global) {
  const APP = global.APP || {};
  const TABLE = "user_state";
  const NAMESPACES = APP.namespaces || [];
  const rowKey = (ns) => `${APP.id}.${ns}`;
  let cfg = null;           // { url, key }
  let status = "off";       // off | signedout | ready | syncing | error
  const pushTimers = {};
  const pending = {};
  let pollTimer = null;
  let refreshing = null;
  const statusCbs = new Set();

  function setStatus(s, detail) { status = s; statusCbs.forEach((f) => f(s, detail)); }
  const sys = () => Store.get("sys");
  const session = () => sys().session || null;
  function saveSession(sess) {
    Store.update("sys", (s) => { if (sess) s.session = sess; else delete s.session; }, { silent: true });
  }

  function loadCfg() {
    const c = sys().cloud || {};
    cfg = (c.url && c.key) ? { url: c.url.trim().replace(/\/$/, ""), key: c.key.trim() } : null;
    setStatus(!cfg ? "off" : session() ? "ready" : "signedout");
    return cfg;
  }

  const jsonHeaders = (key) => ({ apikey: key, "Content-Type": "application/json" });

  function toSession(j) {
    return {
      access_token: j.access_token, refresh_token: j.refresh_token,
      expires_at: Date.now() + (j.expires_in || 3600) * 1000,
      user_id: j.user && j.user.id, email: j.user && j.user.email,
    };
  }

  async function authRequest(path, body, c = cfg) {
    const r = await fetch(`${c.url}/auth/v1/${path}`, { method: "POST", headers: jsonHeaders(c.key), body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const err = new Error(j.error_description || j.msg || j.message || ("HTTP " + r.status));
      err.status = r.status;
      throw err;
    }
    return j;
  }

  async function accessToken(force) {
    const s = session();
    if (!s) throw new Error("Sessão terminada — inicia sessão nas Definições.");
    if (!force && s.expires_at - 60000 > Date.now()) return s.access_token;
    if (!refreshing) {
      refreshing = authRequest("token?grant_type=refresh_token", { refresh_token: s.refresh_token })
        .then((j) => { const ns = toSession(j); saveSession(ns); return ns.access_token; })
        .catch((e) => {
          // Só termina a sessão se o Supabase recusar o token (não por falta de rede).
          if (e.status === 400 || e.status === 401 || e.status === 403) { saveSession(null); setStatus("signedout"); }
          throw e;
        })
        .finally(() => { refreshing = null; });
    }
    return refreshing;
  }

  async function api(path, opts = {}, retried) {
    const token = await accessToken(retried);
    const r = await fetch(`${cfg.url}/rest/v1/${path}`, {
      ...opts, headers: { ...jsonHeaders(cfg.key), Authorization: "Bearer " + token, ...(opts.headers || {}) },
    });
    if (r.status === 401 && !retried) return api(path, opts, true);
    if (!r.ok) {
      const txt = await r.text();
      if (/user_state/.test(txt) && /does not exist|schema cache/.test(txt)) throw new Error("A tabela 'user_state' não existe — corre o SQL de configuração no Supabase.");
      throw new Error("HTTP " + r.status + " " + txt);
    }
    return r;
  }

  const canSync = () => !!(cfg && session());

  function push(ns, data) {
    if (!NAMESPACES.includes(ns) || !canSync()) return;
    pending[ns] = data;
    clearTimeout(pushTimers[ns]);
    pushTimers[ns] = setTimeout(() => flushPush(ns), 1200);
  }

  async function flushPush(ns) {
    clearTimeout(pushTimers[ns]);
    const data = pending[ns];
    if (!data || !canSync()) return;
    delete pending[ns];
    try {
      setStatus("syncing");
      const body = [{ user_id: session().user_id, app: rowKey(ns), data, updated_at: new Date(data._updatedAt || Date.now()).toISOString() }];
      await api(`${TABLE}?on_conflict=user_id,app`, {
        method: "POST", body: JSON.stringify(body), keepalive: true,
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      });
      setStatus("ready");
    } catch (e) { console.warn("sync push", ns, e); if (status !== "signedout") setStatus("error", e.message); }
  }
  const flushAll = () => Promise.all(Object.keys(pending).map((ns) => flushPush(ns)));

  function mergeTomb(a, b) {
    const out = {};
    [a && a._tomb, b && b._tomb].forEach((tomb) => {
      for (const key in tomb || {}) {
        out[key] = out[key] || {};
        for (const id in tomb[key]) out[key][id] = Math.max(out[key][id] || 0, tomb[key][id]);
      }
    });
    return out;
  }

  function mergeArrayBy(out, older, key, keyOf, tomb) {
    let arr = Array.isArray(out[key]) ? out[key] : [];
    const seen = new Set(arr.map((x) => x && keyOf(x)));
    (older[key] || []).forEach((x) => { const id = x && keyOf(x); if (id != null && !seen.has(id)) { arr.push(x); seen.add(id); } });
    const dead = tomb && tomb[key];
    if (dead) arr = arr.filter((x) => !(x && dead[String(keyOf(x))] != null));
    out[key] = arr;
  }

  /** Merge sem perdas: base = estado mais recente; acrescenta itens/chaves que só existem no outro
   *  (exceto itens marcados como apagados em "_tomb"). Os campos de cada namespace estão em APP.merge[ns]:
   *  { ids: [arrays por id], names: [arrays por nome], keyed: [objetos por chave], deepKeyed: [objetos de objetos] }. */
  function mergeStates(ns, local, remote) {
    const rules = (APP.merge && APP.merge[ns]) || {};
    const remoteNewer = (remote._updatedAt || 0) >= (local._updatedAt || 0);
    const newer = remoteNewer ? remote : local, older = remoteNewer ? local : remote;
    const out = JSON.parse(JSON.stringify(newer));
    const tomb = mergeTomb(newer, older);
    (rules.ids || []).forEach((key) => mergeArrayBy(out, older, key, (x) => x.id, tomb));
    (rules.names || []).forEach((key) => mergeArrayBy(out, older, key, (x) => x.name, tomb));
    (rules.keyed || []).forEach((key) => {
      const obj = out[key] && typeof out[key] === "object" ? out[key] : {}; const old = older[key] || {};
      for (const k in old) if (!(k in obj)) obj[k] = old[k];
      out[key] = obj;
    });
    // objetos de objetos (ex: diário por dia → por entrada): junta ao 2.º nível
    (rules.deepKeyed || []).forEach((key) => {
      const obj = out[key] && typeof out[key] === "object" ? out[key] : {}; const old = older[key] || {};
      for (const k in old) {
        if (!(k in obj)) obj[k] = old[k];
        else if (obj[k] && typeof obj[k] === "object" && !Array.isArray(obj[k]) && old[k] && typeof old[k] === "object") {
          for (const k2 in old[k]) if (!(k2 in obj[k])) obj[k][k2] = old[k][k2];
        }
      }
      out[key] = obj;
    });
    if (rules.after) rules.after(out, older);
    if (Object.keys(tomb).length) out._tomb = tomb;
    out._updatedAt = Math.max(local._updatedAt || 0, remote._updatedAt || 0);
    return out;
  }
  const stripVol = (o) => { const c = { ...o }; delete c._updatedAt; return JSON.stringify(c); };

  async function pullAll() {
    if (!canSync()) return;
    try {
      setStatus("syncing");
      const keys = NAMESPACES.map(rowKey);
      const rows = await (await api(`${TABLE}?select=app,data,updated_at&app=in.(${keys.map((k) => `"${k}"`).join(",")})`)).json();
      let changed = 0;
      for (const ns of NAMESPACES) {
        const row = rows.find((r) => r.app === rowKey(ns));
        const local = Store.get(ns);
        if (!row) { if (Object.keys(local).length) { pending[ns] = local; await flushPush(ns); } continue; }
        const remote = row.data || {};
        const merged = mergeStates(ns, local, remote);
        if (JSON.stringify(merged) !== JSON.stringify(local)) { Store.replace(ns, merged, { fromSync: true }); changed++; }
        if (stripVol(merged) !== stripVol(remote)) { pending[ns] = merged; await flushPush(ns); }
      }
      if (status === "syncing") setStatus("ready");
      return changed;
    } catch (e) { console.warn("sync pull", e); if (status !== "signedout") setStatus("error", e.message); }
  }

  async function test(c) {
    const u = c.url.trim().replace(/\/$/, "");
    const r = await fetch(`${u}/auth/v1/settings`, { headers: { apikey: c.key.trim() } });
    if (!r.ok) throw new Error("HTTP " + r.status + " — verifica o URL e a chave pública.");
    return true;
  }

  async function signIn(c, email, password) {
    const conf = { url: c.url.trim().replace(/\/$/, ""), key: c.key.trim() };
    const j = await authRequest("token?grant_type=password", { email: email.trim(), password }, conf);
    Store.update("sys", (s) => { s.cloud = conf; s.session = toSession(j); }, { silent: true });
    loadCfg();
    startPolling();
    await pullAll();
  }

  async function signOut() {
    await flushAll().catch(() => {});
    const s = session();
    if (cfg && s) fetch(`${cfg.url}/auth/v1/logout`, { method: "POST", headers: { ...jsonHeaders(cfg.key), Authorization: "Bearer " + s.access_token } }).catch(() => {});
    clearInterval(pollTimer);
    saveSession(null);
    loadCfg();
  }

  /** Lê (uma vez) um namespace da sincronização antiga da Vida OS / gymos (tabela app_state, por código). */
  async function pullLegacy({ url, key, code }, app) {
    const u = url.replace(/\/$/, "");
    const h = { apikey: key }; if (key.indexOf("eyJ") === 0) h.Authorization = "Bearer " + key;
    const r = await fetch(`${u}/rest/v1/app_state?app=eq.${encodeURIComponent(app)}&sync_code=eq.${encodeURIComponent(code)}&select=data`, { headers: h });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const rows = await r.json();
    return rows.length ? rows[0].data : null;
  }

  function startPolling() {
    clearInterval(pollTimer);
    if (canSync()) pollTimer = setInterval(pullAll, 60000);
  }

  const Sync = {
    init() {
      loadCfg();
      if (canSync()) { pullAll(); startPolling(); }
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) flushAll();
        else pullAll();
      });
      window.addEventListener("pagehide", flushAll);
      window.addEventListener("online", pullAll);
    },
    push, pullAll, test, signIn, signOut, pullLegacy, mergeStates,
    flushAllPending: flushAll,
    onStatus(cb) { statusCbs.add(cb); cb(status); return () => statusCbs.delete(cb); },
    get status() { return status; },
    get enabled() { return canSync(); },
    get configured() { return !!cfg; },
    get email() { const s = session(); return s && s.email; },
    sqlSchema:
`-- Supabase → SQL Editor → cola isto e clica RUN (1x — serve para as apps Vida e Físico).
create table if not exists user_state (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  app text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, app)
);
alter table user_state enable row level security;
revoke all on user_state from anon;
grant select, insert, update, delete on user_state to authenticated;
create policy "dono le" on user_state for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "dono insere" on user_state for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "dono atualiza" on user_state for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "dono apaga" on user_state for delete to authenticated
  using ((select auth.uid()) = user_id);`,
  };

  global.Sync = Sync;
})(window);
