/* =====================================================================
   Vida — o teu dia, hábitos, objetivos, diário, agenda e tese.
   ===================================================================== */
(function () {
  const { el, $, clear, toast, undo, sheet, field, bar, uid, todayISO, isoDate, guardClick } = UI;
  const { cap, ico, btnI, pageHead, panel, linkBtn, kpi, dayPill, shiftDay, mondayOf, daysBetween, checkBtn, barChart, heatmap } = C;
  const NS = "los";
  const BLOCKS = [{ id: "manha", label: "Manhã" }, { id: "tarde", label: "Tarde" }, { id: "noite", label: "Noite" }];
  const MOODS = [{ e: "😔", l: "Mau" }, { e: "😕", l: "Fraco" }, { e: "😐", l: "Normal" }, { e: "🙂", l: "Bom" }, { e: "😄", l: "Ótimo" }];

  let viewDate = todayISO();
  const S = () => Store.get(NS);

  function init() {
    App.boot();
    Store.ensure(NS, { days: {}, pillars: [], habits: [], habitLog: {}, reviews: {}, journal: {}, tabs: [] });
    Store.ensure("tese", { targetDate: "", milestones: [], tasks: [], works: [] });
    seedIfEmpty();
    App.onboard("vida", "Bem-vindo à Vida", [
      "☀️ <b>Hoje</b>: prioridades, hábitos, agenda, tese e como foi o teu dia — tudo num ecrã.",
      "📓 <b>Diário</b> com humor, energia, gratidão e ditado por voz.",
      "🔥 <b>Hábitos</b> com sequências e metas semanais · 🎯 <b>Objetivos</b> por pilar de vida.",
      "🗓️ <b>Agenda</b> do Google Calendar · 🎓 <b>Tese</b> com plano, quadro e trabalhos das cadeiras.",
      "🔒 Privada: sincroniza com a tua conta e pode ter PIN (Definições).",
    ]);
    Tabs.init({
      ns: NS,
      builtins: [
        { id: "hoje", type: "hoje", name: "Hoje" },
        { id: "diario", type: "diario", name: "Diário" },
        { id: "habitos", type: "habitos", name: "Hábitos" },
        { id: "objetivos", type: "objetivos", name: "Objetivos" },
        { id: "agenda", type: "agenda", name: "Agenda" },
        { id: "tese", type: "tese", name: "Tese" },
        { id: "revisao", type: "revisao", name: "Revisão" },
      ],
      renderers: { hoje: renderHoje, diario: renderDiario, habitos: renderHabitos, objetivos: renderObjetivos, agenda: renderAgenda, tese: (v) => VidaTese.render(v), revisao: renderRevisao },
    });
    Store.subscribe(NS, () => Tabs.render(Tabs.current));
    Store.subscribe("tese", () => { if (["tese", "hoje"].includes(Tabs.current)) Tabs.render(Tabs.current); });
    if (window.GCal) GCal.onChange(() => { if (["hoje", "agenda"].includes(Tabs.current)) Tabs.render(Tabs.current); });
    autoConnectGCal();
  }
  const go = (id) => Tabs.render(id);

  function seedIfEmpty() {
    const s = S();
    if (s.habits.length || s._seeded) return;
    Store.update(NS, (st) => {
      st.habits = [{ id: "seed_h_agua", name: "Beber 2L de água" }, { id: "seed_h_ler", name: "Ler 20 minutos" }, { id: "seed_h_ginasio", name: "Treinar", target: 4 }];
      st.pillars = [
        { id: "seed_p_saude", name: "Saúde", goals: [] }, { id: "seed_p_financas", name: "Finanças", goals: [] },
        { id: "seed_p_conhecimento", name: "Conhecimento", goals: [] }, { id: "seed_p_trabalho", name: "Trabalho", goals: [] },
      ];
      st._seeded = true;
    }, { silent: true, keepTime: true });
  }

  /** Google Calendar: tenta ligar sem pedir nada quando já foi autorizado antes (e ao 1.º toque, se o browser bloquear). */
  function autoConnectGCal() {
    if (!window.GCal || !GCal.enabled() || GCal.connected()) return;
    const attempt = () => GCal.connect(false);
    attempt().catch(() => document.addEventListener("pointerdown", () => { attempt().catch(() => {}); }, { once: true }));
  }

  /* ----------------------------- helpers de dados ----------------------------- */
  function day(iso) { const s = S(); return (s.days && s.days[iso]) || { tasks: [] }; }
  function updDay(iso, fn) { Store.update(NS, (s) => { s.days = s.days || {}; s.days[iso] = s.days[iso] || { tasks: [] }; s.days[iso].tasks = s.days[iso].tasks || []; fn(s.days[iso]); }); }
  const habitOn = (hid, iso) => !!((S().habitLog || {})[hid] || {})[iso];
  function toggleHabit(hid, iso) {
    Store.update(NS, (s) => { s.habitLog = s.habitLog || {}; s.habitLog[hid] = s.habitLog[hid] || {}; s.habitLog[hid][iso] = !s.habitLog[hid][iso]; });
  }
  function streak(hid) {
    let n = 0, d = todayISO();
    if (!habitOn(hid, d)) d = shiftDay(d, -1);
    while (habitOn(hid, d)) { n++; d = shiftDay(d, -1); }
    return n;
  }
  function weekCount(hid, iso) { const m = mondayOf(iso); let n = 0; for (let i = 0; i < 7; i++) if (habitOn(hid, shiftDay(m, i))) n++; return n; }
  /** Taxa de cumprimento (0..1) nos últimos N dias — hábitos semanais contam face à meta de X vezes/semana. */
  function habitRate(h, days = 30) {
    let done = 0; const t = todayISO();
    for (let i = 0; i < days; i++) if (habitOn(h.id, shiftDay(t, -i))) done++;
    const expected = h.target && h.target < 7 ? (h.target * days) / 7 : days;
    return Math.min(1, done / expected);
  }
  const moodOf = (iso) => { const j = (S().journal || {})[iso]; return j && j.mood != null ? j.mood : null; };
  function updJournal(iso, fn, opts) { Store.update(NS, (s) => { s.journal = s.journal || {}; s.journal[iso] = s.journal[iso] || {}; fn(s.journal[iso]); s.journal[iso].at = Date.now(); }, opts); }
  const fmtDay = (iso) => cap(new Date(iso + "T00:00:00").toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" }));

  function weekStrip(onPick) {
    const strip = el("div", { class: "weekstrip" });
    const start = shiftDay(mondayOf(viewDate), -7);
    for (let i = 0; i < 21; i++) {
      const iso = shiftDay(start, i), d = new Date(iso + "T00:00:00");
      const has = day(iso).tasks.length || (S().journal || {})[iso];
      strip.appendChild(el("div", { class: "d" + (iso === viewDate ? " sel" : "") + (iso === todayISO() ? " today" : ""), onclick: () => onPick(iso) }, [
        el("div", { class: "wn", text: UI.DAYS[d.getDay()] }), el("div", { class: "dn", text: d.getDate() }),
        has ? el("div", { class: "pt" }) : el("div", { style: "height:9px" }),
      ]));
    }
    setTimeout(() => { const s = strip.querySelector(".sel"); if (s && s.scrollIntoView) s.scrollIntoView({ block: "nearest", inline: "center" }); }, 0);
    return strip;
  }

  /* ----------------------------- HOJE ----------------------------- */
  function renderHoje(view) {
    const s = S();
    const isToday = viewDate === todayISO();
    const hour = new Date().getHours();
    const greet = !isToday ? (viewDate > todayISO() ? "Planear " : "") + fmtDay(viewDate).split(",")[0] + "." : hour < 6 ? "Boa noite." : hour < 13 ? "Bom dia." : hour < 20 ? "Boa tarde." : "Boa noite.";
    const habits = s.habits || [];
    const habitsDone = habits.filter((h) => habitOn(h.id, viewDate)).length;
    const tasks = day(viewDate).tasks;
    const openTop = tasks.filter((t) => t.top && !t.done).length;
    const subBits = [];
    if (habits.length) subBits.push(`${habitsDone} de ${habits.length} hábitos feitos`);
    if (tasks.length) subBits.push(`${tasks.filter((t) => !t.done).length} tarefa${tasks.filter((t) => !t.done).length === 1 ? "" : "s"} por fechar`);
    view.appendChild(pageHead({ eyebrow: fmtDay(viewDate), icon: hour >= 20 || hour < 6 ? "moon" : "sun", title: greet,
      sub: subBits.join(" · ") || "Um dia de cada vez.", actions: [dayPill(viewDate, (d) => { viewDate = d; go("hoje"); })] }));
    view.appendChild(weekStrip((iso) => { viewDate = iso; go("hoje"); }));

    // KPIs
    const mood = moodOf(viewDate), j = (s.journal || {})[viewDate] || {};
    const th = Store.get("tese");
    const dLeft = th.targetDate ? daysBetween(todayISO(), th.targetDate) : null;
    const weekEnd = shiftDay(mondayOf(todayISO()), 6);
    const teseWeek = [...(th.tasks || []), ...(th.milestones || [])].filter((i) => i.status !== "done" && i.due && i.due <= weekEnd).length;
    const best = habits.map((h) => ({ h, n: streak(h.id) })).sort((a, b) => b.n - a.n)[0];
    view.appendChild(el("div", { class: "kpis", style: "margin-top:14px" }, [
      kpi({ label: "Como foi o dia", value: mood != null ? `${MOODS[mood].e} ${MOODS[mood].l}` : "Por registar", icon: "smile", variant: "accent",
        sub: j.energy ? `energia ${j.energy}/5` + (j.highlight ? " · " + j.highlight : "") : "toca para fazer o check-in", onClick: () => checkInSheet(viewDate) }),
      kpi({ label: "Hábitos", value: `${habitsDone}/${habits.length}`, icon: "flame", sub: best && best.n ? `🔥 ${best.h.name}: ${best.n} dia${best.n === 1 ? "" : "s"}` : "começa uma sequência hoje", onClick: () => go("habitos") }),
      kpi({ label: "Tese", value: dLeft == null ? "Sem data" : dLeft >= 0 ? `${dLeft} dias` : `+${-dLeft} dias`, icon: "grad",
        sub: dLeft == null ? "define a data de apresentação" : `${teseWeek} por fazer até domingo`, variant: dLeft != null && dLeft < 0 ? "bad" : null, onClick: () => go("tese") }),
    ]));

    view.appendChild(el("div", { class: "stack", style: "margin-top:18px" }, [
      el("div", { class: "grid-2" }, [tasksPanel(), habitsPanel()]),
      el("div", { class: "grid-2" }, [agendaTodayPanel(), checkInPanel()]),
      el("div", { class: "grid-2" }, [tesePanel(), goalsFocusPanel()]),
    ]));
  }

  // --- tarefas e prioridades ---
  function taskLine(t, iso) {
    return el("div", { class: "task" }, [
      checkBtn(t.done, () => updDay(iso, (d) => { const x = d.tasks.find((y) => y.id === t.id); if (x) x.done = !x.done; }), t.text),
      el("div", { class: "grow", onclick: () => editTask(t, iso) }, [
        el("div", { class: "t" + (t.done ? " done-text" : ""), text: t.text }),
        t.block || t.time ? el("div", { class: "s", text: [t.time, (BLOCKS.find((b) => b.id === t.block) || {}).label].filter(Boolean).join(" · ") }) : null,
      ]),
      el("button", { class: "star" + (t.top ? " on" : ""), title: t.top ? "Tirar das prioridades" : "Marcar como prioridade", "aria-label": "Prioridade", html: UI.icon("star", 18), onclick: () => toggleTop(t, iso) }),
    ]);
  }
  function toggleTop(t, iso) {
    if (!t.top && day(iso).tasks.filter((x) => x.top).length >= 3) return toast("Máximo 3 prioridades — é essa a ideia 🙂");
    updDay(iso, (d) => { const x = d.tasks.find((y) => y.id === t.id); if (x) x.top = !x.top; });
  }
  function tasksPanel() {
    const tasks = day(viewDate).tasks;
    const tops = tasks.filter((t) => t.top), rest = tasks.filter((t) => !t.top);
    const order = (a, b) => (a.done - b.done) || ((a.time || "99") .localeCompare(b.time || "99"));
    const prev = shiftDay(viewDate, -1);
    const carry = viewDate === todayISO() ? day(prev).tasks.filter((t) => !t.done && !t.carried) : [];
    const body = [];
    body.push(el("div", { class: "section-title", style: "margin-top:0", text: `Top 3 · ${tops.filter((t) => t.done).length}/${tops.length}` }));
    if (!tops.length) body.push(el("div", { class: "muted tiny", style: "padding:6px 0 10px", text: "Escolhe até 3 coisas que tornam o dia um sucesso (⭐ numa tarefa)." }));
    body.push(el("div", {}, tops.sort(order).map((t) => taskLine(t, viewDate))));
    if (rest.length) {
      body.push(el("div", { class: "section-title", text: "Outras tarefas" }));
      body.push(el("div", {}, rest.sort(order).map((t) => taskLine(t, viewDate))));
    }
    if (carry.length) body.push(el("button", { class: "btn btn-ghost btn-sm", style: "margin-top:10px", text: `↪ Trazer ${carry.length} tarefa${carry.length === 1 ? "" : "s"} por fazer de ontem`, onclick: () => {
      Store.update(NS, (s) => {
        const from = s.days[prev]; s.days[viewDate] = s.days[viewDate] || { tasks: [] };
        from.tasks.forEach((t) => { if (!t.done && !t.carried) { t.carried = true; s.days[viewDate].tasks.push({ ...t, id: uid(), top: false, carried: false }); } });
      });
      toast("Tarefas trazidas ✓");
    } }));
    return panel({ title: "Prioridades e tarefas", sub: tasks.length ? `${tasks.filter((t) => t.done).length} de ${tasks.length} feitas` : "Nada planeado ainda",
      action: el("button", { class: "btn btn-soft btn-icon", "aria-label": "Nova tarefa", html: UI.icon("plus", 18), onclick: () => editTask(null, viewDate) }) }, body);
  }
  function editTask(t, iso) {
    const isNew = !t;
    t = t || { id: uid(), text: "", done: false, block: null, top: false, time: "" };
    const fText = field("Tarefa", { value: t.text, placeholder: "O que precisas de fazer?" });
    const fBlock = field("Altura do dia", { type: "select", value: t.block || "", options: [{ value: "", label: "Sem altura definida" }, ...BLOCKS.map((b) => ({ value: b.id, label: b.label }))] });
    const fTime = field("Hora (opcional)", { type: "time", value: t.time || "" });
    const fDate = field("Dia", { type: "date", value: iso });
    const topBox = el("label", { class: "check" }, [el("input", { type: "checkbox", checked: !!t.top }), el("span", { text: "⭐ Prioridade (Top 3)" })]);
    const calBox = window.GCal && GCal.enabled() ? el("label", { class: "check" }, [el("input", { type: "checkbox" }), el("span", { text: "Pôr no Google Calendar (1h)" })]) : null;
    const sh = sheet(isNew ? "Nova tarefa" : "Editar tarefa", [
      fText, el("div", { class: "input-row" }, [fDate, fTime]), fBlock, el("div", { class: "checks" }, [topBox, calBox]),
      el("div", { class: "row", style: "gap:10px;margin-top:6px" }, [
        isNew ? null : el("button", { class: "btn btn-danger btn-block", text: "Apagar", onclick: () => {
          const snap = JSON.parse(JSON.stringify(t));
          updDay(iso, (d) => { d.tasks = d.tasks.filter((x) => x.id !== t.id); });
          sh.close(); undo("Tarefa apagada", () => updDay(iso, (d) => d.tasks.push(snap)));
        } }),
        el("button", { class: "btn btn-primary btn-block", text: "Guardar", onclick: guardClick(async () => {
          const text = fText.input.value.trim(); if (!text) return toast("Escreve a tarefa.");
          const target = fDate.input.value || iso;
          let top = topBox.querySelector("input").checked;
          if (top && !t.top && day(target).tasks.filter((x) => x.top && x.id !== t.id).length >= 3) { top = false; toast("Já tens 3 prioridades nesse dia — ficou como tarefa normal."); }
          const data = { ...t, text, block: fBlock.input.value || null, time: fTime.input.value || "", top };
          Store.update(NS, (s) => {
            s.days = s.days || {};
            if (s.days[iso]) s.days[iso].tasks = (s.days[iso].tasks || []).filter((x) => x.id !== t.id);
            s.days[target] = s.days[target] || { tasks: [] };
            s.days[target].tasks = s.days[target].tasks || [];
            s.days[target].tasks.push(data);
          });
          sh.close();
          if (calBox && calBox.querySelector("input").checked) {
            try {
              const start = new Date(target + "T" + (data.time || "09:00") + ":00");
              await GCal.createEvent({ summary: text, start: start.toISOString(), end: new Date(start.getTime() + 3600000).toISOString() });
              toast("Também no Google Calendar ✓");
            } catch (e) { toast("Guardado, mas o Google Calendar falhou: " + e.message, 4500); }
          }
        }) }),
      ]),
    ]);
    setTimeout(() => fText.input.focus(), 50);
  }

  // --- hábitos de hoje ---
  function habitsPanel() {
    const habits = S().habits || [];
    const rows = habits.map((h) => {
      const on = habitOn(h.id, viewDate), st = streak(h.id);
      const weekly = h.target && h.target < 7;
      return el("div", { class: "task" }, [
        checkBtn(on, () => toggleHabit(h.id, viewDate), h.name),
        el("div", { class: "grow", onclick: () => habitSheet(h) }, [
          el("div", { class: "t" + (on ? " done-text" : ""), text: h.name }),
          el("div", { class: "s", text: weekly ? `${weekCount(h.id, viewDate)}/${h.target} esta semana` : st ? `🔥 ${st} dia${st === 1 ? " seguido" : "s seguidos"}` : "sem sequência ativa" }),
        ]),
      ]);
    });
    return panel({ title: "Hábitos", sub: habits.length ? `${habits.filter((h) => habitOn(h.id, viewDate)).length} de ${habits.length} hoje` : "Ainda sem hábitos",
      action: linkBtn("Todos", () => go("habitos")) }, [rows.length ? el("div", {}, rows) : el("div", { class: "empty", text: "Cria hábitos no separador Hábitos." })]);
  }

  // --- agenda de hoje ---
  function agendaTodayPanel() {
    const box = el("div", {}, [el("div", { class: "empty tiny", text: "A carregar…" })]);
    const p = panel({ title: "Agenda", sub: "Google Calendar", action: linkBtn("Semana", () => go("agenda")) }, [box]);
    loadEvents(viewDate, viewDate, box, { compact: true });
    return p;
  }
  /** Carrega e desenha eventos entre dois dias (inclusive) dentro de "box". */
  async function loadEvents(fromIso, toIso, box, { compact } = {}) {
    if (!window.GCal || !GCal.enabled()) {
      clear(box).appendChild(el("div", { class: "empty" }, [el("p", { style: "margin:0 0 12px", text: "Liga o teu Google Calendar para veres aqui os teus eventos." }), el("button", { class: "btn btn-soft", text: "Configurar", onclick: () => App.openSettings() })]));
      return;
    }
    if (!GCal.connected()) {
      clear(box).appendChild(el("div", { class: "empty" }, [el("button", { class: "btn btn-primary", text: "Ligar Google Calendar", onclick: async () => { try { await GCal.connect(true); } catch (e) { toast(e.message, 4000); } } })]));
      return;
    }
    try {
      const evs = await GCal.listEvents(new Date(fromIso + "T00:00:00").toISOString(), new Date(toIso + "T23:59:59").toISOString());
      clear(box);
      if (!evs.length) { box.appendChild(el("div", { class: "empty", text: compact ? "Sem eventos neste dia." : "Sem eventos." })); return; }
      evs.forEach((ev) => box.appendChild(eventLine(ev, !compact)));
    } catch (e) { clear(box).appendChild(el("div", { class: "empty", style: "color:var(--bad)", text: "Erro: " + e.message })); }
  }
  function eventTime(ev) {
    const s = ev.start && ev.start.dateTime ? new Date(ev.start.dateTime) : null;
    return s ? String(s.getHours()).padStart(2, "0") + ":" + String(s.getMinutes()).padStart(2, "0") : "Dia todo";
  }
  function eventLine(ev, withDelete) {
    return el("div", { class: "ev-line" }, [
      el("div", { class: "tm", text: eventTime(ev) }),
      el("div", { class: "ttl", text: ev.summary || "(sem título)" }),
      withDelete ? el("button", { class: "btn btn-ghost btn-icon btn-sm", "aria-label": "Apagar evento", html: UI.icon("trash", 16), onclick: async () => {
        if (!(await UI.confirm("Apagar este evento do Google Calendar?", { ok: "Apagar", danger: true }))) return;
        try { await GCal.deleteEvent(ev.id); toast("Evento apagado"); go(Tabs.current); } catch (e) { toast(e.message, 4000); }
      } }) : null,
    ]);
  }

  // --- check-in do dia ---
  function moodScale(iso, onDone) {
    const cur = moodOf(iso);
    return el("div", { class: "scale" }, MOODS.map((m, i) => el("button", { class: cur === i ? "on" : "", title: m.l, "aria-label": m.l, text: m.e, onclick: () => { updJournal(iso, (j) => { j.mood = i; }); onDone && onDone(); } })));
  }
  function energyScale(iso, onDone) {
    const cur = ((S().journal || {})[iso] || {}).energy;
    return el("div", { class: "scale small" }, [1, 2, 3, 4, 5].map((n) => el("button", { class: cur === n ? "on" : "", "aria-label": "Energia " + n, text: String(n), onclick: () => { updJournal(iso, (j) => { j.energy = n; }); onDone && onDone(); } })));
  }
  function checkInPanel() {
    const j = (S().journal || {})[viewDate] || {};
    const hl = el("input", { placeholder: "O destaque do dia, numa frase…", value: j.highlight || "", "aria-label": "Destaque do dia" });
    let t; hl.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => updJournal(viewDate, (x) => { x.highlight = hl.value.trim(); }, { silent: true }), 500); });
    return panel({ title: "Como foi o teu dia?", sub: j.text ? "Já escreveste no diário ✓" : "Check-in rápido · 20 segundos", action: linkBtn("Diário", () => go("diario")) }, [
      el("div", { class: "section-title", style: "margin-top:0", text: "Humor" }), moodScale(viewDate),
      el("div", { class: "section-title", text: "Energia" }), energyScale(viewDate),
      el("div", { class: "section-title", text: "Destaque" }), hl,
    ]);
  }
  function checkInSheet(iso) {
    const host = el("div", {});
    const draw = () => { clear(host); host.append(el("div", { class: "section-title", style: "margin-top:0", text: "Humor" }), moodScale(iso, draw), el("div", { class: "section-title", text: "Energia" }), energyScale(iso, draw)); };
    draw();
    const sh = sheet("Check-in · " + fmtDay(iso), [host, el("button", { class: "btn btn-soft btn-block", text: "Escrever no diário", onclick: () => { sh.close(); viewDate = iso; go("diario"); } })]);
  }

  // --- tese e objetivos no Hoje ---
  function tesePanel() {
    const th = Store.get("tese");
    const items = [...(th.milestones || []).map((m) => ({ ...m, kind: "milestone" })), ...(th.tasks || []).map((t) => ({ ...t, kind: "task" }))]
      .filter((i) => i.status !== "done").sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999")).slice(0, 4);
    return panel({ title: "Tese · próximos passos", sub: th.targetDate ? `Apresentação ${UI.prettyDate(th.targetDate)}` : "Define a data no separador Tese", action: linkBtn("Tese", () => go("tese")) }, [
      items.length ? el("div", {}, items.map((it) => el("div", { class: "task" }, [
        checkBtn(false, () => VidaTese.toggleDone(it.kind, it.id), it.text),
        el("div", { class: "grow", onclick: () => go("tese") }, [el("div", { class: "t", text: (it.kind === "milestone" ? "🎓 " : "") + it.text }), it.due ? el("div", { class: "s", text: UI.prettyDate(it.due) + (it.due < todayISO() ? " · atrasado" : "") }) : null]),
      ]))) : el("div", { class: "empty", text: "Sem passos por fazer. Planeia a tese no separador Tese." }),
    ]);
  }
  function goalsFocusPanel() {
    const goals = [];
    (S().pillars || []).forEach((p) => (p.goals || []).forEach((g) => { if (!g.done) goals.push({ ...g, pillar: p.name, pid: p.id }); }));
    goals.sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
    return panel({ title: "Objetivos em foco", sub: goals.length ? `${goals.length} ativos` : "Sem objetivos ativos", action: linkBtn("Todos", () => go("objetivos")) }, [
      goals.length ? el("div", { class: "src-rows" }, goals.slice(0, 4).map((g) => goalProgressRow(g, g.pid))) : el("div", { class: "empty", text: "Define objetivos para cada pilar da tua vida." }),
    ]);
  }

  /* ----------------------------- DIÁRIO ----------------------------- */
  let journalQuery = "";
  function renderDiario(view) {
    const s = S();
    const journal = s.journal || {};
    const j = journal[viewDate] || {};
    view.appendChild(pageHead({ eyebrow: "Como foi o teu dia", icon: "book", title: "Diário", sub: fmtDay(viewDate), actions: [dayPill(viewDate, (d) => { viewDate = d; go("diario"); })] }));

    // estatísticas (30 dias)
    const last30 = []; for (let i = 0; i < 30; i++) last30.push(shiftDay(todayISO(), -i));
    const moods = last30.map(moodOf).filter((m) => m != null);
    const energies = last30.map((iso) => (journal[iso] || {}).energy).filter(Boolean);
    const written = last30.filter((iso) => journal[iso] && (journal[iso].text || journal[iso].highlight || journal[iso].mood != null)).length;
    let wStreak = 0; for (let d = todayISO(); journal[d] && (journal[d].text || journal[d].mood != null); d = shiftDay(d, -1)) wStreak++;
    const avgMood = moods.length ? moods.reduce((a, b) => a + b, 0) / moods.length : null;
    view.appendChild(el("div", { class: "kpis" }, [
      kpi({ label: "Humor médio (30 dias)", value: avgMood == null ? "—" : `${MOODS[Math.round(avgMood)].e} ${(avgMood + 1).toFixed(1).replace(".", ",")}/5`, icon: "smile", variant: "accent", sub: moods.length ? `${moods.length} dias registados` : "regista o humor todos os dias" }),
      kpi({ label: "Dias escritos", value: `${written}/30`, icon: "book", sub: wStreak ? `🔥 ${wStreak} dias seguidos` : "escreve hoje para começar" }),
      kpi({ label: "Energia média", value: energies.length ? (energies.reduce((a, b) => a + b, 0) / energies.length).toFixed(1).replace(".", ",") + "/5" : "—", icon: "zap", sub: "últimos 30 dias" }),
    ]));

    // entrada do dia
    const ta = el("textarea", { class: "notes-area", style: "min-height:240px", placeholder: "Escreve (ou dita) sobre o teu dia… O que aconteceu? Como te sentiste? O que aprendeste?" });
    ta.value = j.text || "";
    const state = el("span", { class: "tiny muted" });
    let tmr; ta.addEventListener("input", () => { state.textContent = "…"; clearTimeout(tmr); tmr = setTimeout(() => { updJournal(viewDate, (x) => { x.text = ta.value; }, { silent: true }); state.textContent = "Guardado ✓"; }, 500); });
    const grat = [0, 1, 2].map((i) => {
      const inp = el("input", { placeholder: ["Hoje estou grato por…", "Também por…", "E ainda…"][i], value: (j.gratitude || [])[i] || "" });
      let tg; inp.addEventListener("input", () => { clearTimeout(tg); tg = setTimeout(() => updJournal(viewDate, (x) => { x.gratitude = x.gratitude || ["", "", ""]; x.gratitude[i] = inp.value; }, { silent: true }), 500); });
      return inp;
    });
    const hl = el("input", { placeholder: "O destaque do dia, numa frase…", value: j.highlight || "" });
    let th2; hl.addEventListener("input", () => { clearTimeout(th2); th2 = setTimeout(() => updJournal(viewDate, (x) => { x.highlight = hl.value.trim(); }, { silent: true }), 500); });

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const mic = SR ? btnI("btn-soft btn-sm", "activity", "Ditar", () => dictate(ta, mic)) : null;
    const prompts = ["O melhor momento de hoje…", "Um desafio que enfrentei…", "O que aprendi…", "Amanhã quero…"];
    const entryPanel = panel({ title: viewDate === todayISO() ? "Hoje" : fmtDay(viewDate), sub: "Guarda sozinho e sincroniza", action: mic }, [
      el("div", { class: "section-title", style: "margin-top:0", text: "Humor" }), moodScale(viewDate),
      el("div", { class: "section-title", text: "Energia" }), energyScale(viewDate),
      el("div", { class: "section-title", text: "Destaque do dia" }), hl,
      el("div", { class: "section-title", text: "Gratidão" }), el("div", { class: "stack", style: "gap:8px" }, grat),
      el("div", { class: "section-title", text: "O teu dia" }),
      el("div", { class: "row wrap", style: "gap:6px;margin-bottom:10px" }, prompts.map((p) => el("button", { class: "pill", style: "cursor:pointer", text: p, onclick: () => { ta.value += (ta.value ? "\n\n" : "") + p + " "; ta.focus(); ta.dispatchEvent(new Event("input")); } }))),
      ta, el("div", { style: "text-align:right;margin-top:6px" }, [state]),
      SR ? null : el("p", { class: "tiny muted", style: "margin:6px 0 0", text: "Dica: usa o microfone do teclado do telemóvel para ditar." }),
    ]);

    // humor ao longo do tempo
    const series = []; for (let i = 29; i >= 0; i--) { const iso = shiftDay(todayISO(), -i); const m = moodOf(iso); series.push({ label: i % 5 === 0 ? String(new Date(iso + "T00:00:00").getDate()) : "", value: m == null ? 0 : m + 1, title: `${UI.prettyDate(iso)}: ${m == null ? "sem registo" : MOODS[m].l}`, cur: iso === viewDate, iso }); }
    const moodPanel = panel({ title: "Humor", sub: "Últimos 30 dias · toca num dia para o abrir", icon: "chart" }, [barChart(series, { max: 5, onPick: (x) => { viewDate = x.iso; go("diario"); } })]);

    // entradas anteriores
    const search = el("input", { type: "search", placeholder: "Procurar no diário…", value: journalQuery });
    const listBox = el("div", { class: "tx-rows" });
    const drawList = () => {
      clear(listBox);
      const q = journalQuery.toLowerCase();
      const entries = Object.entries(S().journal || {}).filter(([, v]) => v && (v.text || v.highlight || v.mood != null))
        .filter(([, v]) => !q || [(v.text || ""), (v.highlight || ""), ...(v.gratitude || [])].join(" ").toLowerCase().includes(q))
        .sort((a, b) => b[0].localeCompare(a[0])).slice(0, 60);
      if (!entries.length) { listBox.appendChild(el("div", { class: "empty", text: q ? "Nada encontrado." : "Ainda sem entradas." })); return; }
      entries.forEach(([iso, v]) => listBox.appendChild(el("div", { class: "tx-line", onclick: () => { viewDate = iso; go("diario"); window.scrollTo(0, 0); } }, [
        el("span", { class: "bubble", style: "font-size:1.3rem", text: v.mood != null ? MOODS[v.mood].e : "📝" }),
        el("div", { class: "tl-main" }, [el("div", { class: "tl-title", text: fmtDay(iso) }), el("div", { class: "tl-sub", text: v.highlight || (v.text || "").slice(0, 90) || "—" })]),
      ])));
    };
    search.addEventListener("input", () => { journalQuery = search.value; drawList(); });
    drawList();

    view.appendChild(el("div", { class: "stack", style: "margin-top:18px" }, [entryPanel, moodPanel, panel({ title: "Entradas anteriores" }, [search, el("div", { style: "height:10px" }), listBox])]));
  }
  function dictate(ta, btn) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (btn._rec) { btn._rec.stop(); return; }
    const rec = new SR(); rec.lang = "pt-PT"; rec.continuous = true; rec.interimResults = false;
    rec.onresult = (e) => {
      let txt = ""; for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) txt += e.results[i][0].transcript;
      if (txt.trim()) { ta.value += (ta.value && !/\s$/.test(ta.value) ? " " : "") + txt.trim() + " "; ta.dispatchEvent(new Event("input")); }
    };
    const stop = () => { btn._rec = null; btn.classList.remove("btn-primary"); btn.querySelector("span:last-child").textContent = "Ditar"; };
    rec.onend = stop;
    rec.onerror = (ev) => { stop(); toast(ev.error === "not-allowed" ? "Permite o acesso ao microfone." : "Erro no microfone: " + ev.error); };
    try { rec.start(); btn._rec = rec; btn.classList.add("btn-primary"); btn.querySelector("span:last-child").textContent = "A ouvir… (parar)"; } catch (e) { toast("Não foi possível iniciar o microfone."); }
  }

  /* ----------------------------- HÁBITOS ----------------------------- */
  function renderHabitos(view) {
    const habits = S().habits || [];
    const today = todayISO();
    view.appendChild(pageHead({ eyebrow: "Consistência", icon: "flame", title: "Hábitos", sub: "Pequenas coisas, todos os dias.", actions: [btnI("btn-primary btn-lg", "plus", "Novo hábito", () => editHabit(null))] }));
    const doneToday = habits.filter((h) => habitOn(h.id, today)).length;
    const rate30 = habits.length ? habits.reduce((a, h) => a + habitRate(h, 30), 0) / habits.length : 0;
    const best = habits.map((h) => ({ h, n: streak(h.id) })).sort((a, b) => b.n - a.n)[0];
    view.appendChild(el("div", { class: "kpis" }, [
      kpi({ label: "Hoje", value: `${doneToday}/${habits.length}`, icon: "checkCircle", variant: "accent", sub: doneToday === habits.length && habits.length ? "tudo feito 🎉" : "toca no círculo para marcar" }),
      kpi({ label: "Cumprimento (30 dias)", value: Math.round(rate30 * 100) + "%", icon: "chart", sub: "média de todos os hábitos" }),
      kpi({ label: "Maior sequência", value: best && best.n ? `${best.n} dias` : "—", icon: "flame", sub: best && best.n ? best.h.name : "começa hoje" }),
    ]));

    const last7 = []; for (let i = 6; i >= 0; i--) last7.push(shiftDay(today, -i));
    const rows = habits.map((h) => {
      const weekly = h.target && h.target < 7;
      const st = streak(h.id);
      return el("div", { class: "habit-row" }, [
        el("div", { class: "task", style: "border:0;padding:0" }, [
          checkBtn(habitOn(h.id, today), () => toggleHabit(h.id, today), h.name),
          el("div", { class: "grow", onclick: () => habitSheet(h) }, [
            el("div", { class: "t", text: h.name }),
            el("div", { class: "s", text: [weekly ? `meta ${h.target}×/semana · ${weekCount(h.id, today)} esta semana` : (st ? `🔥 ${st} dia${st === 1 ? " seguido" : "s seguidos"}` : "sem sequência"), `${Math.round(habitRate(h, 30) * 100)}% em 30 dias`].join(" · ") }),
          ]),
        ]),
        el("div", { class: "dots7" }, last7.map((iso) => el("button", { class: "dot7" + (habitOn(h.id, iso) ? " on" : "") + (iso === today ? " today" : ""), title: UI.prettyDate(iso), "aria-label": UI.prettyDate(iso), onclick: () => toggleHabit(h.id, iso) }, [
          el("span", { text: UI.DAYS[new Date(iso + "T00:00:00").getDay()].slice(0, 1).toUpperCase() }),
        ]))),
      ]);
    });
    view.appendChild(el("div", { class: "stack", style: "margin-top:18px" }, [
      panel({ title: "Os teus hábitos", sub: "Toca num hábito para veres o histórico · os círculos são os últimos 7 dias" }, [rows.length ? el("div", { class: "src-rows" }, rows) : el("div", { class: "empty", text: "Cria o primeiro hábito com o botão acima." })]),
      habits.length ? panel({ title: "Todos os hábitos", sub: "Últimas 16 semanas — mais escuro = mais hábitos cumpridos", icon: "calendar" }, [heatmap(allHabitsHeat(), { weeks: 16 })]) : null,
    ].filter(Boolean)));
  }
  function allHabitsHeat() {
    const habits = S().habits || []; const out = {};
    if (!habits.length) return out;
    for (let i = 0; i < 16 * 7; i++) { const iso = shiftDay(todayISO(), -i); out[iso] = habits.filter((h) => habitOn(h.id, iso)).length / habits.length; }
    return out;
  }
  function habitSheet(h) {
    const vals = {}; for (let i = 0; i < 26 * 7; i++) { const iso = shiftDay(todayISO(), -i); if (habitOn(h.id, iso)) vals[iso] = 1; }
    const sh = sheet(h.name, [
      el("p", { class: "muted", style: "margin:0", text: `${streak(h.id)} dias seguidos · ${Math.round(habitRate(h, 30) * 100)}% em 30 dias · ${Math.round(habitRate(h, 90) * 100)}% em 90 dias` }),
      heatmap(vals, { weeks: 26, onPick: (iso) => { toggleHabit(h.id, iso); sh.close(); habitSheet(S().habits.find((x) => x.id === h.id)); } }),
      el("p", { class: "tiny muted", style: "margin:0", text: "Toca num dia para o marcar/desmarcar." }),
      el("button", { class: "btn btn-block", text: "Editar hábito", onclick: () => { sh.close(); editHabit(h); } }),
    ]);
  }
  function editHabit(h) {
    const isNew = !h;
    h = h || { id: uid(), name: "", target: 7 };
    const f = field("Nome", { value: h.name, placeholder: "ex: Meditar 10 min, Dormir antes da meia-noite…" });
    const fT = field("Frequência", { type: "select", value: String(h.target || 7), options: [{ value: "7", label: "Todos os dias" }, ...[6, 5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n}× por semana` }))] });
    const fP = field("Pilar (opcional)", { type: "select", value: h.pillarId || "", options: [{ value: "", label: "—" }, ...(S().pillars || []).map((p) => ({ value: p.id, label: p.name }))] });
    const sh = sheet(isNew ? "Novo hábito" : "Editar hábito", [f, fT, fP, el("div", { class: "row", style: "gap:10px" }, [
      isNew ? null : el("button", { class: "btn btn-danger btn-block", text: "Apagar", onclick: () => {
        const snap = JSON.parse(JSON.stringify(h)); const logSnap = JSON.parse(JSON.stringify((S().habitLog || {})[h.id] || {}));
        Store.update(NS, (s) => { s.habits = s.habits.filter((x) => x.id !== h.id); });
        sh.close(); undo("Hábito apagado", () => Store.update(NS, (s) => { s.habits.push(snap); s.habitLog[h.id] = logSnap; }));
      } }),
      el("button", { class: "btn btn-primary btn-block", text: "Guardar", onclick: guardClick(() => {
        const name = f.input.value.trim(); if (!name) return toast("Escreve o nome.");
        const data = { ...h, name, target: +fT.input.value, pillarId: fP.input.value || null };
        Store.update(NS, (s) => { const i = s.habits.findIndex((x) => x.id === h.id); if (i >= 0) s.habits[i] = data; else s.habits.push(data); });
        sh.close();
      }) }),
    ])]);
    setTimeout(() => f.input.focus(), 50);
  }

  /* ----------------------------- OBJETIVOS ----------------------------- */
  function goalPct(g) {
    if (g.done) return 100;
    if (g.target) return Math.min(100, ((+g.current || 0) / g.target) * 100);
    return 0;
  }
  function goalProgressRow(g, pid) {
    const pct = goalPct(g);
    const left = g.due ? daysBetween(todayISO(), g.due) : null;
    const meta = [g.pillar, g.target ? `${+g.current || 0}/${g.target}${g.unit ? " " + g.unit : ""}` : null, left == null ? null : left >= 0 ? `faltam ${left} dias` : `prazo passou há ${-left} dias`].filter(Boolean).join(" · ");
    return el("div", { class: "src-row", onclick: () => editGoal(pid, g) }, [
      el("div", { class: "src-top" }, [el("span", { text: g.text }), el("span", { class: "money", text: Math.round(pct) + "%" })]),
      bar(pct, g.done ? "good" : left != null && left < 0 ? "bad" : ""),
      meta ? el("div", { class: "tiny muted", style: "margin-top:6px", text: meta }) : null,
    ]);
  }
  function renderObjetivos(view) {
    const pillars = S().pillars || [];
    const all = []; pillars.forEach((p) => (p.goals || []).forEach((g) => all.push(g)));
    const active = all.filter((g) => !g.done);
    view.appendChild(pageHead({ eyebrow: "Para onde vais", icon: "target", title: "Objetivos", sub: "Os pilares da tua vida e o que queres alcançar em cada um.", actions: [btnI("btn-lg", "plus", "Novo pilar", () => editPillar(null))] }));
    view.appendChild(el("div", { class: "kpis" }, [
      kpi({ label: "Objetivos ativos", value: String(active.length), icon: "target", variant: "accent", sub: `${pillars.length} pilares de vida` }),
      kpi({ label: "Concluídos", value: String(all.length - active.length), icon: "trophy", sub: all.length ? `${Math.round((all.length - active.length) / all.length * 100)}% de todos` : "—" }),
      kpi({ label: "Progresso médio", value: active.length ? Math.round(active.reduce((a, g) => a + goalPct(g), 0) / active.length) + "%" : "—", icon: "chart", sub: "dos objetivos ativos" }),
    ]));
    const panels = pillars.map((p) => {
      const goals = (p.goals || []).slice().sort((a, b) => (a.done - b.done) || (a.due || "9999").localeCompare(b.due || "9999"));
      const done = goals.filter((g) => g.done).length;
      const linked = (S().habits || []).filter((h) => h.pillarId === p.id);
      return panel({ title: p.name, sub: goals.length ? `${done} de ${goals.length} concluídos` + (linked.length ? ` · hábitos: ${linked.map((h) => h.name).join(", ")}` : "") : "Sem objetivos ainda",
        action: el("div", { class: "row", style: "gap:6px" }, [
          el("button", { class: "btn btn-ghost btn-icon btn-sm", "aria-label": "Editar pilar", html: UI.icon("pencil", 16), onclick: () => editPillar(p) }),
          el("button", { class: "btn btn-soft btn-icon", "aria-label": "Novo objetivo", html: UI.icon("plus", 18), onclick: () => editGoal(p.id, null) }),
        ]) }, [
        goals.length ? el("div", { class: "src-rows" }, goals.map((g) => el("div", { class: "goal-line" }, [
          checkBtn(g.done, () => Store.update(NS, (s) => { const x = s.pillars.find((y) => y.id === p.id).goals.find((y) => y.id === g.id); x.done = !x.done; x.doneAt = x.done ? Date.now() : null; }), g.text),
          el("div", { style: "flex:1;min-width:0" }, [goalProgressRow(g, p.id)]),
          g.target && !g.done ? el("button", { class: "btn btn-soft btn-sm", text: "+1", "aria-label": "Somar 1", onclick: () => Store.update(NS, (s) => { const x = s.pillars.find((y) => y.id === p.id).goals.find((y) => y.id === g.id); x.current = (+x.current || 0) + 1; if (x.current >= x.target) { x.done = true; x.doneAt = Date.now(); toast("Objetivo cumprido! 🎉"); } }) }) : null,
        ]))) : el("div", { class: "empty", text: "Toca em + para criar um objetivo neste pilar." }),
      ]);
    });
    view.appendChild(el("div", { class: "stack", style: "margin-top:18px" }, panels.length ? panels : [el("div", { class: "panel empty", text: "Cria pilares (Saúde, Finanças, Relações…) e objetivos para cada um." })]));
  }
  function editGoal(pid, g) {
    const isNew = !g;
    g = g || { id: uid(), text: "", done: false };
    const f = field("Objetivo", { value: g.text, placeholder: "ex: Ler 12 livros, Correr 10 km, Entregar a tese…" });
    const fDue = field("Prazo (opcional)", { type: "date", value: g.due || "" });
    const fTarget = field("Meta numérica (opcional)", { type: "number", value: g.target || "", inputmode: "decimal", placeholder: "ex: 12" });
    const fUnit = field("Unidade", { value: g.unit || "", placeholder: "ex: livros, km" });
    const fCur = field("Progresso atual", { type: "number", value: g.current || "", inputmode: "decimal" });
    const fNote = field("Notas / porquê (opcional)", { type: "textarea", value: g.note || "" });
    const sh = sheet(isNew ? "Novo objetivo" : "Editar objetivo", [f, fDue, el("div", { class: "input-row" }, [fTarget, fUnit]), fCur, fNote,
      el("div", { class: "row", style: "gap:10px" }, [
        isNew ? null : el("button", { class: "btn btn-danger btn-block", text: "Apagar", onclick: () => {
          const snap = JSON.parse(JSON.stringify(g));
          Store.update(NS, (s) => { const p = s.pillars.find((x) => x.id === pid); p.goals = p.goals.filter((x) => x.id !== g.id); });
          sh.close(); undo("Objetivo apagado", () => Store.update(NS, (s) => { s.pillars.find((x) => x.id === pid).goals.push(snap); }));
        } }),
        el("button", { class: "btn btn-primary btn-block", text: "Guardar", onclick: guardClick(() => {
          const text = f.input.value.trim(); if (!text) return toast("Escreve o objetivo.");
          const target = parseFloat(fTarget.input.value) || 0, current = parseFloat(fCur.input.value) || 0;
          const data = { ...g, text, due: fDue.input.value || "", target: target || null, unit: fUnit.input.value.trim(), current: target ? current : null, note: fNote.input.value.trim() };
          if (target && current >= target && !data.done) { data.done = true; data.doneAt = Date.now(); }
          Store.update(NS, (s) => { const p = s.pillars.find((x) => x.id === pid); p.goals = p.goals || []; const i = p.goals.findIndex((x) => x.id === g.id); if (i >= 0) p.goals[i] = data; else p.goals.push(data); });
          sh.close();
        }) }),
      ])]);
    setTimeout(() => f.input.focus(), 50);
  }
  function editPillar(p) {
    const isNew = !p;
    const f = field("Nome do pilar", { value: p ? p.name : "", placeholder: "ex: Saúde, Relações, Espiritualidade…" });
    const sh = sheet(isNew ? "Novo pilar" : "Editar pilar", [f, el("div", { class: "row", style: "gap:10px" }, [
      isNew ? null : el("button", { class: "btn btn-danger btn-block", text: "Apagar", onclick: () => { const snap = JSON.parse(JSON.stringify(p)); Store.update(NS, (s) => { s.pillars = s.pillars.filter((x) => x.id !== p.id); }); sh.close(); undo("Pilar apagado", () => Store.update(NS, (s) => { s.pillars.push(snap); })); } }),
      el("button", { class: "btn btn-primary btn-block", text: "Guardar", onclick: guardClick(() => { const name = f.input.value.trim(); if (!name) return toast("Escreve o nome."); Store.update(NS, (s) => { if (isNew) s.pillars.push({ id: uid(), name, goals: [] }); else s.pillars.find((x) => x.id === p.id).name = name; }); sh.close(); }) }),
    ])]);
    setTimeout(() => f.input.focus(), 50);
  }

  /* ----------------------------- AGENDA ----------------------------- */
  let agendaWeek = mondayOf(todayISO());
  function renderAgenda(view) {
    const end = shiftDay(agendaWeek, 6);
    const label = `${UI.prettyDate(agendaWeek)} – ${UI.prettyDate(end)}`;
    const weekPill = el("div", { class: "month-pill" }, [
      el("button", { class: "mp-btn", "aria-label": "Semana anterior", html: UI.icon("left", 20), onclick: () => { agendaWeek = shiftDay(agendaWeek, -7); go("agenda"); } }),
      el("div", { class: "mp-label", onclick: () => { agendaWeek = mondayOf(todayISO()); go("agenda"); } }, [ico("calendar", 18), el("span", { text: label })]),
      el("button", { class: "mp-btn", "aria-label": "Semana seguinte", html: UI.icon("right", 20), onclick: () => { agendaWeek = shiftDay(agendaWeek, 7); go("agenda"); } }),
    ]);
    const on = window.GCal && GCal.enabled();
    view.appendChild(pageHead({ eyebrow: "Google Calendar", icon: "calendar", title: "Agenda", sub: on ? (GCal.connected() ? "Ligado — os eventos que criares aqui aparecem no teu Google Calendar." : "Configurado — falta ligar a sessão do Google.") : "Ainda não ligado.",
      actions: [weekPill, on ? btnI("btn-primary btn-lg", "plus", "Evento", () => newEvent(agendaWeek <= todayISO() && todayISO() <= end ? todayISO() : agendaWeek)) : null] }));
    if (!on) {
      view.appendChild(panel({ title: "Liga o teu Google Calendar", sub: "Uma vez, ~5 minutos" }, [
        el("p", { class: "muted", style: "margin:0 0 16px", text: "Vê a tua semana aqui, cria eventos e põe tarefas no calendário. Precisas de um 'Client ID' grátis do Google — as instruções estão nas Definições." }),
        btnI("btn-primary", "settings", "Abrir Definições", () => App.openSettings()),
      ]));
      return;
    }
    const days = [];
    for (let i = 0; i < 7; i++) days.push(shiftDay(agendaWeek, i));
    const boxes = {};
    const panels = days.map((iso) => {
      const box = el("div", {}, [el("div", { class: "empty tiny", text: "…" })]); boxes[iso] = box;
      const tasks = day(iso).tasks;
      return panel({ title: fmtDay(iso), sub: tasks.length ? `${tasks.filter((t) => !t.done).length} tarefa(s) por fazer` : null, cls: iso === todayISO() ? "is-today" : "",
        action: el("button", { class: "btn btn-ghost btn-icon btn-sm", "aria-label": "Novo evento", html: UI.icon("plus", 18), onclick: () => newEvent(iso) }) }, [box]);
    });
    view.appendChild(el("div", { class: "stack" }, panels));
    if (!GCal.connected()) { days.forEach((iso, i) => { clear(boxes[iso]); if (i === 0) boxes[iso].appendChild(el("button", { class: "btn btn-primary", text: "Ligar Google Calendar", onclick: async () => { try { await GCal.connect(true); } catch (e) { toast(e.message, 4000); } } })); }); return; }
    GCal.listEvents(new Date(agendaWeek + "T00:00:00").toISOString(), new Date(end + "T23:59:59").toISOString()).then((evs) => {
      const by = {}; evs.forEach((ev) => { const iso = ev.start.date || (ev.start.dateTime || "").slice(0, 10); (by[iso] = by[iso] || []).push(ev); });
      days.forEach((iso) => { clear(boxes[iso]); const list = by[iso] || []; if (!list.length) boxes[iso].appendChild(el("div", { class: "muted tiny", text: "Sem eventos." })); list.forEach((ev) => boxes[iso].appendChild(eventLine(ev, true))); });
    }).catch((e) => days.forEach((iso) => { clear(boxes[iso]).appendChild(el("div", { class: "tiny", style: "color:var(--bad)", text: "Erro: " + e.message })); }));
  }
  function newEvent(iso) {
    const fT = field("Título", { placeholder: "ex: Reunião com orientador, Treino…" });
    const allDay = el("label", { class: "check" }, [el("input", { type: "checkbox" }), el("span", { text: "Dia inteiro" })]);
    const fDate = field("Data", { type: "date", value: iso || todayISO() });
    const fS = field("Início", { type: "time", value: "09:00" }), fE = field("Fim", { type: "time", value: "10:00" });
    const sh = sheet("Novo evento", [fT, fDate, el("div", { class: "input-row" }, [fS, fE]), el("div", { class: "checks" }, [allDay]),
      el("button", { class: "btn btn-primary btn-block", text: "Criar no Google Calendar", onclick: guardClick(async () => {
        const title = fT.input.value.trim(); if (!title) return toast("Indica o título.");
        const date = fDate.input.value;
        try {
          if (allDay.querySelector("input").checked) await GCal.createEvent({ summary: title, allDay: true, start: date, end: shiftDay(date, 1) });
          else await GCal.createEvent({ summary: title, start: new Date(date + "T" + fS.input.value + ":00").toISOString(), end: new Date(date + "T" + fE.input.value + ":00").toISOString() });
          sh.close(); toast("Evento criado ✓"); go(Tabs.current);
        } catch (e) { toast("Falha: " + e.message, 4500); }
      }) }),
    ]);
    setTimeout(() => fT.input.focus(), 50);
  }

  /* ----------------------------- REVISÃO SEMANAL ----------------------------- */
  function weekKey(iso) {
    const d = new Date(iso + "T00:00:00");
    const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dn = dt.getUTCDay() || 7; dt.setUTCDate(dt.getUTCDate() + 4 - dn);
    const y0 = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
    return dt.getUTCFullYear() + "-S" + String(Math.ceil((((dt - y0) / 86400000) + 1) / 7)).padStart(2, "0");
  }
  let reviewWeek = mondayOf(todayISO());
  function weekStats(monday) {
    const s = S(); const days = []; for (let i = 0; i < 7; i++) days.push(shiftDay(monday, i));
    const habits = s.habits || [];
    let hDone = 0, hExp = 0; habits.forEach((h) => { const exp = h.target && h.target < 7 ? h.target : 7; hExp += exp; hDone += Math.min(exp, days.filter((iso) => habitOn(h.id, iso)).length); });
    const moods = days.map(moodOf).filter((m) => m != null);
    const tasks = days.flatMap((iso) => day(iso).tasks);
    const th = Store.get("tese");
    const from = new Date(monday + "T00:00:00").getTime(), to = from + 7 * 86400000;
    const teseDone = [...(th.tasks || []), ...(th.milestones || [])].filter((i) => i.doneAt && i.doneAt >= from && i.doneAt < to).length;
    return { habits: hExp ? hDone / hExp : null, mood: moods.length ? moods.reduce((a, b) => a + b, 0) / moods.length : null, tasksDone: tasks.filter((t) => t.done).length, tasksTotal: tasks.length, teseDone, written: days.filter((iso) => (s.journal || {})[iso] && (s.journal[iso].text || s.journal[iso].mood != null)).length };
  }
  function renderRevisao(view) {
    const wk = weekKey(reviewWeek);
    const r = (S().reviews || {})[wk] || {};
    const label = `${UI.prettyDate(reviewWeek)} – ${UI.prettyDate(shiftDay(reviewWeek, 6))}`;
    const weekPill = el("div", { class: "month-pill" }, [
      el("button", { class: "mp-btn", "aria-label": "Semana anterior", html: UI.icon("left", 20), onclick: () => { reviewWeek = shiftDay(reviewWeek, -7); go("revisao"); } }),
      el("div", { class: "mp-label" }, [ico("calendar", 18), el("span", { text: label })]),
      el("button", { class: "mp-btn", "aria-label": "Semana seguinte", html: UI.icon("right", 20), onclick: () => { reviewWeek = shiftDay(reviewWeek, 7); go("revisao"); } }),
    ]);
    view.appendChild(pageHead({ eyebrow: "Olhar para trás · " + wk, icon: "repeat", title: "Revisão semanal", sub: "10 minutos ao domingo para fechar a semana e preparar a próxima.", actions: [weekPill] }));
    const cur = weekStats(reviewWeek), prev = weekStats(shiftDay(reviewWeek, -7));
    const delta = (a, b, pct) => (a == null || b == null) ? "" : ` · ${a >= b ? "▲" : "▼"} ${pct ? Math.abs(Math.round((a - b) * 100)) + " p.p." : Math.abs(a - b).toFixed(1).replace(".", ",")} vs semana anterior`;
    view.appendChild(el("div", { class: "kpis" }, [
      kpi({ label: "Hábitos cumpridos", value: cur.habits == null ? "—" : Math.round(cur.habits * 100) + "%", icon: "flame", variant: "accent", sub: "da meta semanal" + delta(cur.habits, prev.habits, true) }),
      kpi({ label: "Humor médio", value: cur.mood == null ? "—" : `${MOODS[Math.round(cur.mood)].e} ${(cur.mood + 1).toFixed(1).replace(".", ",")}`, icon: "smile", sub: `${cur.written}/7 dias registados` + delta(cur.mood, prev.mood) }),
      kpi({ label: "Feito", value: `${cur.tasksDone} tarefas`, icon: "checkCircle", sub: `de ${cur.tasksTotal} planeadas · ${cur.teseDone} passo(s) da tese` }),
    ]));
    const fields = [["good", "O que correu bem?"], ["bad", "O que falhou ou ficou por fazer?"], ["improve", "O que vais fazer diferente?"], ["focus", "Foco para a próxima semana"]].map(([k, l]) => {
      const f = field(l, { type: "textarea", value: r[k] || "" });
      f.input.addEventListener("input", () => { clearTimeout(f._t); f._t = setTimeout(() => Store.update(NS, (s) => { s.reviews = s.reviews || {}; s.reviews[wk] = { ...(s.reviews[wk] || {}), [k]: f.input.value, savedAt: Date.now() }; }, { silent: true }), 600); });
      return f;
    });
    const past = Object.entries(S().reviews || {}).filter(([k]) => k !== wk).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12);
    view.appendChild(el("div", { class: "stack", style: "margin-top:18px" }, [
      panel({ title: "A tua reflexão", sub: "Guarda sozinho" }, [el("div", { class: "stack", style: "gap:14px" }, fields)]),
      past.length ? panel({ title: "Revisões anteriores" }, [el("div", {}, past.map(([k, v]) => el("details", { class: "rev" }, [
        el("summary", { text: k + (v.focus ? " · foco: " + v.focus.slice(0, 60) : "") }),
        el("div", { class: "muted", style: "white-space:pre-wrap;padding:8px 0 4px" }, [`Bem: ${v.good || "—"}\nFalhou: ${v.bad || "—"}\nMelhorar: ${v.improve || "—"}\nFoco: ${v.focus || "—"}`]),
      ])))]) : null,
    ].filter(Boolean)));
  }

  /* ----------------------------- DEFINIÇÕES: Google Calendar ----------------------------- */
  window.VidaSettings = function () {
    const gc = Store.get("sys").gcal || {};
    const fCid = UI.field("Client ID do Google", { value: gc.clientId || "", placeholder: "…apps.googleusercontent.com" });
    const fCal = UI.field("Calendário (id ou 'primary')", { value: gc.calendarId || "primary" });
    const state = el("span", { class: "pill" });
    const refresh = () => { const c = window.GCal && GCal.connected(); state.innerHTML = `<span class="dot" style="background:${c ? "var(--good)" : "var(--text-mute)"}"></span>${c ? "Ligado ✓" : (fCid.input.value.trim() ? "Configurado" : "Desligado")}`; };
    const save = () => Store.update("sys", (s) => { s.gcal = { clientId: fCid.input.value.trim(), calendarId: fCal.input.value.trim() || "primary" }; }, { silent: true });
    setTimeout(refresh, 0);
    return [
      el("div", { class: "section-title", text: "Google Calendar" }),
      el("div", { class: "row" }, [el("span", { class: "muted tiny", text: "Estado:" }), state]),
      fCid, fCal,
      el("div", { class: "row", style: "gap:10px" }, [
        el("button", { class: "btn btn-block", text: "Guardar", onclick: () => { save(); refresh(); toast("Guardado ✓"); } }),
        el("button", { class: "btn btn-primary btn-block", text: "Ligar", onclick: async () => { if (!fCid.input.value.trim()) return toast("Cola o Client ID primeiro."); save(); try { await GCal.connect(true); refresh(); toast("Google Calendar ligado ✓"); } catch (e) { toast("Falha: " + e.message, 4500); } } }),
      ]),
      el("details", { class: "card" }, [
        el("summary", { style: "cursor:pointer;font-weight:600", text: "Como ligar o Google Calendar (1x, ~5 min)" }),
        el("ol", { class: "muted tiny", style: "line-height:1.7;padding-left:18px" }, [
          el("li", { html: 'Abre <a class="link" href="https://console.cloud.google.com/" target="_blank" rel="noopener">console.cloud.google.com</a> e cria um projeto (grátis) — ou usa o que já tinhas para a Vida OS.' }),
          el("li", { text: "APIs & Services → Library → ativa 'Google Calendar API'." }),
          el("li", { text: "OAuth consent screen → External → preenche o nome e adiciona-te em 'Test users'." }),
          el("li", { text: "Credentials → Create credentials → OAuth client ID → 'Web application'." }),
          el("li", { html: "Em 'Authorized JavaScript origins' tem de estar: <b>" + location.origin + "</b> (se já usavas na Vida OS, já está)." }),
          el("li", { text: "Copia o Client ID, cola acima, Guardar → Ligar." }),
        ]),
      ]),
    ];
  };

  window.VidaApp = { go, day, habitOn };
  document.addEventListener("DOMContentLoaded", init);
})();
