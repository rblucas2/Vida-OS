/* =====================================================================
   Nutrição & Macros
   ===================================================================== */
(function () {
  const { el, $, clear, num, toast, sheet, field, bar, ring, uid, todayISO } = UI;
  const D = Domain;
  const NS = "nut";

  // Alimentos iniciais (por 100g) — base local editável
  const SEED_FOODS = [
    { id: "f_frango", nome: "Peito de frango grelhado", categoria: "Proteína", calorias: 165, proteina: 31, hidratos: 0, gordura: 3.6 },
    { id: "f_arroz", nome: "Arroz cozido", categoria: "Hidratos", calorias: 130, proteina: 2.7, hidratos: 28, gordura: 0.3 },
    { id: "f_ovo", nome: "Ovo", categoria: "Proteína", calorias: 155, proteina: 13, hidratos: 1.1, gordura: 11 },
    { id: "f_atum", nome: "Atum em água", categoria: "Proteína", calorias: 116, proteina: 26, hidratos: 0, gordura: 1 },
    { id: "f_aveia", nome: "Flocos de aveia", categoria: "Hidratos", calorias: 389, proteina: 17, hidratos: 66, gordura: 7 },
    { id: "f_batata", nome: "Batata doce cozida", categoria: "Hidratos", calorias: 90, proteina: 2, hidratos: 21, gordura: 0.1 },
    { id: "f_banana", nome: "Banana", categoria: "Fruta", calorias: 89, proteina: 1.1, hidratos: 23, gordura: 0.3 },
    { id: "f_iogurte", nome: "Iogurte grego natural", categoria: "Laticínios", calorias: 97, proteina: 9, hidratos: 4, gordura: 5 },
    { id: "f_whey", nome: "Proteína whey (pó)", categoria: "Suplemento", calorias: 380, proteina: 80, hidratos: 7, gordura: 5 },
    { id: "f_azeite", nome: "Azeite", categoria: "Gordura", calorias: 884, proteina: 0, hidratos: 0, gordura: 100 },
    { id: "f_brocolos", nome: "Brócolos", categoria: "Legumes", calorias: 34, proteina: 2.8, hidratos: 7, gordura: 0.4 },
    { id: "f_amendoa", nome: "Amêndoas", categoria: "Gordura", calorias: 579, proteina: 21, hidratos: 22, gordura: 50 },
  ];

  function init() {
    App.boot({ active: "nutrition" });
    Store.ensure(NS, { profile: null, foods: SEED_FOODS, diary: {}, meals: [], workoutDays: {} });
    $("#settingsBtn").addEventListener("click", App.openSettings);
    const tabs = $("#tabs");
    tabs.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-tab]"); if (!b) return;
      [...tabs.children].forEach((c) => c.classList.toggle("active", c === b));
      render(b.dataset.tab);
    });
    Store.subscribe(NS, () => render(current));
    Store.subscribe("los", () => { if (current === "hoje") render("hoje"); });
    render("hoje");
  }

  let current = "hoje";
  function render(tab) {
    current = tab;
    const view = clear($("#view"));
    ({ hoje: renderHoje, calc: renderCalc, foods: renderFoods, meals: renderMeals }[tab] || renderHoje)(view);
  }

  /* ----------------------------- HOJE ----------------------------- */
  function renderHoje(view) {
    const nut = Store.get(NS), los = Store.get("los");
    const targets = D.effectiveTargets(nut, los);
    $("#subtitle").textContent = new Date().toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" });

    if (!targets) {
      view.appendChild(el("div", { class: "card empty" }, [
        el("p", { text: "Define o teu perfil para calcular as metas diárias." }),
        el("button", { class: "btn btn-primary", text: "Abrir calculadora", onclick: () => switchTab("calc") }),
      ]));
      return;
    }

    const got = D.dayIntake(nut);

    // Anel de calorias
    const kcalPct = targets.kcal ? (got.kcal / targets.kcal) * 100 : 0;
    const left = Math.round(targets.kcal - got.kcal);
    const ringCard = el("div", { class: "card center" }, [
      el("div", { class: "ringwrap" }, [ring(kcalPct, { size: 150, stroke: 13, label: String(Math.abs(left)), sub: left >= 0 ? "kcal livres" : "kcal a mais", color: left < 0 ? "var(--bad)" : "var(--accent)" })]),
      el("div", { class: "muted tiny", style: "margin-top:6px", text: `${num(got.kcal)} de ${num(targets.kcal)} kcal${targets.boosted ? " · +12% treino 💪" : ""}` }),
    ]);

    // Toggle treino
    const trained = D.workoutDone(nut, los);
    const trainBtn = el("button", { class: "btn btn-block " + (trained ? "btn-soft" : ""), html: (trained ? "✓ " : "") + "Treino concluído hoje", onclick: () => {
      Store.update(NS, (s) => { s.workoutDays = s.workoutDays || {}; if (s.workoutDays[todayISO()]) delete s.workoutDays[todayISO()]; else s.workoutDays[todayISO()] = true; });
    }});

    const macros = el("div", { class: "grid-2" }, [
      macroCard("Proteína", got.p, targets.protein, "var(--good)"),
      macroCard("Hidratos", got.c, targets.carbs, "var(--accent)"),
      macroCard("Gordura", got.f, targets.fat, "var(--warn)"),
      el("div", { class: "card", style: "padding:14px;display:flex;flex-direction:column;justify-content:center;gap:8px" }, [
        el("button", { class: "btn btn-soft btn-block btn-sm", text: "⚡ Fechar macros", onclick: macroSolver }),
        trainBtn,
      ]),
    ]);

    // Diário
    const items = (nut.diary[todayISO()] || []);
    const diaryCard = el("div", { class: "card" }, [
      el("div", { class: "row", style: "justify-content:space-between;margin-bottom:6px" }, [
        el("strong", { text: "Diário de hoje" }),
        el("span", { class: "tiny muted", text: items.length + " itens" }),
      ]),
    ]);
    if (!items.length) diaryCard.appendChild(el("div", { class: "empty", text: "Ainda não registaste nada. Toca em + para adicionar." }));
    else {
      const list = el("div", { class: "list" });
      items.forEach((it, i) => {
        list.appendChild(el("div", { class: "item" }, [
          el("div", { class: "grow" }, [el("div", { class: "t", text: it.nome }), el("div", { class: "s", text: `${num(it.grams)} g · ${num(it.p)}P ${num(it.c)}C ${num(it.f)}G` })]),
          el("div", { class: "amt", text: num(it.kcal) + " kcal" }),
          el("button", { class: "btn btn-ghost btn-sm", text: "✕", onclick: () => removeDiary(i) }),
        ]));
      });
      diaryCard.appendChild(list);
    }

    view.appendChild(el("div", { class: "stack" }, [ringCard, macros, diaryCard]));
    if (nut.meals.length) {
      const qc = el("div", { class: "row wrap", style: "gap:8px;margin-top:12px" });
      nut.meals.forEach((m) => qc.appendChild(el("button", { class: "pill on", text: "+ " + m.nome, onclick: () => logMeal(m) })));
      view.appendChild(el("div", {}, [el("div", { class: "section-title", text: "Refeições rápidas" }), qc]));
    }

    view.appendChild(fab(() => addFoodSheet()));
  }

  function macroCard(label, val, tgt, color) {
    const pct = tgt ? (val / tgt) * 100 : 0;
    const c = el("div", { class: "card", style: "padding:14px" });
    c.appendChild(el("div", { class: "row", style: "justify-content:space-between" }, [
      el("span", { class: "tiny muted", text: label }),
      el("span", { class: "tiny num", text: `${num(val)} / ${num(tgt)}g` }),
    ]));
    const b = bar(pct, pct > 105 ? "bad" : ""); b.firstChild.style.background = pct > 105 ? "var(--bad)" : color; b.style.marginTop = "8px";
    c.appendChild(b);
    return c;
  }

  function removeDiary(i) { Store.update(NS, (s) => { (s.diary[todayISO()] || []).splice(i, 1); }); }

  function logMeal(m) {
    Store.update(NS, (s) => {
      s.diary[todayISO()] = s.diary[todayISO()] || [];
      m.items.forEach((it) => s.diary[todayISO()].push({ ...it, id: uid() }));
    });
    toast("Refeição adicionada ✓");
  }

  /* --------------------- Adicionar alimento ao diário --------------------- */
  function addFoodSheet(preset) {
    const nut = Store.get(NS);
    let selected = preset || null;
    const search = field("Procurar alimento", { placeholder: "ex: frango, aveia…" });
    const results = el("div", { class: "list", style: "max-height:240px;overflow:auto" });
    const gramsF = field("Quantidade (g)", { type: "number", value: 100, inputmode: "decimal" });
    const preview = el("div", { class: "tiny muted center" });
    const scanBtn = el("button", { class: "btn btn-block", html: "📷 Ler código de barras", onclick: () => openScanner((food) => { selected = food; pick(food); }) });

    function calcPreview() {
      if (!selected) { preview.textContent = ""; return; }
      const g = parseFloat(gramsF.input.value) || 0; const k = g / 100;
      preview.textContent = `${num(selected.calorias * k)} kcal · ${num(selected.proteina * k)}P · ${num(selected.hidratos * k)}C · ${num(selected.gordura * k)}G`;
    }
    function pick(food) {
      selected = food; search.input.value = food.nome;
      clear(results); calcPreview();
    }
    function renderResults() {
      const q = search.input.value.toLowerCase().trim();
      clear(results);
      Store.get(NS).foods.filter((f) => f.nome.toLowerCase().includes(q)).slice(0, 30).forEach((f) => {
        results.appendChild(el("div", { class: "item", style: "cursor:pointer", onclick: () => pick(f) }, [
          el("div", { class: "grow" }, [el("div", { class: "t", text: f.nome }), el("div", { class: "s", text: `${num(f.calorias)} kcal · ${num(f.proteina)}P /100g` })]),
          el("span", { class: "tiny", text: "+" }),
        ]));
      });
    }
    search.input.addEventListener("input", renderResults);
    gramsF.input.addEventListener("input", calcPreview);
    renderResults();
    if (preset) pick(preset);

    const s = sheet("Adicionar ao diário", [
      scanBtn, search, results, gramsF, preview,
      el("button", { class: "btn btn-primary btn-block", text: "Adicionar", onclick: () => {
        if (!selected) return toast("Escolhe um alimento.");
        const g = parseFloat(gramsF.input.value) || 0; if (g <= 0) return toast("Quantidade inválida.");
        const k = g / 100;
        Store.update(NS, (st) => {
          st.diary[todayISO()] = st.diary[todayISO()] || [];
          st.diary[todayISO()].push({ id: uid(), foodId: selected.id, nome: selected.nome, grams: g,
            kcal: Math.round(selected.calorias * k), p: +(selected.proteina * k).toFixed(1), c: +(selected.hidratos * k).toFixed(1), f: +(selected.gordura * k).toFixed(1) });
        });
        s.close(); toast("Adicionado ✓");
      }}),
    ]);
  }

  /* --------------------- Macro Solver (Fecho de macros) --------------------- */
  function macroSolver() {
    const nut = Store.get(NS), los = Store.get("los");
    const t = D.effectiveTargets(nut, los); if (!t) return;
    const got = D.dayIntake(nut);
    const need = { p: t.protein - got.p, c: t.carbs - got.c, f: t.fat - got.f, kcal: t.kcal - got.kcal };

    // Pontua cada alimento: o que mais aproxima dos macros em falta sem estourar.
    const cands = nut.foods.map((food) => {
      // grama ideal para fechar a proteína em falta (macro mais limitante normalmente)
      let grams;
      if (need.p > 3 && food.proteina > 1) grams = (need.p / food.proteina) * 100;
      else if (need.c > 5 && food.hidratos > 1) grams = (need.c / food.hidratos) * 100;
      else if (need.kcal > 50) grams = (need.kcal / Math.max(1, food.calorias)) * 100;
      else return null;
      grams = Math.max(10, Math.min(400, Math.round(grams / 5) * 5));
      const k = grams / 100;
      const add = { p: food.proteina * k, c: food.hidratos * k, f: food.gordura * k, kcal: food.calorias * k };
      // erro = desvio aos restantes após adicionar (penaliza ultrapassar)
      const err = pen(need.p - add.p) * 1.4 + pen(need.c - add.c) + pen(need.f - add.f) * 1.2 + pen((need.kcal - add.kcal) / 25);
      return { food, grams, add, err };
    }).filter(Boolean).sort((a, b) => a.err - b.err).slice(0, 3);

    function pen(x) { return x < 0 ? Math.abs(x) * 2.2 : Math.abs(x); } // ultrapassar custa mais

    const body = [
      el("p", { class: "muted tiny", text: `Faltam para fechar o dia: ${num(Math.max(0, need.p))}g proteína · ${num(Math.max(0, need.c))}g hidratos · ${num(Math.max(0, need.f))}g gordura · ${num(Math.max(0, need.kcal))} kcal.` }),
    ];
    if (!cands.length || (need.p < 3 && need.c < 5 && need.kcal < 50)) {
      body.push(el("div", { class: "card center", text: "🎯 Já estás muito perto das metas. Bom trabalho!" }));
    } else {
      cands.forEach((c) => {
        body.push(el("div", { class: "card row", style: "justify-content:space-between" }, [
          el("div", { class: "grow" }, [
            el("div", { class: "t", text: c.food.nome }),
            el("div", { class: "s tiny muted", text: `+${num(c.add.p)}P · +${num(c.add.c)}C · +${num(c.add.f)}G · ${num(c.add.kcal)} kcal` }),
          ]),
          el("div", { style: "text-align:right" }, [
            el("div", { style: "font-weight:700", text: num(c.grams) + " g" }),
            el("button", { class: "btn btn-soft btn-sm", text: "Adicionar", onclick: () => { addFromSolver(c); } }),
          ]),
        ]));
      });
    }
    sheet("⚡ Fecho de macros", body);
  }
  function addFromSolver(c) {
    const k = c.grams / 100;
    Store.update(NS, (st) => {
      st.diary[todayISO()] = st.diary[todayISO()] || [];
      st.diary[todayISO()].push({ id: uid(), foodId: c.food.id, nome: c.food.nome, grams: c.grams,
        kcal: Math.round(c.food.calorias * k), p: +(c.food.proteina * k).toFixed(1), c: +(c.food.hidratos * k).toFixed(1), f: +(c.food.gordura * k).toFixed(1) });
    });
    toast("Adicionado ✓");
  }

  /* ----------------------------- CALCULADORA ----------------------------- */
  function renderCalc(view) {
    const nut = Store.get(NS); const p = nut.profile || { sex: "m", activity: "moderado", goal: "maintain" };
    $("#subtitle").textContent = "Calculadora de calorias";
    const fAge = field("Idade", { type: "number", value: p.age || "", inputmode: "numeric" });
    const fSex = field("Sexo", { type: "select", value: p.sex, options: [{ value: "m", label: "Masculino" }, { value: "f", label: "Feminino" }] });
    const fW = field("Peso (kg)", { type: "number", value: p.weight || "", inputmode: "decimal" });
    const fH = field("Altura (cm)", { type: "number", value: p.height || "", inputmode: "numeric" });
    const fAct = field("Nível de atividade", { type: "select", value: p.activity, options: Object.keys(D.ACTIVITY).map((k) => ({ value: k, label: D.ACTIVITY[k].label })) });
    const fGoal = field("Objetivo", { type: "select", value: p.goal, options: [{ value: "lose", label: "Perda de peso (−400 kcal)" }, { value: "maintain", label: "Manutenção" }, { value: "gain", label: "Ganho de massa (+400 kcal)" }] });

    const out = el("div", { class: "card" });
    function recompute(save) {
      const prof = { age: +fAge.input.value, sex: fSex.input.value, weight: +fW.input.value, height: +fH.input.value, activity: fAct.input.value, goal: fGoal.input.value };
      const t = D.nutritionTargets(prof);
      clear(out);
      if (!t) { out.appendChild(el("div", { class: "empty", text: "Preenche idade, peso e altura para ver as metas." })); return; }
      out.appendChild(el("div", { class: "grid-2" }, [
        kpi("TMB", num(t.tmb) + " kcal"), kpi("Gasto diário", num(t.getd) + " kcal"),
      ]));
      out.appendChild(el("hr", { class: "hr" }));
      out.appendChild(el("div", { class: "center" }, [el("div", { class: "big num", text: num(t.kcal) }), el("div", { class: "muted tiny", text: "kcal alvo / dia" })]));
      out.appendChild(el("div", { class: "grid-2", style: "margin-top:14px" }, [
        kpi("Proteína", num(t.protein) + " g"), kpi("Hidratos", num(t.carbs) + " g"),
        kpi("Gordura", num(t.fat) + " g"), kpi("", ""),
      ]));
      if (save) Store.update(NS, (s) => { s.profile = prof; s.targets = t; });
    }
    [fAge, fSex, fW, fH, fAct, fGoal].forEach((f) => f.input.addEventListener("input", () => recompute(false)));
    recompute(false);

    view.appendChild(el("div", { class: "stack" }, [
      el("div", { class: "card" }, [
        el("div", { class: "input-row" }, [fAge, fSex]),
        el("div", { class: "input-row", style: "margin-top:12px" }, [fW, fH]),
        el("div", { style: "margin-top:12px" }, [fAct]),
        el("div", { style: "margin-top:12px" }, [fGoal]),
      ]),
      out,
      el("button", { class: "btn btn-primary btn-block", text: "Guardar metas", onclick: () => { recompute(true); toast("Metas guardadas ✓"); switchTab("hoje"); } }),
    ]));
  }
  function kpi(k, v) { return el("div", { class: "kpi center" }, [el("div", { class: "v", text: v }), el("div", { class: "k", text: k })]); }

  /* ----------------------------- ALIMENTOS ----------------------------- */
  function renderFoods(view) {
    const nut = Store.get(NS);
    $("#subtitle").textContent = nut.foods.length + " alimentos na base";
    const search = field("Procurar", { placeholder: "Filtrar alimentos…" });
    const list = el("div", { class: "card list" });
    function draw() {
      const q = search.input.value.toLowerCase().trim();
      clear(list);
      const fs = Store.get(NS).foods.filter((f) => f.nome.toLowerCase().includes(q));
      if (!fs.length) { list.appendChild(el("div", { class: "empty", text: "Sem resultados." })); return; }
      fs.forEach((f) => {
        list.appendChild(el("div", { class: "item" }, [
          el("div", { class: "grow" }, [el("div", { class: "t", text: f.nome }), el("div", { class: "s", text: `${f.categoria} · ${num(f.calorias)} kcal · ${num(f.proteina)}P ${num(f.hidratos)}C ${num(f.gordura)}G /100g` })]),
          el("button", { class: "btn btn-ghost btn-sm", text: "✎", onclick: () => editFood(f) }),
        ]));
      });
    }
    search.input.addEventListener("input", draw); draw();
    view.appendChild(el("div", { class: "stack" }, [
      el("div", { class: "row", style: "gap:10px" }, [
        el("button", { class: "btn btn-soft btn-block", html: "📷 Scanner", onclick: () => openScanner((food) => editFood(food, true)) }),
        el("button", { class: "btn btn-primary btn-block", text: "+ Manual", onclick: () => editFood(null) }),
      ]),
      search, list,
    ]));
  }

  function editFood(food, isNew) {
    const f = food || { nome: "", categoria: "Outros", calorias: "", proteina: "", hidratos: "", gordura: "" };
    const exists = food && Store.get(NS).foods.some((x) => x.id === food.id);
    const fn = field("Nome", { value: f.nome });
    const fc = field("Categoria", { value: f.categoria });
    const fk = field("Calorias /100g", { type: "number", value: f.calorias, inputmode: "decimal" });
    const fp = field("Proteína /100g", { type: "number", value: f.proteina, inputmode: "decimal" });
    const fh = field("Hidratos /100g", { type: "number", value: f.hidratos, inputmode: "decimal" });
    const fg = field("Gordura /100g", { type: "number", value: f.gordura, inputmode: "decimal" });
    const buttons = el("div", { class: "row", style: "gap:10px" }, [
      exists ? el("button", { class: "btn btn-block", style: "color:var(--bad)", text: "Apagar", onclick: async () => {
        if (await UI.confirm("Apagar este alimento da base?", { danger: true })) { Store.update(NS, (s) => { s.foods = s.foods.filter((x) => x.id !== food.id); }); s.close(); }
      }}) : null,
      el("button", { class: "btn btn-primary btn-block", text: "Guardar", onclick: () => {
        const data = { id: f.id || uid(), nome: fn.input.value.trim() || "Sem nome", categoria: fc.input.value.trim() || "Outros",
          calorias: +fk.input.value || 0, proteina: +fp.input.value || 0, hidratos: +fh.input.value || 0, gordura: +fg.input.value || 0 };
        Store.update(NS, (st) => { const i = st.foods.findIndex((x) => x.id === data.id); if (i >= 0) st.foods[i] = data; else st.foods.unshift(data); });
        s.close(); toast("Guardado ✓");
      }}),
    ]);
    const s = sheet(exists ? "Editar alimento" : "Novo alimento", [
      fn, fc, el("div", { class: "input-row" }, [fk, fp]), el("div", { class: "input-row" }, [fh, fg]), buttons,
    ]);
  }

  /* ----------------------------- REFEIÇÕES ----------------------------- */
  function renderMeals(view) {
    const nut = Store.get(NS);
    $("#subtitle").textContent = "Refeições pré-guardadas";
    const list = el("div", { class: "stack" });
    if (!nut.meals.length) list.appendChild(el("div", { class: "card empty", text: "Cria refeições (ex: 'Pequeno-almoço') para adicionares vários alimentos com um clique." }));
    nut.meals.forEach((m) => {
      const tot = m.items.reduce((a, it) => ({ kcal: a.kcal + it.kcal, p: a.p + it.p }), { kcal: 0, p: 0 });
      list.appendChild(el("div", { class: "card" }, [
        el("div", { class: "row", style: "justify-content:space-between" }, [
          el("strong", { text: m.nome }),
          el("div", { class: "row", style: "gap:6px" }, [
            el("button", { class: "btn btn-soft btn-sm", text: "+ Diário", onclick: () => logMeal(m) }),
            el("button", { class: "btn btn-ghost btn-sm", text: "✎", onclick: () => editMeal(m) }),
          ]),
        ]),
        el("div", { class: "s tiny muted", text: `${m.items.length} itens · ${num(tot.kcal)} kcal · ${num(tot.p)}g proteína` }),
      ]));
    });
    view.appendChild(el("div", { class: "stack" }, [
      el("button", { class: "btn btn-primary btn-block", text: "+ Nova refeição", onclick: () => editMeal(null) }),
      list,
    ]));
  }

  function editMeal(meal) {
    const nut = Store.get(NS);
    const m = meal ? JSON.parse(JSON.stringify(meal)) : { id: uid(), nome: "", items: [] };
    const fn = field("Nome da refeição", { value: m.nome, placeholder: "ex: Pequeno-almoço padrão" });
    const itemsBox = el("div", { class: "list" });
    function drawItems() {
      clear(itemsBox);
      if (!m.items.length) itemsBox.appendChild(el("div", { class: "empty tiny", text: "Sem alimentos ainda." }));
      m.items.forEach((it, i) => itemsBox.appendChild(el("div", { class: "item" }, [
        el("div", { class: "grow" }, [el("div", { class: "t", text: it.nome }), el("div", { class: "s", text: num(it.grams) + " g · " + num(it.kcal) + " kcal" })]),
        el("button", { class: "btn btn-ghost btn-sm", text: "✕", onclick: () => { m.items.splice(i, 1); drawItems(); } }),
      ])));
    }
    drawItems();
    const addItem = el("button", { class: "btn btn-block", text: "+ Adicionar alimento", onclick: () => {
      // mini seletor
      const sel = field("Alimento", { type: "select", options: Store.get(NS).foods.map((f) => ({ value: f.id, label: f.nome })) });
      const g = field("Gramas", { type: "number", value: 100, inputmode: "decimal" });
      const s2 = sheet("Adicionar alimento", [sel, g, el("button", { class: "btn btn-primary btn-block", text: "Adicionar", onclick: () => {
        const food = Store.get(NS).foods.find((f) => f.id === sel.input.value); const grams = +g.input.value || 0; const k = grams / 100;
        m.items.push({ foodId: food.id, nome: food.nome, grams, kcal: Math.round(food.calorias * k), p: +(food.proteina * k).toFixed(1), c: +(food.hidratos * k).toFixed(1), f: +(food.gordura * k).toFixed(1) });
        s2.close(); drawItems();
      }})]);
    }});
    const s = sheet(meal ? "Editar refeição" : "Nova refeição", [
      fn, el("div", { class: "section-title", style: "margin-top:8px", text: "Alimentos" }), itemsBox, addItem,
      el("div", { class: "row", style: "gap:10px;margin-top:8px" }, [
        meal ? el("button", { class: "btn btn-block", style: "color:var(--bad)", text: "Apagar", onclick: () => { Store.update(NS, (st) => { st.meals = st.meals.filter((x) => x.id !== m.id); }); s.close(); } }) : null,
        el("button", { class: "btn btn-primary btn-block", text: "Guardar", onclick: () => {
          m.nome = fn.input.value.trim() || "Refeição";
          Store.update(NS, (st) => { const i = st.meals.findIndex((x) => x.id === m.id); if (i >= 0) st.meals[i] = m; else st.meals.push(m); });
          s.close(); toast("Guardado ✓");
        }}),
      ]),
    ]);
  }

  /* ----------------------------- SCANNER ----------------------------- */
  function openScanner(onFood) {
    const status = el("div", { class: "tiny muted center", text: "A iniciar câmara…" });
    const reader = el("div", { id: "qr-reader", style: "width:100%;border-radius:12px;overflow:hidden" });
    const manual = field("Ou insere o código manualmente", { placeholder: "ex: 5601234567890", inputmode: "numeric" });
    const s = sheet("Scanner de código de barras", [
      reader, status,
      el("button", { class: "btn btn-block", text: "Procurar código manual", onclick: () => lookup(manual.input.value.trim()) }),
      manual,
    ], { onClose: () => { try { window.__qr && window.__qr.stop(); } catch (e) {} } });

    async function lookup(code) {
      if (!code) return toast("Sem código.");
      status.textContent = "A procurar " + code + "…";
      try {
        const r = await fetch(`https://world.openfoodfacts.org/api/v0/product/${code}.json`);
        const j = await r.json();
        if (j.status !== 1) { status.textContent = "Produto não encontrado. Insere manualmente."; return manualFood(code); }
        const p = j.product, n = p.nutriments || {};
        const food = { id: "of_" + code, nome: p.product_name || ("Produto " + code), categoria: p.categories_tags ? "Scanner" : "Outros",
          calorias: Math.round(n["energy-kcal_100g"] || (n["energy_100g"] ? n["energy_100g"] / 4.184 : 0)),
          proteina: +(n["proteins_100g"] || 0), hidratos: +(n["carbohydrates_100g"] || 0), gordura: +(n["fat_100g"] || 0) };
        // guardar na base local
        Store.update(NS, (st) => { if (!st.foods.some((f) => f.id === food.id)) st.foods.unshift(food); });
        try { window.__qr && window.__qr.stop(); } catch (e) {}
        s.close(); toast("✓ " + food.nome); onFood && onFood(food);
      } catch (e) { status.textContent = "Erro de rede. Tenta o código manual."; }
    }
    function manualFood(code) { /* deixa o utilizador criar */ }

    // carregar Html5Qrcode dinamicamente
    if (window.Html5Qrcode) startCam();
    else {
      const sc = document.createElement("script");
      sc.src = "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js";
      sc.onload = startCam;
      sc.onerror = () => { status.textContent = "Sem ligação para o scanner. Usa o código manual."; };
      document.head.appendChild(sc);
    }
    function startCam() {
      try {
        const q = new Html5Qrcode("qr-reader"); window.__qr = q;
        q.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 240, height: 160 } },
          (txt) => { q.stop().then(() => lookup(txt)); },
          () => {}).then(() => status.textContent = "Aponta ao código de barras.")
          .catch(() => status.textContent = "Sem acesso à câmara. Usa o código manual.");
      } catch (e) { status.textContent = "Scanner indisponível. Usa o código manual."; }
    }
  }

  /* ----------------------------- helpers ----------------------------- */
  function switchTab(tab) {
    const tabs = $("#tabs");
    [...tabs.children].forEach((c) => c.classList.toggle("active", c.dataset.tab === tab));
    render(tab);
  }
  function fab(onclick) { return el("button", { class: "fab", text: "+", onclick, "aria-label": "Adicionar" }); }

  document.addEventListener("DOMContentLoaded", init);
})();
