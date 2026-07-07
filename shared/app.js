/* =====================================================================
   app.js — arranque comum: tema, service worker, navegação,
   ecrã de Definições partilhado (tema, sincronização, backup).
   ===================================================================== */
(function (global) {
  const { el, $, toast } = UI;

  // ---- Tema: segue o sistema, com override manual opcional ------------
  function applyTheme() {
    const sys = Store.get("sys");
    const pref = sys.theme || "auto";   // auto | light | dark
    const root = document.documentElement;
    if (pref === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", pref);
    // Atualiza a barra do telemóvel
    const isDark = pref === "dark" || (pref === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
    let meta = $('meta[name="theme-color"]');
    if (!meta) { meta = el("meta", { name: "theme-color" }); document.head.appendChild(meta); }
    meta.setAttribute("content", isDark ? "#121212" : "#f6f6f4");
  }
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);

  // ---- Service worker (offline + instalável) --------------------------
  function registerSW() {
    if (!("serviceWorker" in navigator)) return;
    if (!location.protocol.startsWith("http")) return; // file:// não suporta SW
    // sw.js está na raiz do projeto (um nível acima das sub-apps)
    const p = location.pathname;
    const base = /\/(lifeos|finance|nutrition)\//.test(p)
      ? p.replace(/(lifeos|finance|nutrition)\/[^/]*$/, "")
      : p.replace(/[^/]*$/, "");
    navigator.serviceWorker.register(base + "sw.js").catch((e) => console.warn("SW falhou", e));
  }

  // ---- Prompt de instalação -------------------------------------------
  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredPrompt = e; });

  async function promptInstall() {
    if (deferredPrompt) { deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; }
    else toast("No telemóvel: menu do browser → 'Adicionar ao ecrã principal'.", 3600);
  }

  // ---- Navegação inferior partilhada ----------------------------------
  const ICON = {
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V10"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    tasks: '<path d="M9 6h12M9 12h12M9 18h12"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>',
    money: '<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="12" cy="12" r="3"/>',
    food: '<path d="M6 2v7a3 3 0 0 0 6 0V2M9 2v20M16 2c-1.5 1-2 3-2 6s.5 4 2 5v9"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  };
  function tabbar(active) {
    const base = /\/(lifeos|finance|nutrition)\//.test(location.pathname) ? "../" : "./";
    const items = [
      { id: "home", href: base, label: "Início", icon: ICON.grid },
      { id: "lifeos", href: base + "lifeos/", label: "Espiritual", icon: ICON.tasks },
      { id: "finance", href: base + "finance/", label: "Finanças", icon: ICON.money },
      { id: "nutrition", href: base + "nutrition/", label: "Nutrição", icon: ICON.food },
      { id: "settings", href: "#settings", label: "Ajustes", icon: ICON.settings },
    ];
    const nav = el("nav", { class: "tabbar" });
    items.forEach((it) => {
      const a = el("a", { href: it.href, class: it.id === active ? "active" : "", html: UI.svgIcon(it.icon, 23) + `<span>${it.label}</span>` });
      if (it.id === "settings") a.addEventListener("click", (e) => { e.preventDefault(); openSettings(); });
      nav.appendChild(a);
    });
    document.body.appendChild(nav);
  }

  // ---- Definições (partilhado) ----------------------------------------
  function openSettings() {
    const sys = Store.get("sys");
    const themeSel = UI.field("Tema", { type: "select", value: sys.theme || "auto",
      options: [{ value: "auto", label: "Automático (segue o sistema)" }, { value: "light", label: "Claro" }, { value: "dark", label: "Escuro" }] });
    themeSel.input.addEventListener("change", () => { Store.update("sys", (s) => { s.theme = themeSel.input.value; }); applyTheme(); });

    // Estado da sync
    const syncState = el("div", { class: "pill" });
    const refreshState = () => {
      const s = Sync.status; const map = { off: ["Desligada", "var(--text-mute)"], ready: ["Ligada ✓", "var(--good)"], syncing: ["A sincronizar…", "var(--accent)"], error: ["Erro", "var(--bad)"] };
      const [t, c] = map[s] || map.off; syncState.innerHTML = `<span class="dot" style="background:${c}"></span>${t}`;
    };
    Sync.onStatus(refreshState);

    const cur = (Store.get("sys").sync) || {};
    const fUrl = UI.field("URL do projeto Supabase", { value: cur.url || "", placeholder: "https://xxxx.supabase.co" });
    const fKey = UI.field("Chave anónima (anon public)", { value: cur.key || "", placeholder: "eyJ..." });
    const fCode = UI.field("Código de sincronização (igual nos 2 dispositivos)", { value: cur.code || "", placeholder: "ex: rodrigo-2026" });

    const saveSync = el("button", { class: "btn btn-primary btn-block", text: "Ligar / Guardar sincronização", onclick: async () => {
      const c = { url: fUrl.input.value.trim(), key: fKey.input.value.trim(), code: fCode.input.value.trim() };
      if (!c.url || !c.key || !c.code) return toast("Preenche os 3 campos.");
      try { await Sync.test(c); } catch (e) { return toast("Falha: " + e.message, 4000); }
      Store.update("sys", (s) => { s.sync = c; });
      Sync.reload(); toast("Sincronização ligada ✓");
    }});

    const syncNow = el("button", { class: "btn btn-block", text: "↻ Sincronizar agora", onclick: async () => { if (!Sync.enabled) return toast("Liga a sincronização primeiro."); toast("A sincronizar…"); await Sync.pullAll(); toast("Sincronizado ✓"); } });

    const help = el("details", { class: "card", style: "margin-top:4px" }, [
      el("summary", { style: "cursor:pointer;font-weight:600", text: "Como ativar a sincronização grátis (1x, ~3 min)" }),
      el("ol", { class: "muted tiny", style: "line-height:1.7;padding-left:18px" }, [
        el("li", { html: 'Cria conta grátis em <a class="link" href="https://supabase.com" target="_blank">supabase.com</a> (sem cartão) e cria um projeto.' }),
        el("li", { text: "No projeto: SQL Editor → cola o código abaixo → RUN." }),
        el("li", { text: "Em Project Settings → API copia o 'Project URL' e a 'anon public' key para os campos acima." }),
        el("li", { text: "Define um código de sincronização e usa o MESMO no telemóvel e no PC." }),
      ]),
      el("pre", { class: "tiny", style: "white-space:pre-wrap;background:var(--surface-2);padding:12px;border-radius:10px;overflow:auto", text: Sync.sqlSchema }),
    ]);

    // Integração com a app de Ginásio
    const curGym = Store.get("sys").gymUrl || "https://rblucas2.github.io/gymos/";
    const fGym = el("input", { type: "url", value: curGym, placeholder: "https://.../gymos/" });
    fGym.addEventListener("change", () => { Store.update("sys", (s) => { s.gymUrl = fGym.value.trim(); }); toast("Guardado ✓"); });
    const gymField = el("label", { class: "field" }, [el("span", { text: "URL da app de Ginásio (gymos)" }), fGym,
      el("div", { class: "tiny muted", style: "margin-top:6px", html: Domain.gymConnected() ? "✓ Ligada — treinos detetados neste dispositivo." : "Para ler os treinos, publica esta suite na mesma conta GitHub (mesma origem que o gymos)." })]);

    // Google Calendar
    const gc = Store.get("sys").gcal || {};
    const fCid = el("input", { type: "text", value: gc.clientId || "", placeholder: "…apps.googleusercontent.com" });
    const fCal = el("input", { type: "text", value: gc.calendarId || "primary", placeholder: "primary" });
    const gcState = el("span", { class: "pill" });
    const refreshGc = () => { const c = (typeof GCal !== "undefined") && GCal.connected(); gcState.innerHTML = `<span class="dot" style="background:${c ? "var(--good)" : "var(--text-mute)"}"></span>${c ? "Ligado ✓" : (fCid.value.trim() ? "Configurado" : "Desligado")}`; };
    if (typeof GCal !== "undefined") GCal.onChange(refreshGc);
    const gcSave = el("button", { class: "btn btn-block", text: "Guardar Client ID", onclick: () => { Store.update("sys", (s) => { s.gcal = { clientId: fCid.value.trim(), calendarId: fCal.value.trim() || "primary" }; }); toast("Guardado ✓"); refreshGc(); } });
    const gcConnect = el("button", { class: "btn btn-primary btn-block", text: "Ligar Google Calendar", onclick: async () => {
      if (!fCid.value.trim()) return toast("Cola o Client ID e guarda primeiro.");
      Store.update("sys", (s) => { s.gcal = { clientId: fCid.value.trim(), calendarId: fCal.value.trim() || "primary" }; });
      try { await GCal.connect(true); toast("Google Calendar ligado ✓"); } catch (e) { toast("Falha: " + e.message, 4500); }
    }});
    const gcHelp = el("details", { class: "card", style: "margin-top:4px" }, [
      el("summary", { style: "cursor:pointer;font-weight:600", text: "Como ligar o Google Calendar (1x, ~5 min)" }),
      el("ol", { class: "muted tiny", style: "line-height:1.7;padding-left:18px" }, [
        el("li", { html: 'Abre <a class="link" href="https://console.cloud.google.com/" target="_blank">console.cloud.google.com</a> e cria um projeto (grátis).' }),
        el("li", { text: "APIs & Services → Library → ativa 'Google Calendar API'." }),
        el("li", { text: "OAuth consent screen → External → preenche o nome e adiciona-te em 'Test users'." }),
        el("li", { text: "Credentials → Create credentials → OAuth client ID → tipo 'Web application'." }),
        el("li", { html: 'Em "Authorized JavaScript origins" adiciona exatamente: <b>' + location.origin + '</b>' }),
        el("li", { text: "Copia o 'Client ID' (…apps.googleusercontent.com), cola acima, Guardar → Ligar." }),
      ]),
    ]);
    const gcalField = el("div", {}, [
      el("div", { class: "row" }, [el("span", { class: "tiny muted", text: "Estado:" }), gcState]),
      el("label", { class: "field", style: "margin-top:8px" }, [el("span", { text: "Client ID do Google" }), fCid]),
      el("label", { class: "field", style: "margin-top:8px" }, [el("span", { text: "Calendário (id ou 'primary')" }), fCal]),
      el("div", { class: "row", style: "gap:10px;margin-top:8px" }, [gcSave, gcConnect]),
      gcHelp,
    ]);
    setTimeout(refreshGc, 0);

    const exportBtn = el("button", { class: "btn btn-block", text: "Exportar cópia de segurança (.json)", onclick: () => {
      const blob = new Blob([JSON.stringify(Store.exportAll(), null, 2)], { type: "application/json" });
      const a = el("a", { href: URL.createObjectURL(blob), download: `vidaos-backup-${UI.todayISO()}.json` }); a.click();
    }});
    const importInput = el("input", { type: "file", accept: "application/json", class: "hide" });
    importInput.addEventListener("change", async () => {
      const f = importInput.files[0]; if (!f) return;
      try { const obj = JSON.parse(await f.text()); Store.importAll(obj); toast("Dados importados ✓"); }
      catch (e) { toast("Ficheiro inválido."); }
    });
    const importBtn = el("button", { class: "btn btn-block", text: "Importar cópia (.json)", onclick: () => importInput.click() });

    UI.sheet("Definições", [
      el("div", { class: "section-title", style: "margin-top:4px", text: "Aparência" }), themeSel,
      el("button", { class: "btn btn-soft btn-block", text: "Instalar app no dispositivo", onclick: promptInstall }),
      el("div", { class: "section-title", text: "Integração · Ginásio" }), gymField,
      el("div", { class: "section-title", text: "Integração · Google Calendar" }), gcalField,
      el("div", { class: "section-title", text: "Sincronização telemóvel ↔ PC" }),
      el("div", { class: "row" }, [el("span", { class: "muted tiny", text: "Estado:" }), syncState]),
      fUrl, fKey, fCode, saveSync, syncNow, help,
      el("div", { class: "section-title", text: "Cópia de segurança" }),
      exportBtn, importBtn, importInput,
      el("p", { class: "tiny muted center", style: "margin-top:18px", text: "Vida OS · dados guardados no teu dispositivo" }),
    ]);
    refreshState();
  }

  // ---- Onboarding (1ª utilização de cada app) -------------------------
  function onboard(appId, title, lines) {
    const sys = Store.get("sys");
    if (sys.onboarded && sys.onboarded[appId]) return;
    const ul = el("ul", { class: "muted", style: "line-height:1.7;padding-left:20px;font-size:.92rem" }, lines.map((l) => el("li", { html: l })));
    const s = UI.sheet(title, [
      el("p", { class: "muted tiny", text: "Bem-vindo 👋 — tudo fica guardado no teu dispositivo." }), ul,
      el("button", { class: "btn btn-primary btn-block", text: "Começar", onclick: () => { Store.update("sys", (st) => { st.onboarded = st.onboarded || {}; st.onboarded[appId] = true; }, { silent: true }); s.close(); } }),
    ]);
  }

  // ---- API pública ----------------------------------------------------
  const App = {
    boot({ active } = {}) {
      Store.ensure("sys", { theme: "auto" });
      applyTheme();
      registerSW();
      Sync.init();
      if (active) tabbar(active);
      // sincroniza UI quando o sync trouxer dados novos
      Store.subscribe("*", () => { /* cada app trata do seu render via subscribe próprio */ });
    },
    applyTheme, promptInstall, openSettings, tabbar, onboard,
  };
  global.App = App;
})(window);
