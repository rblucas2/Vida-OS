/* =====================================================================
   Finanças Pessoais
   ===================================================================== */
(function () {
  const { el, $, clear, eur, eur0, num, toast, sheet, field, bar, donut, colorFor, uid, todayISO, monthKey, prettyMonth } = UI;
  const D = Domain;
  const NS = "fin";

  let viewMonth = monthKey();   // mês em análise (Resumo/Orçamentos)

  function init() {
    App.boot({ active: "finance" });
    Store.ensure(NS, { transactions: [], budgets: {}, assets: [], categoryRules: {}, nwHistory: {} });
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
    ({ resumo: renderResumo, tx: renderTx, budgets: renderBudgets, net: renderNet }[tab] || renderResumo)(view);
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
  function renderResumo(view) {
    const fin = Store.get(NS);
    const s = D.financeSummary(fin, viewMonth);
    $("#subtitle").textContent = "Visão geral";

    // Dinheiro livre
    const free = el("div", { class: "card center" }, [
      el("div", { class: "k", style: "text-transform:uppercase;letter-spacing:.06em;font-size:.72rem;color:var(--text-soft)", text: "Dinheiro livre este mês" }),
      el("div", { class: "big num", style: "color:" + (s.free < 0 ? "var(--bad)" : "var(--good)") + ";margin-top:4px", text: eur(s.free) }),
      el("div", { class: "tiny muted", style: "margin-top:2px", text: `Rendimentos ${eur0(s.income)} − gastos ${eur0(s.expense)} − compromissos ${eur0(s.committed)}` }),
    ]);

    const kpis = el("div", { class: "grid-2" }, [
      kpiCard("Rendimentos", eur(s.income), "var(--good)"),
      kpiCard("Despesas", eur(s.expense), "var(--bad)"),
    ]);

    // Donut por categoria
    const cats = Object.entries(s.byCat).sort((a, b) => b[1] - a[1]);
    let chartCard;
    if (cats.length) {
      const parts = cats.map(([name, value]) => ({ label: name, value, color: colorFor(name) }));
      const legend = el("div", { style: "flex:1" }, parts.slice(0, 8).map((p) => el("div", { class: "row", style: "justify-content:space-between;padding:3px 0" }, [
        el("span", { class: "tiny", html: `<span class="dot" style="background:${p.color}"></span> ${p.label}` }),
        el("span", { class: "tiny num muted", text: eur0(p.value) + " · " + Math.round(p.value / s.expense * 100) + "%" }),
      ])));
      chartCard = el("div", { class: "card" }, [
        el("strong", { text: "Para onde foi o dinheiro" }),
        el("div", { class: "row", style: "gap:18px;margin-top:12px;align-items:center" }, [
          el("div", { class: "ringwrap", style: "flex:none" }, [donut(parts, { size: 130 })]), legend,
        ]),
      ]);
    } else chartCard = el("div", { class: "card empty", text: "Sem despesas neste mês. Importa um CSV ou adiciona transações." });

    // Top despesas
    const tx = D.txInMonth(fin.transactions, viewMonth).filter((t) => t.type === "expense").sort((a, b) => b.amount - a.amount).slice(0, 5);
    const topCard = el("div", { class: "card" }, [el("strong", { text: "Maiores gastos" })]);
    if (tx.length) { const list = el("div", { class: "list" }); tx.forEach((t) => list.appendChild(txRow(t, false))); topCard.appendChild(list); }
    else topCard.appendChild(el("div", { class: "empty tiny", text: "—" }));

    // Essenciais vs estilo de vida
    let ess = 0, life = 0;
    Object.entries(s.byCat).forEach(([c, v]) => { if (D.isEssential(c)) ess += v; else life += v; });
    const tot = ess + life || 1;
    const splitCard = el("div", { class: "card" }, [
      el("strong", { text: "Essenciais vs. Estilo de vida" }),
      el("div", { class: "row", style: "justify-content:space-between;margin-top:10px" }, [el("span", { class: "tiny", text: "Essenciais" }), el("span", { class: "tiny num", text: eur0(ess) + " · " + Math.round(ess / tot * 100) + "%" })]),
      barColored(ess / tot * 100, "var(--accent)"),
      el("div", { class: "row", style: "justify-content:space-between;margin-top:10px" }, [el("span", { class: "tiny", text: "Estilo de vida" }), el("span", { class: "tiny num", text: eur0(life) + " · " + Math.round(life / tot * 100) + "%" })]),
      barColored(life / tot * 100, "var(--warn)"),
    ]);

    view.appendChild(monthNav(() => render("resumo")));
    view.appendChild(el("div", { class: "stack" }, [free, kpis, chartCard, splitCard, topCard]));
  }

  function kpiCard(k, v, color) { return el("div", { class: "card kpi" }, [el("div", { class: "v num", style: "color:" + color, text: v }), el("div", { class: "k", text: k })]); }
  function barColored(pct, color) { const b = bar(pct); b.firstChild.style.background = color; b.style.marginTop = "6px"; return b; }

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
      importInput, search, list,
    ]));
  }

  function txRow(t, editable) {
    const sign = t.type === "income" ? "+" : "−";
    const color = t.type === "income" ? "var(--good)" : "var(--text)";
    const row = el("div", { class: "item" }, [
      el("div", { class: "grow", style: editable ? "cursor:pointer" : "", onclick: editable ? () => editTx(t) : null }, [
        el("div", { class: "t", text: t.desc || "(sem descrição)" }),
        el("div", { class: "s", html: `<span class="pill" style="padding:1px 8px">${t.category || "Outros"}</span> &nbsp;${UI.prettyDate(t.date)}${t.manual ? " · manual" : ""}` }),
      ]),
      el("div", { class: "amt", style: "color:" + color, text: sign + eur(t.amount).replace("€", "") + "€" }),
    ]);
    return row;
  }

  function editTx(t) {
    const fin = Store.get(NS);
    const isNew = !t;
    t = t || { id: uid(), date: todayISO(), desc: "", amount: "", category: "Outros", type: "expense", account: "Manual", manual: true };
    const cats = uniqueCats();
    const fType = field("Tipo", { type: "select", value: t.type, options: [{ value: "expense", label: "Despesa" }, { value: "income", label: "Receita" }] });
    const fAmount = field("Valor (€)", { type: "number", value: t.amount, inputmode: "decimal", step: "0.01" });
    const fDate = field("Data", { type: "date", value: t.date });
    const fDesc = field("Descrição", { value: t.desc, placeholder: "ex: Almoço, Ordenado…" });
    const fCat = field("Categoria", { value: t.category, list: "catlist" });
    const dl = el("datalist", { id: "catlist" }, cats.map((c) => el("option", { value: c })));
    const fAcc = field("Conta / método", { value: t.account || "Manual", placeholder: "Banco, Dinheiro, MBWay…" });
    fDesc.input.addEventListener("blur", () => { if (!fCat.input.value || fCat.input.value === "Outros") fCat.input.value = D.categorize(fDesc.input.value, fin.categoryRules); });

    const body = [
      fType, el("div", { class: "input-row" }, [fAmount, fDate]), fDesc, fCat, dl, fAcc,
      el("div", { class: "row", style: "gap:10px;margin-top:8px" }, [
        !isNew ? el("button", { class: "btn btn-block", style: "color:var(--bad)", text: "Apagar", onclick: async () => { if (await UI.confirm("Apagar esta transação?", { danger: true })) { Store.update(NS, (s) => { s.transactions = s.transactions.filter((x) => x.id !== t.id); }); sh.close(); } } }) : null,
        el("button", { class: "btn btn-primary btn-block", text: "Guardar", onclick: () => {
          const data = { ...t, date: fDate.input.value, desc: fDesc.input.value.trim(), amount: Math.abs(parseFloat(fAmount.input.value) || 0),
            category: fCat.input.value.trim() || "Outros", type: fType.input.value, account: fAcc.input.value.trim() || "Manual", manual: t.manual !== false };
          if (!data.amount) return toast("Indica um valor.");
          Store.update(NS, (s) => { const i = s.transactions.findIndex((x) => x.id === data.id); if (i >= 0) s.transactions[i] = data; else { data._c = Date.now(); s.transactions.push(data); } });
          sh.close(); toast("Guardado ✓");
        }}),
      ]),
    ];
    const sh = sheet(isNew ? "Nova transação" : "Editar transação", body);
  }

  function uniqueCats() {
    const set = new Set(["Supermercado", "Restaurantes", "Transportes", "Contas", "Habitação", "Saúde", "Subscrições", "Compras", "Lazer", "Salário", "Outros"]);
    Store.get(NS).transactions.forEach((t) => t.category && set.add(t.category));
    return [...set];
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
    const s = D.financeSummary(fin, viewMonth);
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

  /* ----------------------------- PATRIMÓNIO ----------------------------- */
  function renderNet(view) {
    const fin = Store.get(NS);
    const nw = D.netWorth(fin);
    $("#subtitle").textContent = "Património líquido";
    // snapshot do mês atual
    Store.update(NS, (s) => { s.nwHistory = s.nwHistory || {}; s.nwHistory[monthKey()] = nw.net; }, { silent: true });

    const head = el("div", { class: "card center" }, [
      el("div", { class: "k", style: "text-transform:uppercase;letter-spacing:.06em;font-size:.72rem;color:var(--text-soft)", text: "Net Worth" }),
      el("div", { class: "big num", style: "color:" + (nw.net < 0 ? "var(--bad)" : "var(--text)"), text: eur(nw.net) }),
      el("div", { class: "row", style: "justify-content:center;gap:18px;margin-top:8px" }, [
        el("span", { class: "tiny", html: `<span class="dot" style="background:var(--good)"></span> Ativos ${eur0(nw.assets)}` }),
        el("span", { class: "tiny", html: `<span class="dot" style="background:var(--bad)"></span> Passivos ${eur0(nw.liab)}` }),
      ]),
    ]);

    // histórico
    const hist = Object.entries(fin.nwHistory || {}).sort((a, b) => a[0].localeCompare(b[0])).slice(-12);
    let histCard = null;
    if (hist.length >= 2) {
      histCard = el("div", { class: "card" }, [
        el("strong", { text: "Evolução" }),
        UI.sparkBars(hist.map((h) => h[1]), { labels: hist.map((h) => h[0].slice(5)), height: 70, color: "var(--good)" }),
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
        !isNew ? el("button", { class: "btn btn-block", style: "color:var(--bad)", text: "Apagar", onclick: () => { Store.update(NS, (s) => { s.assets = s.assets.filter((x) => x.id !== a.id); }); sh.close(); } }) : null,
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
