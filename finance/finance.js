/* =====================================================================
   Finanças Pessoais
   ===================================================================== */
(function () {
  const { el, $, clear, eur, eur0, num, toast, undo, sheet, field, bar, donut, colorFor, uid, todayISO, monthKey, prettyMonth } = UI;
  const D = Domain;
  const NS = "fin";

  let viewMonth = monthKey();   // mês em análise (Resumo/Orçamentos)

  function init() {
    App.boot({ active: "finance" });
    Store.ensure(NS, { transactions: [], budgets: {}, assets: [], categoryRules: {}, nwHistory: {}, recurring: [], sources: [], categories: [] });
    seedFinance();
    applyRecurring();
    App.onboard("finance", "Finanças", [
      "⇪ Importa o <b>CSV do banco</b> — categorias automáticas que aprendem com as tuas correções.",
      "↻ Define <b>movimentos recorrentes</b> (renda, ordenado, subscrições).",
      "🎯 <b>Orçamentos</b> com alertas e <b>Dinheiro Livre</b> do mês.",
      "📊 <b>Net Worth</b> com evolução ao longo do tempo.",
    ]);
    $("#settingsBtn").addEventListener("click", App.openSettings);
    const tabs = $("#tabs");
    tabs.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-tab]"); if (!b) return;
      [...tabs.children].forEach((c) => c.classList.toggle("active", c === b));
      render(b.dataset.tab);
    });
    Store.subscribe(NS, () => render(current));
    render("resumo");
  }

  let current = "resumo";
  function render(tab) {
    current = tab;
    const view = clear($("#view"));
    ({ resumo: renderResumo, tx: renderTx, budgets: renderBudgets, savings: renderSavings, net: renderNet }[tab] || renderResumo)(view);
  }

  function monthNav(onChange) {
    const prev = el("button", { class: "btn btn-ghost btn-sm", text: "‹", onclick: () => shift(-1) });
    const next = el("button", { class: "btn btn-ghost btn-sm", text: "›", onclick: () => shift(1) });
    const label = el("strong", { text: prettyMonth(viewMonth), style: "min-width:140px;text-align:center" });
    function shift(d) {
      const [y, m] = viewMonth.split("-").map(Number);
      const dt = new Date(y, m - 1 + d, 1); viewMonth = monthKey(dt); onChange();
    }
    return el("div", { class: "row", style: "justify-content:center;gap:6px;margin-bottom:6px" }, [prev, label, next]);
  }

  /* ----------------------------- RESUMO ----------------------------- */
  function monthlySeries(fin, endMk, n = 6) {
    const out = [];
    const [ey, em] = endMk.split("-").map(Number);
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(ey, em - 1 - i, 1); const mk = monthKey(d);
      const s = D.financeSummary(fin, mk);
      out.push({ mk, label: UI.MONTHS[d.getMonth()].slice(0, 3), income: s.income, expense: s.expense, net: s.balance });
    }
    return out;
  }
  function dailyCumulative(fin, mk) {
    const tx = D.txInMonth(fin.transactions, mk).filter((t) => t.type === "expense");
    const days = new Date(+mk.slice(0, 4), +mk.slice(5) , 0).getDate();
    const perDay = new Array(days).fill(0);
    tx.forEach((t) => { const d = parseInt((t.date || "").slice(8, 10), 10); if (d >= 1 && d <= days) perDay[d - 1] += t.amount; });
    let acc = 0; return perDay.map((v) => (acc += v));
  }

  function renderResumo(view) {
    const fin = Store.get(NS);
    const s = D.financeSummary(fin, viewMonth, essentialSet());
    $("#subtitle").textContent = "Visão geral";

    // HERO — Dinheiro livre
    const hero = el("div", { class: "hero" }, [
      el("div", { class: "label", text: "Dinheiro livre" }),
      el("div", { class: "value", text: eur(s.free) }),
      el("div", { class: "foot", text: `${UI.prettyMonth(viewMonth)} · rend. ${eur0(s.income)} − gastos ${eur0(s.expense)} − compromissos ${eur0(s.committed)}` }),
    ]);

    const kpis = el("div", { class: "grid-2" }, [
      kpiCard("Rendimentos", eur(s.income), "var(--good)", "↑"),
      kpiCard("Despesas", eur(s.expense), "var(--bad)", "↓"),
    ]);

    // Evolução mensal (receitas vs despesas) — 6 meses
    const series = monthlySeries(fin, viewMonth, 6);
    const maxV = Math.max(1, ...series.map((m) => Math.max(m.income, m.expense)));
    const bars = el("div", { class: "row", style: "align-items:flex-end;gap:10px;height:120px;margin-top:14px" });
    series.forEach((m) => {
      const cur = m.mk === viewMonth;
      const col = (v, c) => el("div", { style: `flex:1;max-width:14px;height:${Math.max(3, (v / maxV) * 92)}px;border-radius:5px 5px 3px 3px;background:${c};opacity:${cur ? 1 : .55}` });
      bars.appendChild(el("div", { style: "flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;height:100%;justify-content:flex-end" }, [
        el("div", { class: "row", style: "gap:3px;align-items:flex-end;height:100%;width:100%;justify-content:center" }, [col(m.income, "var(--good)"), col(m.expense, "var(--bad)")]),
        el("div", { class: "tiny muted", style: "font-size:.62rem;" + (cur ? "font-weight:800;color:var(--accent)" : ""), text: m.label }),
      ]));
    });
    const trendCard = el("div", { class: "card" }, [
      el("div", { class: "row between" }, [el("strong", { text: "Evolução (6 meses)" }),
        el("div", { class: "row", style: "gap:12px" }, [el("span", { class: "tiny", html: `<span class="dot" style="background:var(--good)"></span> Receitas` }), el("span", { class: "tiny", html: `<span class="dot" style="background:var(--bad)"></span> Despesas` })])]),
      bars,
    ]);

    // Gasto acumulado no mês (linha)
    let cumCard = null;
    const cum = dailyCumulative(fin, viewMonth);
    if (cum[cum.length - 1] > 0) {
      cumCard = el("div", { class: "card" }, [
        el("div", { class: "row between" }, [el("strong", { text: "Gasto acumulado no mês" }), el("span", { class: "num", style: "font-weight:800", text: eur0(cum[cum.length - 1]) })]),
        UI.lineChart(cum, { height: 74, color: "var(--accent)", labels: ["dia 1", "dia " + cum.length] }),
      ]);
    }

    // Donut por categoria
    const cats = Object.entries(s.byCat).sort((a, b) => b[1] - a[1]);
    let chartCard;
    if (cats.length) {
      const parts = cats.map(([name, value]) => ({ label: name, value, color: colorFor(name) }));
      const legend = el("div", { class: "legend", style: "flex:1" }, parts.slice(0, 7).map((p) => el("div", { class: "lg" }, [
        el("span", { class: "nm" }, [el("span", { class: "sw", style: "background:" + p.color }), el("span", { class: "tiny", text: p.label })]),
        el("span", { class: "vl tiny", text: eur0(p.value) + " · " + Math.round(p.value / s.expense * 100) + "%" }),
      ])));
      chartCard = el("div", { class: "card" }, [
        el("strong", { text: "Para onde foi o dinheiro" }),
        el("div", { class: "row", style: "gap:18px;margin-top:14px;align-items:center" }, [
          el("div", { class: "ringwrap", style: "flex:none;position:relative" }, [
            donut(parts, { size: 132 }),
            el("div", { style: "position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center" }, [
              el("div", { class: "num", style: "font-weight:800;font-size:1.05rem", text: eur0(s.expense) }), el("div", { class: "tiny muted", style: "font-size:.62rem", text: "gasto" })]),
          ]), legend,
        ]),
      ]);
    } else chartCard = el("div", { class: "card empty", html: '<span class="ico">📊</span>Sem despesas neste mês. Importa um CSV ou adiciona transações.' });

    // Top despesas
    const tx = D.txInMonth(fin.transactions, viewMonth).filter((t) => t.type === "expense").sort((a, b) => b.amount - a.amount).slice(0, 5);
    const topCard = el("div", { class: "card" }, [el("strong", { text: "Maiores gastos" })]);
    if (tx.length) { const list = el("div", { class: "list" }); tx.forEach((t) => list.appendChild(txRow(t, false))); topCard.appendChild(list); }
    else topCard.appendChild(el("div", { class: "empty tiny", text: "—" }));

    // Essenciais vs estilo de vida
    let ess = 0, life = 0;
    Object.entries(s.byCat).forEach(([c, v]) => { if (catGroup(c) === "essential") ess += v; else life += v; });
    const tot = ess + life || 1;
    const splitCard = el("div", { class: "card" }, [
      el("strong", { text: "Essenciais vs. Estilo de vida" }),
      el("div", { class: "row between", style: "margin-top:10px" }, [el("span", { class: "tiny", text: "Essenciais" }), el("span", { class: "tiny num", text: eur0(ess) + " · " + Math.round(ess / tot * 100) + "%" })]),
      barColored(ess / tot * 100, "var(--accent)"),
      el("div", { class: "row between", style: "margin-top:10px" }, [el("span", { class: "tiny", text: "Estilo de vida" }), el("span", { class: "tiny num", text: eur0(life) + " · " + Math.round(life / tot * 100) + "%" })]),
      barColored(life / tot * 100, "var(--warn)"),
    ]);

    view.appendChild(monthNav(() => render("resumo")));
    view.appendChild(el("div", { class: "stack" }, [hero, kpis, trendCard, cumCard, chartCard, splitCard, topCard].filter(Boolean)));
  }

  function kpiCard(k, v, color, arrow) { return el("div", { class: "card kpi pad-sm" }, [el("div", { class: "k", text: k }), el("div", { class: "v num", style: "color:" + color, text: (arrow ? arrow + " " : "") + v })]); }
  function barColored(pct, color) { const b = bar(Math.min(100, pct)); b.firstChild.style.background = color; b.style.marginTop = "6px"; return b; }

  /* ----------------------------- TRANSAÇÕES ----------------------------- */
  function renderTx(view) {
    const fin = Store.get(NS);
    $("#subtitle").textContent = fin.transactions.length + " transações";
    const search = field("Pesquisar", { placeholder: "Descrição ou categoria…" });
    const list = el("div", { class: "card list" });
    function draw() {
      const q = search.input.value.toLowerCase().trim();
      clear(list);
      const tx = [...Store.get(NS).transactions]
        .filter((t) => !q || (t.desc || "").toLowerCase().includes(q) || (t.category || "").toLowerCase().includes(q))
        .sort((a, b) => (b.date || "").localeCompare(a.date) || (b._c || 0) - (a._c || 0));
      if (!tx.length) { list.appendChild(el("div", { class: "empty", text: "Sem transações. Importa um CSV ou adiciona manualmente." })); return; }
      tx.slice(0, 400).forEach((t) => list.appendChild(txRow(t, true)));
    }
    search.input.addEventListener("input", draw); draw();

    const importInput = el("input", { type: "file", accept: ".csv,text/csv", class: "hide" });
    importInput.addEventListener("change", () => { const f = importInput.files[0]; if (f) f.text().then((txt) => importCsv(txt)); importInput.value = ""; });

    view.appendChild(el("div", { class: "stack" }, [
      el("div", { class: "row", style: "gap:10px" }, [
        el("button", { class: "btn btn-soft btn-block", html: "⇪ Importar CSV", onclick: () => importInput.click() }),
        el("button", { class: "btn btn-primary btn-block", text: "+ Manual", onclick: () => editTx(null) }),
      ]),
      el("div", { class: "row", style: "gap:10px" }, [
        el("button", { class: "btn btn-ghost btn-block btn-sm", html: "↻ Recorrentes", onclick: manageRecurring }),
        el("button", { class: "btn btn-ghost btn-block btn-sm", html: "🏷️ Categorias", onclick: manageCategories }),
        el("button", { class: "btn btn-ghost btn-block btn-sm", html: "💳 Fontes", onclick: manageSources }),
      ]),
      importInput, search, list,
    ]));
  }

  function txRow(t, editable) {
    const sign = t.type === "income" ? "+" : t.type === "transfer" ? "↔" : "−";
    const color = t.type === "income" ? "var(--good)" : t.type === "transfer" ? "var(--text-mute)" : "var(--text)";
    const src = t.account ? " · " + t.account : "";
    const row = el("div", { class: "item" }, [
      el("div", { class: "grow", style: editable ? "cursor:pointer" : "", onclick: editable ? () => editTx(t) : null }, [
        el("div", { class: "t", text: t.desc || "(sem descrição)" }),
        el("div", { class: "s", html: `<span class="pill" style="padding:1px 8px">${t.category || "Outros"}</span> &nbsp;${UI.prettyDate(t.date)}${src}` }),
      ]),
      el("div", { class: "amt", style: "color:" + color, text: sign + eur(t.amount).replace("€", "") + "€" }),
    ]);
    return row;
  }

  function editTx(t) {
    const fin = Store.get(NS);
    const isNew = !t;
    t = t || { id: uid(), date: todayISO(), desc: "", amount: "", category: "Outros", type: "expense", account: sourceNames()[0] || "Dinheiro", manual: true };
    const fType = field("Tipo", { type: "select", value: t.type, options: [{ value: "expense", label: "Despesa" }, { value: "income", label: "Receita" }, { value: "transfer", label: "Transferência (ignorada nos totais)" }] });
    const fAmount = field("Valor (€)", { type: "number", value: t.amount, inputmode: "decimal", step: "0.01" });
    const fDate = field("Data", { type: "date", value: t.date });
    const fDesc = field("Descrição", { value: t.desc, placeholder: "ex: Almoço, Ordenado…" });
    const fCat = field("Categoria", { value: t.category, list: "catlist" });
    const dl = el("datalist", { id: "catlist" }, catNames().map((c) => el("option", { value: c })));
    const fAcc = field("Fonte de pagamento", { value: t.account || "", list: "srclist", placeholder: "Dinheiro, Cartão…" });
    const dlS = el("datalist", { id: "srclist" }, sourceNames().map((c) => el("option", { value: c })));
    fDesc.input.addEventListener("blur", () => { if (!fCat.input.value || fCat.input.value === "Outros") fCat.input.value = D.categorize(fDesc.input.value, fin.categoryRules); });

    const catRow = el("div", { class: "row", style: "gap:8px;align-items:flex-end" }, [el("div", { style: "flex:1" }, [fCat]), el("button", { class: "btn btn-soft btn-icon", text: "⚙", title: "Gerir categorias", onclick: () => manageCategories() })]);
    const srcRow = el("div", { class: "row", style: "gap:8px;align-items:flex-end" }, [el("div", { style: "flex:1" }, [fAcc]), el("button", { class: "btn btn-soft btn-icon", text: "⚙", title: "Gerir fontes", onclick: () => manageSources() })]);

    const body = [
      fType, el("div", { class: "input-row" }, [fAmount, fDate]), fDesc, catRow, dl, srcRow, dlS,
      el("div", { class: "row", style: "gap:10px;margin-top:8px" }, [
        !isNew ? el("button", { class: "btn btn-block", style: "color:var(--bad)", text: "Apagar", onclick: () => { const snap = JSON.parse(JSON.stringify(t)); Store.update(NS, (s) => { s.transactions = s.transactions.filter((x) => x.id !== t.id); }); sh.close(); undo("Transação apagada", () => Store.update(NS, (s) => { s.transactions.push(snap); })); } }) : null,
        el("button", { class: "btn btn-primary btn-block", text: "Guardar", onclick: () => {
          const data = { ...t, date: fDate.input.value, desc: fDesc.input.value.trim(), amount: Math.abs(parseFloat(fAmount.input.value) || 0),
            category: fCat.input.value.trim() || "Outros", type: fType.input.value, account: fAcc.input.value.trim() || "Dinheiro", manual: t.manual !== false };
          if (!data.amount) return toast("Indica um valor.");
          Store.update(NS, (s) => {
            const i = s.transactions.findIndex((x) => x.id === data.id); if (i >= 0) s.transactions[i] = data; else { data._c = Date.now(); s.transactions.push(data); }
            // auto-regista categoria / fonte novas
            if (data.category && !s.categories.some((c) => c.name === data.category)) s.categories.push({ name: data.category, group: data.type === "income" ? "income" : "lifestyle" });
            if (data.account && !s.sources.some((x) => x.name === data.account)) s.sources.push({ id: uid(), name: data.account });
          });
          learnRule(data.desc, data.category);
          sh.close(); toast("Guardado ✓");
        }}),
      ]),
    ];
    const sh = sheet(isNew ? "Nova transação" : "Editar transação", body);
  }

  function seedFinance() {
    const fin = Store.get(NS);
    if (fin._seededV2) return;
    Store.update(NS, (s) => {
      if (!s.sources || !s.sources.length) s.sources = ["Dinheiro", "Cartão de débito", "Cartão de crédito", "MBWay", "Conta bancária"].map((n) => ({ id: uid(), name: n }));
      if (!s.categories || !s.categories.length) {
        const mk = (arr, group) => arr.map((name) => ({ name, group }));
        s.categories = [
          ...mk(["Supermercado", "Habitação", "Contas", "Saúde", "Transportes"], "essential"),
          ...mk(["Restaurantes", "Subscrições", "Compras", "Lazer", "Levantamentos", "Outros"], "lifestyle"),
          ...mk(["Salário"], "income"),
        ];
      }
      s._seededV2 = true;
    }, { silent: true });
  }
  function catNames() { const c = Store.get(NS).categories || []; const set = new Set(c.map((x) => x.name)); Store.get(NS).transactions.forEach((t) => t.category && set.add(t.category)); return [...set]; }
  function uniqueCats() { return catNames(); }
  function sourceNames() { return (Store.get(NS).sources || []).map((s) => s.name); }
  function essentialSet() { const c = Store.get(NS).categories || []; const s = c.filter((x) => x.group === "essential").map((x) => x.name); return s.length ? s : Domain.ESSENTIAL_CATS; }
  function catGroup(name) { const c = (Store.get(NS).categories || []).find((x) => x.name === name); return c ? c.group : (Domain.ESSENTIAL_CATS.includes(name) ? "essential" : "lifestyle"); }

  /* -------- Gestão de categorias e fontes de pagamento -------- */
  function manageCategories() {
    const fin = Store.get(NS);
    const list = el("div", { class: "list" });
    const GROUPS = { essential: "Essencial", lifestyle: "Estilo de vida", income: "Receita" };
    (fin.categories || []).forEach((c) => list.appendChild(el("div", { class: "item", style: "cursor:pointer", onclick: () => editCategory(c) }, [
      el("div", { class: "grow" }, [el("div", { class: "t", text: c.name }), el("div", { class: "s", text: GROUPS[c.group] || c.group })]),
      el("span", { class: "pill" + (c.group === "essential" ? " on" : ""), text: GROUPS[c.group] }),
    ])));
    sheet("Categorias", [
      el("p", { class: "tiny muted", text: "Organiza as tuas despesas e receitas. 'Essencial' vs 'Estilo de vida' alimenta os gráficos." }),
      list, el("button", { class: "btn btn-primary btn-block", text: "+ Nova categoria", onclick: () => editCategory(null) }),
    ]);
  }
  function editCategory(c) {
    const isNew = !c; const old = c ? c.name : "";
    c = c || { name: "", group: "lifestyle" };
    const fn = field("Nome", { value: c.name, placeholder: "ex: Viagens" });
    const fg = field("Grupo", { type: "select", value: c.group, options: [{ value: "essential", label: "Essencial" }, { value: "lifestyle", label: "Estilo de vida" }, { value: "income", label: "Receita" }] });
    const sh = sheet(isNew ? "Nova categoria" : "Editar categoria", [fn, fg, el("div", { class: "row", style: "gap:10px" }, [
      !isNew ? el("button", { class: "btn btn-block", style: "color:var(--bad)", text: "Apagar", onclick: () => { Store.update(NS, (s) => { s.categories = s.categories.filter((x) => x.name !== old); }); sh.close(); manageCategories(); } }) : null,
      el("button", { class: "btn btn-primary btn-block", text: "Guardar", onclick: () => {
        const name = fn.input.value.trim(); if (!name) return toast("Indica o nome.");
        Store.update(NS, (s) => {
          const i = s.categories.findIndex((x) => x.name === old);
          if (i >= 0) { s.categories[i] = { name, group: fg.input.value }; if (old !== name) s.transactions.forEach((t) => { if (t.category === old) t.category = name; }); }
          else s.categories.push({ name, group: fg.input.value });
        });
        sh.close(); manageCategories();
      }}),
    ])]);
  }
  function manageSources() {
    const fin = Store.get(NS);
    const list = el("div", { class: "list" });
    (fin.sources || []).forEach((src) => list.appendChild(el("div", { class: "item", style: "cursor:pointer", onclick: () => editSource(src) }, [
      el("div", { class: "grow t", text: src.name }), el("span", { class: "tiny muted", text: "✎" }),
    ])));
    sheet("Fontes de pagamento", [
      el("p", { class: "tiny muted", text: "Onde entra/sai o dinheiro: dinheiro, cartões, MBWay, contas…" }),
      list, el("button", { class: "btn btn-primary btn-block", text: "+ Nova fonte", onclick: () => editSource(null) }),
    ]);
  }
  function editSource(src) {
    const isNew = !src; const old = src ? src.name : "";
    src = src || { id: uid(), name: "" };
    const fn = field("Nome", { value: src.name, placeholder: "ex: Cartão Revolut" });
    const sh = sheet(isNew ? "Nova fonte" : "Editar fonte", [fn, el("div", { class: "row", style: "gap:10px" }, [
      !isNew ? el("button", { class: "btn btn-block", style: "color:var(--bad)", text: "Apagar", onclick: () => { Store.update(NS, (s) => { s.sources = s.sources.filter((x) => x.id !== src.id); }); sh.close(); manageSources(); } }) : null,
      el("button", { class: "btn btn-primary btn-block", text: "Guardar", onclick: () => {
        const name = fn.input.value.trim(); if (!name) return toast("Indica o nome.");
        Store.update(NS, (s) => { const i = s.sources.findIndex((x) => x.id === src.id); if (i >= 0) { s.sources[i].name = name; if (old !== name) s.transactions.forEach((t) => { if (t.account === old) t.account = name; }); } else s.sources.push({ id: src.id, name }); });
        sh.close(); manageSources();
      }}),
    ])]);
  }

  /* ------- Categorização que aprende com as correções do utilizador ------- */
  function learnRule(desc, category) {
    if (!desc || !category || category === "Outros") return;
    const token = (desc.toLowerCase().match(/[a-zà-ú]{4,}/gi) || []).sort((a, b) => b.length - a.length)[0];
    if (!token) return;
    if (Domain.DEFAULT_RULES[token] === category) return;     // já coberto por defeito
    if (Store.get(NS).categoryRules[token] === category) return;
    Store.update(NS, (s) => { s.categoryRules = s.categoryRules || {}; s.categoryRules[token] = category; }, { silent: true });
  }

  /* ----------------------------- RECORRENTES ----------------------------- */
  function monthsFromTo(since, to) {
    const out = []; let [y, m] = since.split("-").map(Number); const [ty, tm] = to.split("-").map(Number);
    while (y < ty || (y === ty && m <= tm)) { out.push(`${y}-${String(m).padStart(2, "0")}`); m++; if (m > 12) { m = 1; y++; } if (out.length > 60) break; }
    return out;
  }
  function applyRecurring() {
    const fin = Store.get(NS); const rec = fin.recurring || []; if (!rec.length) return;
    const now = monthKey(); const toAdd = [];
    rec.forEach((r) => {
      if (r.active === false) return;
      const since = r.since || now;
      monthsFromTo(since, now).forEach((mk) => {
        const exists = fin.transactions.some((t) => t.recurringId === r.id && (t.date || "").slice(0, 7) === mk);
        if (!exists) {
          const day = String(Math.min(28, Math.max(1, r.day || 1))).padStart(2, "0");
          toAdd.push({ id: uid(), date: `${mk}-${day}`, desc: r.desc, amount: r.amount, type: r.type, category: r.category, account: r.account || "Recorrente", manual: true, recurringId: r.id });
        }
      });
    });
    if (!toAdd.length) return;
    Store.update(NS, (s) => { toAdd.forEach((t, i) => { t._c = Date.now() + i; s.transactions.push(t); }); });
    toast(`${toAdd.length} movimento(s) recorrente(s) lançado(s)`);
  }
  function manageRecurring() {
    const fin = Store.get(NS);
    const list = el("div", { class: "list" });
    if (!fin.recurring.length) list.appendChild(el("div", { class: "empty tiny", text: "Sem movimentos recorrentes." }));
    fin.recurring.forEach((r) => list.appendChild(el("div", { class: "item", style: "cursor:pointer", onclick: () => editRecurring(r) }, [
      el("div", { class: "grow" }, [el("div", { class: "t", text: r.desc }), el("div", { class: "s", text: `${r.type === "income" ? "Receita" : "Despesa"} · dia ${r.day} · ${r.category}` })]),
      el("div", { class: "amt", style: r.type === "income" ? "color:var(--good)" : "", text: (r.type === "income" ? "+" : "−") + eur(r.amount).replace("€", "") + "€" }),
    ])));
    sheet("Movimentos recorrentes", [
      el("p", { class: "tiny muted", text: "Renda, ordenado, subscrições… lançados automaticamente todos os meses." }),
      list,
      el("button", { class: "btn btn-primary btn-block", text: "+ Novo recorrente", onclick: () => editRecurring(null) }),
    ]);
  }
  function editRecurring(r) {
    const isNew = !r;
    r = r || { id: uid(), desc: "", amount: "", type: "expense", category: "Outros", account: "Recorrente", day: 1, active: true, since: monthKey() };
    const fType = field("Tipo", { type: "select", value: r.type, options: [{ value: "expense", label: "Despesa" }, { value: "income", label: "Receita" }] });
    const fAmount = field("Valor (€)", { type: "number", value: r.amount, inputmode: "decimal" });
    const fDay = field("Dia do mês (1–28)", { type: "number", value: r.day, min: 1, max: 28, inputmode: "numeric" });
    const fDesc = field("Descrição", { value: r.desc, placeholder: "ex: Renda, Ordenado, Netflix…" });
    const fCat = field("Categoria", { value: r.category, list: "rcats" });
    const dl = el("datalist", { id: "rcats" }, catNames().map((c) => el("option", { value: c })));
    const fSrc = field("Fonte de pagamento", { value: r.account || sourceNames()[0] || "", list: "rsrc" });
    const dlS = el("datalist", { id: "rsrc" }, sourceNames().map((c) => el("option", { value: c })));
    const sh = sheet(isNew ? "Novo recorrente" : "Editar recorrente", [
      fType, el("div", { class: "input-row" }, [fAmount, fDay]), fDesc, fCat, dl, fSrc, dlS,
      el("div", { class: "row", style: "gap:10px;margin-top:8px" }, [
        !isNew ? el("button", { class: "btn btn-block", style: "color:var(--bad)", text: "Apagar", onclick: () => { Store.update(NS, (s) => { s.recurring = s.recurring.filter((x) => x.id !== r.id); }); sh.close(); manageRecurring(); } }) : null,
        el("button", { class: "btn btn-primary btn-block", text: "Guardar", onclick: () => {
          const data = { ...r, desc: fDesc.input.value.trim() || "Recorrente", amount: Math.abs(parseFloat(fAmount.input.value) || 0), type: fType.input.value, category: fCat.input.value.trim() || "Outros", account: fSrc.input.value.trim() || "Dinheiro", day: Math.min(28, Math.max(1, parseInt(fDay.input.value) || 1)) };
          if (!data.amount) return toast("Indica um valor.");
          Store.update(NS, (s) => { const i = s.recurring.findIndex((x) => x.id === data.id); if (i >= 0) s.recurring[i] = data; else s.recurring.push(data); });
          applyRecurring(); sh.close(); toast("Guardado ✓");
        }}),
      ]),
    ]);
  }

  /* ----------------------------- IMPORTAÇÃO CSV ----------------------------- */
  function parseCSV(text) {
    // deteta delimitador
    const firstLine = text.split(/\r?\n/).find((l) => l.trim()) || "";
    const delim = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ";" : ",";
    const rows = []; let row = [], cell = "", inQ = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQ) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; } else cell += ch; }
      else if (ch === '"') inQ = true;
      else if (ch === delim) { row.push(cell); cell = ""; }
      else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else if (ch === "\r") { /* skip */ }
      else cell += ch;
    }
    if (cell.length || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((c) => c.trim() !== ""));
  }

  function parseNum(s) {
    if (s == null) return NaN;
    s = String(s).replace(/\s|€|EUR/gi, "").trim();
    if (!s) return NaN;
    // formato PT: 1.234,56 -> remove '.', troca ',' por '.'
    if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
    return parseFloat(s);
  }
  function parseDate(s) {
    s = String(s).trim();
    let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`;
    m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
    if (m) { let y = m[3]; if (y.length === 2) y = "20" + y; return `${y}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`; }
    return null;
  }

  function importCsv(text) {
    const rows = parseCSV(text);
    if (rows.length < 2) return toast("CSV vazio ou ilegível.");
    // tenta encontrar a linha de cabeçalho (a que tem palavras conhecidas)
    let headerIdx = rows.findIndex((r) => r.join(" ").toLowerCase().match(/data|date|descri|montante|valor|amount|d[eé]bito|cr[eé]dito/));
    if (headerIdx < 0) headerIdx = 0;
    const headers = rows[headerIdx].map((h) => h.trim());
    const dataRows = rows.slice(headerIdx + 1);
    const lc = headers.map((h) => h.toLowerCase());
    const find = (...keys) => { for (const k of keys) { const i = lc.findIndex((h) => h.includes(k)); if (i >= 0) return i; } return -1; };
    const guess = {
      date: find("data valor", "data mov", "data", "date"),
      desc: find("descri", "descriç", "movimento", "concept", "detalhe", "description"),
      amount: find("montante", "valor", "amount", "import"),
      debit: find("débito", "debito", "debit"),
      credit: find("crédito", "credito", "credit"),
    };

    // UI de mapeamento + pré-visualização
    const opts = [{ value: -1, label: "—" }, ...headers.map((h, i) => ({ value: i, label: h || ("Coluna " + (i + 1)) }))];
    const mDate = field("Coluna da Data", { type: "select", value: guess.date, options: opts });
    const mDesc = field("Coluna da Descrição", { type: "select", value: guess.desc, options: opts });
    const mAmount = field("Coluna do Valor (com sinal)", { type: "select", value: guess.amount, options: opts });
    const mDebit = field("Coluna Débito (opcional)", { type: "select", value: guess.debit, options: opts });
    const mCredit = field("Coluna Crédito (opcional)", { type: "select", value: guess.credit, options: opts });
    const preview = el("div", { class: "card list", style: "max-height:240px;overflow:auto" });

    function build() {
      const di = +mDate.input.value, dei = +mDesc.input.value, ai = +mAmount.input.value, dbi = +mDebit.input.value, cri = +mCredit.input.value;
      const rules = Store.get(NS).categoryRules;
      const out = [];
      dataRows.forEach((r) => {
        const date = parseDate(r[di] || "");
        const desc = (r[dei] || "").trim();
        let amount = NaN, type = "expense";
        if (ai >= 0 && !isNaN(parseNum(r[ai]))) { const v = parseNum(r[ai]); amount = Math.abs(v); type = v >= 0 ? "income" : "expense"; }
        else {
          const d = dbi >= 0 ? parseNum(r[dbi]) : NaN, c = cri >= 0 ? parseNum(r[cri]) : NaN;
          if (!isNaN(c) && c > 0) { amount = c; type = "income"; }
          else if (!isNaN(d) && d > 0) { amount = d; type = "expense"; }
        }
        if (!date || isNaN(amount) || amount === 0) return;
        out.push({ id: uid(), _c: Date.now() + out.length, date, desc, amount, type, category: type === "income" ? D.categorize(desc, rules) : D.categorize(desc, rules), account: "Banco", manual: false });
      });
      return out;
    }
    function drawPreview() {
      const out = build(); clear(preview);
      preview.appendChild(el("div", { class: "tiny muted", style: "padding:4px 2px", text: out.length + " transações detetadas" }));
      out.slice(0, 8).forEach((t) => preview.appendChild(txRow(t, false)));
      sh._out = out;
    }
    [mDate, mDesc, mAmount, mDebit, mCredit].forEach((f) => f.input.addEventListener("change", drawPreview));
    drawPreview();

    const sh = sheet("Importar CSV do banco", [
      el("p", { class: "tiny muted", text: "Confirma o mapeamento das colunas. As categorias são atribuídas automaticamente." }),
      mDate, mDesc, mAmount,
      el("details", {}, [el("summary", { class: "tiny muted", style: "cursor:pointer", text: "Banco usa colunas Débito/Crédito separadas?" }), mDebit, mCredit]),
      el("div", { class: "section-title", text: "Pré-visualização" }), preview,
      el("button", { class: "btn btn-primary btn-block", text: "Importar transações", onclick: () => {
        const out = sh._out || [];
        if (!out.length) return toast("Nada para importar — verifica o mapeamento.");
        // evita duplicados simples (mesma data+valor+descrição)
        const fin = Store.get(NS);
        const seen = new Set(fin.transactions.map((t) => t.date + "|" + t.amount + "|" + (t.desc || "").slice(0, 20)));
        const fresh = out.filter((t) => !seen.has(t.date + "|" + t.amount + "|" + (t.desc || "").slice(0, 20)));
        Store.update(NS, (s) => { s.transactions.push(...fresh); });
        sh.close(); toast(`${fresh.length} importadas` + (out.length - fresh.length ? ` · ${out.length - fresh.length} duplicadas ignoradas` : ""));
      }}),
    ]);
  }

  /* ----------------------------- ORÇAMENTOS ----------------------------- */
  function renderBudgets(view) {
    const fin = Store.get(NS);
    const s = D.financeSummary(fin, viewMonth, essentialSet());
    $("#subtitle").textContent = "Orçamentos mensais";
    const cats = new Set([...Object.keys(fin.budgets), ...Object.keys(s.byCat)]);
    const list = el("div", { class: "stack" });
    if (!cats.size) list.appendChild(el("div", { class: "card empty", text: "Define limites por categoria para acompanhares os gastos." }));
    [...cats].sort().forEach((cat) => {
      const limit = fin.budgets[cat] || 0; const spent = s.byCat[cat] || 0;
      const pct = limit ? (spent / limit) * 100 : 0;
      const tone = !limit ? "" : pct >= 100 ? "bad" : pct >= 85 ? "warn" : "good";
      const b = bar(Math.min(100, pct), tone);
      list.appendChild(el("div", { class: "card", onclick: () => setBudget(cat), style: "cursor:pointer" }, [
        el("div", { class: "row", style: "justify-content:space-between" }, [
          el("strong", { text: cat }),
          el("span", { class: "tiny num " + (pct >= 100 ? "" : "muted"), style: pct >= 100 ? "color:var(--bad);font-weight:700" : "", text: limit ? `${eur0(spent)} / ${eur0(limit)}` : eur0(spent) + " (sem limite)" }),
        ]),
        b,
        limit && pct >= 85 ? el("div", { class: "tiny", style: "margin-top:6px;color:" + (pct >= 100 ? "var(--bad)" : "var(--warn)"), text: pct >= 100 ? `⚠ Ultrapassaste em ${eur0(spent - limit)}` : `Atenção: ${Math.round(pct)}% usado` }) : null,
      ]));
    });
    view.appendChild(monthNav(() => render("budgets")));
    view.appendChild(el("div", { class: "stack" }, [
      el("button", { class: "btn btn-primary btn-block", text: "+ Definir limite de categoria", onclick: () => setBudget(null) }),
      list,
    ]));
  }

  function setBudget(cat) {
    const fin = Store.get(NS);
    const fCat = field("Categoria", { value: cat || "", list: "bcats" });
    const dl = el("datalist", { id: "bcats" }, uniqueCats().map((c) => el("option", { value: c })));
    const fLim = field("Limite mensal (€)", { type: "number", value: cat ? (fin.budgets[cat] || "") : "", inputmode: "decimal" });
    const sh = sheet("Limite de orçamento", [
      fCat, dl, fLim,
      el("div", { class: "row", style: "gap:10px" }, [
        cat ? el("button", { class: "btn btn-block", style: "color:var(--bad)", text: "Remover", onclick: () => { Store.update(NS, (s) => { delete s.budgets[cat]; }); sh.close(); } }) : null,
        el("button", { class: "btn btn-primary btn-block", text: "Guardar", onclick: () => {
          const c = fCat.input.value.trim(); const v = parseFloat(fLim.input.value) || 0;
          if (!c) return toast("Indica a categoria.");
          Store.update(NS, (s) => { if (cat && cat !== c) delete s.budgets[cat]; s.budgets[c] = v; });
          sh.close(); toast("Guardado ✓");
        }}),
      ]),
    ]);
  }

  /* ----------------------------- POUPANÇA ----------------------------- */
  function savingsData(fin) {
    const months = {};
    (fin.transactions || []).forEach((t) => {
      if (t.type === "transfer") return;
      const mk = (t.date || "").slice(0, 7); if (!/^\d{4}-\d{2}$/.test(mk)) return;
      months[mk] = months[mk] || { income: 0, expense: 0 };
      if (t.type === "income") months[mk].income += t.amount; else months[mk].expense += t.amount;
    });
    const arr = Object.entries(months).map(([mk, v]) => ({ mk, save: v.income - v.expense, income: v.income, expense: v.expense })).sort((a, b) => a.mk.localeCompare(b.mk));
    const years = {}; arr.forEach((m) => { const y = m.mk.slice(0, 4); years[y] = (years[y] || 0) + m.save; });
    const total = arr.reduce((a, m) => a + m.save, 0);
    return { arr, years, total };
  }

  function renderSavings(view) {
    const fin = Store.get(NS);
    $("#subtitle").textContent = "Quanto estás a poupar";
    const { arr, years, total } = savingsData(fin);
    const curYear = String(new Date().getFullYear());
    const thisYear = years[curYear] || 0;
    const avg = arr.length ? total / arr.length : 0;

    const hero = el("div", { class: "hero" }, [
      el("div", { class: "label", text: "Poupança total" }),
      el("div", { class: "value", text: eur(total) }),
      el("div", { class: "foot", text: `${curYear}: ${eur0(thisYear)} · média ${eur0(avg)}/mês` }),
    ]);

    // Gráfico mensal de poupança (últimos 12) — verde/vermelho
    let chart = null;
    if (arr.length) {
      const last = arr.slice(-12);
      const maxV = Math.max(1, ...last.map((m) => Math.abs(m.save)));
      const bars = el("div", { class: "row", style: "align-items:center;gap:8px;height:120px;margin-top:12px;position:relative" });
      last.forEach((m) => {
        const h = Math.max(3, (Math.abs(m.save) / maxV) * 48);
        const up = m.save >= 0;
        bars.appendChild(el("div", { style: "flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:2px" }, [
          el("div", { style: "flex:1;display:flex;flex-direction:column;justify-content:flex-end;width:100%;align-items:center" }, [up ? el("div", { style: `width:100%;max-width:22px;height:${h}px;border-radius:5px 5px 0 0;background:var(--good)` }) : el("div", { style: "height:0" })]),
          el("div", { style: "height:1px;width:100%;background:var(--border-2)" }),
          el("div", { style: "flex:1;display:flex;flex-direction:column;justify-content:flex-start;width:100%;align-items:center" }, [!up ? el("div", { style: `width:100%;max-width:22px;height:${h}px;border-radius:0 0 5px 5px;background:var(--bad)` }) : el("div", { style: "height:0" })]),
          el("div", { class: "tiny muted", style: "font-size:.58rem", text: m.mk.slice(5) }),
        ]));
      });
      chart = el("div", { class: "card" }, [el("strong", { text: "Poupança por mês" }), bars]);
    }

    // Por ano
    const yearsCard = el("div", { class: "card" }, [el("strong", { text: "Por ano" })]);
    const ykeys = Object.keys(years).sort((a, b) => b.localeCompare(a));
    if (!ykeys.length) yearsCard.appendChild(el("div", { class: "empty tiny", text: "Sem dados ainda." }));
    else { const list = el("div", { class: "list" }); ykeys.forEach((y) => list.appendChild(el("div", { class: "item" }, [
      el("div", { class: "grow t", text: y }), el("div", { class: "amt", style: "color:" + (years[y] >= 0 ? "var(--good)" : "var(--bad)"), text: eur(years[y]) })])));
      yearsCard.appendChild(list); }

    // Donut: categorias onde gastou mais (ano atual)
    const byCat = {};
    (fin.transactions || []).forEach((t) => { if (t.type === "expense" && (t.date || "").slice(0, 4) === curYear) byCat[t.category] = (byCat[t.category] || 0) + t.amount; });
    const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    let catCard;
    if (cats.length) {
      const totalExp = cats.reduce((a, c) => a + c[1], 0) || 1;
      const parts = cats.map(([name, value]) => ({ label: name, value, color: colorFor(name) }));
      const legend = el("div", { class: "legend", style: "flex:1" }, parts.slice(0, 7).map((p) => el("div", { class: "lg" }, [
        el("span", { class: "nm" }, [el("span", { class: "sw", style: "background:" + p.color }), el("span", { class: "tiny", text: p.label })]),
        el("span", { class: "vl tiny", text: eur0(p.value) + " · " + Math.round(p.value / totalExp * 100) + "%" }),
      ])));
      catCard = el("div", { class: "card" }, [
        el("div", { class: "row between" }, [el("strong", { text: "Onde gastas mais" }), el("span", { class: "tiny muted", text: curYear })]),
        el("div", { class: "row", style: "gap:18px;margin-top:14px;align-items:center" }, [
          el("div", { class: "ringwrap", style: "flex:none" }, [donut(parts, { size: 132 })]), legend,
        ]),
      ]);
    } else catCard = el("div", { class: "card empty", html: '<span class="ico">🥧</span>Sem despesas este ano ainda.' });

    view.appendChild(el("div", { class: "stack" }, [hero, chart, catCard, yearsCard].filter(Boolean)));
  }

  /* ----------------------------- PATRIMÓNIO ----------------------------- */
  function renderNet(view) {
    const fin = Store.get(NS);
    const nw = D.netWorth(fin);
    $("#subtitle").textContent = "Património líquido";
    // snapshot do mês atual
    Store.update(NS, (s) => { s.nwHistory = s.nwHistory || {}; s.nwHistory[monthKey()] = nw.net; }, { silent: true });

    const head = el("div", { class: "hero" }, [
      el("div", { class: "label", text: "Património líquido" }),
      el("div", { class: "value", text: eur(nw.net) }),
      el("div", { class: "row", style: "gap:16px;margin-top:8px" }, [
        el("span", { class: "foot", html: `● Ativos ${eur0(nw.assets)}` }),
        el("span", { class: "foot", html: `● Passivos ${eur0(nw.liab)}` }),
      ]),
    ]);

    // histórico
    const hist = Object.entries(fin.nwHistory || {}).sort((a, b) => a[0].localeCompare(b[0])).slice(-12);
    let histCard = null;
    if (hist.length >= 2) {
      const delta = hist[hist.length - 1][1] - hist[0][1];
      histCard = el("div", { class: "card" }, [
        el("div", { class: "row between" }, [el("strong", { text: "Evolução" }), el("span", { class: "tiny num", style: "color:" + (delta >= 0 ? "var(--good)" : "var(--bad)"), text: (delta >= 0 ? "+" : "") + eur0(delta) })]),
        UI.lineChart(hist.map((h) => h[1]), { labels: [UI.prettyMonth(hist[0][0]).split(" ")[0], UI.prettyMonth(hist[hist.length - 1][0]).split(" ")[0]], height: 76, color: "var(--accent)" }),
      ]);
    }

    const mk = (type, title) => {
      const items = (fin.assets || []).filter((a) => (a.type === "liability") === (type === "liability"));
      const card = el("div", { class: "card" }, [el("div", { class: "row", style: "justify-content:space-between" }, [el("strong", { text: title }), el("button", { class: "btn btn-soft btn-sm", text: "+", onclick: () => editAsset(null, type) })])]);
      if (!items.length) card.appendChild(el("div", { class: "empty tiny", text: "—" }));
      else { const list = el("div", { class: "list" }); items.forEach((a) => list.appendChild(el("div", { class: "item", style: "cursor:pointer", onclick: () => editAsset(a) }, [
        el("div", { class: "grow t", text: a.name }), el("div", { class: "amt", style: type === "liability" ? "color:var(--bad)" : "", text: eur(a.value) }),
      ]))); card.appendChild(list); }
      return card;
    };

    view.appendChild(el("div", { class: "stack" }, [head, histCard, mk("asset", "Ativos (o que tens)"), mk("liability", "Passivos (o que deves)")].filter(Boolean)));
  }

  function editAsset(a, type) {
    const isNew = !a;
    a = a || { id: uid(), name: "", value: "", type: type || "asset" };
    const fName = field("Nome", { value: a.name, placeholder: "ex: Conta à ordem, Carro, Crédito…" });
    const fVal = field("Valor (€)", { type: "number", value: a.value, inputmode: "decimal" });
    const fType = field("Tipo", { type: "select", value: a.type, options: [{ value: "asset", label: "Ativo (o que tens)" }, { value: "liability", label: "Passivo (o que deves)" }] });
    const sh = sheet(isNew ? "Novo registo" : "Editar registo", [
      fName, fVal, fType,
      el("div", { class: "row", style: "gap:10px" }, [
        !isNew ? el("button", { class: "btn btn-block", style: "color:var(--bad)", text: "Apagar", onclick: () => { const snap = JSON.parse(JSON.stringify(a)); Store.update(NS, (s) => { s.assets = s.assets.filter((x) => x.id !== a.id); }); sh.close(); undo("Registo apagado", () => Store.update(NS, (s) => { s.assets.push(snap); })); } }) : null,
        el("button", { class: "btn btn-primary btn-block", text: "Guardar", onclick: () => {
          const data = { ...a, name: fName.input.value.trim() || "Sem nome", value: parseFloat(fVal.input.value) || 0, type: fType.input.value };
          Store.update(NS, (s) => { s.assets = s.assets || []; const i = s.assets.findIndex((x) => x.id === data.id); if (i >= 0) s.assets[i] = data; else s.assets.push(data); });
          sh.close(); toast("Guardado ✓");
        }}),
      ]),
    ]);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
