/* =====================================================================
   Tese — plano de ação da tese de mestrado.
   4 vistas do mesmo plano: Resumo (contagem + progresso), Linha do
   tempo (marcos/passos no tempo), Calendário (por dia) e Quadro
   (kanban dos passos por estado).
   ===================================================================== */
(function () {
  const { el, $, clear, toast, sheet, field, uid, todayISO, guardClick } = UI;
  const NS = "tese";

  const STATUSES = [
    { id: "todo", label: "Por fazer", color: "var(--text-mute)" },
    { id: "doing", label: "Em curso", color: "var(--accent)" },
    { id: "done", label: "Feito", color: "var(--good)" },
  ];
  function statusColor(status) { const s = STATUSES.find((x) => x.id === status); return s ? s.color : "var(--text-mute)"; }
  function statusLabel(status) { const s = STATUSES.find((x) => x.id === status); return s ? s.label : status; }

  function init() {
    App.boot({ active: "tese" });
    Store.ensure(NS, { targetDate: "", milestones: [], tasks: [] });
    migrateFromLifeos();
    normalizeData();
    App.onboard("tese", "Tese", [
      "🎓 Define a <b>data prevista de apresentação</b> e acompanha a contagem decrescente no Resumo.",
      "🧭 <b>Linha do tempo</b>: vê os marcos e passos espalhados entre hoje e a apresentação.",
      "📅 <b>Calendário</b>: o que está agendado para cada dia.",
      "🗂️ <b>Quadro</b>: arrasta os passos entre Por fazer / Em curso / Feito.",
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

  // Esta aba existiu por breve tempo dentro do Espiritual (Store "los".thesis) antes de passar
  // a app própria — copia os dados de lá uma única vez, se existirem, para não os perder.
  function migrateFromLifeos() {
    const los = Store.get("los");
    const th = Store.get(NS);
    if (los && los.thesis && !th._migrated && !th.targetDate && !th.milestones.length && !th.tasks.length) {
      Store.update(NS, (s) => {
        s.targetDate = los.thesis.targetDate || "";
        s.milestones = los.thesis.milestones || [];
        s.tasks = los.thesis.tasks || [];
        s._migrated = true;
      }, { silent: true });
    }
  }

  // Garante que todos os marcos/passos têm "status" (introduzido quando o Quadro foi
  // adicionado) — itens antigos só tinham "done" (booleano). Idempotente.
  function normalizeData() {
    Store.update(NS, (s) => {
      [s.milestones, s.tasks].forEach((arr) => (arr || []).forEach((it) => {
        if (!it.status) it.status = it.done ? "done" : "todo";
        if (it.status === "done" && !it.doneAt) it.doneAt = Date.now();
        it.done = it.status === "done";
      }));
    }, { silent: true });
  }

  function daysUntil(iso) {
    if (!iso) return null;
    const target = new Date(iso + "T00:00:00"); const today = new Date(todayISO() + "T00:00:00");
    return Math.round((target - today) / 86400000);
  }
  function rawMilestone(id) { return Store.get(NS).milestones.find((x) => x.id === id); }
  function rawTask(id) { return Store.get(NS).tasks.find((x) => x.id === id); }
  function combinedItems(th) {
    return [
      ...th.milestones.map((m) => ({ ...m, kind: "milestone" })),
      ...th.tasks.map((t) => ({ ...t, kind: "task" })),
    ];
  }

  let current = "resumo";
  function render(tab) {
    current = tab;
    const view = clear($("#view"));
    ({ resumo: renderResumo, timeline: renderTimeline, calendar: renderCalendar, board: renderBoard }[tab] || renderResumo)(view);
  }

  /* ----------------------------- RESUMO ----------------------------- */
  function renderResumo(view) {
    const th = Store.get(NS);
    $("#subtitle").textContent = "Plano de ação da tese";

    const dLeft = daysUntil(th.targetDate);
    const hero = el("div", { class: "hero" }, [
      el("div", { class: "label", text: "Apresentação da tese" }),
      el("div", { class: "value", text: dLeft == null ? "—" : dLeft >= 0 ? dLeft + " dias" : "atrasada " + Math.abs(dLeft) + "d" }),
      el("div", { class: "foot", text: th.targetDate ? UI.prettyDate(th.targetDate) : "Define abaixo a data prevista de apresentação." }),
    ]);
    const fDate = field("Data de apresentação (prevista)", { type: "date", value: th.targetDate || "" });
    fDate.input.addEventListener("change", () => { Store.update(NS, (s) => { s.targetDate = fDate.input.value; }, { silent: true }); render("resumo"); });

    const items = combinedItems(th);
    const totalCount = items.length;
    const doneCount = items.filter((i) => i.status === "done").length;
    const weekAgo = Date.now() - 6 * 86400000;
    const doneThisWeek = items.filter((i) => i.status === "done" && i.doneAt && i.doneAt >= weekAgo).length;
    const openMilestones = th.milestones.filter((m) => m.status !== "done").length;

    const statsRow = el("div", { class: "row", style: "gap:10px" }, [
      statCard(totalCount ? Math.round(doneCount / totalCount * 100) + "%" : "—", "concluído"),
      statCard(doneThisWeek + "", "esta semana"),
      statCard(openMilestones + "", "marcos por fazer"),
    ]);

    let chartCard = null;
    const bd = burndownData(th);
    if (bd) {
      chartCard = el("div", { class: "card" }, [
        el("div", { class: "row between" }, [el("strong", { text: "Progresso" }), el("span", { class: "tiny muted", text: bd.ideal ? "real vs. ideal" : "itens restantes" })]),
        burndownSVGWrap(bd),
      ]);
    }

    const upcoming = items.filter((i) => i.status !== "done").sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999")).slice(0, 5);
    const upcomingCard = el("div", { class: "card" }, [el("strong", { text: "Próximos" })]);
    const ul = el("div", { class: "list", style: "margin-top:8px" });
    if (!upcoming.length) ul.appendChild(el("div", { class: "empty tiny", text: "Sem passos ou marcos por fazer." }));
    upcoming.forEach((it) => ul.appendChild(itemRow(it)));
    upcomingCard.appendChild(ul);
    upcomingCard.appendChild(el("div", { class: "row", style: "gap:8px;margin-top:8px" }, [
      el("button", { class: "btn btn-soft btn-block btn-sm", text: "+ Marco", onclick: () => editMilestone(null) }),
      el("button", { class: "btn btn-soft btn-block btn-sm", text: "+ Passo", onclick: () => editTask(null) }),
    ]));

    view.appendChild(el("div", { class: "stack" }, [hero, fDate, statsRow, chartCard, upcomingCard].filter(Boolean)));
  }
  function statCard(v, l) {
    return el("div", { class: "card kpi pad-sm", style: "flex:1;text-align:center;align-items:center" }, [
      el("div", { class: "v", text: v }), el("div", { class: "k", text: l }),
    ]);
  }
  function itemRow(it) {
    const isDone = it.status === "done";
    return el("div", { class: "item", style: "padding:8px 2px" }, [
      el("button", { class: "btn btn-icon btn-ghost", style: "width:24px;height:24px;border:2px solid " + (isDone ? "var(--good)" : "var(--border)") + ";background:" + (isDone ? "var(--good)" : "transparent") + ";color:#fff;font-size:.7rem;flex:none", html: isDone ? "✓" : "", onclick: () => toggleItemDone(it.kind, it.id) }),
      el("div", { class: "grow", style: "cursor:pointer;" + (isDone ? "text-decoration:line-through;color:var(--text-mute)" : ""), onclick: () => it.kind === "milestone" ? editMilestone(rawMilestone(it.id)) : editTask(rawTask(it.id)) }, [
        el("div", { class: "t", text: (it.kind === "milestone" ? "🎓 " : "") + it.text }),
        it.due ? el("div", { class: "s tiny muted", text: UI.prettyDate(it.due) }) : null,
      ]),
      it.status !== "done" ? el("span", { class: "pill tiny", style: "color:" + statusColor(it.status) + ";border-color:" + statusColor(it.status), text: statusLabel(it.status) }) : null,
    ]);
  }
  function toggleItemDone(kind, id) {
    Store.update(NS, (s) => {
      const arr = kind === "milestone" ? s.milestones : s.tasks;
      const it = arr.find((x) => x.id === id); if (!it) return;
      const next = it.status === "done" ? "todo" : "done";
      it.status = next; it.done = next === "done"; it.doneAt = next === "done" ? Date.now() : null;
    });
  }

  // --- Progresso (real vs. ideal) — remaining ao longo do tempo, a partir do 1º item criado ---
  function burndownData(th) {
    const items = [...th.milestones, ...th.tasks];
    const total = items.length;
    if (!total) return null;
    const doneEvents = items.filter((i) => i.status === "done" && i.doneAt).map((i) => i.doneAt).sort((a, b) => a - b);
    const candidates = th.tasks.map((t) => t.createdAt).filter(Boolean);
    if (doneEvents.length) candidates.push(doneEvents[0]);
    const startTs = candidates.length ? Math.min(...candidates) : Date.now();
    const startDay = new Date(startTs); startDay.setHours(0, 0, 0, 0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const daysElapsed = Math.max(0, Math.round((today - startDay) / 86400000));
    const series = [];
    for (let d = 0; d <= daysElapsed; d++) {
      const cutoff = startDay.getTime() + (d + 1) * 86400000 - 1;
      const doneByThen = doneEvents.filter((ts) => ts <= cutoff).length;
      series.push(total - doneByThen);
    }
    let ideal = null;
    if (th.targetDate) {
      const targetDay = new Date(th.targetDate + "T00:00:00");
      const totalSpan = Math.max(1, Math.round((targetDay - startDay) / 86400000));
      ideal = series.map((_, i) => Math.max(0, total - total * (i / totalSpan)));
    }
    return { series, ideal, total };
  }
  function burndownSVG(actual, ideal) {
    const w = 320, h = 140, pad = 10;
    const n = actual.length;
    const allVals = ideal ? actual.concat(ideal) : actual;
    const maxV = Math.max(1, ...allVals);
    const X = (i) => (n <= 1 ? w / 2 : pad + i * (w - 2 * pad) / (n - 1));
    const Y = (v) => pad + (1 - v / maxV) * (h - 2 * pad);
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`); svg.setAttribute("width", "100%"); svg.setAttribute("height", h); svg.setAttribute("preserveAspectRatio", "none");
    if (ideal) {
      const polyI = document.createElementNS(ns, "polyline");
      polyI.setAttribute("points", ideal.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" "));
      polyI.setAttribute("fill", "none"); polyI.setAttribute("stroke", "var(--text-mute)"); polyI.setAttribute("stroke-width", "2"); polyI.setAttribute("stroke-dasharray", "5,5"); polyI.setAttribute("vector-effect", "non-scaling-stroke");
      svg.appendChild(polyI);
    }
    const poly = document.createElementNS(ns, "polyline");
    poly.setAttribute("points", actual.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" "));
    poly.setAttribute("fill", "none"); poly.setAttribute("stroke", "var(--accent)"); poly.setAttribute("stroke-width", "2.5"); poly.setAttribute("stroke-linecap", "round"); poly.setAttribute("stroke-linejoin", "round"); poly.setAttribute("vector-effect", "non-scaling-stroke");
    svg.appendChild(poly);
    const dot = document.createElementNS(ns, "circle");
    dot.setAttribute("cx", X(n - 1)); dot.setAttribute("cy", Y(actual[n - 1])); dot.setAttribute("r", "4"); dot.setAttribute("fill", "var(--accent)");
    svg.appendChild(dot);
    return svg;
  }
  function burndownSVGWrap(bd) {
    const wrap = el("div", { style: "margin-top:10px" }, [burndownSVG(bd.series, bd.ideal)]);
    wrap.appendChild(el("div", { class: "row", style: "gap:14px;margin-top:6px" }, [
      el("span", { class: "tiny muted", html: '<span class="dot" style="background:var(--accent)"></span> Real (restantes)' }),
      bd.ideal ? el("span", { class: "tiny muted", html: '<span class="dot" style="background:var(--text-mute)"></span> Ideal' }) : null,
    ].filter(Boolean)));
    return wrap;
  }

  /* ----------------------------- LINHA DO TEMPO ----------------------------- */
  function renderTimeline(view) {
    const th = Store.get(NS);
    $("#subtitle").textContent = "Linha do tempo";
    const items = combinedItems(th);
    const dated = items.filter((i) => i.due).sort((a, b) => a.due.localeCompare(b.due));
    const undated = items.filter((i) => !i.due);

    if (!dated.length) {
      view.appendChild(el("div", { class: "stack" }, [
        el("div", { class: "card empty", text: "Sem marcos/passos com data ainda. Adiciona datas para veres a linha do tempo." }),
        el("div", { class: "row", style: "gap:8px" }, [
          el("button", { class: "btn btn-soft btn-block btn-sm", text: "+ Marco", onclick: () => editMilestone(null) }),
          el("button", { class: "btn btn-soft btn-block btn-sm", text: "+ Passo", onclick: () => editTask(null) }),
        ]),
      ]));
      return;
    }

    const todayIso = todayISO();
    const minDate = dated[0].due < todayIso ? dated[0].due : todayIso;
    const lastDated = dated[dated.length - 1].due;
    const maxDate = th.targetDate && th.targetDate > lastDated ? th.targetDate : lastDated;
    const minTs = new Date(minDate + "T00:00:00").getTime();
    const maxTs = Math.max(new Date(maxDate + "T00:00:00").getTime(), minTs + 86400000);
    const span = maxTs - minTs;
    const pct = (iso) => Math.min(100, Math.max(0, (new Date(iso + "T00:00:00").getTime() - minTs) / span * 100));

    const milestoneItems = dated.filter((i) => i.kind === "milestone");
    const taskItems = dated.filter((i) => i.kind === "task");
    const trackW = Math.max(560, dated.length * 100);

    function lane(labelText, arr, big) {
      const laneEl = el("div", { style: `position:relative;height:${big ? 74 : 50}px;margin-bottom:4px` }, [
        el("div", { style: "position:absolute;left:0;right:0;top:50%;height:2px;background:var(--border)" }),
      ]);
      arr.forEach((it) => {
        const left = pct(it.due);
        laneEl.appendChild(el("div", {
          style: `position:absolute;left:${left}%;top:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;cursor:pointer`,
          onclick: () => it.kind === "milestone" ? editMilestone(rawMilestone(it.id)) : editTask(rawTask(it.id)),
        }, [
          el("div", { style: `width:${big ? 14 : 10}px;height:${big ? 14 : 10}px;border-radius:50%;background:${statusColor(it.status)};border:2px solid var(--surface)` }),
          el("div", { class: "tiny", style: `margin-top:4px;white-space:nowrap;max-width:88px;overflow:hidden;text-overflow:ellipsis;font-weight:${big ? 700 : 500}` , text: it.text }),
        ]));
      });
      return el("div", {}, [el("div", { class: "tiny muted", style: "margin-bottom:2px", text: labelText }), laneEl]);
    }

    const todayLeft = pct(todayIso);
    const inner = el("div", { style: `position:relative;min-width:${trackW}px;padding-top:14px` }, [
      el("div", { style: `position:absolute;left:${todayLeft}%;top:14px;bottom:0;width:2px;background:var(--accent);z-index:1` }),
      el("div", { style: `position:absolute;left:${todayLeft}%;top:0;transform:translateX(-50%);font-size:.62rem;font-weight:700;color:var(--accent)`, text: "hoje" }),
      milestoneItems.length ? lane("Marcos", milestoneItems, true) : null,
      taskItems.length ? lane("Passos", taskItems, false) : null,
    ].filter(Boolean));
    const scrollWrap = el("div", { style: "overflow-x:auto;padding:4px 2px 6px" }, [inner]);

    const card = el("div", { class: "card" }, [el("strong", { text: "Marcos e passos no tempo" }), scrollWrap]);

    let undatedCard = null;
    if (undated.length) {
      undatedCard = el("div", { class: "card" }, [
        el("strong", { text: "Sem data definida" }),
        el("div", { class: "row wrap", style: "gap:8px;margin-top:8px" }, undated.map((it) => el("span", {
          class: "pill", style: "cursor:pointer", text: (it.kind === "milestone" ? "🎓 " : "") + it.text,
          onclick: () => it.kind === "milestone" ? editMilestone(rawMilestone(it.id)) : editTask(rawTask(it.id)),
        }))),
      ]);
    }

    view.appendChild(el("div", { class: "stack" }, [card, undatedCard].filter(Boolean)));
  }

  /* ----------------------------- CALENDÁRIO ----------------------------- */
  let calMonth = todayISO().slice(0, 7);
  function shiftMonth(delta) {
    const [y, m] = calMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    calMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  function renderCalendar(view) {
    const th = Store.get(NS);
    $("#subtitle").textContent = "Calendário";
    const items = combinedItems(th).filter((i) => i.due);
    const byDay = {};
    items.forEach((it) => { (byDay[it.due] = byDay[it.due] || []).push(it); });

    const [y, m] = calMonth.split("-").map(Number);
    const first = new Date(y, m - 1, 1);
    const startDow = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(y, m, 0).getDate();
    const todayIso = todayISO();

    const nav = el("div", { class: "row between", style: "margin-bottom:12px" }, [
      el("button", { class: "btn btn-ghost btn-sm", text: "‹", onclick: () => { shiftMonth(-1); render("calendar"); } }),
      el("strong", { style: "text-transform:capitalize", text: UI.prettyMonth(calMonth) }),
      el("button", { class: "btn btn-ghost btn-sm", text: "›", onclick: () => { shiftMonth(1); render("calendar"); } }),
    ]);

    const grid = el("div", { class: "cal" });
    ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].forEach((w) => grid.appendChild(el("div", { class: "wd", text: w })));
    for (let i = 0; i < startDow; i++) grid.appendChild(el("div", {}));
    for (let dn = 1; dn <= daysInMonth; dn++) {
      const iso = `${y}-${String(m).padStart(2, "0")}-${String(dn).padStart(2, "0")}`;
      const dayItems = byDay[iso] || [];
      const cls = "day" + (iso === todayIso ? " today" : "");
      grid.appendChild(el("div", { class: cls, onclick: () => openDaySheet(iso) }, [
        el("div", { text: dn }),
        dayItems.length ? el("div", { class: "mk" }, dayItems.slice(0, 4).map((it) => el("i", { style: "background:" + statusColor(it.status) }))) : null,
      ]));
    }

    view.appendChild(el("div", { class: "stack" }, [el("div", { class: "card" }, [nav, grid])]));
  }
  function openDaySheet(iso) {
    const th = Store.get(NS);
    const items = combinedItems(th).filter((i) => i.due === iso).sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "milestone" ? -1 : 1));
    const list = el("div", { class: "list", style: "margin-top:8px" });
    if (!items.length) list.appendChild(el("div", { class: "empty tiny", text: "Nada agendado neste dia." }));
    items.forEach((it) => list.appendChild(itemRow(it)));
    sheet(UI.prettyDate(iso), [
      list,
      el("div", { class: "row", style: "gap:8px;margin-top:12px" }, [
        el("button", { class: "btn btn-soft btn-block btn-sm", text: "+ Marco", onclick: () => editMilestone(null, { due: iso }) }),
        el("button", { class: "btn btn-soft btn-block btn-sm", text: "+ Passo", onclick: () => editTask(null, { due: iso }) }),
      ]),
    ]);
  }

  /* ----------------------------- QUADRO (KANBAN) ----------------------------- */
  function cycleTaskStatus(id, dir) {
    const order = STATUSES.map((s) => s.id);
    Store.update(NS, (s) => {
      const t = s.tasks.find((x) => x.id === id); if (!t) return;
      const idx = Math.max(0, order.indexOf(t.status));
      const next = order[Math.min(order.length - 1, Math.max(0, idx + dir))];
      if (next !== t.status) { t.status = next; t.done = next === "done"; t.doneAt = next === "done" ? Date.now() : null; }
    });
  }
  function renderBoard(view) {
    const th = Store.get(NS);
    $("#subtitle").textContent = "Quadro de passos";
    const cols = STATUSES.map((s) => ({ ...s, items: th.tasks.filter((t) => t.status === s.id).sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999")) }));

    const board = el("div", { style: "display:flex;gap:10px;overflow-x:auto;padding-bottom:10px;-webkit-overflow-scrolling:touch" });
    cols.forEach((col, ci) => {
      const colEl = el("div", { style: "flex:0 0 250px;background:var(--surface-2);border:1px solid var(--border);border-radius:14px;padding:10px;display:flex;flex-direction:column" }, [
        el("div", { class: "row between", style: "margin-bottom:8px" }, [
          el("strong", { style: "font-size:.85rem", text: col.label }),
          el("span", { class: "tiny muted num", text: col.items.length + "" }),
        ]),
      ]);
      if (!col.items.length) colEl.appendChild(el("div", { class: "empty tiny", style: "padding:16px 4px", text: "—" }));
      col.items.forEach((t) => {
        colEl.appendChild(el("div", { class: "card", style: "padding:10px;margin-bottom:8px" }, [
          el("div", { style: "cursor:pointer", onclick: () => editTask(t) }, [
            el("div", { class: "t", style: "font-size:.86rem", text: t.text }),
            t.due ? el("div", { class: "tiny muted", style: "margin-top:3px", text: UI.prettyDate(t.due) }) : null,
          ]),
          el("div", { class: "row", style: "gap:6px;margin-top:8px;justify-content:space-between" }, [
            el("button", { class: "btn btn-ghost btn-sm", text: "◀", disabled: ci === 0, style: ci === 0 ? "opacity:.3" : "", onclick: () => cycleTaskStatus(t.id, -1) }),
            el("button", { class: "btn btn-ghost btn-sm", text: "✕", onclick: () => Store.update(NS, (s) => { s.tasks = s.tasks.filter((x) => x.id !== t.id); }) }),
            el("button", { class: "btn btn-ghost btn-sm", text: "▶", disabled: ci === cols.length - 1, style: ci === cols.length - 1 ? "opacity:.3" : "", onclick: () => cycleTaskStatus(t.id, 1) }),
          ]),
        ]));
      });
      colEl.appendChild(el("button", { class: "btn btn-soft btn-block btn-sm", style: "margin-top:auto", text: "+ Passo", onclick: () => editTask(null, { status: col.id }) }));
      board.appendChild(colEl);
    });

    view.appendChild(el("div", { class: "stack" }, [board]));
  }

  /* ----------------------------- FORMULÁRIOS (marcos e passos) ----------------------------- */
  function editMilestone(existing, presets) {
    const isNew = !existing;
    const m = existing || { id: uid(), text: "", due: (presets && presets.due) || "", status: (presets && presets.status) || "todo" };
    const f = field("Marco", { value: m.text, placeholder: "ex: Revisão de literatura, Metodologia, Escrita, Defesa…" });
    const fd = field("Data alvo (opcional)", { type: "date", value: m.due || "" });
    const fs = field("Estado", { type: "select", value: m.status, options: STATUSES.map((s) => ({ value: s.id, label: s.label })) });
    const sh = sheet(isNew ? "Novo marco" : "Editar marco", [
      f, fd, fs,
      el("div", { class: "row", style: "gap:10px;margin-top:8px" }, [
        !isNew ? el("button", { class: "btn btn-block", style: "color:var(--bad)", text: "Apagar", onclick: () => { Store.update(NS, (s) => { s.milestones = s.milestones.filter((x) => x.id !== m.id); }); sh.close(); } }) : null,
        el("button", { class: "btn btn-primary btn-block", text: "Guardar", onclick: guardClick(() => {
          const text = f.input.value.trim(); if (!text) return toast("Indica o marco.");
          const status = fs.input.value;
          Store.update(NS, (s) => {
            if (isNew) { s.milestones.push({ id: m.id, text, due: fd.input.value || "", status, done: status === "done", doneAt: status === "done" ? Date.now() : null }); }
            else { const it = s.milestones.find((x) => x.id === m.id); it.text = text; it.due = fd.input.value || ""; if (it.status !== status) { it.status = status; it.done = status === "done"; it.doneAt = status === "done" ? Date.now() : null; } }
          });
          sh.close();
        })}),
      ]),
    ]);
    setTimeout(() => f.input.focus(), 50);
  }
  function editTask(existing, presets) {
    const isNew = !existing;
    const t = existing || { id: uid(), text: "", due: (presets && presets.due) || "", status: (presets && presets.status) || "todo" };
    const f = field("Passo", { value: t.text, placeholder: "ex: Escrever secção 2.1, Ler 3 artigos…" });
    const fd = field("Data (opcional)", { type: "date", value: t.due || "" });
    const fs = field("Estado", { type: "select", value: t.status, options: STATUSES.map((s) => ({ value: s.id, label: s.label })) });
    const sh = sheet(isNew ? "Novo passo" : "Editar passo", [
      f, fd, fs,
      el("div", { class: "row", style: "gap:10px;margin-top:8px" }, [
        !isNew ? el("button", { class: "btn btn-block", style: "color:var(--bad)", text: "Apagar", onclick: () => { Store.update(NS, (s) => { s.tasks = s.tasks.filter((x) => x.id !== t.id); }); sh.close(); } }) : null,
        el("button", { class: "btn btn-primary btn-block", text: "Guardar", onclick: guardClick(() => {
          const text = f.input.value.trim(); if (!text) return toast("Indica o passo.");
          const status = fs.input.value;
          Store.update(NS, (s) => {
            if (isNew) { s.tasks.push({ id: t.id, text, due: fd.input.value || "", status, done: status === "done", doneAt: status === "done" ? Date.now() : null, createdAt: Date.now() }); }
            else { const it = s.tasks.find((x) => x.id === t.id); it.text = text; it.due = fd.input.value || ""; if (it.status !== status) { it.status = status; it.done = status === "done"; it.doneAt = status === "done" ? Date.now() : null; } }
          });
          sh.close();
        })}),
      ]),
    ]);
    setTimeout(() => f.input.focus(), 50);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
