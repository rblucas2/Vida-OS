/* =====================================================================
   Tese — plano de ação da tese de mestrado: marcos de longo prazo e
   passos do dia-a-dia, com contagem decrescente até à apresentação.
   ===================================================================== */
(function () {
  const { el, $, clear, toast, sheet, field, bar, uid, todayISO, guardClick } = UI;
  const NS = "tese";

  function init() {
    App.boot({ active: "tese" });
    Store.ensure(NS, { targetDate: "", milestones: [], tasks: [] });
    migrateFromLifeos();
    App.onboard("tese", "Tese", [
      "🎓 Define a <b>data prevista de apresentação</b> e acompanha a contagem decrescente.",
      "🧭 <b>Marcos</b>: as fases de longo prazo da tese (revisão de literatura, metodologia, escrita, defesa…).",
      "✅ <b>Passos</b>: o que vais fazer hoje ou esta semana, ligado ao marco que avança.",
    ]);
    $("#settingsBtn").addEventListener("click", App.openSettings);
    Store.subscribe(NS, render);
    render();
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

  function daysUntil(iso) {
    if (!iso) return null;
    const target = new Date(iso + "T00:00:00"); const today = new Date(todayISO() + "T00:00:00");
    return Math.round((target - today) / 86400000);
  }

  function render() {
    const view = clear($("#view"));
    const th = Store.get(NS);
    $("#subtitle").textContent = "Plano de ação da tese";

    const dLeft = daysUntil(th.targetDate);
    const hero = el("div", { class: "hero" }, [
      el("div", { class: "label", text: "Apresentação da tese" }),
      el("div", { class: "value", text: dLeft == null ? "—" : dLeft >= 0 ? dLeft + " dias" : "atrasada " + Math.abs(dLeft) + "d" }),
      el("div", { class: "foot", text: th.targetDate ? UI.prettyDate(th.targetDate) : "Define abaixo a data prevista de apresentação." }),
    ]);
    const fDate = field("Data de apresentação (prevista)", { type: "date", value: th.targetDate || "" });
    fDate.input.addEventListener("change", () => { Store.update(NS, (s) => { s.targetDate = fDate.input.value; }, { silent: true }); render(); });

    const weekAgo = Date.now() - 6 * 86400000;
    const doneThisWeek = th.tasks.filter((t) => t.done && t.doneAt && t.doneAt >= weekAgo).length;
    const motivCard = el("div", { class: "card" }, [
      el("div", { class: "row", style: "justify-content:space-between;align-items:center" }, [
        el("div", {}, [el("div", { class: "tiny muted", text: "Esta semana" }), el("div", { class: "num", style: "font-weight:800;font-size:1.3rem", text: doneThisWeek + " passo(s) concluído(s)" })]),
        el("div", { class: "tiny muted", style: "max-width:140px;text-align:right", text: doneThisWeek ? "Continua assim 💪" : "Começa por um passo pequeno hoje." }),
      ]),
    ]);

    // Marcos — visão de longo prazo (fases da tese: revisão de literatura, metodologia, escrita, defesa…)
    const doneM = th.milestones.filter((m) => m.done).length, totalM = th.milestones.length;
    const milestonesCard = el("div", { class: "card" }, [
      el("div", { class: "row", style: "justify-content:space-between" }, [
        el("strong", { text: "Marcos — visão de longo prazo" }),
        el("span", { class: "tiny muted num", text: doneM + "/" + totalM }),
      ]),
      bar(totalM ? (doneM / totalM) * 100 : 0, doneM === totalM && totalM ? "good" : ""),
    ]);
    const ml = el("div", { class: "list", style: "margin-top:6px" });
    if (!th.milestones.length) ml.appendChild(el("div", { class: "empty tiny", text: "Sem marcos ainda — ex: Revisão de literatura, Metodologia, Resultados, Escrita, Defesa." }));
    th.milestones.slice().sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999")).forEach((m) => {
      const dm = daysUntil(m.due);
      ml.appendChild(el("div", { class: "item", style: "padding:8px 2px" }, [
        el("button", { class: "btn btn-icon btn-ghost", style: "width:24px;height:24px;border:2px solid " + (m.done ? "var(--good)" : "var(--border)") + ";background:" + (m.done ? "var(--good)" : "transparent") + ";color:#fff;font-size:.7rem;flex:none", html: m.done ? "✓" : "", onclick: () => toggleMilestone(m.id) }),
        el("div", { class: "grow", style: m.done ? "text-decoration:line-through;color:var(--text-mute)" : "" }, [
          el("div", { class: "t", text: m.text }),
          m.due ? el("div", { class: "s tiny muted", text: (dm >= 0 ? dm + "d restantes" : "atrasado " + Math.abs(dm) + "d") + " · " + UI.prettyDate(m.due) }) : null,
        ]),
        el("button", { class: "btn btn-ghost btn-sm", text: "✕", onclick: () => removeMilestone(m.id) }),
      ]));
    });
    milestonesCard.appendChild(ml);
    milestonesCard.appendChild(el("button", { class: "btn btn-soft btn-block btn-sm", style: "margin-top:8px", text: "+ Marco", onclick: addMilestone }));

    // Passos — visão micro (o que fazer, dia a dia, para avançar os marcos acima)
    function taskRow(t) {
      return el("div", { class: "item", style: "padding:8px 2px" }, [
        el("button", { class: "btn btn-icon btn-ghost", style: "width:24px;height:24px;border:2px solid " + (t.done ? "var(--good)" : "var(--border)") + ";background:" + (t.done ? "var(--good)" : "transparent") + ";color:#fff;font-size:.7rem;flex:none", html: t.done ? "✓" : "", onclick: () => toggleThesisTask(t.id) }),
        el("div", { class: "grow", style: t.done ? "text-decoration:line-through;color:var(--text-mute)" : "" }, [
          el("div", { class: "t", text: t.text }),
          t.due ? el("div", { class: "s tiny muted", text: UI.prettyDate(t.due) }) : null,
        ]),
        el("button", { class: "btn btn-ghost btn-sm", text: "✕", onclick: () => removeThesisTask(t.id) }),
      ]);
    }
    const tasksCard = el("div", { class: "card" }, [el("strong", { text: "Passos — planeamento diário" })]);
    const tl = el("div", { class: "list", style: "margin-top:8px" });
    const pending = th.tasks.filter((t) => !t.done).sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
    if (!pending.length) tl.appendChild(el("div", { class: "empty tiny", text: "Sem passos definidos. Define o que vais fazer hoje ou esta semana para avançar num marco." }));
    pending.forEach((t) => tl.appendChild(taskRow(t)));
    tasksCard.appendChild(tl);
    tasksCard.appendChild(el("button", { class: "btn btn-soft btn-block btn-sm", style: "margin-top:8px", text: "+ Passo", onclick: addThesisTask }));
    const doneRecent = th.tasks.filter((t) => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).slice(0, 5);
    if (doneRecent.length) {
      tasksCard.appendChild(el("div", { class: "tiny muted", style: "margin-top:14px;font-weight:700", text: "Feito recentemente" }));
      const dl = el("div", { class: "list" });
      doneRecent.forEach((t) => dl.appendChild(taskRow(t)));
      tasksCard.appendChild(dl);
    }

    view.appendChild(el("div", { class: "stack" }, [hero, fDate, motivCard, milestonesCard, tasksCard]));
  }

  function addMilestone() {
    const f = field("Marco", { placeholder: "ex: Revisão de literatura, Metodologia, Escrita, Defesa…" });
    const fd = field("Data alvo (opcional)", { type: "date" });
    const sh = sheet("Novo marco", [f, fd, el("button", { class: "btn btn-primary btn-block", text: "Adicionar", onclick: guardClick(() => {
      const text = f.input.value.trim(); if (!text) return;
      Store.update(NS, (s) => { s.milestones.push({ id: uid(), text, due: fd.input.value || "", done: false }); });
      sh.close();
    })})]);
    setTimeout(() => f.input.focus(), 50);
  }
  function toggleMilestone(id) { Store.update(NS, (s) => { const m = s.milestones.find((x) => x.id === id); if (m) m.done = !m.done; }); }
  function removeMilestone(id) { Store.update(NS, (s) => { s.milestones = s.milestones.filter((x) => x.id !== id); }); }
  function addThesisTask() {
    const f = field("Passo", { placeholder: "ex: Escrever secção 2.1, Ler 3 artigos…" });
    const fd = field("Data (opcional)", { type: "date" });
    const sh = sheet("Novo passo", [f, fd, el("button", { class: "btn btn-primary btn-block", text: "Adicionar", onclick: guardClick(() => {
      const text = f.input.value.trim(); if (!text) return;
      Store.update(NS, (s) => { s.tasks.push({ id: uid(), text, due: fd.input.value || "", done: false, createdAt: Date.now(), doneAt: null }); });
      sh.close();
    })})]);
    setTimeout(() => f.input.focus(), 50);
  }
  function toggleThesisTask(id) { Store.update(NS, (s) => { const t = s.tasks.find((x) => x.id === id); if (t) { t.done = !t.done; t.doneAt = t.done ? Date.now() : null; } }); }
  function removeThesisTask(id) { Store.update(NS, (s) => { s.tasks = s.tasks.filter((x) => x.id !== id); }); }

  document.addEventListener("DOMContentLoaded", init);
})();
