/* =====================================================================
   Vida OS — Dashboard inicial (command center)
   Agrega Life OS + Finanças + Nutrição + Ginásio (mesma origem).
   ===================================================================== */
(function () {
  const { el, $, clear, num, eur, eur0, todayISO, isoDate } = UI;
  const D = Domain;

  function boot() {
    App.boot({});                    // tema + service worker + sync (sem tabbar)
    $("#settingsBtn").addEventListener("click", App.openSettings);
    const gymUrl = Store.get("sys").gymUrl || "https://rblucas2.github.io/gymos/";
    $("#gymLink").href = gymUrl;
    // re-render quando qualquer app muda (sync/edições)
    Store.subscribe("los", render); Store.subscribe("fin", render); Store.subscribe("nut", render);
    tick(); setInterval(tick, 1000);
    render();
  }

  function tick() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0"), mm = String(now.getMinutes()).padStart(2, "0"), ss = String(now.getSeconds()).padStart(2, "0");
    const off = -now.getTimezoneOffset() / 60;
    $("#topmeta").innerHTML = `<span><b>${hh}:${mm}</b><span style="color:var(--text-mute)">:${ss}</span></span> <span>UTC${off >= 0 ? "+" + off : off}</span> <span>${now.toLocaleDateString("pt-PT", { day: "2-digit", month: "short" }).toUpperCase()}</span>`;
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
    dash.appendChild(pFinance(fin));
    dash.appendChild(pHabits(los));
    dash.appendChild(pNutrition(nut, los));
    dash.appendChild(pTasks(los));
    dash.appendChild(pSchedule(los));
    dash.appendChild(pGoals(los));
  }

  /* 01 — Operador */
  function pOperator(los) {
    const streak = D.gymStreak(los);
    let best = 0; (los.habits || []).forEach((h) => { best = Math.max(best, D.habitStreak(los, h.id)); });
    return panel("c4", "01", "Operador", "● online", [
      el("div", { class: "row", style: "gap:14px" }, [
        el("div", { class: "avatar", text: NAME[0] }),
        el("div", {}, [el("div", { style: "font-weight:800;font-size:1.05rem", text: NAME }), el("div", { class: "tiny muted", text: "A construir o dia." })]),
      ]),
      el("div", { class: "statline", style: "margin-top:14px" }, [
        el("div", { class: "stat" }, [el("div", { class: "n", text: best }), el("div", { class: "l", text: "Melhor streak" })]),
        el("div", { class: "stat" }, [el("div", { class: "n", style: "color:var(--accent)", text: streak }), el("div", { class: "l", text: "Ginásio (dias)" })]),
      ]),
    ]);
  }

  /* 02 — Sessão / saudação + relógio + captura */
  function pSession(los) {
    const now = new Date();
    const cap = el("input", { placeholder: "Captura rápida… (Enter para guardar no brain dump)" });
    cap.addEventListener("keydown", (e) => { if (e.key === "Enter" && cap.value.trim()) { Store.update("los", (s) => { s.brainDump = (s.brainDump ? s.brainDump + "\n" : "") + cap.value.trim(); }, { silent: true }); UI.toast("Guardado no brain dump ✓"); cap.value = ""; } });
    return panel("c8", "02", "Sessão", now.toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" }).toUpperCase(), [
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
    const ring = UI.ring(pct, { size: 74, stroke: 8, label: pct + "%", color: "var(--accent)" });
    const list = el("div", {});
    if (!habits.length) list.appendChild(el("div", { class: "emptymini", text: "Sem hábitos. Cria-os no Life OS." }));
    habits.slice(0, 6).forEach((h) => {
      const on = !!(los.habitLog && los.habitLog[h.id] && los.habitLog[h.id][todayISO()]);
      list.appendChild(el("div", { class: "checkline" + (on ? " done" : "") }, [
        el("div", { class: "cbx" + (on ? " on" : ""), html: on ? "✓" : "", onclick: () => toggleHabit(h.id) }),
        el("div", { class: "tx", text: h.name }),
        el("div", { class: "tiny muted", text: "🔥 " + D.habitStreak(los, h.id) }),
      ]));
    });
    return panel("c5", "04", "Hábitos", done + "/" + habits.length, [
      el("div", { class: "row", style: "gap:16px;align-items:center" }, [el("div", { style: "flex:none" }, [ring]), el("div", { style: "flex:1" }, [list])]),
    ]);
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
        el("div", { class: "hbig num", style: "color:" + (left < 0 ? "var(--bad)" : "var(--text)"), text: num(Math.abs(left)) }),
        el("div", { class: "tiny muted", text: (left >= 0 ? "kcal restantes" : "kcal a mais") + " · " + num(got.kcal) + "/" + num(t.kcal) }),
        el("div", { class: "mini-macros" }, [
          mm("P", num(got.p) + "/" + num(t.protein), "var(--good)"),
          mm("C", num(got.c) + "/" + num(t.carbs), "#3b82f6"),
          mm("G", num(got.f) + "/" + num(t.fat), "var(--warn)"),
        ]),
      ]));
    }
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

  /* 07 — Plano do dia (calendário) */
  function pSchedule(los) {
    const day = (los.days && los.days[todayISO()]) || { tasks: [] };
    const BLOCKS = [{ id: "manha", label: "Manhã" }, { id: "tarde", label: "Tarde" }, { id: "noite", label: "Noite" }];
    const box = el("div", { class: "schedule" });
    let any = false;
    BLOCKS.forEach((b) => {
      const ts = (day.tasks || []).filter((t) => t.block === b.id);
      if (!ts.length) return; any = true;
      ts.forEach((t) => box.appendChild(el("div", { class: "s-item" + (t.done ? " done" : "") }, [el("div", { class: "tm", text: b.label }), el("div", { style: "flex:1;" + (t.done ? "color:var(--text-mute);text-decoration:line-through" : ""), text: t.text })])));
    });
    if (!any) box.appendChild(el("div", { class: "emptymini", text: "Nada agendado. Usa o time-blocking no Life OS." }));
    return panel("c4", "07", "Plano do dia", "", [box]);
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
