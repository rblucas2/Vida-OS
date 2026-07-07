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
    ({ hoje: renderHoje, journal: renderJournal, habits: renderHabits, pillars: renderPillars, review: renderReview }[tab] || renderHoje)(view);
  }

  let viewDate = todayISO();
  function curDay() { const s = Store.get(NS); s.days[viewDate] = s.days[viewDate] || { tasks: [] }; return s.days[viewDate]; }

  /* ----------------------------- HOJE ----------------------------- */
  function renderHoje(view) {
    const dObj = new Date(viewDate + "T00:00:00");
    $("#subtitle").textContent = dObj.toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" });
    const los = Store.get(NS);
    const day = curDay();

    view.appendChild(integrationWidgets());
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

    // Time-blocking
    const planCard = el("div", { class: "card" }, [el("strong", { html: "🗓️ Plano do dia" })]);
    BLOCKS.forEach((bl) => {
      const tasks = day.tasks.filter((t) => t.block === bl.id);
      const head = el("div", { class: "row", style: "justify-content:space-between;margin-top:12px" }, [
        el("span", { class: "section-title", style: "margin:0", text: bl.icon + " " + bl.label }),
        el("button", { class: "btn btn-ghost btn-sm", text: "+", onclick: () => addTask(false, bl.id) }),
      ]);
      planCard.appendChild(head);
      if (!tasks.length) planCard.appendChild(el("div", { class: "tiny muted", style: "padding:2px 2px 4px", text: "—" }));
      const list = el("div", { class: "list" });
      tasks.forEach((t) => list.appendChild(taskRow(t)));
      planCard.appendChild(list);
    });
    // tarefas sem bloco
    const unb = day.tasks.filter((t) => !t.block);
    if (unb.length) {
      planCard.appendChild(el("div", { class: "section-title", text: "Sem horário" }));
      const list = el("div", { class: "list" }); unb.forEach((t) => list.appendChild(taskRow(t))); planCard.appendChild(list);
    }

    // Brain dump
    const dump = el("textarea", { placeholder: "Descarga mental — escreve aqui ideias, links, lembretes…", style: "min-height:110px" });
    dump.value = los.brainDump || "";
    let dumpT;
    dump.addEventListener("input", () => { clearTimeout(dumpT); dumpT = setTimeout(() => Store.update(NS, (s) => { s.brainDump = dump.value; }, { silent: true }), 500); });
    const dumpCard = el("div", { class: "card" }, [el("strong", { html: "🧠 Descarga mental" }), el("div", { style: "margin-top:10px" }, [dump])]);

    view.appendChild(el("div", { class: "stack" }, [top3, planCard, dumpCard]));
    view.appendChild(el("button", { class: "fab", text: "+", onclick: () => addTask(false), "aria-label": "Nova tarefa" }));
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

  /* --------------------- Widgets de integração --------------------- */
  function integrationWidgets() {
    const los = Store.get(NS), nut = Store.get("nut"), fin = Store.get("fin");
    const wrap = el("div", { class: "grid-2", style: "grid-template-columns:1fr 1fr 1fr;gap:10px" });

    // Treino / saúde — lê a app de ginásio (gymos) se estiver na mesma origem
    const gymUrl = Store.get("sys").gymUrl || "https://rblucas2.github.io/gymos/";
    const gymOn = D.gymConnected();
    const streak = D.gymStreak(los);
    const trained = D.workoutDone(nut, los);
    const last = D.gymLastSession();
    const gymBig = trained ? "✓ Hoje" : (streak > 0 ? streak + (streak === 1 ? " dia" : " dias") : "—");
    const gymLabel = trained ? (last ? last.name : "treino feito") : (gymOn ? "🔥 streak ginásio" : "abrir ginásio");
    wrap.appendChild(widget(gymUrl, "💪", gymBig, gymLabel, "var(--accent)", () => { location.href = gymUrl; }));

    // Nutrição
    const ns = D.nutritionSummary(nut, los);
    if (ns.configured) wrap.appendChild(widget("../nutrition/", "🍎", num(ns.kcalLeft) , ns.kcalLeft >= 0 ? "kcal livres" : "kcal a mais", "var(--good)", () => go("../nutrition/")));
    else wrap.appendChild(widget("../nutrition/", "🍎", "—", "Configurar", "var(--text-mute)", () => go("../nutrition/")));

    // Finanças
    const fs = D.financeSummary(fin);
    wrap.appendChild(widget("../finance/", "💶", eur0(fs.free), "livre p/ gastar", fs.free < 0 ? "var(--bad)" : "var(--good)", () => go("../finance/")));

    return wrap;
  }
  function widget(href, icon, big, label, color, onclick) {
    return el("div", { class: "card", style: "padding:13px 10px;text-align:center;cursor:pointer", onclick }, [
      el("div", { style: "font-size:1.3rem", text: icon }),
      el("div", { class: "num", style: "font-size:1.15rem;font-weight:700;color:" + color + ";margin-top:2px;line-height:1.1", text: big }),
      el("div", { class: "tiny muted", style: "font-size:.66rem", text: label }),
    ]);
  }
  function go(href) { location.href = href; }

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

    const ta = el("textarea", { placeholder: "Escreve sobre o teu dia… O que aconteceu? Como te sentiste? Pelo que estás grato?", style: "min-height:200px;line-height:1.6" });
    ta.value = entry.text || "";
    let t; ta.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => Store.update(NS, (s) => { s.journal = s.journal || {}; s.journal[viewDate] = s.journal[viewDate] || {}; s.journal[viewDate].text = ta.value; s.journal[viewDate].at = Date.now(); }, { silent: true }), 500); });

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
      el("div", { class: "card" }, [el("div", { class: "section-title", style: "margin-top:0", text: "Como te sentes?" }), moodRow, el("div", { style: "margin-top:12px" }, [ta]), promptRow]),
      el("div", { class: "tiny muted center", text: "Guardado automaticamente ✓" }),
      histCard,
    ].filter(Boolean)));
  }

  /* ----------------------------- HÁBITOS ----------------------------- */
  function renderHabits(view) {
    const los = Store.get(NS);
    $("#subtitle").textContent = "Rastreador de hábitos";
    const N = 14; // últimos 14 dias
    const days = [];
    for (let i = N - 1; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(d); }

    const list = el("div", { class: "stack" });
    if (!los.habits.length) list.appendChild(el("div", { class: "card empty", text: "Cria hábitos para acompanhares as tuas rotinas." }));
    los.habits.forEach((h) => {
      const log = (los.habitLog && los.habitLog[h.id]) || {};
      const streak = D.habitStreak(los, h.id);
      const grid = el("div", { class: "row", style: "gap:4px;margin-top:10px;flex-wrap:nowrap;overflow:auto" });
      days.forEach((d) => {
        const iso = isoDate(d); const on = !!log[iso]; const isToday = iso === todayISO();
        grid.appendChild(el("button", { title: iso, style: `flex:1;min-width:20px;aspect-ratio:1;border-radius:6px;border:${isToday ? "2px solid var(--accent)" : "1px solid var(--border)"};background:${on ? "var(--accent)" : "var(--surface-2)"};padding:0`, onclick: () => toggleHabit(h.id, iso) }));
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
      el("button", { class: "btn btn-primary btn-block", text: "Guardar", onclick: () => { const name = f.input.value.trim(); if (!name) return toast("Escreve o nome."); Store.update(NS, (s) => { if (isNew) s.habits.push({ id: uid(), name }); else { const x = s.habits.find((y) => y.id === h.id); if (x) x.name = name; } }); sh.close(); } }),
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
