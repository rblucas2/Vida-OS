/* =====================================================================
   Nutrição & Macros
   ===================================================================== */
(function () {
  const { el, $, clear, num, toast, undo, sheet, field, bar, ring, donut, uid, todayISO } = UI;
  const D = Domain;
  const NS = "nut";

  // Alimentos iniciais (por 100g) — base local editável
  const SEED_FOODS = [
    { id: "f_frango", nome: "Peito de frango grelhado", categoria: "Proteína", calorias: 165, proteina: 31, hidratos: 0, gordura: 3.6, fibra: 0, acucar: 0, saturadas: 1, sodio: 74 },
    { id: "f_arroz", nome: "Arroz cozido", categoria: "Hidratos", calorias: 130, proteina: 2.7, hidratos: 28, gordura: 0.3, fibra: 0.4, acucar: 0.1, saturadas: 0.1, sodio: 1 },
    { id: "f_ovo", nome: "Ovo", categoria: "Proteína", calorias: 155, proteina: 13, hidratos: 1.1, gordura: 11, fibra: 0, acucar: 1.1, saturadas: 3.3, sodio: 124 },
    { id: "f_atum", nome: "Atum em água", categoria: "Proteína", calorias: 116, proteina: 26, hidratos: 0, gordura: 1, fibra: 0, acucar: 0, saturadas: 0.3, sodio: 247 },
    { id: "f_aveia", nome: "Flocos de aveia", categoria: "Hidratos", calorias: 389, proteina: 17, hidratos: 66, gordura: 7, fibra: 10, acucar: 1, saturadas: 1.2, sodio: 2 },
    { id: "f_batata", nome: "Batata doce cozida", categoria: "Hidratos", calorias: 90, proteina: 2, hidratos: 21, gordura: 0.1, fibra: 3, acucar: 6, saturadas: 0, sodio: 36 },
    { id: "f_banana", nome: "Banana", categoria: "Fruta", calorias: 89, proteina: 1.1, hidratos: 23, gordura: 0.3, fibra: 2.6, acucar: 12, saturadas: 0.1, sodio: 1 },
    { id: "f_iogurte", nome: "Iogurte grego natural", categoria: "Laticínios", calorias: 97, proteina: 9, hidratos: 4, gordura: 5, fibra: 0, acucar: 4, saturadas: 3.2, sodio: 36 },
    { id: "f_whey", nome: "Proteína whey (pó)", categoria: "Suplemento", calorias: 380, proteina: 80, hidratos: 7, gordura: 5, fibra: 1, acucar: 6, saturadas: 1.5, sodio: 300 },
    { id: "f_azeite", nome: "Azeite", categoria: "Gordura", calorias: 884, proteina: 0, hidratos: 0, gordura: 100, fibra: 0, acucar: 0, saturadas: 14, sodio: 2 },
    { id: "f_brocolos", nome: "Brócolos", categoria: "Legumes", calorias: 34, proteina: 2.8, hidratos: 7, gordura: 0.4, fibra: 2.6, acucar: 1.7, saturadas: 0.1, sodio: 33 },
    { id: "f_amendoa", nome: "Amêndoas", categoria: "Gordura", calorias: 579, proteina: 21, hidratos: 22, gordura: 50, fibra: 12.5, acucar: 4.4, saturadas: 3.7, sodio: 1 },
  ];

  // Constrói uma entrada de diário (macros + micros) a partir de um alimento e gramas
  function entryFromFood(food, grams) {
    const k = grams / 100;
    return { foodId: food.id, nome: food.nome, grams,
      kcal: Math.round(food.calorias * k), p: +(food.proteina * k).toFixed(1), c: +(food.hidratos * k).toFixed(1), f: +(food.gordura * k).toFixed(1),
      fib: +((food.fibra || 0) * k).toFixed(1), sug: +((food.acucar || 0) * k).toFixed(1), sat: +((food.saturadas || 0) * k).toFixed(1), sod: Math.round((food.sodio || 0) * k) };
  }

  const PLAN_DAYS = [
    { id: "seg", label: "Segunda", g: 1 }, { id: "ter", label: "Terça", g: 2 }, { id: "qua", label: "Quarta", g: 3 },
    { id: "qui", label: "Quinta", g: 4 }, { id: "sex", label: "Sexta", g: 5 }, { id: "sab", label: "Sábado", g: 6 }, { id: "dom", label: "Domingo", g: 0 },
  ];
  const PLAN_SLOTS = [
    { id: "pa", label: "Pequeno-almoço", icon: "🌅" }, { id: "al", label: "Almoço", icon: "🍽️" },
    { id: "la", label: "Lanche", icon: "🍎" }, { id: "ja", label: "Jantar", icon: "🌙" },
  ];

  function init() {
    App.boot({ active: "nutrition" });
    Store.ensure(NS, { profile: null, customTargets: null, foods: SEED_FOODS, diary: {}, meals: [], workoutDays: {}, weightLog: {}, mealPlan: {} });
    App.onboard("nutrition", "Nutrição", [
      "🧮 Define o teu perfil na <b>Calculadora</b> (Mifflin-St Jeor).",
      "📷 Regista comida com o <b>scanner de código de barras</b> (Open Food Facts).",
      "⚡ O <b>Fecho de macros</b> sugere o que comer para fechares o dia.",
      "💪 Em dias de treino (lidos da app de Ginásio), os alvos sobem automaticamente.",
    ]);
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
    ({ hoje: renderHoje, plano: renderPlano, calc: renderCalc, foods: renderFoods, meals: renderMeals }[tab] || renderHoje)(view);
  }

  /* ----------------------------- HOJE ----------------------------- */
  let viewDate = todayISO();
  function renderHoje(view) {
    const nut = Store.get(NS), los = Store.get("los");
    const targets = D.effectiveTargets(nut, los, viewDate);
    $("#subtitle").textContent = new Date(viewDate + "T00:00:00").toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" });
    const got = D.dayIntake(nut, viewDate);
    const REF = D.MICRO_REF;
    const cards = [];

    if (targets) {
      // HERO — contador de calorias (Objetivo − Consumido = Restante)
      const left = Math.round(targets.kcal - got.kcal);
      const kcalPct = targets.kcal ? (got.kcal / targets.kcal) * 100 : 0;
      const cell = (k, v) => el("div", { style: "text-align:center;flex:1" }, [
        el("div", { style: "font-family:var(--font-num);font-weight:800;font-size:1.25rem", text: v }),
        el("div", { style: "font-size:.66rem;opacity:.85;text-transform:uppercase;letter-spacing:.04em", text: k }),
      ]);
      const ringMini = ring(Math.min(100, kcalPct), { size: 118, stroke: 11, label: String(Math.abs(left)), sub: left >= 0 ? "restam" : "a mais", color: "#fff" });
      ringMini.querySelectorAll("text").forEach((t) => t.setAttribute("fill", "#fff"));
      cards.push(el("div", { class: "hero" }, [
        el("div", { class: "row", style: "align-items:center;gap:16px" }, [
          el("div", { style: "flex:none" }, [ringMini]),
          el("div", { style: "flex:1" }, [
            el("div", { class: "label", text: "Calorias de hoje" + (targets.boosted ? " · +12% treino 💪" : "") }),
            el("div", { class: "row", style: "margin-top:8px;gap:4px" }, [
              cell("Objetivo", num(targets.kcal)), el("div", { style: "opacity:.7;font-size:1.1rem", text: "−" }),
              cell("Consumido", num(got.kcal)), el("div", { style: "opacity:.7;font-size:1.1rem", text: "=" }),
              cell("Restante", num(left)),
            ]),
          ]),
        ]),
      ]));

      // Macros donut
      const dParts = [
        { label: "Proteína", value: got.p * 4, color: "var(--good)" },
        { label: "Hidratos", value: got.c * 4, color: "#3b82f6" },
        { label: "Gordura", value: got.f * 9, color: "var(--warn)" },
      ];
      const sum = dParts.reduce((a, b) => a + b.value, 0) || 1;
      cards.push(el("div", { class: "card" }, [
        el("div", { class: "row between" }, [el("strong", { text: "Macros" }), el("span", { class: "tiny muted", text: "distribuição das calorias" })]),
        el("div", { class: "row", style: "gap:14px;margin-top:12px;align-items:center;flex-wrap:wrap" }, [
          el("div", { class: "ringwrap", style: "flex:none;position:relative" }, [
            donut(dParts, { size: 116, stroke: 18 }),
            el("div", { style: "position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center" }, [
              el("div", { class: "num", style: "font-weight:800", text: num(got.kcal) }), el("div", { class: "tiny muted", style: "font-size:.6rem", text: "kcal" })]),
          ]),
          el("div", { class: "legend", style: "flex:1;min-width:160px" }, dParts.map((p) => el("div", { class: "lg" }, [
            el("span", { class: "nm" }, [el("span", { class: "sw", style: "background:" + p.color }), el("span", { class: "tiny", text: p.label })]),
            el("span", { class: "vl tiny", text: Math.round(p.value / sum * 100) + "% das kcal" }),
          ]))),
        ]),
      ]));
    } else {
      cards.push(el("div", { class: "card" }, [
        el("div", { class: "row between" }, [el("strong", { text: "Metas por definir" }), el("span", { class: "pill", text: "⚠ sem metas" })]),
        el("p", { class: "tiny muted", style: "margin:6px 0 10px", text: "Mostro o que já consumiste hoje. Define metas para veres quanto falta a cada nutriente." }),
        el("div", { class: "row", style: "gap:10px" }, [
          el("button", { class: "btn btn-primary btn-block", text: "Definir metas", onclick: setManualTargets }),
          el("button", { class: "btn btn-soft btn-block", text: "Calcular (perfil)", onclick: () => switchTab("calc") }),
        ]),
      ]));
    }

    // RESUMO DO DIA — macros + micros (SEMPRE visível, com ou sem metas)
    const nutrientRow = (label, val, tgt, unit, kind) => {
      if (tgt == null) {
        return el("div", { style: "padding:10px 0;border-bottom:1px solid var(--border)" }, [
          el("div", { class: "row between" }, [
            el("span", { style: "font-weight:600;font-size:.92rem", text: label }),
            el("span", { class: "tiny num muted", text: num(val) + unit + " consumido" }),
          ]),
        ]);
      }
      const pct = tgt ? Math.min(100, (val / tgt) * 100) : 0;
      let status, color;
      if (kind === "limit") {
        if (val > tgt) { status = "↑ " + num(val - tgt) + unit + " acima do limite"; color = "var(--bad)"; }
        else { status = "✓ dentro do limite"; color = "var(--good)"; }
      } else {
        if (val >= tgt) { status = "✓ meta atingida"; color = "var(--good)"; }
        else { status = "↓ faltam " + num(tgt - val) + unit; color = "var(--accent)"; }
      }
      const b = bar(pct); b.className = "bar thin"; b.firstChild.style.background = color; b.style.marginTop = "6px";
      return el("div", { style: "padding:10px 0;border-bottom:1px solid var(--border)" }, [
        el("div", { class: "row between" }, [
          el("span", { style: "font-weight:600;font-size:.92rem", text: label }),
          el("span", { class: "tiny", style: "color:" + color + ";font-weight:650", text: status }),
        ]),
        el("div", { class: "row between", style: "margin-top:2px" }, [
          el("span", { class: "tiny muted num", text: num(val) + " / " + num(tgt) + unit }),
          el("span", { class: "tiny muted num", text: Math.round(pct) + "%" }),
        ]),
        b,
      ]);
    };
    cards.push(el("div", { class: "card" }, [
      el("div", { class: "row between" }, [el("strong", { text: "Resumo do dia" }), el("span", { class: "tiny muted", text: "macros e micros" })]),
      el("div", { style: "margin-top:8px" }, [
        nutrientRow("Calorias", got.kcal, targets ? targets.kcal : null, " kcal", "goal"),
        nutrientRow("Proteína", got.p, targets ? targets.protein : null, "g", "goal"),
        nutrientRow("Hidratos de carbono", got.c, targets ? targets.carbs : null, "g", "goal"),
        nutrientRow("Gordura", got.f, targets ? targets.fat : null, "g", "goal"),
        nutrientRow("Fibra", got.fib, REF.fib, "g", "goal"),
        nutrientRow("Açúcar", got.sug, REF.sug, "g", "limit"),
        nutrientRow("Gordura saturada", got.sat, REF.sat, "g", "limit"),
        nutrientRow("Sódio", got.sod, REF.sod, "mg", "limit"),
      ]),
    ]));

    if (targets) {
      // Ações
      const trained = D.workoutDone(nut, los, viewDate);
      const fromGym = D.gymWorkoutDone(viewDate);
      const trainBtn = el("button", { class: "btn btn-block " + (trained ? "btn-soft" : ""), disabled: fromGym, title: fromGym ? "Treino registado na app de Ginásio" : "", html: (trained ? "✓ " : "") + (fromGym ? "Treino (Ginásio) 💪" : "Treino concluído"), onclick: () => {
        Store.update(NS, (s) => { s.workoutDays = s.workoutDays || {}; if (s.workoutDays[viewDate]) delete s.workoutDays[viewDate]; else s.workoutDays[viewDate] = true; });
      }});
      cards.push(el("div", { class: "grid-2" }, [el("button", { class: "btn btn-soft btn-block", html: "⚡ Fechar macros", onclick: macroSolver }), trainBtn]));

      // Gráfico últimos 7 dias
      const week = [];
      for (let i = 6; i >= 0; i--) { const d = new Date(viewDate + "T00:00:00"); d.setDate(d.getDate() - i); const iso = UI.isoDate(d); week.push({ iso, kcal: D.dayIntake(nut, iso).kcal, wd: UI.DAYS[d.getDay()] }); }
      const wkMax = Math.max(targets.kcal, ...week.map((w) => w.kcal), 1);
      const wkBars = el("div", { class: "row", style: "align-items:flex-end;gap:7px;height:96px;margin-top:12px" });
      week.forEach((w) => {
        const h = Math.max(3, (w.kcal / wkMax) * 82);
        const over = w.kcal > targets.kcal * 1.05;
        wkBars.appendChild(el("div", { style: "flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;height:100%;justify-content:flex-end" }, [
          el("div", { style: `width:100%;max-width:26px;height:${h}px;border-radius:5px;background:${over ? "var(--bad)" : "var(--accent-grad)"};opacity:${w.iso === viewDate ? 1 : .6}` }),
          el("div", { class: "tiny muted", style: "font-size:.6rem", text: w.wd }),
        ]));
      });
      cards.push(el("div", { class: "card" }, [
        el("div", { class: "row between" }, [el("strong", { text: "Últimos 7 dias" }), el("span", { class: "tiny muted", text: "objetivo " + num(targets.kcal) + " kcal" })]),
        wkBars,
      ]));
    }

    // Diário — SEMPRE
    const items = (nut.diary[viewDate] || []);
    const diaryCard = el("div", { class: "card" }, [
      el("div", { class: "row", style: "justify-content:space-between;margin-bottom:6px" }, [
        el("strong", { text: "Diário" }), el("span", { class: "tiny muted", text: items.length + " itens" }),
      ]),
    ]);
    if (!items.length) diaryCard.appendChild(el("div", { class: "empty", text: "Ainda não registaste nada. Toca em + para adicionar." }));
    else {
      const list = el("div", { class: "list" });
      items.forEach((it) => list.appendChild(el("div", { class: "item" }, [
        el("div", { class: "grow" }, [el("div", { class: "t", text: it.nome }), el("div", { class: "s", text: `${num(it.grams)} g · ${num(it.p)}P ${num(it.c)}C ${num(it.f)}G` })]),
        el("div", { class: "amt", text: num(it.kcal) + " kcal" }),
        el("button", { class: "btn btn-ghost btn-sm", text: "✕", onclick: () => removeDiary(it.id) }),
      ])));
      diaryCard.appendChild(list);
    }
    cards.push(diaryCard);

    view.appendChild(UI.dateNav(viewDate, (d) => { viewDate = d; render("hoje"); }));
    view.appendChild(el("div", { class: "stack" }, cards));
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

  function removeDiary(id) {
    let snap = null, idx = -1;
    Store.update(NS, (s) => { const arr = s.diary[viewDate] || []; idx = arr.findIndex((x) => x.id === id); if (idx >= 0) { snap = arr[idx]; arr.splice(idx, 1); } });
    if (snap) undo("Removido do diário", () => Store.update(NS, (s) => { s.diary[viewDate] = s.diary[viewDate] || []; s.diary[viewDate].splice(Math.min(idx, s.diary[viewDate].length), 0, snap); }));
  }

  function logMeal(m) {
    Store.update(NS, (s) => {
      s.diary[viewDate] = s.diary[viewDate] || [];
      m.items.forEach((it) => s.diary[viewDate].push({ ...it, id: uid() }));
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
          st.diary[viewDate] = st.diary[viewDate] || [];
          st.diary[viewDate].push({ id: uid(), ...entryFromFood(selected, g) });
        });
        s.close(); toast("Adicionado ✓");
      }}),
    ]);
  }

  /* --------------------- Macro Solver (Fecho de macros) --------------------- */
  function macroSolver() {
    const nut = Store.get(NS), los = Store.get("los");
    const t = D.effectiveTargets(nut, los, viewDate); if (!t) return;
    const got = D.dayIntake(nut, viewDate);
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
    Store.update(NS, (st) => {
      st.diary[viewDate] = st.diary[viewDate] || [];
      st.diary[viewDate].push({ id: uid(), ...entryFromFood(c.food, c.grams) });
    });
    toast("Adicionado ✓");
  }

  /* ----------------------------- PERFIL / METAS ----------------------------- */
  function setManualTargets() {
    const nut = Store.get(NS); const c = nut.customTargets || {};
    const t = D.baseTargets(nut) || {};
    const fk = field("Calorias (kcal)", { type: "number", value: c.kcal || t.kcal || "", inputmode: "numeric" });
    const fp = field("Proteína (g)", { type: "number", value: c.protein || t.protein || "", inputmode: "numeric" });
    const fc = field("Hidratos (g)", { type: "number", value: c.carbs || t.carbs || "", inputmode: "numeric" });
    const fg = field("Gordura (g)", { type: "number", value: c.fat || t.fat || "", inputmode: "numeric" });
    const sh = sheet("Definir metas manualmente", [
      el("p", { class: "tiny muted", text: "Define os teus alvos diários. Estes têm prioridade sobre a calculadora." }),
      fk, el("div", { class: "input-row" }, [fp, fc]), fg,
      el("button", { class: "btn btn-primary btn-block", text: "Guardar metas", onclick: () => {
        const kcal = +fk.input.value; if (!kcal) return toast("Indica as calorias.");
        Store.update(NS, (s) => { s.customTargets = { kcal, protein: +fp.input.value || 0, carbs: +fc.input.value || 0, fat: +fg.input.value || 0 }; });
        sh.close(); toast("Metas guardadas ✓"); switchTab("hoje");
      }}),
    ]);
  }

  function renderCalc(view) {
    const nut = Store.get(NS); const p = nut.profile || { sex: "m", activity: "moderado", goal: "maintain" };
    $("#subtitle").textContent = "Perfil e metas";
    const usingManual = !!(nut.customTargets && nut.customTargets.kcal);
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
      if (save) Store.update(NS, (s) => { s.profile = prof; s.targets = t; s.customTargets = null; });
    }
    [fAge, fSex, fW, fH, fAct, fGoal].forEach((f) => f.input.addEventListener("input", () => recompute(false)));
    recompute(false);

    // Cartão de metas manuais
    const manualCard = el("div", { class: "card" }, [
      el("div", { class: "row between" }, [
        el("strong", { text: "Metas manuais" }),
        el("span", { class: "pill" + (usingManual ? " on" : ""), text: usingManual ? "ativas ✓" : "desligadas" }),
      ]),
      el("p", { class: "tiny muted", style: "margin:6px 0 0", text: usingManual ? "As tuas metas estão definidas manualmente." : "Sabes os teus alvos? Define-os diretamente (ex: 150g de proteína)." }),
      el("div", { class: "row", style: "gap:10px;margin-top:10px" }, [
        el("button", { class: "btn btn-primary btn-block", text: usingManual ? "Editar metas" : "Definir metas", onclick: setManualTargets }),
        usingManual ? el("button", { class: "btn btn-block", text: "Usar calculadora", onclick: () => { Store.update(NS, (s) => { s.customTargets = null; }); } }) : null,
      ]),
    ]);

    view.appendChild(el("div", { class: "stack" }, [
      weightCard(),
      manualCard,
      el("div", { class: "section-title", text: "Calculadora (Mifflin-St Jeor)" }),
      el("div", { class: "card" }, [
        el("div", { class: "input-row" }, [fAge, fSex]),
        el("div", { class: "input-row", style: "margin-top:12px" }, [fW, fH]),
        el("div", { style: "margin-top:12px" }, [fAct]),
        el("div", { style: "margin-top:12px" }, [fGoal]),
      ]),
      out,
      el("button", { class: "btn btn-primary btn-block", text: "Guardar metas calculadas", onclick: () => { recompute(true); toast("Metas guardadas ✓"); switchTab("hoje"); } }),
    ]));
  }
  function kpi(k, v) { return el("div", { class: "kpi center" }, [el("div", { class: "v", text: v }), el("div", { class: "k", text: k })]); }

  /* ----------------------------- PESO ----------------------------- */
  function weightCard() {
    const nut = Store.get(NS);
    const log = nut.weightLog || {};
    const entries = Object.entries(log).sort((a, b) => a[0].localeCompare(b[0]));
    const last = entries.length ? entries[entries.length - 1][1] : (nut.profile && nut.profile.weight);
    const first = entries.length ? entries[0][1] : last;
    const delta = (last != null && first != null) ? last - first : 0;
    const goal = nut.profile && nut.profile.goal;
    const goodDir = goal === "lose" ? delta <= 0 : goal === "gain" ? delta >= 0 : Math.abs(delta) < 1;
    const card = el("div", { class: "card" }, [
      el("div", { class: "row", style: "justify-content:space-between" }, [
        el("strong", { text: "Peso" }),
        el("button", { class: "btn btn-soft btn-sm", text: "+ Registar", onclick: logWeight }),
      ]),
      el("div", { class: "row", style: "gap:14px;align-items:baseline;margin-top:6px" }, [
        el("div", { class: "big num", text: last != null ? num(last, 1) + " kg" : "—" }),
        entries.length > 1 ? el("div", { class: "tiny", style: "color:" + (goodDir ? "var(--good)" : "var(--warn)"), text: (delta > 0 ? "+" : "") + num(delta, 1) + " kg desde o início" }) : null,
      ]),
    ]);
    if (entries.length >= 2) {
      const slice = entries.slice(-30);
      card.appendChild(UI.lineChart(slice.map((e) => e[1]), { labels: [UI.prettyDate(slice[0][0]), UI.prettyDate(slice[slice.length - 1][0])], height: 70, color: "var(--accent)" }));
    } else card.appendChild(el("div", { class: "tiny muted", style: "margin-top:6px", text: "Regista o teu peso regularmente para veres a evolução." }));
    return card;
  }
  function logWeight() {
    const nut = Store.get(NS);
    const f = field("Peso (kg)", { type: "number", value: (nut.profile && nut.profile.weight) || "", inputmode: "decimal", step: "0.1" });
    const fd = field("Data", { type: "date", value: todayISO() });
    const sh = sheet("Registar peso", [f, fd, el("button", { class: "btn btn-primary btn-block", text: "Guardar", onclick: () => {
      const kg = parseFloat(f.input.value); if (!kg) return toast("Indica o peso.");
      Store.update(NS, (s) => {
        s.weightLog = s.weightLog || {}; s.weightLog[fd.input.value] = kg;
        if (!s.profile) s.profile = { sex: "m", activity: "moderado", goal: "maintain" };
        const dates = Object.keys(s.weightLog).sort();
        if (dates[dates.length - 1] === fd.input.value) s.profile.weight = kg;   // peso mais recente → perfil
        if (s.profile.weight && s.profile.height && s.profile.age) s.targets = Domain.nutritionTargets(s.profile);
      });
      sh.close(); toast("Peso registado ✓");
    }})]);
  }

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
    const fFib = field("Fibra /100g", { type: "number", value: f.fibra != null ? f.fibra : "", inputmode: "decimal" });
    const fSug = field("Açúcar /100g", { type: "number", value: f.acucar != null ? f.acucar : "", inputmode: "decimal" });
    const fSat = field("Saturadas /100g", { type: "number", value: f.saturadas != null ? f.saturadas : "", inputmode: "decimal" });
    const fSod = field("Sódio mg /100g", { type: "number", value: f.sodio != null ? f.sodio : "", inputmode: "decimal" });
    const buttons = el("div", { class: "row", style: "gap:10px" }, [
      exists ? el("button", { class: "btn btn-block", style: "color:var(--bad)", text: "Apagar", onclick: () => {
        const snap = JSON.parse(JSON.stringify(food));
        Store.update(NS, (st) => { st.foods = st.foods.filter((x) => x.id !== food.id); }); s.close();
        undo("Alimento apagado", () => Store.update(NS, (st) => { st.foods.unshift(snap); }));
      }}) : null,
      el("button", { class: "btn btn-primary btn-block", text: "Guardar", onclick: () => {
        const data = { id: f.id || uid(), nome: fn.input.value.trim() || "Sem nome", categoria: fc.input.value.trim() || "Outros",
          calorias: +fk.input.value || 0, proteina: +fp.input.value || 0, hidratos: +fh.input.value || 0, gordura: +fg.input.value || 0,
          fibra: +fFib.input.value || 0, acucar: +fSug.input.value || 0, saturadas: +fSat.input.value || 0, sodio: +fSod.input.value || 0 };
        Store.update(NS, (st) => { const i = st.foods.findIndex((x) => x.id === data.id); if (i >= 0) st.foods[i] = data; else st.foods.unshift(data); });
        s.close(); toast("Guardado ✓");
      }}),
    ]);
    const s = sheet(exists ? "Editar alimento" : "Novo alimento", [
      fn, fc, el("div", { class: "input-row" }, [fk, fp]), el("div", { class: "input-row" }, [fh, fg]),
      el("details", { style: "margin-top:2px" }, [el("summary", { class: "tiny muted", style: "cursor:pointer", text: "Micronutrientes (opcional)" }),
        el("div", { class: "input-row", style: "margin-top:8px" }, [fFib, fSug]), el("div", { class: "input-row", style: "margin-top:8px" }, [fSat, fSod])]),
      buttons,
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
        const food = Store.get(NS).foods.find((f) => f.id === sel.input.value); const grams = +g.input.value || 0;
        m.items.push(entryFromFood(food, grams));
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

  /* ----------------------------- PLANO SEMANAL ----------------------------- */
  function todayPlanDay() { return PLAN_DAYS.find((d) => d.g === new Date().getDay()).id; }
  let planDay = todayPlanDay();
  function renderPlano(view) {
    const nut = Store.get(NS);
    $("#subtitle").textContent = "Plano de alimentação semanal";
    const plan = nut.mealPlan || {};

    // Seletor de dia
    const sel = el("div", { class: "weekstrip" });
    PLAN_DAYS.forEach((d) => {
      const count = Object.values((plan[d.id] || {})).reduce((a, arr) => a + (arr ? arr.length : 0), 0);
      sel.appendChild(el("div", { class: "d" + (d.id === planDay ? " sel" : ""), onclick: () => { planDay = d.id; render("plano"); } }, [
        el("div", { class: "wn", text: d.label.slice(0, 3) }),
        el("div", { class: "dn", style: "font-size:.9rem", text: d.label.slice(0, 1) }),
        count ? el("div", { class: "pt" }) : el("div", { style: "height:5px" }),
      ]));
    });

    const dayPlan = plan[planDay] || {};
    // Total do dia
    let tot = { kcal: 0, p: 0, c: 0, f: 0 };
    PLAN_SLOTS.forEach((sl) => (dayPlan[sl.id] || []).forEach((e) => { tot.kcal += e.kcal || 0; tot.p += e.p || 0; tot.c += e.c || 0; tot.f += e.f || 0; }));

    const targets = D.effectiveTargets(nut, Store.get("los"), todayISO());
    const totCard = el("div", { class: "hero" }, [
      el("div", { class: "label", text: PLAN_DAYS.find((d) => d.id === planDay).label }),
      el("div", { class: "value", text: num(tot.kcal) + " kcal" }),
      el("div", { class: "foot", text: `${num(tot.p)}g proteína · ${num(tot.c)}g hidratos · ${num(tot.f)}g gordura` + (targets ? ` · meta ${num(targets.kcal)} kcal` : "") }),
    ]);

    const slots = PLAN_SLOTS.map((sl) => {
      const entries = dayPlan[sl.id] || [];
      const card = el("div", { class: "card pad-sm" }, [
        el("div", { class: "row between" }, [
          el("strong", { html: sl.icon + " " + sl.label }),
          el("button", { class: "btn btn-soft btn-sm", text: "+", onclick: () => addPlanEntry(planDay, sl.id) }),
        ]),
      ]);
      if (!entries.length) card.appendChild(el("div", { class: "tiny muted", style: "padding:6px 2px", text: "—" }));
      else { const list = el("div", { class: "list" }); entries.forEach((e, i) => list.appendChild(el("div", { class: "item", style: "padding:9px 2px" }, [
        el("div", { class: "grow" }, [el("div", { class: "t", text: e.nome }), e.kcal ? el("div", { class: "s", text: `${num(e.kcal)} kcal · ${num(e.p)}P ${num(e.c)}C ${num(e.f)}G` }) : el("div", { class: "s", text: "nota" })]),
        el("button", { class: "btn btn-ghost btn-sm", text: "✕", onclick: () => {
          const removed = entries[i];
          Store.update(NS, (s) => {
            s.mealPlan[planDay][sl.id].splice(i, 1);
            // este dia é hoje → desfaz também a sincronização no diário
            if (planDay === todayPlanDay() && removed && removed.id) {
              s.diary[todayISO()] = (s.diary[todayISO()] || []).filter((d) => d.planRef !== removed.id);
            }
          });
        }}),
      ]))); card.appendChild(list); }
      return card;
    });

    const isToday = planDay === todayPlanDay();
    const syncNote = isToday
      ? el("p", { class: "tiny", style: "color:var(--good);text-align:center;font-weight:600", text: "🔄 Este dia sincroniza automaticamente com o Diário de hoje." })
      : el("button", { class: "btn btn-primary btn-block", text: "↳ Copiar este dia para o diário de hoje", onclick: () => {
          const entries = [];
          PLAN_SLOTS.forEach((sl) => (dayPlan[sl.id] || []).forEach((e) => { if (e.kcal) entries.push(e); }));
          if (!entries.length) return toast("Nada com macros para copiar.");
          Store.update(NS, (s) => { s.diary[todayISO()] = s.diary[todayISO()] || []; entries.forEach((e) => s.diary[todayISO()].push({ id: uid(), foodId: e.foodId, nome: e.nome, grams: e.grams || 0, kcal: e.kcal, p: e.p, c: e.c, f: e.f })); });
          toast(entries.length + " itens no diário de hoje ✓");
        }});

    view.appendChild(el("div", { class: "stack" }, [sel, totCard, ...slots, syncNote,
      el("p", { class: "tiny muted center", text: isToday ? "Adiciona ou remove aqui e o Diário de hoje atualiza-se sozinho." : "O plano é um modelo semanal reutilizável. Copia um dia para o diário quando o quiseres registar." })]));
  }

  function addPlanEntry(dayId, slotId) {
    const nut = Store.get(NS);
    const seg = el("div", { class: "seg", style: "margin-bottom:6px" }, [
      el("button", { class: "active", text: "Refeição", onclick: (e) => switchSub(e, "meal") }),
      el("button", { text: "Alimento", onclick: (e) => switchSub(e, "food") }),
      el("button", { text: "Nota", onclick: (e) => switchSub(e, "text") }),
    ]);
    const body = el("div", {});
    let mode = "meal";
    function switchSub(e, m) { mode = m; [...seg.children].forEach((c) => c.classList.toggle("active", c === e.target)); drawBody(); }
    function push(entry) {
      entry.id = entry.id || uid();
      Store.update(NS, (s) => {
        s.mealPlan[dayId] = s.mealPlan[dayId] || {}; s.mealPlan[dayId][slotId] = s.mealPlan[dayId][slotId] || [];
        s.mealPlan[dayId][slotId].push(entry);
        // este dia é hoje → sincroniza logo com o diário de hoje, sem precisar de "Copiar"
        if (dayId === todayPlanDay() && entry.kcal) {
          s.diary[todayISO()] = s.diary[todayISO()] || [];
          s.diary[todayISO()].push({ id: uid(), planRef: entry.id, foodId: entry.foodId, nome: entry.nome, grams: entry.grams || 0, kcal: entry.kcal, p: entry.p || 0, c: entry.c || 0, f: entry.f || 0 });
        }
      });
      sh.close(); toast("Adicionado ✓");
    }
    function drawBody() {
      clear(body);
      if (mode === "meal") {
        if (!nut.meals.length) { body.appendChild(el("div", { class: "empty tiny", text: "Sem refeições guardadas. Cria-as no separador Refeições." })); return; }
        nut.meals.forEach((m) => {
          const t = m.items.reduce((a, it) => ({ kcal: a.kcal + it.kcal, p: a.p + it.p, c: a.c + it.c, f: a.f + it.f }), { kcal: 0, p: 0, c: 0, f: 0 });
          body.appendChild(el("div", { class: "item", style: "cursor:pointer", onclick: () => push({ kind: "meal", nome: m.nome, kcal: Math.round(t.kcal), p: +t.p.toFixed(1), c: +t.c.toFixed(1), f: +t.f.toFixed(1) }) }, [
            el("div", { class: "grow" }, [el("div", { class: "t", text: m.nome }), el("div", { class: "s", text: num(t.kcal) + " kcal" })]), el("span", { text: "+" })]));
        });
      } else if (mode === "food") {
        const search = field("Alimento", { placeholder: "Procurar…" });
        const g = field("Gramas", { type: "number", value: 100, inputmode: "decimal" });
        const res = el("div", { class: "list", style: "max-height:180px;overflow:auto" });
        function draw() { clear(res); const q = search.input.value.toLowerCase(); nut.foods.filter((f) => f.nome.toLowerCase().includes(q)).slice(0, 20).forEach((f) => res.appendChild(el("div", { class: "item", style: "cursor:pointer", onclick: () => { const grams = parseFloat(g.input.value) || 100; push({ kind: "food", ...entryFromFood(f, grams), nome: `${f.nome} (${num(grams)}g)` }); } }, [el("div", { class: "grow t", text: f.nome }), el("span", { text: "+" })]))); }
        search.input.addEventListener("input", draw); draw();
        body.appendChild(g); body.appendChild(search); body.appendChild(res);
      } else {
        const t = field("Nota", { placeholder: "ex: Sopa + fruta" });
        body.appendChild(t); body.appendChild(el("button", { class: "btn btn-primary btn-block", style: "margin-top:10px", text: "Adicionar nota", onclick: () => { if (t.input.value.trim()) push({ kind: "text", nome: t.input.value.trim() }); } }));
      }
    }
    drawBody();
    const sh = sheet("Adicionar ao plano", [seg, body]);
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

    let lastDetect = 0;
    async function lookup(code) {
      if (!code) return toast("Sem código.");
      status.textContent = `✓ Código lido: ${code} — a procurar produto…`;
      try {
        const r = await fetch(`https://world.openfoodfacts.org/api/v0/product/${code}.json`);
        const j = await r.json();
        if (j.status !== 1) { status.textContent = `Código ${code} lido, mas o produto não está na base de dados Open Food Facts. Insere-o manualmente abaixo.`; return; }
        const p = j.product, n = p.nutriments || {};
        const sodio = n["sodium_100g"] != null ? Math.round(n["sodium_100g"] * 1000) : (n["salt_100g"] != null ? Math.round(n["salt_100g"] * 400) : 0);
        const food = { id: "of_" + code, nome: p.product_name || ("Produto " + code), categoria: p.categories_tags ? "Scanner" : "Outros",
          calorias: Math.round(n["energy-kcal_100g"] || (n["energy_100g"] ? n["energy_100g"] / 4.184 : 0)),
          proteina: +(n["proteins_100g"] || 0), hidratos: +(n["carbohydrates_100g"] || 0), gordura: +(n["fat_100g"] || 0),
          fibra: +(n["fiber_100g"] || 0), acucar: +(n["sugars_100g"] || 0), saturadas: +(n["saturated-fat_100g"] || 0), sodio };
        // guardar na base local
        Store.update(NS, (st) => { if (!st.foods.some((f) => f.id === food.id)) st.foods.unshift(food); });
        try { window.__qr && window.__qr.stop(); } catch (e) {}
        s.close(); toast("✓ " + food.nome); onFood && onFood(food);
      } catch (e) { status.textContent = `Código ${code} lido, mas houve um erro de rede a procurar o produto (${e.message}). Tenta outra vez ou insere manualmente.`; }
    }

    // carregar Html5Qrcode dinamicamente
    if (window.Html5Qrcode) startCam();
    else {
      status.textContent = "A carregar o scanner…";
      const sc = document.createElement("script");
      sc.src = "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js";
      sc.onload = startCam;
      sc.onerror = () => { status.textContent = "Sem ligação para descarregar o scanner. Usa o código manual."; };
      document.head.appendChild(sc);
    }
    function startCam() {
      try {
        // Chamada mais simples e básica possível — a biblioteca já suporta EAN/UPC por
        // defeito. Ler o frame INTEIRO (sem qrbox) em vez de recortar uma zona, para não
        // arriscar cortar o código de fora da área de deteção.
        const q = new Html5Qrcode("qr-reader"); window.__qr = q;
        q.start(
          { facingMode: "environment" },
          { fps: 10 },
          (txt) => { lastDetect = Date.now(); status.textContent = "✓ Detetado: " + txt; q.stop().then(() => lookup(txt)).catch(() => lookup(txt)); },
          () => { /* chamado a cada frame sem deteção — normal, não fazer nada */ }
        ).then(() => {
          status.textContent = "Câmara aberta — aponta ao código de barras, a uns 10-15cm, bem iluminado.";
          setTimeout(() => { if (!lastDetect) status.textContent += " Ainda a tentar ler…"; }, 6000);
        }).catch((err) => {
          const msg = (err && err.message) || String(err);
          if (/NotAllowedError|Permission denied/i.test(msg)) status.textContent = "Sem permissão para a câmara. Autoriza o acesso nas definições do browser e tenta outra vez.";
          else if (/NotFoundError/i.test(msg)) status.textContent = "Não foi encontrada nenhuma câmara. Usa o código manual.";
          else status.textContent = "Não foi possível abrir a câmara: " + msg;
        });
      } catch (e) { status.textContent = "Scanner indisponível: " + (e.message || e); }
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
