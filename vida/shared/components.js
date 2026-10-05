/* =====================================================================
   components.js — blocos de interface partilhados (cabeçalhos, painéis,
   cartões KPI, seletores de data) + motor de separadores editáveis
   (reordenar, renomear, esconder, criar separadores de notas).
   ===================================================================== */
(function (global) {
  const { el, $, clear, toast, sheet, field, uid, guardClick } = UI;

  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const ico = (name, size = 20) => el("span", { class: "ico", style: "display:inline-flex", html: UI.icon(name, size) });
  const btnI = (cls, iconName, label, onclick) => el("button", { class: "btn " + cls, "aria-label": label, onclick }, [ico(iconName, 18), el("span", { text: label })]);

  function pageHead({ eyebrow, icon, title, sub, actions }) {
    const eb = eyebrow ? el("div", { class: "eyebrow" }, [icon ? ico(icon, 16) : null, el("span", { text: eyebrow })]) : null;
    return el("div", { class: "page-head" }, [
      el("div", { class: "ph-text" }, [eb, el("h1", { class: "page-title", text: title }), sub ? el("p", { class: "page-sub", text: sub }) : null]),
      actions && actions.filter(Boolean).length ? el("div", { class: "ph-actions" }, actions.filter(Boolean)) : null,
    ]);
  }

  function panel({ title, sub, icon, action, cls }, children) {
    const head = title ? el("div", { class: "panel-head" }, [
      el("div", {}, [el("h2", { class: "panel-title", text: title }), sub ? el("div", { class: "panel-sub", text: sub }) : null]),
      action || (icon ? el("span", { class: "panel-ico", html: UI.icon(icon, 26) }) : null),
    ]) : null;
    return el("section", { class: "panel" + (cls ? " " + cls : "") }, [head, ...children.filter((c) => c != null && c !== false)]);
  }
  const linkBtn = (text, onclick) => el("button", { class: "link-btn", onclick }, [el("span", { text }), ico("right", 18)]);

  function kpi({ label, value, sub, icon, variant, onClick }) {
    return el(onClick ? "button" : "div", { class: "kpi-card" + (variant ? " is-" + variant : ""), type: onClick ? "button" : null, onclick: onClick || null }, [
      el("div", { class: "k-label", text: label }),
      el("span", { class: "k-ico", html: UI.icon(icon, 20) }),
      el("div", { class: "k-value", text: value }),
      sub ? el("div", { class: "k-sub", text: sub }) : null,
    ]);
  }

  /** Seletor de dia ‹ [quarta, 7 out] › com atalho para hoje. */
  function dayPill(iso, onChange) {
    const today = UI.todayISO();
    const d = new Date(iso + "T00:00:00");
    const label = iso === today ? "Hoje" : iso === shiftDay(today, -1) ? "Ontem" : iso === shiftDay(today, 1) ? "Amanhã" : cap(d.toLocaleDateString("pt-PT", { weekday: "short", day: "numeric", month: "short" }));
    const picker = el("input", { type: "date", class: "hide", value: iso, "aria-label": "Escolher dia" });
    picker.addEventListener("change", () => { if (picker.value) onChange(picker.value); });
    return el("div", { class: "month-pill" }, [
      el("button", { class: "mp-btn", "aria-label": "Dia anterior", html: UI.icon("left", 20), onclick: () => onChange(shiftDay(iso, -1)) }),
      el("div", { class: "mp-label", title: "Escolher dia", onclick: () => { try { picker.showPicker(); } catch (e) { picker.click(); } } }, [ico("calendar", 18), el("span", { text: label })]),
      picker,
      iso !== today ? el("button", { class: "mp-btn mp-today", title: "Voltar a hoje", "aria-label": "Hoje", text: "•", onclick: () => onChange(today) }) : null,
      el("button", { class: "mp-btn", "aria-label": "Dia seguinte", html: UI.icon("right", 20), onclick: () => onChange(shiftDay(iso, 1)) }),
    ]);
  }
  function shiftDay(iso, n) { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return UI.isoDate(d); }
  function mondayOf(iso) { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return UI.isoDate(d); }
  function daysBetween(a, b) { return Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000); }

  /** Seletor de mês ‹ [Outubro 2026] ›. get/set: funções para ler/escrever o mês ("YYYY-MM"). */
  function monthPill(mk, onChange) {
    const picker = el("input", { type: "month", class: "hide", value: mk, "aria-label": "Escolher mês" });
    picker.addEventListener("change", () => { if (picker.value) onChange(picker.value); });
    const shift = (n) => { const [y, m] = mk.split("-").map(Number); onChange(UI.monthKey(new Date(y, m - 1 + n, 1))); };
    return el("div", { class: "month-pill" }, [
      el("button", { class: "mp-btn", "aria-label": "Mês anterior", html: UI.icon("left", 20), onclick: () => shift(-1) }),
      el("div", { class: "mp-label", onclick: () => { try { picker.showPicker(); } catch (e) { picker.click(); } } }, [ico("calendar", 18), el("span", { text: cap(UI.prettyMonth(mk)) })]),
      picker,
      el("button", { class: "mp-btn", "aria-label": "Mês seguinte", html: UI.icon("right", 20), onclick: () => shift(1) }),
    ]);
  }

  /** Caixa de verificação redonda (tarefas, hábitos). */
  function checkBtn(on, onclick, label) {
    return el("button", { class: "chk" + (on ? " on" : ""), "aria-label": label || (on ? "Desmarcar" : "Marcar"), "aria-pressed": on ? "true" : "false", html: on ? UI.icon("check", 16) : "", onclick: (e) => { e.stopPropagation(); onclick(); } });
  }

  /** Barras verticais arredondadas: series = [{label, value, title, cur, tone}] */
  function barChart(series, { onPick, max } = {}) {
    const m = max || Math.max(1, ...series.map((x) => Math.abs(x.value)));
    return el("div", { class: "evo" }, series.map((x) => el("div", { class: "ev-col" + (x.cur ? " cur" : ""), title: x.title || "", onclick: onPick ? () => onPick(x) : null }, [
      el("div", { class: "ev-bar" + (x.value < 0 ? " neg" : "") + (x.tone ? " " + x.tone : ""), style: `height:max(${x.value ? 8 : 3}px, calc((100% - 34px) * ${(Math.abs(x.value) / m).toFixed(4)}))` }),
      el("div", { class: "ev-lbl", text: x.label }),
    ])));
  }

  /** Mapa de calor de dias (estilo GitHub): values = { iso: 0..1 }, semanas a terminar hoje. */
  function heatmap(values, { weeks = 16, onPick } = {}) {
    const today = UI.todayISO();
    const start = shiftDay(mondayOf(today), -7 * (weeks - 1));
    const grid = el("div", { class: "heat", style: `grid-template-columns:repeat(${weeks}, minmax(0, 24px))` });
    for (let w = 0; w < weeks; w++) {
      for (let d = 0; d < 7; d++) {
        const iso = shiftDay(start, w * 7 + d);
        const v = values[iso] || 0;
        const future = iso > today;
        grid.appendChild(el("div", { class: "hc" + (future ? " fut" : "") + (iso === today ? " today" : ""), title: iso, style: `grid-column:${w + 1};grid-row:${d + 1};${v ? `background:color-mix(in srgb, var(--accent) ${Math.round(25 + v * 75)}%, var(--surface-3))` : ""}`, onclick: onPick && !future ? () => onPick(iso) : null }));
      }
    }
    return grid;
  }

  /* ----------------------------- MOTOR DE SEPARADORES -----------------------------
     Tabs.init({ ns, builtins:[{id,type,name}], renderers:{type: fn(view, tab)}, onRender })
     Guarda a lista em Store[ns].tabs (sincronizada). Tipo personalizado incluído: "notes". */
  const Tabs = (function () {
    let cfg = null, current = "";
    const allTabs = () => (Store.get(cfg.ns).tabs || []);
    const visible = () => allTabs().filter((t) => !t.hidden);
    const isBuiltin = (t) => cfg.builtins.some((b) => b.id === t.id);

    function ensure() {
      const have = new Set(allTabs().map((t) => t.id));
      const missing = cfg.builtins.filter((b) => !have.has(b.id));
      if (!missing.length) return;
      Store.update(cfg.ns, (s) => {
        s.tabs = s.tabs || [];
        missing.forEach((b) => {
          const bi = cfg.builtins.indexOf(b);
          let at = s.tabs.length;
          for (let j = bi - 1; j >= 0; j--) { const k = s.tabs.findIndex((t) => t.id === cfg.builtins[j].id); if (k >= 0) { at = k + 1; break; } }
          if (bi === 0) at = 0;
          s.tabs.splice(at, 0, { ...b });
        });
      }, { silent: true, keepTime: true });
    }

    function draw() {
      const bar = clear($("#tabs"));
      visible().forEach((t) => bar.appendChild(el("button", { "data-tab": t.id, class: t.id === current ? "active" : "", "aria-current": t.id === current ? "page" : null, text: t.name })));
      bar.appendChild(el("button", { class: "seg-edit", title: "Organizar separadores", "aria-label": "Organizar separadores", html: UI.icon("sliders", 18) }));
      fit();
      const active = bar.querySelector("button.active");
      if (active && active.scrollIntoView) active.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
    function fit() {
      const nav = $(".nav-in"), bar = $("#tabs"); if (!nav || !bar) return;
      nav.classList.remove("wrap2");
      if (bar.scrollWidth > bar.clientWidth + 2) nav.classList.add("wrap2");
    }

    function render(tabId) {
      const vis = visible();
      const tab = vis.find((t) => t.id === tabId) || vis[0] || cfg.builtins[0];
      const switching = current !== tab.id;
      if (switching) Store.update("sys", (s) => { s.lastTab = tab.id; }, { silent: true });
      current = tab.id;
      draw();
      const y = window.scrollY;
      const view = clear($("#view"));
      const fn = cfg.renderers[tab.type] || (tab.type === "notes" ? renderNotes : null) || cfg.renderers[cfg.builtins[0].type];
      fn(view, tab);
      window.scrollTo(0, switching ? 0 : y);
      if (cfg.onRender) cfg.onRender(tab);
    }

    function renderNotes(view, tab) {
      view.appendChild(pageHead({ eyebrow: "Notas", icon: "notes", title: tab.name, sub: "Guarda sozinho e sincroniza entre dispositivos.", actions: [btnI("btn-lg", "sliders", "Editar", () => editTab(tab))] }));
      const area = el("textarea", { class: "notes-area", placeholder: "Escreve aqui…", "aria-label": tab.name });
      area.value = tab.body || "";
      const state = el("div", { class: "tiny muted", style: "text-align:right;min-height:18px;margin-top:8px" });
      let t = null;
      area.addEventListener("input", () => {
        state.textContent = "…"; clearTimeout(t);
        t = setTimeout(() => { Store.update(cfg.ns, (s) => { const x = s.tabs.find((y) => y.id === tab.id); if (x) x.body = area.value; }, { silent: true }); state.textContent = "Guardado ✓"; }, 600);
      });
      view.appendChild(panel({}, [area, state]));
    }

    function manage() {
      const list = el("div", { class: "list" });
      function move(i, d) { Store.update(cfg.ns, (s) => { const j = i + d; if (j < 0 || j >= s.tabs.length) return; [s.tabs[i], s.tabs[j]] = [s.tabs[j], s.tabs[i]]; }); drawList(); }
      function toggleHidden(t) {
        if (!t.hidden && visible().length <= 1) return toast("Tem de ficar pelo menos um separador visível.");
        Store.update(cfg.ns, (s) => { const x = s.tabs.find((y) => y.id === t.id); if (x) x.hidden = !x.hidden; });
        drawList();
      }
      function drawList() {
        clear(list);
        allTabs().forEach((t, i, arr) => list.appendChild(el("div", { class: "item tab-item" + (t.hidden ? " is-hidden" : "") }, [
          el("div", { class: "grow", style: "cursor:pointer", onclick: () => editTab(t, sh) }, [el("div", { class: "t", text: t.name }), el("div", { class: "s", text: (isBuiltin(t) ? "Base" : "Notas") + (t.hidden ? " · escondido" : "") })]),
          el("button", { class: "btn btn-ghost btn-icon btn-sm", title: t.hidden ? "Mostrar" : "Esconder", "aria-label": t.hidden ? "Mostrar" : "Esconder", text: t.hidden ? "◌" : "◉", onclick: () => toggleHidden(t) }),
          el("button", { class: "btn btn-ghost btn-icon btn-sm", title: "Subir", "aria-label": "Subir", text: "↑", disabled: i === 0, onclick: () => move(i, -1) }),
          el("button", { class: "btn btn-ghost btn-icon btn-sm", title: "Descer", "aria-label": "Descer", text: "↓", disabled: i === arr.length - 1, onclick: () => move(i, 1) }),
        ])));
      }
      drawList();
      const sh = sheet("Separadores", [
        el("p", { class: "tiny muted", text: "Toca num separador para o renomear. ◉ visível · ◌ escondido. A ordem sincroniza entre dispositivos." }),
        list,
        el("button", { class: "btn btn-primary btn-block", text: "+ Novo separador de notas", onclick: () => editTab(null, sh) }),
      ]);
      return sh;
    }

    function editTab(tab, parentSheet) {
      const isNew = !tab;
      const builtin = tab && isBuiltin(tab);
      tab = tab ? JSON.parse(JSON.stringify(tab)) : { id: "tab_" + uid(), type: "notes", name: "", body: "" };
      const fName = field("Nome", { value: tab.name, placeholder: "ex: Ideias, Leituras, Metas 2027…" });
      const back = (reopen = true) => { sh.close(); if (parentSheet) { parentSheet.close(); if (reopen) manage(); } };
      const original = builtin ? cfg.builtins.find((b) => b.id === tab.id).name : null;
      const sh = sheet(isNew ? "Novo separador de notas" : "Editar separador", [
        fName,
        builtin ? el("p", { class: "tiny muted", text: "Separador base — podes mudar o nome ou escondê-lo, mas não apagá-lo." }) : null,
        el("div", { class: "row", style: "gap:10px;margin-top:8px" }, [
          !isNew && !builtin ? el("button", { class: "btn btn-danger btn-block", text: "Apagar", onclick: async () => {
            if (!(await UI.confirm(`Apagar o separador "${tab.name}" e as notas dele?`, { ok: "Apagar", danger: true }))) return;
            if (current === tab.id) current = "";
            Store.update(cfg.ns, (s) => { s.tabs = s.tabs.filter((x) => x.id !== tab.id); });
            back();
          } }) : null,
          builtin && original !== tab.name ? el("button", { class: "btn btn-block", text: "Repor nome", onclick: () => { Store.update(cfg.ns, (s) => { const x = s.tabs.find((y) => y.id === tab.id); if (x) x.name = original; }); back(); } }) : null,
          el("button", { class: "btn btn-primary btn-block", text: "Guardar", onclick: guardClick(() => {
            const name = fName.input.value.trim(); if (!name) return toast("Dá um nome ao separador.");
            const data = { ...tab, name };
            Store.update(cfg.ns, (s) => { s.tabs = s.tabs || []; const i = s.tabs.findIndex((x) => x.id === data.id); if (i >= 0) s.tabs[i] = data; else s.tabs.push(data); });
            toast("Guardado ✓"); back(!isNew);
            if (isNew) render(data.id);
          }) }),
        ]),
      ]);
    }

    return {
      init(c) {
        cfg = c;
        ensure();
        $("#tabs").addEventListener("click", (e) => {
          if (e.target.closest(".seg-edit")) return manage();
          const b = e.target.closest("button[data-tab]"); if (!b) return;
          render(b.dataset.tab);
        });
        const brand = $(".brand");
        if (brand) brand.addEventListener("click", (e) => { e.preventDefault(); const f = visible()[0]; if (f) render(f.id); });
        window.addEventListener("resize", fit);
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
        render(Store.get("sys").lastTab || cfg.builtins[0].id);
      },
      render, manage, editTab,
      get current() { return current; },
      has(id) { return visible().some((t) => t.id === id); },
    };
  })();

  global.C = { cap, ico, btnI, pageHead, panel, linkBtn, kpi, dayPill, monthPill, shiftDay, mondayOf, daysBetween, checkBtn, barChart, heatmap };
  global.Tabs = Tabs;
})(window);
