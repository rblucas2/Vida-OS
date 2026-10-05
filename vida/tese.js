/* =====================================================================
   Tese — plano de ação da tese (marcos e passos) + trabalhos das cadeiras.
   Sub-vistas: Resumo · Semana · Calendário · Quadro · Trabalhos.
   ===================================================================== */
(function () {
  const { el, clear, toast, sheet, field, uid, todayISO, guardClick } = UI;
  const { cap, ico, btnI, pageHead, panel, linkBtn, kpi, shiftDay, mondayOf, daysBetween, checkBtn, monthPill } = C;
  const NS = "tese";
  const STATUSES = [
    { id: "todo", label: "Por fazer", color: "var(--text-mute)" },
    { id: "doing", label: "Em curso", color: "var(--accent)" },
    { id: "done", label: "Feito", color: "var(--good)" },
  ];
  const statusOf = (id) => STATUSES.find((s) => s.id === id) || STATUSES[0];
  const T = () => Store.get(NS);
  const items = (th) => [...(th.milestones || []).map((m) => ({ ...m, kind: "milestone" })), ...(th.tasks || []).map((t) => ({ ...t, kind: "task" }))];
  let sub = "resumo";
  let calMonth = todayISO().slice(0, 7);
  const rerender = () => VidaApp.go("tese");

  function setStatus(it, status) {
    it.status = status; it.done = status === "done"; it.doneAt = status === "done" ? Date.now() : null;
  }
  function toggleDone(kind, id) {
    Store.update(NS, (s) => {
      const arr = kind === "milestone" ? s.milestones : kind === "work" ? s.works : s.tasks;
      const it = arr.find((x) => x.id === id); if (!it) return;
      setStatus(it, it.status === "done" ? "todo" : "done");
    });
  }
  function normalize() {
    const th = T();
    const needs = [th.milestones, th.tasks, th.works].some((arr) => (arr || []).some((it) => !it.status));
    if (!needs) return;
    Store.update(NS, (s) => {
      s.works = s.works || [];
      [s.milestones, s.tasks, s.works].forEach((arr) => (arr || []).forEach((it) => { if (!it.status) it.status = it.done ? "done" : "todo"; it.done = it.status === "done"; }));
    }, { silent: true, keepTime: true });
  }

  function render(view) {
    normalize();
    const th = T();
    const dLeft = th.targetDate ? daysBetween(todayISO(), th.targetDate) : null;
    const dateInput = el("input", { type: "date", value: th.targetDate || "", "aria-label": "Data de apresentação", style: "width:auto" });
    dateInput.addEventListener("change", () => Store.update(NS, (s) => { s.targetDate = dateInput.value; }));
    view.appendChild(pageHead({ eyebrow: "Mestrado", icon: "grad", title: "Tese", sub: dLeft == null ? "Define a data prevista de apresentação →" : dLeft >= 0 ? `Faltam ${dLeft} dias para a apresentação (${UI.prettyDate(th.targetDate)}).` : `A data prevista passou há ${-dLeft} dias.`,
      actions: [el("label", { class: "row", style: "gap:10px" }, [el("span", { class: "muted tiny", text: "Apresentação" }), dateInput])] }));
    const tabs = [["resumo", "Resumo"], ["semana", "Semana"], ["calendario", "Calendário"], ["quadro", "Quadro"], ["trabalhos", "Trabalhos"]];
    view.appendChild(el("div", { class: "subtabs" }, tabs.map(([id, l]) => el("button", { class: sub === id ? "active" : "", text: l, onclick: () => { sub = id; rerender(); } }))));
    ({ resumo: renderResumo, semana: renderSemana, calendario: renderCalendario, quadro: renderQuadro, trabalhos: renderTrabalhos }[sub] || renderResumo)(view, th);
  }

  /* ----------------------------- RESUMO ----------------------------- */
  function renderResumo(view, th) {
    const all = items(th);
    const done = all.filter((i) => i.status === "done").length;
    const weekAgo = Date.now() - 6 * 86400000;
    const doneWeek = all.filter((i) => i.status === "done" && i.doneAt && i.doneAt >= weekAgo).length;
    const openMs = (th.milestones || []).filter((m) => m.status !== "done").length;
    const late = all.filter((i) => i.status !== "done" && i.due && i.due < todayISO()).length;
    view.appendChild(el("div", { class: "kpis" }, [
      kpi({ label: "Concluído", value: all.length ? Math.round(done / all.length * 100) + "%" : "—", icon: "grad", variant: "accent", sub: `${done} de ${all.length} marcos e passos` }),
      kpi({ label: "Esta semana", value: `${doneWeek} feitos`, icon: "checkCircle", sub: `${openMs} marco(s) por fazer` }),
      kpi({ label: "Atrasados", value: String(late), icon: "clock", variant: late ? "bad" : null, sub: late ? "com data já passada" : "tudo dentro do prazo" }),
    ]));
    const bd = burndown(th);
    const upcoming = all.filter((i) => i.status !== "done").sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999")).slice(0, 6);
    view.appendChild(el("div", { class: "stack", style: "margin-top:18px" }, [
      bd ? panel({ title: "Progresso", sub: bd.ideal ? "Restantes: real vs. ritmo ideal até à apresentação" : "Itens por fazer ao longo do tempo", icon: "chart" }, [pace(bd), burndownSVG(bd)]) : null,
      el("div", { class: "grid-2" }, [
        panel({ title: "Próximos", sub: "Por data", action: el("div", { class: "row", style: "gap:6px" }, [btnI("btn-soft btn-sm", "plus", "Marco", () => editItem("milestone", null)), btnI("btn-soft btn-sm", "plus", "Passo", () => editItem("task", null))]) }, [
          upcoming.length ? el("div", {}, upcoming.map(itemRow)) : el("div", { class: "empty", text: "Sem nada por fazer — acrescenta marcos e passos." }),
        ]),
        panel({ title: "Google Calendar", sub: "Traz o planeamento que já tens lá" }, [
          el("p", { class: "muted", style: "margin:0 0 14px", text: "Escolhe eventos do teu calendário (ex: reuniões com o orientador, prazos) e cada um vira um passo da tese." }),
          btnI("btn-soft", "download", "Importar do Google Calendar", importFromGCal),
        ]),
      ]),
    ].filter(Boolean)));
  }
  function itemRow(it) {
    const isDone = it.status === "done";
    const late = !isDone && it.due && it.due < todayISO();
    return el("div", { class: "task" }, [
      checkBtn(isDone, () => toggleDone(it.kind, it.id), it.text),
      el("div", { class: "grow", onclick: () => editItem(it.kind, it) }, [
        el("div", { class: "t" + (isDone ? " done-text" : ""), text: (it.kind === "milestone" ? "🎓 " : "") + it.text }),
        it.due || it.note ? el("div", { class: "s", style: late ? "color:var(--bad)" : "", text: [it.due ? UI.prettyDate(it.due) + (late ? " · atrasado" : "") : null, it.note || null].filter(Boolean).join(" · ") }) : null,
      ]),
      !isDone ? el("span", { class: "pill", style: `color:${statusOf(it.status).color}`, text: statusOf(it.status).label }) : null,
    ]);
  }
  function burndown(th) {
    const all = [...(th.milestones || []), ...(th.tasks || [])];
    if (!all.length) return null;
    const doneTs = all.filter((i) => i.status === "done" && i.doneAt).map((i) => i.doneAt).sort((a, b) => a - b);
    const starts = (th.tasks || []).map((t) => t.createdAt).filter(Boolean); if (doneTs.length) starts.push(doneTs[0]);
    const start = new Date(starts.length ? Math.min(...starts) : Date.now()); start.setHours(0, 0, 0, 0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const n = Math.max(0, Math.round((today - start) / 86400000));
    const series = []; for (let d = 0; d <= n; d++) { const cut = start.getTime() + (d + 1) * 86400000 - 1; series.push(all.length - doneTs.filter((t) => t <= cut).length); }
    let ideal = null;
    if (th.targetDate) { const span = Math.max(1, Math.round((new Date(th.targetDate + "T00:00:00") - start) / 86400000)); ideal = series.map((_, i) => Math.max(0, all.length - all.length * (i / span))); }
    return { series, ideal, total: all.length };
  }
  function pace(bd) {
    if (!bd.ideal) return null;
    const i = bd.series.length - 1, diff = Math.round(bd.series[i] - bd.ideal[i]);
    return el("div", { style: "font-weight:650;margin-bottom:10px;color:" + (diff <= 0 ? "var(--good)" : "var(--bad)"), text: diff <= 0 ? (diff === 0 ? "No ritmo planeado." : `Adiantado: menos ${-diff} passo(s) por fazer do que o planeado para hoje.`) : `Atrasado: mais ${diff} passo(s) por fazer do que o planeado para hoje.` });
  }
  function burndownSVG(bd) {
    const w = 320, h = 150, p = 10, n = bd.series.length;
    const maxV = Math.max(1, ...bd.series, ...(bd.ideal || []));
    const X = (i) => (n <= 1 ? w / 2 : p + i * (w - 2 * p) / (n - 1)), Y = (v) => p + (1 - v / maxV) * (h - 2 * p);
    const pts = (arr) => arr.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
    const wrap = el("div", { html: `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none" aria-hidden="true">
      ${bd.ideal ? `<polyline points="${pts(bd.ideal)}" fill="none" stroke="var(--text-mute)" stroke-width="2" stroke-dasharray="5,5" vector-effect="non-scaling-stroke"/>` : ""}
      <polyline points="${pts(bd.series)}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>` });
    wrap.appendChild(el("div", { class: "split-legend" }, [el("span", {}, [el("i", { class: "dot", style: "background:var(--accent)" }), "Real (por fazer)"]), bd.ideal ? el("span", {}, [el("i", { class: "dot", style: "background:var(--text-mute)" }), "Ritmo ideal"]) : null]));
    return wrap;
  }

  /* ----------------------------- SEMANA ----------------------------- */
  function renderSemana(view, th) {
    const all = items(th);
    const dated = all.filter((i) => i.due), undated = all.filter((i) => !i.due);
    if (!all.length) { view.appendChild(panel({}, [el("div", { class: "empty", text: "Sem marcos/passos. Cria-os no Resumo." })])); return; }
    const cur = mondayOf(todayISO());
    let minW = cur, maxW = cur;
    dated.forEach((i) => { const w = mondayOf(i.due); if (w < minW) minW = w; if (w > maxW) maxW = w; });
    if (th.targetDate && mondayOf(th.targetDate) > maxW) maxW = mondayOf(th.targetDate);
    const by = {}; dated.forEach((i) => { const w = mondayOf(i.due); (by[w] = by[w] || []).push(i); });
    const out = [];
    if (undated.length) out.push(panel({ title: "Sem data", sub: "Dá-lhes uma data para entrarem no plano" }, [el("div", {}, undated.map(itemRow))]));
    for (let w = minW, g = 0; w <= maxW && g < 80; w = shiftDay(w, 7), g++) {
      const list = (by[w] || []).sort((a, b) => a.due.localeCompare(b.due));
      const isCur = w === cur, past = w < cur;
      if (past && !list.length) continue;
      out.push(panel({ title: (isCur ? "Esta semana · " : "") + `${UI.prettyDate(w)} – ${UI.prettyDate(shiftDay(w, 6))}`, sub: list.length ? `${list.filter((i) => i.status === "done").length}/${list.length} feitos` : "Nada agendado", cls: isCur ? "is-today" : past ? "is-past" : "",
        action: el("button", { class: "btn btn-ghost btn-icon btn-sm", "aria-label": "Passo nesta semana", html: UI.icon("plus", 18), onclick: () => editItem("task", null, { due: isCur ? todayISO() : w }) }) }, [list.length ? el("div", {}, list.map(itemRow)) : null]));
    }
    view.appendChild(el("div", { class: "stack" }, out));
  }

  /* ----------------------------- CALENDÁRIO ----------------------------- */
  function renderCalendario(view, th) {
    const by = {}; items(th).filter((i) => i.due).forEach((i) => (by[i.due] = by[i.due] || []).push(i));
    (th.works || []).filter((w) => w.due).forEach((w) => (by[w.due] = by[w.due] || []).push({ ...w, kind: "work" }));
    const [y, m] = calMonth.split("-").map(Number);
    const startDow = (new Date(y, m - 1, 1).getDay() + 6) % 7, dim = new Date(y, m, 0).getDate();
    const grid = el("div", { class: "cal" });
    ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].forEach((w) => grid.appendChild(el("div", { class: "wd", text: w })));
    for (let i = 0; i < startDow; i++) grid.appendChild(el("div"));
    for (let d = 1; d <= dim; d++) {
      const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const list = by[iso] || [];
      grid.appendChild(el("div", { class: "day" + (iso === todayISO() ? " today" : ""), onclick: () => daySheet(iso, list) }, [
        el("div", { text: d }),
        list.length ? el("div", { class: "mk" }, list.slice(0, 5).map((i) => el("i", { style: "background:" + (i.kind === "work" ? "var(--warn)" : statusOf(i.status).color) }))) : null,
        list[0] ? el("div", { class: "lbl", text: list[0].text }) : null,
      ]));
    }
    view.appendChild(panel({ title: cap(UI.prettyMonth(calMonth)), sub: "Toca num dia para ver ou planear · laranja = trabalhos das cadeiras", action: monthPill(calMonth, (mk) => { calMonth = mk; rerender(); }) }, [grid]));
  }
  function daySheet(iso, list) {
    sheet(cap(new Date(iso + "T00:00:00").toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" })), [
      list.length ? el("div", {}, list.map((i) => i.kind === "work" ? workRow(i) : itemRow(i))) : el("div", { class: "empty", text: "Nada agendado neste dia." }),
      el("div", { class: "row", style: "gap:8px" }, [btnI("btn-soft btn-block", "plus", "Marco", () => editItem("milestone", null, { due: iso })), btnI("btn-soft btn-block", "plus", "Passo", () => editItem("task", null, { due: iso }))]),
    ]);
  }

  /* ----------------------------- QUADRO ----------------------------- */
  function renderQuadro(view, th) {
    const board = el("div", { class: "board" });
    STATUSES.forEach((st, ci) => {
      const list = (th.tasks || []).filter((t) => t.status === st.id).sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
      const col = el("div", { class: "col" }, [el("div", { class: "col-head" }, [el("span", { text: st.label }), el("span", { class: "pill", text: String(list.length) })])]);
      if (!list.length) col.appendChild(el("div", { class: "empty tiny", text: "—" }));
      list.forEach((t) => col.appendChild(el("div", { class: "bcard" }, [
        el("div", { class: "t", onclick: () => editItem("task", { ...t, kind: "task" }), text: t.text }),
        t.due ? el("div", { class: "tiny muted", style: "margin-top:4px", text: UI.prettyDate(t.due) }) : null,
        el("div", { class: "acts" }, [
          el("button", { class: "btn btn-ghost btn-sm", text: "◀", disabled: ci === 0, "aria-label": "Mover para trás", onclick: () => move(t.id, -1) }),
          el("button", { class: "btn btn-ghost btn-sm", text: "▶", disabled: ci === STATUSES.length - 1, "aria-label": "Mover para a frente", onclick: () => move(t.id, 1) }),
        ]),
      ])));
      col.appendChild(btnI("btn-soft btn-sm", "plus", "Passo", () => editItem("task", null, { status: st.id })));
      board.appendChild(col);
    });
    view.appendChild(board);
  }
  function move(id, dir) {
    const order = STATUSES.map((s) => s.id);
    Store.update(NS, (s) => { const t = s.tasks.find((x) => x.id === id); if (!t) return; const i = Math.max(0, order.indexOf(t.status)); const nx = order[Math.min(order.length - 1, Math.max(0, i + dir))]; if (nx !== t.status) setStatus(t, nx); });
  }

  /* ----------------------------- TRABALHOS ----------------------------- */
  function workRow(w) {
    const isDone = w.status === "done";
    const late = !isDone && w.due && w.due < todayISO();
    return el("div", { class: "task" }, [
      checkBtn(isDone, () => toggleDone("work", w.id), w.text),
      el("div", { class: "grow", onclick: () => editWork(w) }, [
        el("div", { class: "t" + (isDone ? " done-text" : ""), text: w.text }),
        el("div", { class: "s", style: late ? "color:var(--bad)" : "", text: [w.subject && w.kind === "work" ? w.subject : null, w.due ? UI.prettyDate(w.due) + (late ? " · atrasado" : "") : null, w.grade ? "Nota " + w.grade : null, w.note || null].filter(Boolean).join(" · ") || " " }),
      ]),
      !isDone ? el("span", { class: "pill", style: `color:${statusOf(w.status).color}`, text: statusOf(w.status).label }) : null,
    ]);
  }
  function renderTrabalhos(view, th) {
    const works = th.works || [];
    const done = works.filter((w) => w.status === "done").length;
    const next = works.filter((w) => w.status !== "done" && w.due).sort((a, b) => a.due.localeCompare(b.due))[0];
    view.appendChild(el("div", { class: "kpis" }, [
      kpi({ label: "Por entregar", value: String(works.length - done), icon: "list", variant: "accent", sub: `${works.length} trabalhos no total` }),
      kpi({ label: "Entregues", value: String(done), icon: "checkCircle", sub: works.filter((w) => w.grade).length ? "média " + avgGrade(works) : "sem notas registadas" }),
      kpi({ label: "Próxima entrega", value: next ? UI.prettyDate(next.due) : "—", icon: "clock", sub: next ? next.text : "nada marcado" }),
    ]));
    const by = {}; works.forEach((w) => { const k = (w.subject || "").trim() || "Sem cadeira"; (by[k] = by[k] || []).push(w); });
    const subjects = Object.keys(by).sort((a, b) => a === "Sem cadeira" ? 1 : b === "Sem cadeira" ? -1 : a.localeCompare(b, "pt"));
    view.appendChild(el("div", { class: "stack", style: "margin-top:18px" }, [
      btnI("btn-primary", "plus", "Novo trabalho", () => editWork(null)),
      ...(subjects.length ? subjects.map((sj) => {
        const list = by[sj].slice().sort((a, b) => (a.status === "done") - (b.status === "done") || (a.due || "9999").localeCompare(b.due || "9999"));
        return panel({ title: sj, sub: `${list.filter((w) => w.status === "done").length}/${list.length} entregues` }, [el("div", {}, list.map(workRow))]);
      }) : [panel({}, [el("div", { class: "empty", text: "Sem trabalhos ainda. Adiciona as entregas das cadeiras do mestrado — cada uma com a cadeira, data e estado." })])]),
    ]));
  }
  function avgGrade(works) {
    const g = works.map((w) => parseFloat(String(w.grade).replace(",", "."))).filter((x) => !isNaN(x));
    return g.length ? (g.reduce((a, b) => a + b, 0) / g.length).toFixed(1).replace(".", ",") : "—";
  }

  /* ----------------------------- FORMULÁRIOS ----------------------------- */
  function editItem(kind, it, presets = {}) {
    const isNew = !it;
    const key = kind === "milestone" ? "milestones" : "tasks";
    it = it ? (T()[key] || []).find((x) => x.id === it.id) || it : { id: uid(), text: "", due: presets.due || "", status: presets.status || "todo", note: "" };
    const f = field(kind === "milestone" ? "Marco" : "Passo", { value: it.text, placeholder: kind === "milestone" ? "ex: Revisão de literatura, Metodologia, Defesa…" : "ex: Escrever secção 2.1, Ler 3 artigos…" });
    const fd = field("Data (opcional)", { type: "date", value: it.due || "" });
    const fs = field("Estado", { type: "select", value: it.status || "todo", options: STATUSES.map((s) => ({ value: s.id, label: s.label })) });
    const fn = field("Como (notas, opcional)", { type: "textarea", value: it.note || "" });
    const sh = sheet(isNew ? (kind === "milestone" ? "Novo marco" : "Novo passo") : (kind === "milestone" ? "Editar marco" : "Editar passo"), [f, el("div", { class: "input-row" }, [fd, fs]), fn,
      el("div", { class: "row", style: "gap:10px" }, [
        isNew ? null : el("button", { class: "btn btn-danger btn-block", text: "Apagar", onclick: () => { Store.update(NS, (s) => { s[key] = s[key].filter((x) => x.id !== it.id); }); sh.close(); } }),
        el("button", { class: "btn btn-primary btn-block", text: "Guardar", onclick: guardClick(() => {
          const text = f.input.value.trim(); if (!text) return toast("Escreve o texto.");
          Store.update(NS, (s) => {
            s[key] = s[key] || [];
            let x = s[key].find((y) => y.id === it.id);
            if (!x) { x = { id: it.id, createdAt: Date.now(), status: "todo" }; s[key].push(x); }
            x.text = text; x.due = fd.input.value || ""; x.note = fn.input.value.trim();
            if (x.status !== fs.input.value || x.done == null) setStatus(x, fs.input.value);
          });
          sh.close();
        }) }),
      ])]);
    setTimeout(() => f.input.focus(), 50);
  }
  function editWork(w) {
    const isNew = !w;
    w = w || { id: uid(), subject: "", text: "", due: "", status: "todo", grade: "", note: "" };
    const subjects = [...new Set((T().works || []).map((x) => x.subject).filter(Boolean))];
    const fSubj = field("Cadeira / UC", { value: w.subject, placeholder: "ex: Metodologias de Investigação", list: "subjlist" });
    const dl = el("datalist", { id: "subjlist" }, subjects.map((x) => el("option", { value: x })));
    const f = field("Trabalho", { value: w.text, placeholder: "ex: Trabalho de grupo 1, Relatório final…" });
    const fd = field("Data de entrega", { type: "date", value: w.due || "" });
    const fs = field("Estado", { type: "select", value: w.status, options: STATUSES.map((s) => ({ value: s.id, label: s.label })) });
    const fg = field("Nota (opcional)", { value: w.grade || "", placeholder: "ex: 17" });
    const fn = field("Notas (opcional)", { type: "textarea", value: w.note || "" });
    const sh = sheet(isNew ? "Novo trabalho" : "Editar trabalho", [fSubj, dl, f, el("div", { class: "input-row" }, [fd, fs]), fg, fn,
      el("div", { class: "row", style: "gap:10px" }, [
        isNew ? null : el("button", { class: "btn btn-danger btn-block", text: "Apagar", onclick: () => { Store.update(NS, (s) => { s.works = s.works.filter((x) => x.id !== w.id); }); sh.close(); } }),
        el("button", { class: "btn btn-primary btn-block", text: "Guardar", onclick: guardClick(() => {
          const text = f.input.value.trim(); if (!text) return toast("Indica o trabalho.");
          Store.update(NS, (s) => {
            s.works = s.works || [];
            let x = s.works.find((y) => y.id === w.id);
            if (!x) { x = { id: w.id, createdAt: Date.now(), status: "todo" }; s.works.push(x); }
            Object.assign(x, { subject: fSubj.input.value.trim(), text, due: fd.input.value || "", grade: fg.input.value.trim(), note: fn.input.value.trim() });
            if (x.status !== fs.input.value || x.done == null) setStatus(x, fs.input.value);
          });
          sh.close();
        }) }),
      ])]);
    setTimeout(() => fSubj.input.focus(), 50);
  }

  /* ----------------------------- IMPORTAR DO GOOGLE CALENDAR ----------------------------- */
  function importFromGCal() {
    if (!window.GCal || !GCal.enabled()) { toast("Liga primeiro o Google Calendar nas Definições."); return; }
    const th = T();
    const fMin = field("Desde", { type: "date", value: shiftDay(todayISO(), -30) });
    const fMax = field("Até", { type: "date", value: th.targetDate || shiftDay(todayISO(), 180) });
    const results = el("div", {});
    let events = [];
    const imported = new Set((th.tasks || []).map((t) => t.gcalId).filter(Boolean));
    async function search() {
      clear(results).appendChild(el("div", { class: "empty tiny", text: "A procurar…" }));
      try {
        const raw = await GCal.listEvents(new Date(fMin.input.value + "T00:00:00").toISOString(), new Date(fMax.input.value + "T23:59:59").toISOString());
        events = raw.filter((ev) => !imported.has(ev.id)).map((ev) => ({ id: ev.id, summary: ev.summary || "(sem título)", date: (ev.start && (ev.start.date || (ev.start.dateTime || "").slice(0, 10))) || "", description: (ev.description || "").trim(), checked: true }));
        clear(results);
        if (!events.length) { results.appendChild(el("div", { class: "empty tiny", text: "Sem eventos novos neste intervalo." })); return; }
        events.forEach((ev) => results.appendChild(el("label", { class: "task", style: "cursor:pointer" }, [
          el("input", { type: "checkbox", checked: true, onchange: (e) => { ev.checked = e.target.checked; } }),
          el("div", { class: "grow" }, [el("div", { class: "t", text: ev.summary }), el("div", { class: "s", text: [ev.date ? UI.prettyDate(ev.date) : "sem data", ev.description].filter(Boolean).join(" · ") })]),
        ])));
      } catch (e) { clear(results).appendChild(el("div", { class: "empty tiny", style: "color:var(--bad)", text: "Erro: " + e.message })); }
    }
    const sh = sheet("Importar do Google Calendar", [
      el("p", { class: "tiny muted", style: "margin:0", text: "Cada evento escolhido vira um passo da tese, com a data e a descrição do evento." }),
      el("div", { class: "input-row" }, [fMin, fMax]),
      btnI("btn-soft btn-block", "search", "Procurar eventos", guardClick(search)), results,
      el("button", { class: "btn btn-primary btn-block", text: "Importar selecionados", onclick: guardClick(() => {
        const pick = events.filter((e) => e.checked); if (!pick.length) return toast("Nada selecionado.");
        Store.update(NS, (s) => { pick.forEach((ev) => s.tasks.push({ id: uid(), text: ev.summary, due: ev.date, status: "todo", done: false, note: ev.description, createdAt: Date.now(), gcalId: ev.id })); });
        toast(pick.length + " passo(s) importado(s) ✓"); sh.close();
      }) }),
    ]);
  }

  window.VidaTese = { render, toggleDone };
})();
