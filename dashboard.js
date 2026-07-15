/* =====================================================================
   Vida OS — Dashboard inicial (command center)
   Agrega Life OS + Finanças + Nutrição + Ginásio (mesma origem).
   ===================================================================== */
(function () {
  const { el, $, clear, num, eur, eur0, todayISO, isoDate } = UI;
  const D = Domain;

  function boot() {
    App.boot({ active: "home" });     // tema + service worker + sync + barra inferior consistente
    $("#settingsBtn").addEventListener("click", App.openSettings);
    // re-render quando qualquer app muda (sync/edições)
    Store.subscribe("los", render); Store.subscribe("fin", render); Store.subscribe("nut", render);
    tick(); setInterval(tick, 1000);
    render();
  }

  function tick() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0"), mm = String(now.getMinutes()).padStart(2, "0"), ss = String(now.getSeconds()).padStart(2, "0");
    const c = $("#clockNow"); if (c) c.innerHTML = `${hh}:${mm}<span class="s">:${ss}</span>`;
  }

  function panel(cls, ix, title, meta, body) {
    const head = el("div", { class: "ph" }, [
      el("div", { class: "lbl", html: `<span class="ix">${ix}</span> // ${title}` }),
      meta ? el("div", { class: "phmeta", text: meta }) : null,
    ]);
    return el("div", { class: "panel " + cls }, [head, ...(Array.isArray(body) ? body : [body])]);
  }

  const NAME = "Rodrigo";
  function greeting() { const h = new Date().getHours(); return h < 6 ? "Boa noite" : h < 13 ? "Bom dia" : h < 20 ? "Boa tarde" : "Boa noite"; }

  function render() {
    const dash = clear($("#dash"));
    const los = Store.get("los"), fin = Store.get("fin"), nut = Store.get("nut");
    dash.appendChild(pOperator(los));
    dash.appendChild(pSession(los));
    dash.appendChild(pGoals(los));
    dash.appendChild(pFinance(fin));
    dash.appendChild(pHabits(los));
    dash.appendChild(pNutrition(nut, los));
    dash.appendChild(pTasks(los));
    dash.appendChild(pCalendar(los));
  }

  /* 01 — Operador */
  function pOperator(los) {
    let best = 0, count = 0;
    (los.habits || []).forEach((h) => { best = Math.max(best, D.habitStreak(los, h.id)); if (los.habitLog && los.habitLog[h.id] && los.habitLog[h.id][todayISO()]) count++; });
    return panel("c3", "01", "Operador", "● online", [
      el("div", { class: "row", style: "gap:14px" }, [
        el("div", { class: "avatar", text: NAME[0] }),
        el("div", {}, [el("div", { style: "font-weight:800;font-size:1.05rem", text: NAME }), el("div", { class: "tiny muted", text: "A construir o dia." })]),
      ]),
      el("div", { class: "statline", style: "margin-top:14px" }, [
        el("div", { class: "stat" }, [el("div", { class: "n", text: best }), el("div", { class: "l", text: "Melhor streak" })]),
        el("div", { class: "stat" }, [el("div", { class: "n", style: "color:var(--accent)", text: count }), el("div", { class: "l", text: "Feitos hoje" })]),
      ]),
    ]);
  }

  /* 02 — Sessão / saudação + relógio + captura */
  function pSession(los) {
    const now = new Date();
    const cap = el("input", { placeholder: "Captura rápida… (Enter para guardar no brain dump)" });
    cap.addEventListener("keydown", (e) => { if (e.key === "Enter" && cap.value.trim()) { Store.update("los", (s) => { s.brainDump = (s.brainDump ? s.brainDump + "\n" : "") + cap.value.trim(); }, { silent: true }); UI.toast("Guardado no brain dump ✓"); cap.value = ""; } });
    return panel("c6", "02", "Sessão", now.toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" }).toUpperCase(), [
      el("div", { class: "row between", style: "align-items:flex-start;gap:16px;flex-wrap:wrap" }, [
        el("div", { class: "greet", html: `${greeting()}, <em>${NAME}</em>.` }),
        el("div", { class: "clock", id: "clockNow", html: "00:00<span class='s'>:00</span>" }),
      ]),
      el("div", { class: "caprow", style: "margin-top:16px" }, [cap, el("button", { class: "btn btn-primary", text: "Capturar", onclick: () => { const ev = new KeyboardEvent("keydown", { key: "Enter" }); cap.dispatchEvent(ev); } })]),
    ]);
  }

  /* 03 — Finance pulse */
  function pFinance(fin) {
    const nw = D.netWorth(fin); const s = D.financeSummary(fin);
    const hist = Object.entries(fin.nwHistory || {}).sort((a, b) => a[0].localeCompare(b[0])).slice(-12).map((h) => h[1]);
    const spark = hist.length >= 2 ? UI.lineChart(hist, { height: 46, color: "var(--good)" }) : null;
    return panel("c4", "03", "Finance Pulse", nw.net >= 0 ? "▲" : "▼", [
      el("a", { class: "applink2", href: "./finance/" }, [
        el("div", { class: "hbig num", text: eur0(nw.net) }),
        el("div", { class: "tiny muted", text: "Património líquido" }),
        spark || el("div", { class: "emptymini", text: "Sem histórico ainda." }),
        el("div", { class: "statline", style: "margin-top:10px" }, [
          el("div", { class: "stat" }, [el("div", { class: "n", style: "color:" + (s.free < 0 ? "var(--bad)" : "var(--good)"), text: eur0(s.free) }), el("div", { class: "l", text: "Livre / mês" })]),
          el("div", { class: "stat" }, [el("div", { class: "n", text: eur0(s.balance) }), el("div", { class: "l", text: "Poupança / mês" })]),
        ]),
      ]),
    ]);
  }

  /* 04 — Hábitos + score do dia */
  function pHabits(los) {
    const habits = los.habits || [];
    const done = habits.filter((h) => (los.habitLog && los.habitLog[h.id] && los.habitLog[h.id][todayISO()])).length;
    const pct = habits.length ? Math.round(done / habits.length * 100) : 0;
    const score = el("div", { class: "row", style: "gap:16px;align-items:center;margin-bottom:12px" }, [
      el("div", { style: "flex:none" }, [UI.ring(pct, { size: 68, stroke: 8, label: pct + "", color: "var(--accent)" })]),
      el("div", {}, [el("div", { class: "dscore", text: pct }), el("div", { class: "tiny muted", text: pct >= 80 ? "No caminho ✓" : pct >= 40 ? "Em progresso" : "Vamos lá 💪" })]),
    ]);
    const grid = el("div", { class: "habgrid" });
    if (!habits.length) grid.appendChild(el("div", { class: "emptymini", text: "Sem hábitos. Cria-os em Espiritual." }));
    habits.slice(0, 6).forEach((h) => {
      const on = !!(los.habitLog && los.habitLog[h.id] && los.habitLog[h.id][todayISO()]);
      grid.appendChild(el("div", { class: "habcard" + (on ? " on" : ""), onclick: () => toggleHabit(h.id) }, [
        el("div", { class: "cbx" + (on ? " on" : ""), html: on ? "✓" : "" }),
        el("div", { class: "grow" }, [el("div", { class: "nm", text: h.name }), el("div", { class: "tiny muted", text: "🔥 " + D.habitStreak(los, h.id) })]),
      ]));
    });
    return panel("c5", "04", "Hábitos", done + "/" + habits.length, [score, grid]);
  }
  function toggleHabit(id) { Store.update("los", (s) => { s.habitLog = s.habitLog || {}; s.habitLog[id] = s.habitLog[id] || {}; const t = todayISO(); if (s.habitLog[id][t]) delete s.habitLog[id][t]; else s.habitLog[id][t] = true; }); }

  /* 05 — Nutrição */
  function pNutrition(nut, los) {
    const t = D.effectiveTargets(nut, los);
    const body = [];
    if (!t) body.push(el("a", { class: "applink2", href: "./nutrition/" }, [el("div", { class: "emptymini", text: "Define metas na Nutrição." })]));
    else {
      const got = D.dayIntake(nut);
      const left = Math.round(t.kcal - got.kcal);
      body.push(el("a", { class: "applink2", href: "./nutrition/" }, [
        el("div", { class: "hbig num", style: "color:" + (left < 0 ? "var(--bad)" : "var(--text)"), text: num(got.kcal) }),
        el("div", { class: "tiny muted", text: "kcal hoje · " + (left >= 0 ? num(left) + " restantes" : num(-left) + " a mais") }),
        el("div", { class: "mini-macros" }, [
          mm("PROT", num(got.p) + "g", "var(--good)"),
          mm("HID", num(got.c) + "g", "#3b82f6"),
          mm("GORD", num(got.f) + "g", "var(--warn)"),
        ]),
      ]));
      const items = (nut.diary && nut.diary[todayISO()]) || [];
      if (items.length) {
        const list = el("div", { style: "margin-top:10px" });
        items.slice(-4).forEach((it) => list.appendChild(el("div", { class: "meal-item" }, [
          el("div", { class: "grow", style: "min-width:0" }, [el("div", { style: "font-size:.84rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis", text: it.nome })]),
          el("div", { class: "tiny num muted", text: num(it.kcal) + " kcal" }),
        ])));
        body.push(list);
      }
    }
    body.push(el("a", { class: "btn btn-soft btn-block btn-sm", href: "./nutrition/", style: "margin-top:10px;text-decoration:none", text: "+ Registar refeição" }));
    return panel("c3", "05", "Nutrição", "hoje", body);
  }
  function mm(k, v, c) { return el("div", { class: "mm" }, [el("div", { class: "v", style: "color:" + c, text: v }), el("div", { class: "k", text: k })]); }

  /* 06 — Tarefas de hoje */
  function pTasks(los) {
    const day = (los.days && los.days[todayISO()]) || { tasks: [] };
    const tasks = day.tasks || [];
    const done = tasks.filter((t) => t.done).length;
    const list = el("div", {});
    if (!tasks.length) list.appendChild(el("div", { class: "emptymini", text: "Sem tarefas para hoje. Abre o Life OS para planear." }));
    tasks.slice(0, 8).forEach((t) => list.appendChild(el("div", { class: "checkline" + (t.done ? " done" : "") }, [
      el("div", { class: "cbx" + (t.done ? " on" : ""), html: t.done ? "✓" : "", onclick: () => toggleTask(t.id) }),
      el("div", { class: "tx", text: (t.top ? "★ " : "") + t.text }),
    ])));
    return panel("c5", "06", "Tarefas de hoje", done + "/" + tasks.length, [list]);
  }
  function toggleTask(id) { Store.update("los", (s) => { const d = s.days[todayISO()]; if (!d) return; const t = d.tasks.find((x) => x.id === id); if (t) t.done = !t.done; }); }

  /* 07 — Calendário (semana + plano do dia) */
  function pCalendar(los) {
    const now = new Date(); const dow = (now.getDay() + 6) % 7; const monday = new Date(now); monday.setDate(now.getDate() - dow);
    const strip = el("div", { class: "weekstrip" });
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday); d.setDate(monday.getDate() + i); const iso = isoDate(d); const isToday = iso === todayISO();
      const has = !!(los.days && los.days[iso] && los.days[iso].tasks && los.days[iso].tasks.length);
      strip.appendChild(el("a", { class: "applink2", href: "./lifeos/" }, [el("div", { class: "d" + (isToday ? " sel" : "") }, [
        el("div", { class: "wn", text: UI.DAYS[d.getDay()] }), el("div", { class: "dn", text: d.getDate() }), has ? el("div", { class: "pt" }) : el("div", { style: "height:5px" }),
      ])]));
    }
    const day = (los.days && los.days[todayISO()]) || { tasks: [] };
    const BLOCKS = [{ id: "manha", label: "Manhã" }, { id: "tarde", label: "Tarde" }, { id: "noite", label: "Noite" }];
    const box = el("div", { class: "schedule", style: "margin-top:14px" }); let any = false;
    BLOCKS.forEach((b) => { (day.tasks || []).filter((t) => t.block === b.id).forEach((t) => { any = true; box.appendChild(el("div", { class: "s-item" }, [el("div", { class: "tm", text: b.label }), el("div", { style: "flex:1;" + (t.done ? "color:var(--text-mute);text-decoration:line-through" : ""), text: t.text })])); }); });
    if (!any) box.appendChild(el("div", { class: "emptymini", text: "Nada agendado hoje. Planeia o dia em Espiritual." }));
    return panel("c7", "07", "Calendário", now.toLocaleDateString("pt-PT", { month: "long", year: "numeric" }).toUpperCase(), [strip, box]);
  }

  /* 08 — Objetivos semana / mês */
  function pGoals(los) {
    const fw = el("input", { placeholder: "Objetivo da semana…", value: los.weeklyGoal || "" });
    const fm = el("input", { placeholder: "Objetivo do mês…", value: los.monthlyGoal || "" });
    fw.addEventListener("change", () => Store.update("los", (s) => { s.weeklyGoal = fw.value.trim(); }, { silent: true }));
    fm.addEventListener("change", () => Store.update("los", (s) => { s.monthlyGoal = fm.value.trim(); }, { silent: true }));
    return panel("c3", "08", "Objetivos", "", [
      el("div", { class: "lbl", style: "margin-bottom:4px", text: "Esta semana" }), el("div", { class: "goalrow" }, [fw]),
      el("div", { class: "lbl", style: "margin:12px 0 4px", text: "Este mês" }), el("div", { class: "goalrow" }, [fm]),
    ]);
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
