/* =====================================================================
   Life OS — Dashboard pessoal diário
   ===================================================================== */
(function () {
  const { el, $, clear, num, eur0, toast, undo, sheet, field, bar, uid, todayISO, isoDate } = UI;
  const D = Domain;
  const NS = "los";
  const BLOCKS = [{ id: "manha", label: "Manhã", icon: "🌅" }, { id: "tarde", label: "Tarde", icon: "☀️" }, { id: "noite", label: "Noite", icon: "🌙" }];

  function init() {
    App.boot({ active: "lifeos" });
    Store.ensure(NS, { days: {}, brainDump: "", pillars: [], habits: [], habitLog: {}, reviews: {}, journal: {} });
    seedIfEmpty();
    App.onboard("lifeos", "Espiritual", [
      "🎯 <b>Top 3</b>: define até 3 prioridades absolutas por dia.",
      "📓 <b>Diário</b>: escreve como foi o teu dia e regista o teu humor.",
      "🔥 <b>Hábitos</b> com sequências e <b>Pilares</b> com objetivos.",
      "💪🍎💶 Os widgets ligam-se às tuas apps de Ginásio, Nutrição e Finanças.",
    ]);
    $("#settingsBtn").addEventListener("click", App.openSettings);
    const tabs = $("#tabs");
    tabs.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-tab]"); if (!b) return;
      [...tabs.children].forEach((c) => c.classList.toggle("active", c === b));
      render(b.dataset.tab);
    });
    Store.subscribe(NS, () => render(current));
    Store.subscribe("nut", () => { if (current === "hoje") render("hoje"); });
    Store.subscribe("fin", () => { if (current === "hoje") render("hoje"); });
    render("hoje");
  }

  function seedIfEmpty() {
    const s = Store.get(NS);
    if (!s.habits.length && !s._seeded) {
      Store.update(NS, (st) => {
        st.habits = [{ id: uid(), name: "Beber água" }, { id: uid(), name: "Ler" }, { id: uid(), name: "Ginásio" }];
        st.pillars = [
          { id: uid(), name: "Saúde", goals: [] }, { id: uid(), name: "Finanças", goals: [] },
          { id: uid(), name: "Conhecimento", goals: [] }, { id: uid(), name: "Trabalho", goals: [] },
        ];
        st._seeded = true;
      }, { silent: true });
    }
  }

  let current = "hoje";
  function render(tab) {
    current = tab;
    const view = clear($("#view"));
    ({ hoje: renderHoje, agenda: renderAgenda, journal: renderJournal, habits: renderHabits, pillars: renderPillars, review: renderReview }[tab] || renderHoje)(view);
  }

  let viewDate = todayISO();
  function curDay() { const s = Store.get(NS); s.days[viewDate] = s.days[viewDate] || { tasks: [] }; return s.days[viewDate]; }

  /* ----------------------------- HOJE ----------------------------- */
  function renderHoje(view) {
    const dObj = new Date(viewDate + "T00:00:00");
    $("#subtitle").textContent = dObj.toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" });
    const los = Store.get(NS);
    const day = curDay();

    view.appendChild(calHeader());
    view.appendChild(weekStrip());

    // Top 3
    const tops = day.tasks.filter((t) => t.top);
    const top3 = el("div", { class: "card" }, [
      el("div", { class: "row", style: "justify-content:space-between" }, [
        el("strong", { html: "🎯 Top 3 de hoje" }),
        el("span", { class: "tiny muted", text: tops.length + "/3" }),
      ]),
    ]);
    if (!tops.length) top3.appendChild(el("div", { class: "empty tiny", text: "Define até 3 prioridades absolutas para hoje." }));
    const tl = el("div", { class: "list" });
    tops.forEach((t) => tl.appendChild(taskRow(t)));
    top3.appendChild(tl);
    if (tops.length < 3) top3.appendChild(el("button", { class: "btn btn-soft btn-block btn-sm", style: "margin-top:10px", text: "+ Adicionar prioridade", onclick: () => addTask(true) }));

    view.appendChild(el("div", { class: "stack" }, [top3, weekCalendarCard(), habitsQuickCard()]));
    view.appendChild(el("button", { class: "fab", text: "+", onclick: () => addTask(false), "aria-label": "Nova tarefa" }));
  }

  /* --------------------- Calendário semanal (Google Calendar) na página Hoje --------------------- */
  function weekCalendarCard() {
    const connected = typeof GCal !== "undefined" && GCal.enabled();
    const card = el("div", { class: "card" }, [
      el("div", { class: "row between" }, [
        el("strong", { html: "🗓️ Calendário da semana" }),
        connected ? el("button", { class: "btn btn-soft btn-sm", text: "+ Evento", onclick: newEvent }) : el("button", { class: "btn btn-soft btn-sm", text: "Ligar", onclick: App.openSettings }),
      ]),
      el("div", { class: "wk-cal", style: "margin-top:10px" }, [el("div", { class: "empty tiny", text: connected ? "A carregar…" : "" })]),
    ]);
    if (connected) loadWeekCal(card.querySelector(".wk-cal"));
    else card.querySelector(".wk-cal").appendChild(el("div", { class: "empty tiny", html: 'Liga o teu Google Calendar em Definições para veres a semana aqui.' }));
    return card;
  }
  async function loadWeekCal(box) {
    try {
      if (!GCal.connected()) {
        clear(box).appendChild(el("button", { class: "btn btn-primary btn-block", text: "Ligar Google Calendar", onclick: async () => { try { await GCal.connect(true); render("hoje"); } catch (e) { toast(e.message); } } }));
        return;
      }
      const base = new Date(viewDate + "T00:00:00"); const dow = (base.getDay() + 6) % 7;
      const monday = new Date(base); monday.setDate(base.getDate() - dow); monday.setHours(0, 0, 0, 0);
      const sunday = new Date(monday); sunday.setDate(monday.getDate() + 7);
      const events = await GCal.listEvents(monday.toISOString(), sunday.toISOString());
      const byDay = {};
      events.forEach((ev) => { const iso = ev.start.date || (ev.start.dateTime || "").slice(0, 10); (byDay[iso] = byDay[iso] || []).push(ev); });
      clear(box);
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday); d.setDate(monday.getDate() + i); const iso = isoDate(d); const isToday = iso === todayISO();
        const dayEvents = (byDay[iso] || []).sort((a, b) => (a.start.dateTime || a.start.date || "").localeCompare(b.start.dateTime || b.start.date || ""));
        const row = el("div", { style: "padding:8px 0;border-bottom:1px solid var(--border)" }, [
          el("div", { class: "row between" }, [
            el("div", { style: "font-family:var(--mono);font-size:.72rem;font-weight:700;letter-spacing:.06em;" + (isToday ? "color:var(--accent)" : "color:var(--text-soft)"), text: UI.DAYS[d.getDay()].toUpperCase() + " " + d.getDate() }),
            el("button", { class: "btn btn-ghost btn-sm", style: "padding:2px 9px", text: "+", onclick: () => { viewDate = iso; newEvent(); } }),
          ]),
        ]);
        if (!dayEvents.length) row.appendChild(el("div", { class: "tiny muted", style: "padding:1px 2px", text: "—" }));
        else dayEvents.forEach((ev) => {
          const s = ev.start.dateTime ? new Date(ev.start.dateTime) : null;
          const tm = s ? String(s.getHours()).padStart(2, "0") + ":" + String(s.getMinutes()).padStart(2, "0") : "Dia inteiro";
          row.appendChild(el("div", { class: "row", style: "gap:10px;padding:3px 0;align-items:center" }, [
            el("div", { style: "font-family:var(--mono);font-size:.68rem;color:var(--text-soft);min-width:46px", text: tm }),
            el("div", { style: "flex:1;font-size:.86rem;border-left:3px solid var(--accent);padding-left:8px", text: ev.summary || "(sem título)" }),
          ]));
        });
        box.appendChild(row);
      }
    } catch (e) { clear(box).appendChild(el("div", { class: "empty tiny", style: "color:var(--bad)", text: "Erro: " + e.message })); }
  }

  /* --------------------- Hábitos rápidos na página Hoje --------------------- */
  function habitsQuickCard() {
    const los = Store.get(NS); const habits = los.habits || [];
    const card = el("div", { class: "card" }, [
      el("div", { class: "row between" }, [el("strong", { html: "🔥 Hábitos" }), el("button", { class: "btn btn-ghost btn-sm", text: "Gerir", onclick: () => switchTab("habits") })]),
    ]);
    if (!habits.length) { card.appendChild(el("div", { class: "empty tiny", text: "Sem hábitos. Cria-os no separador Hábitos." })); return card; }
    const list = el("div", { style: "margin-top:6px" });
    habits.forEach((h) => {
      const on = !!(los.habitLog && los.habitLog[h.id] && los.habitLog[h.id][viewDate]);
      list.appendChild(el("div", { class: "item", style: "padding:10px 2px;cursor:pointer", onclick: () => toggleHabit(h.id, viewDate) }, [
        el("div", { style: `width:24px;height:24px;border-radius:8px;flex:none;border:2px solid ${on ? "var(--good)" : "var(--border-2)"};background:${on ? "var(--good)" : "transparent"};color:#fff;display:flex;align-items:center;justify-content:center;font-size:.72rem`, html: on ? "✓" : "" }),
        el("div", { class: "grow t", style: on ? "color:var(--text-mute)" : "", text: h.name }),
        el("span", { class: "pill" + (D.habitStreak(los, h.id) > 0 ? " on" : ""), text: "🔥 " + D.habitStreak(los, h.id) }),
      ]));
    });
    card.appendChild(list);
    return card;
  }

  /* --------------------- Calendário / navegação de dias --------------------- */
  function dayHasContent(iso) { const d = Store.get(NS).days[iso]; return !!(d && d.tasks && d.tasks.length); }
  function calHeader() {
    const d = new Date(viewDate + "T00:00:00");
    const isToday = viewDate === todayISO();
    return el("div", { class: "row between", style: "margin:4px 0 8px" }, [
      el("div", { class: "row", style: "gap:8px" }, [
        el("strong", { style: "text-transform:capitalize", text: d.toLocaleDateString("pt-PT", { month: "long", year: "numeric" }) }),
        isToday ? null : el("button", { class: "btn btn-soft btn-sm", text: "Hoje", onclick: () => { viewDate = todayISO(); render("hoje"); } }),
      ]),
      el("button", { class: "btn btn-sm", html: "📅 Calendário", onclick: calendarSheet }),
    ]);
  }
  function weekStrip() {
    const strip = el("div", { class: "weekstrip" });
    const base = new Date(viewDate + "T00:00:00"); const dow = (base.getDay() + 6) % 7;
    const monday = new Date(base); monday.setDate(base.getDate() - dow);
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday); d.setDate(monday.getDate() + i); const iso = isoDate(d);
      strip.appendChild(el("div", { class: "d" + (iso === viewDate ? " sel" : ""), onclick: () => { viewDate = iso; render("hoje"); } }, [
        el("div", { class: "wn", text: UI.DAYS[d.getDay()] }),
        el("div", { class: "dn", text: d.getDate() }),
        dayHasContent(iso) ? el("div", { class: "pt" }) : el("div", { style: "height:5px" }),
      ]));
    }
    return strip;
  }
  function calendarSheet() {
    const cur = new Date(viewDate + "T00:00:00"); cur.setDate(1);
    const host = el("div", {});
    function draw() {
      clear(host);
      const y = cur.getFullYear(), m = cur.getMonth();
      const startDow = (new Date(y, m, 1).getDay() + 6) % 7;
      const days = new Date(y, m + 1, 0).getDate();
      host.appendChild(el("div", { class: "row between", style: "margin-bottom:12px" }, [
        el("button", { class: "btn btn-ghost btn-sm", text: "‹", onclick: () => { cur.setMonth(m - 1); draw(); } }),
        el("strong", { style: "text-transform:capitalize", text: UI.prettyMonth(`${y}-${String(m + 1).padStart(2, "0")}`) }),
        el("button", { class: "btn btn-ghost btn-sm", text: "›", onclick: () => { cur.setMonth(m + 1); draw(); } }),
      ]));
      const grid = el("div", { class: "cal" });
      ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].forEach((w) => grid.appendChild(el("div", { class: "wd", text: w })));
      for (let i = 0; i < startDow; i++) grid.appendChild(el("div", {}));
      for (let dn = 1; dn <= days; dn++) {
        const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(dn).padStart(2, "0")}`;
        const cls = "day" + (iso === todayISO() ? " today" : "") + (iso === viewDate ? " sel" : "");
        grid.appendChild(el("div", { class: cls, onclick: () => { viewDate = iso; sh.close(); render("hoje"); } }, [
          el("div", { text: dn }), dayHasContent(iso) ? el("div", { class: "mk" }, [el("i", {})]) : null,
        ]));
      }
      host.appendChild(grid);
    }
    draw();
    const sh = sheet("Calendário", [host, el("p", { class: "tiny muted center", style: "margin-top:12px", text: "Toca num dia para o planear." })]);
  }

  function taskRow(t) {
    const cb = el("button", { class: "btn btn-icon btn-ghost", style: "width:28px;height:28px;border:2px solid " + (t.done ? "var(--good)" : "var(--border)") + ";background:" + (t.done ? "var(--good)" : "transparent") + ";color:#fff;font-size:.8rem;flex:none", html: t.done ? "✓" : "", onclick: () => toggleTask(t.id) });
    const star = el("button", { class: "btn btn-ghost btn-sm", style: "color:" + (t.top ? "var(--accent)" : "var(--text-mute)"), text: t.top ? "★" : "☆", onclick: () => toggleTop(t.id) });
    return el("div", { class: "item", style: "padding:9px 2px" }, [
      cb,
      el("div", { class: "grow", style: "cursor:pointer", onclick: () => editTask(t) }, [
        el("div", { class: "t", style: t.done ? "text-decoration:line-through;color:var(--text-mute)" : "", text: t.text }),
      ]),
      star,
    ]);
  }

  function toggleTask(id) { Store.update(NS, (s) => { const t = s.days[viewDate].tasks.find((x) => x.id === id); if (t) t.done = !t.done; }); }
  function toggleTop(id) {
    const tops = curDay().tasks.filter((t) => t.top).length;
    Store.update(NS, (s) => {
      const t = s.days[viewDate].tasks.find((x) => x.id === id);
      if (t) { if (!t.top && tops >= 3) { toast("Máximo 3 prioridades — é essa a ideia 🙂"); return; } t.top = !t.top; }
    });
  }
  function addTask(top, block) {
    if (top && curDay().tasks.filter((t) => t.top).length >= 3) return toast("Já tens 3 prioridades.");
    const fText = field("Tarefa", { placeholder: "O que precisas de fazer?" });
    const fBlock = field("Bloco", { type: "select", value: block || "", options: [{ value: "", label: "Sem horário" }, ...BLOCKS.map((b) => ({ value: b.id, label: b.label }))] });
    const sh = sheet("Nova tarefa", [fText, fBlock, el("label", { class: "row", style: "gap:8px" }, [el("input", { type: "checkbox", checked: !!top, id: "istop" }), el("span", { text: "Marcar como prioridade (Top 3)" })]),
      el("button", { class: "btn btn-primary btn-block", text: "Adicionar", onclick: () => {
        const text = fText.input.value.trim(); if (!text) return toast("Escreve a tarefa.");
        const isTop = $("#istop").checked && curDay().tasks.filter((t) => t.top).length < 3;
        Store.update(NS, (s) => { s.days[viewDate].tasks.push({ id: uid(), text, done: false, block: fBlock.input.value || null, top: isTop }); });
        sh.close();
      }})]);
    setTimeout(() => fText.input.focus(), 50);
  }
  function editTask(t) {
    const fText = field("Tarefa", { value: t.text });
    const fBlock = field("Bloco", { type: "select", value: t.block || "", options: [{ value: "", label: "Sem horário" }, ...BLOCKS.map((b) => ({ value: b.id, label: b.label }))] });
    const sh = sheet("Editar tarefa", [fText, fBlock, el("div", { class: "row", style: "gap:10px" }, [
      el("button", { class: "btn btn-block", style: "color:var(--bad)", text: "Apagar", onclick: () => { const snap = JSON.parse(JSON.stringify(t)); Store.update(NS, (s) => { const d = s.days[viewDate]; d.tasks = d.tasks.filter((x) => x.id !== t.id); }); sh.close(); undo("Tarefa apagada", () => Store.update(NS, (s) => { s.days[viewDate].tasks.push(snap); })); } }),
      el("button", { class: "btn btn-primary btn-block", text: "Guardar", onclick: () => { Store.update(NS, (s) => { const x = s.days[viewDate].tasks.find((y) => y.id === t.id); if (x) { x.text = fText.input.value.trim() || x.text; x.block = fBlock.input.value || null; } }); sh.close(); } }),
    ])]);
  }

  /* ----------------------------- AGENDA (Google Calendar) ----------------------------- */
  function renderAgenda(view) {
    $("#subtitle").textContent = "Agenda · Google Calendar";
    view.appendChild(UI.dateNav(viewDate, (d) => { viewDate = d; render("agenda"); }));

    if (typeof GCal === "undefined" || !GCal.enabled()) {
      view.appendChild(el("div", { class: "card empty" }, [
        el("span", { class: "ico", text: "📅" }),
        el("p", { text: "Liga o teu Google Calendar para veres e criares eventos — sincroniza nos dois sentidos." }),
        el("button", { class: "btn btn-primary", text: "Configurar", onclick: App.openSettings }),
      ]));
      return;
    }
    view.appendChild(el("div", { class: "row", style: "gap:10px" }, [
      el("button", { class: "btn btn-primary btn-block", text: "+ Novo evento", onclick: newEvent }),
      el("button", { class: "btn btn-soft", text: "↻", title: "Atualizar", onclick: () => render("agenda") }),
    ]));
    const card = el("div", { class: "card" }, [el("div", { class: "empty tiny", text: "A carregar eventos…" })]);
    view.appendChild(card);
    loadAgenda(card);
  }
  async function loadAgenda(card) {
    try {
      if (!GCal.connected()) {
        clear(card).appendChild(el("div", { class: "empty" }, [
          el("p", { text: "Autoriza o acesso ao teu Google Calendar." }),
          el("button", { class: "btn btn-primary", text: "Ligar Google Calendar", onclick: async () => { try { await GCal.connect(true); render("agenda"); } catch (e) { toast(e.message); } } }),
        ]));
        return;
      }
      const tMin = new Date(viewDate + "T00:00:00").toISOString();
      const tMax = new Date(viewDate + "T23:59:59").toISOString();
      const events = await GCal.listEvents(tMin, tMax);
      clear(card);
      card.appendChild(el("div", { class: "row between" }, [el("strong", { text: "Eventos" }), el("span", { class: "tiny muted", text: events.length + (events.length === 1 ? " evento" : " eventos") })]));
      if (!events.length) card.appendChild(el("div", { class: "empty tiny", text: "Sem eventos neste dia. Toca em '+ Novo evento'." }));
      else {
        const list = el("div", { class: "list" });
        events.forEach((ev) => {
          const s = ev.start && ev.start.dateTime ? new Date(ev.start.dateTime) : null;
          const tm = s ? String(s.getHours()).padStart(2, "0") + ":" + String(s.getMinutes()).padStart(2, "0") : "Dia inteiro";
          list.appendChild(el("div", { class: "item" }, [
            el("div", { style: "font-family:var(--mono);font-size:.72rem;color:var(--text-soft);min-width:52px", text: tm }),
            el("div", { class: "grow t", text: ev.summary || "(sem título)" }),
            el("button", { class: "btn btn-ghost btn-sm", text: "✕", onclick: async () => { if (await UI.confirm("Apagar este evento do Google Calendar?", { danger: true })) { try { await GCal.deleteEvent(ev.id); render("agenda"); } catch (e) { toast(e.message); } } } }),
          ]));
        });
        card.appendChild(list);
      }
    } catch (e) { clear(card).appendChild(el("div", { class: "empty tiny", style: "color:var(--bad)", text: "Erro: " + e.message })); }
  }
  function newEvent() {
    const fT = field("Título", { placeholder: "ex: Reunião, Treino, Consulta…" });
    const fAll = el("input", { type: "checkbox" });
    const fDate = field("Data", { type: "date", value: viewDate });
    const fS = field("Início", { type: "time", value: "09:00" });
    const fE = field("Fim", { type: "time", value: "10:00" });
    const sh = sheet("Novo evento", [
      fT, el("label", { class: "row", style: "gap:8px" }, [fAll, el("span", { text: "Dia inteiro" })]),
      fDate, el("div", { class: "input-row" }, [fS, fE]),
      el("button", { class: "btn btn-primary btn-block", text: "Criar no Google Calendar", onclick: async () => {
        const title = fT.input.value.trim(); if (!title) return toast("Indica o título.");
        const date = fDate.input.value;
        try {
          if (fAll.checked) { const next = new Date(date + "T00:00:00"); next.setDate(next.getDate() + 1); await GCal.createEvent({ summary: title, allDay: true, start: date, end: isoDate(next) }); }
          else { await GCal.createEvent({ summary: title, start: new Date(date + "T" + fS.input.value + ":00").toISOString(), end: new Date(date + "T" + fE.input.value + ":00").toISOString() }); }
          sh.close(); toast("Evento criado ✓"); viewDate = date; render("agenda");
        } catch (e) { toast("Falha: " + e.message, 4000); }
      }}),
    ]);
  }

  /* ----------------------------- DIÁRIO ----------------------------- */
  const MOODS = ["😔", "😕", "😐", "🙂", "😄"];
  function renderJournal(view) {
    const los = Store.get(NS);
    $("#subtitle").textContent = "Diário — como foi o teu dia";
    const entry = (los.journal && los.journal[viewDate]) || { text: "", mood: null };

    const moodRow = el("div", { class: "row", style: "gap:8px;justify-content:center;margin:4px 0 2px" }, MOODS.map((m, i) => {
      const on = entry.mood === i;
      return el("button", { class: "btn btn-icon", style: "font-size:1.4rem;width:46px;height:46px;" + (on ? "background:var(--accent-soft);border-color:var(--accent)" : ""), text: m, onclick: () => {
        Store.update(NS, (s) => { s.journal = s.journal || {}; s.journal[viewDate] = s.journal[viewDate] || { text: "" }; s.journal[viewDate].mood = i; s.journal[viewDate].at = Date.now(); });
      }});
    }));

    const ta = el("textarea", { placeholder: "Escreve ou dita sobre o teu dia… O que aconteceu? Como te sentiste? Pelo que estás grato?", style: "min-height:200px;line-height:1.6" });
    ta.value = entry.text || "";
    let t; ta.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => Store.update(NS, (s) => { s.journal = s.journal || {}; s.journal[viewDate] = s.journal[viewDate] || {}; s.journal[viewDate].text = ta.value; s.journal[viewDate].at = Date.now(); }, { silent: true }), 500); });

    // Ditado por voz (Web Speech API — grátis, no browser)
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const micBtn = el("button", { class: "btn btn-soft", html: "🎤 Ditar" });
    let rec = null, recording = false;
    micBtn.addEventListener("click", () => {
      if (!SR) return toast("Este browser não suporta ditado por voz. Experimenta o Chrome.");
      if (recording) { rec && rec.stop(); return; }
      rec = new SR(); rec.lang = "pt-PT"; rec.continuous = true; rec.interimResults = false;
      rec.onresult = (e) => {
        let txt = "";
        for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) txt += e.results[i][0].transcript;
        if (txt.trim()) { ta.value += (ta.value && !/\s$/.test(ta.value) ? " " : "") + txt.trim() + " "; ta.dispatchEvent(new Event("input")); }
      };
      rec.onend = () => { recording = false; micBtn.classList.replace("btn-primary", "btn-soft"); micBtn.innerHTML = "🎤 Ditar"; };
      rec.onerror = (ev) => { recording = false; micBtn.classList.replace("btn-primary", "btn-soft"); micBtn.innerHTML = "🎤 Ditar"; toast(ev.error === "not-allowed" ? "Permite o acesso ao microfone." : "Erro no microfone: " + ev.error); };
      try { rec.start(); recording = true; micBtn.classList.replace("btn-soft", "btn-primary"); micBtn.innerHTML = "⏹️ A gravar…"; toast("A ouvir… fala à vontade."); }
      catch (e) { toast("Não foi possível iniciar o microfone."); }
    });
    const micRow = SR
      ? el("div", { class: "row between", style: "margin:12px 0 6px" }, [el("span", { class: "tiny muted", text: "O teu dia" }), micBtn])
      : el("div", { class: "tiny muted", style: "margin:12px 0 6px", html: "🎤 O Firefox não suporta ditado dentro da app. <b>Dica:</b> toca na caixa abaixo e usa o <b>microfone do teclado</b> do telemóvel (funciona em qualquer app). O botão de ditar aparece no Chrome/Safari." });

    const prompts = ["O melhor momento de hoje…", "Um desafio que enfrentei…", "Algo por que estou grato…", "O que quero melhorar amanhã…"];
    const promptRow = el("div", { class: "row wrap", style: "gap:6px;margin-top:8px" }, prompts.map((p) => el("button", { class: "pill", text: p, onclick: () => { ta.value += (ta.value ? "\n\n" : "") + p + " "; ta.focus(); ta.dispatchEvent(new Event("input")); } })));

    // Histórico
    const past = Object.entries(los.journal || {}).filter(([k, v]) => k !== viewDate && v && (v.text || v.mood != null)).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 30);
    const histCard = past.length ? el("div", { class: "card" }, [el("strong", { text: "Entradas anteriores" }),
      ...past.map(([k, v]) => el("div", { class: "item", style: "cursor:pointer", onclick: () => { viewDate = k; render("journal"); } }, [
        el("div", { style: "font-size:1.2rem", text: v.mood != null ? MOODS[v.mood] : "📝" }),
        el("div", { class: "grow" }, [el("div", { class: "t", text: UI.prettyDate(k) + " · " + new Date(k + "T00:00:00").toLocaleDateString("pt-PT", { weekday: "long" }) }), el("div", { class: "s", text: (v.text || "").slice(0, 60) || "—" })]),
      ]))]) : null;

    view.appendChild(UI.dateNav(viewDate, (d) => { viewDate = d; render("journal"); }));
    view.appendChild(el("div", { class: "stack" }, [
      el("div", { class: "card" }, [el("div", { class: "section-title", style: "margin-top:0", text: "Como te sentes?" }), moodRow, micRow, ta, promptRow]),
      el("div", { class: "tiny muted center", text: "Guardado automaticamente ✓" }),
      histCard,
    ].filter(Boolean)));
  }

  /* ----------------------------- HÁBITOS ----------------------------- */
  function renderHabits(view) {
    const los = Store.get(NS);
    $("#subtitle").textContent = "Rastreador de hábitos";
    const N = 7; // última semana — cabe sem precisar de deslizar, e hoje fica sempre à direita
    const days = [];
    for (let i = N - 1; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(d); }

    const list = el("div", { class: "stack" });
    if (!los.habits.length) list.appendChild(el("div", { class: "card empty", text: "Cria hábitos para acompanhares as tuas rotinas." }));
    los.habits.forEach((h) => {
      const log = (los.habitLog && los.habitLog[h.id]) || {};
      const streak = D.habitStreak(los, h.id);
      // grid.flex-wrap:nowrap + os 7 dias com flex:1 (sem min-width fixo) — cabem sempre
      // na largura do cartão, sem scroll, e "hoje" fica sempre o último (mais à direita).
      const grid = el("div", { class: "row", style: "gap:4px;margin-top:10px;flex-wrap:nowrap" });
      days.forEach((d) => {
        const iso = isoDate(d); const on = !!log[iso]; const isToday = iso === todayISO();
        grid.appendChild(el("button", { title: iso, style: `flex:1;min-width:0;aspect-ratio:1;border-radius:6px;border:${isToday ? "2px solid var(--accent)" : "1px solid var(--border)"};background:${on ? "var(--accent)" : "var(--surface-2)"};padding:0`, onclick: () => toggleHabit(h.id, iso) }));
      });
      list.appendChild(el("div", { class: "card" }, [
        el("div", { class: "row", style: "justify-content:space-between" }, [
          el("strong", { text: h.name }),
          el("div", { class: "row", style: "gap:8px" }, [
            el("span", { class: "pill" + (streak > 0 ? " on" : ""), text: "🔥 " + streak }),
            el("button", { class: "btn btn-ghost btn-sm", text: "✎", onclick: () => editHabit(h) }),
          ]),
        ]),
        grid,
        el("div", { class: "row", style: "justify-content:space-between;margin-top:4px" }, [
          el("span", { class: "tiny muted", text: isoDate(days[0]).slice(5) }), el("span", { class: "tiny muted", text: "hoje" }),
        ]),
      ]));
    });
    view.appendChild(el("div", { class: "stack" }, [el("button", { class: "btn btn-primary btn-block", text: "+ Novo hábito", onclick: () => editHabit(null) }), list]));
  }
  function toggleHabit(id, iso) { Store.update(NS, (s) => { s.habitLog = s.habitLog || {}; s.habitLog[id] = s.habitLog[id] || {}; if (s.habitLog[id][iso]) delete s.habitLog[id][iso]; else s.habitLog[id][iso] = true; }); }
  function editHabit(h) {
    const isNew = !h; const f = field("Nome do hábito", { value: h ? h.name : "", placeholder: "ex: Meditar, Dormir 8h…" });
    const sh = sheet(isNew ? "Novo hábito" : "Editar hábito", [f, el("div", { class: "row", style: "gap:10px" }, [
      !isNew ? el("button", { class: "btn btn-block", style: "color:var(--bad)", text: "Apagar", onclick: () => { const snap = JSON.parse(JSON.stringify(h)); const logSnap = JSON.parse(JSON.stringify((Store.get(NS).habitLog || {})[h.id] || {})); Store.update(NS, (s) => { s.habits = s.habits.filter((x) => x.id !== h.id); if (s.habitLog) delete s.habitLog[h.id]; }); sh.close(); undo("Hábito apagado", () => Store.update(NS, (s) => { s.habits.push(snap); s.habitLog = s.habitLog || {}; s.habitLog[h.id] = logSnap; })); } }) : null,
      el("button", { class: "btn btn-primary btn-block", text: "Guardar", onclick: (e) => {
        if (e.currentTarget.disabled) return;   // evita criar hábito em duplicado com duplo-toque
        e.currentTarget.disabled = true;
        const name = f.input.value.trim(); if (!name) { e.currentTarget.disabled = false; return toast("Escreve o nome."); }
        Store.update(NS, (s) => { if (isNew) s.habits.push({ id: uid(), name }); else { const x = s.habits.find((y) => y.id === h.id); if (x) x.name = name; } });
        sh.close();
      }}),
    ])]);
  }

  /* ----------------------------- PILARES ----------------------------- */
  function renderPillars(view) {
    const los = Store.get(NS);
    $("#subtitle").textContent = "Pilares de vida e objetivos";
    const list = el("div", { class: "stack" });
    if (!los.pillars.length) list.appendChild(el("div", { class: "card empty", text: "Cria pilares (ex: Saúde, Finanças) e objetivos para cada um." }));
    los.pillars.forEach((p) => {
      const done = p.goals.filter((g) => g.done).length; const total = p.goals.length;
      const pct = total ? (done / total) * 100 : 0;
      const card = el("div", { class: "card" }, [
        el("div", { class: "row", style: "justify-content:space-between" }, [
          el("strong", { text: p.name }),
          el("div", { class: "row", style: "gap:6px" }, [
            el("span", { class: "tiny muted num", text: done + "/" + total }),
            el("button", { class: "btn btn-ghost btn-sm", text: "✎", onclick: () => editPillar(p) }),
          ]),
        ]),
        bar(pct, pct >= 100 ? "good" : ""),
      ]);
      const gl = el("div", { class: "list", style: "margin-top:6px" });
      p.goals.forEach((g) => gl.appendChild(el("div", { class: "item", style: "padding:8px 2px" }, [
        el("button", { class: "btn btn-icon btn-ghost", style: "width:24px;height:24px;border:2px solid " + (g.done ? "var(--good)" : "var(--border)") + ";background:" + (g.done ? "var(--good)" : "transparent") + ";color:#fff;font-size:.7rem;flex:none", html: g.done ? "✓" : "", onclick: () => toggleGoal(p.id, g.id) }),
        el("div", { class: "grow t", style: g.done ? "text-decoration:line-through;color:var(--text-mute)" : "", text: g.text }),
        el("button", { class: "btn btn-ghost btn-sm", text: "✕", onclick: () => { Store.update(NS, (s) => { const pp = s.pillars.find((x) => x.id === p.id); pp.goals = pp.goals.filter((x) => x.id !== g.id); }); } }),
      ])));
      card.appendChild(gl);
      card.appendChild(el("button", { class: "btn btn-soft btn-block btn-sm", style: "margin-top:8px", text: "+ Objetivo", onclick: () => addGoal(p.id) }));
      list.appendChild(card);
    });
    view.appendChild(el("div", { class: "stack" }, [el("button", { class: "btn btn-primary btn-block", text: "+ Novo pilar", onclick: () => editPillar(null) }), list]));
  }
  function toggleGoal(pid, gid) { Store.update(NS, (s) => { const p = s.pillars.find((x) => x.id === pid); const g = p.goals.find((x) => x.id === gid); if (g) g.done = !g.done; }); }
  function addGoal(pid) {
    const f = field("Objetivo", { placeholder: "ex: Poupar 2000€, Ler 12 livros…" });
    const sh = sheet("Novo objetivo", [f, el("button", { class: "btn btn-primary btn-block", text: "Adicionar", onclick: () => { const text = f.input.value.trim(); if (!text) return; Store.update(NS, (s) => { s.pillars.find((x) => x.id === pid).goals.push({ id: uid(), text, done: false }); }); sh.close(); } })]);
    setTimeout(() => f.input.focus(), 50);
  }
  function editPillar(p) {
    const isNew = !p; const f = field("Nome do pilar", { value: p ? p.name : "", placeholder: "ex: Saúde, Conhecimento…" });
    const sh = sheet(isNew ? "Novo pilar" : "Editar pilar", [f, el("div", { class: "row", style: "gap:10px" }, [
      !isNew ? el("button", { class: "btn btn-block", style: "color:var(--bad)", text: "Apagar", onclick: () => { const snap = JSON.parse(JSON.stringify(p)); Store.update(NS, (s) => { s.pillars = s.pillars.filter((x) => x.id !== p.id); }); sh.close(); undo("Pilar apagado", () => Store.update(NS, (s) => { s.pillars.push(snap); })); } }) : null,
      el("button", { class: "btn btn-primary btn-block", text: "Guardar", onclick: () => { const name = f.input.value.trim(); if (!name) return; Store.update(NS, (s) => { if (isNew) s.pillars.push({ id: uid(), name, goals: [] }); else s.pillars.find((x) => x.id === p.id).name = name; }); sh.close(); } }),
    ])]);
  }

  /* ----------------------------- REVISÃO SEMANAL ----------------------------- */
  function weekKey(d = new Date()) {
    const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = dt.getUTCDay() || 7; dt.setUTCDate(dt.getUTCDate() + 4 - day);
    const yStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
    const wk = Math.ceil((((dt - yStart) / 86400000) + 1) / 7);
    return dt.getUTCFullYear() + "-S" + String(wk).padStart(2, "0");
  }
  function renderReview(view) {
    const los = Store.get(NS);
    const wk = weekKey();
    const r = (los.reviews && los.reviews[wk]) || { good: "", bad: "", improve: "", focus: "" };
    $("#subtitle").textContent = "Revisão semanal · " + wk;

    const isWeekend = [0, 6].includes(new Date().getDay());
    const banner = isWeekend ? el("div", { class: "card", style: "background:var(--accent-soft);border-color:transparent" }, [el("div", { class: "tiny", style: "color:var(--accent)", text: "✨ Fim de semana — bom momento para refletir sobre os últimos 7 dias." })]) : null;

    const fGood = field("O que correu bem?", { type: "textarea", value: r.good });
    const fBad = field("O que falhou ou ficou por fazer?", { type: "textarea", value: r.bad });
    const fImp = field("O que podes melhorar?", { type: "textarea", value: r.improve });
    const fFocus = field("Foco para a próxima semana", { type: "textarea", value: r.focus });

    const save = () => Store.update(NS, (s) => { s.reviews = s.reviews || {}; s.reviews[wk] = { good: fGood.input.value, bad: fBad.input.value, improve: fImp.input.value, focus: fFocus.input.value, savedAt: Date.now() }; }, { silent: true });
    [fGood, fBad, fImp, fFocus].forEach((f) => f.input.addEventListener("input", () => { clearTimeout(window.__rv); window.__rv = setTimeout(save, 600); }));

    // histórico
    const past = Object.entries(los.reviews || {}).filter(([k]) => k !== wk).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 8);
    const pastCard = past.length ? el("div", { class: "card" }, [el("strong", { text: "Revisões anteriores" }),
      ...past.map(([k, v]) => el("details", { style: "margin-top:8px" }, [
        el("summary", { class: "tiny", style: "cursor:pointer;font-weight:600", text: k }),
        el("div", { class: "tiny muted", style: "padding:6px 0", html: `<b>Bem:</b> ${esc(v.good) || "—"}<br><b>Falhou:</b> ${esc(v.bad) || "—"}<br><b>Foco:</b> ${esc(v.focus) || "—"}` }),
      ]))]) : null;

    view.appendChild(el("div", { class: "stack" }, [banner, el("div", { class: "card stack" }, [fGood, fBad, fImp, fFocus]),
      el("div", { class: "tiny muted center", text: "Guardado automaticamente ✓" }), pastCard].filter(Boolean)));
  }
  function esc(s) { return (s || "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c])); }

  function switchTab(tab) { const tabs = $("#tabs"); [...tabs.children].forEach((c) => c.classList.toggle("active", c.dataset.tab === tab)); render(tab); }

  document.addEventListener("DOMContentLoaded", init);
})();
