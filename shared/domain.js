/* =====================================================================
   domain.js — regras de negócio puras, partilhadas pelas 3 apps.
   Fonte única de verdade para os widgets de integração do Life OS.
   ===================================================================== */
(function (global) {
  const todayISO = () => UI.todayISO();
  const monthKey = (d) => UI.monthKey(d);

  /* ---------------- NUTRIÇÃO ---------------- */
  const ACTIVITY = {
    sedentario: { f: 1.2,   label: "Sedentário" },
    leve:       { f: 1.375, label: "Leve" },
    moderado:   { f: 1.55,  label: "Moderado" },
    muito:      { f: 1.725, label: "Muito ativo" },
  };

  function mifflin({ sex, weight, height, age }) {
    const base = 10 * weight + 6.25 * height - 5 * age;
    return sex === "f" ? base - 161 : base + 5;     // TMB
  }

  /** Calcula alvos diários a partir do perfil. */
  function nutritionTargets(profile) {
    if (!profile || !profile.weight || !profile.height || !profile.age) return null;
    const tmb = mifflin(profile);
    const getd = tmb * (ACTIVITY[profile.activity] || ACTIVITY.moderado).f;
    let kcal = getd;
    if (profile.goal === "lose") kcal -= 400;
    else if (profile.goal === "gain") kcal += 400;
    const protein = Math.round((profile.weight || 70) * 2);     // 2 g/kg
    const fat = Math.round((kcal * 0.25) / 9);
    const carbs = Math.round((kcal - protein * 4 - fat * 9) / 4);
    return { tmb: Math.round(tmb), getd: Math.round(getd), kcal: Math.round(kcal), protein, carbs: Math.max(0, carbs), fat };
  }

  /** Metas base: manuais (customTargets) têm prioridade; senão Mifflin-St Jeor. */
  function baseTargets(nut) {
    const c = nut && nut.customTargets;
    if (c && c.kcal) return { tmb: null, getd: null, kcal: +c.kcal || 0, protein: +c.protein || 0, carbs: +c.carbs || 0, fat: +c.fat || 0, manual: true };
    return nutritionTargets(nut && nut.profile);
  }

  /** Aplica "ciclismo de nutrientes" se houve treino hoje. +12% kcal/hidratos. */
  function effectiveTargets(nut, los, dateISO = todayISO()) {
    const base = baseTargets(nut);
    if (!base) return null;
    if (workoutDone(nut, los, dateISO)) {
      const kcal = Math.round(base.kcal * 1.12);
      const extra = kcal - base.kcal;
      return { ...base, kcal, carbs: base.carbs + Math.round(extra / 4), boosted: true };
    }
    return { ...base, boosted: false };
  }

  function workoutDone(nut, los, dateISO = todayISO()) {
    if (nut.workoutDays && nut.workoutDays[dateISO]) return true; // toggle manual na Nutrição
    // ou: hábito de ginásio marcado hoje no Life OS
    if (los && los.habits) {
      const gym = los.habits.find((h) => /gin|trein|workout|musc/i.test(h.name));
      if (gym && los.habitLog && los.habitLog[gym.id] && los.habitLog[gym.id][dateISO]) return true;
    }
    return false;
  }

  /** Soma de macros e micronutrientes consumidos num dia. */
  function dayIntake(nut, dateISO = todayISO()) {
    const items = (nut.diary && nut.diary[dateISO]) || [];
    return items.reduce((a, it) => ({
      kcal: a.kcal + (it.kcal || 0), p: a.p + (it.p || 0), c: a.c + (it.c || 0), f: a.f + (it.f || 0),
      fib: a.fib + (it.fib || 0), sug: a.sug + (it.sug || 0), sat: a.sat + (it.sat || 0), sod: a.sod + (it.sod || 0),
    }), { kcal: 0, p: 0, c: 0, f: 0, fib: 0, sug: 0, sat: 0, sod: 0 });
  }

  // Referências diárias aproximadas para micronutrientes (adulto)
  const MICRO_REF = { fib: 30, sug: 50, sat: 22, sod: 2300 };

  /** Resumo de nutrição para o widget do Life OS. */
  function nutritionSummary(nut, los) {
    const t = effectiveTargets(nut, los);
    if (!t) return { configured: false };
    const got = dayIntake(nut);
    return {
      configured: true,
      kcalLeft: Math.round(t.kcal - got.kcal),
      proteinLeft: Math.round(t.protein - got.p),
      kcalPct: t.kcal ? (got.kcal / t.kcal) * 100 : 0,
      boosted: t.boosted, targets: t, intake: got,
    };
  }

  /* ---------------- FINANÇAS ---------------- */
  const DEFAULT_RULES = {
    "continente": "Supermercado", "pingo doce": "Supermercado", "lidl": "Supermercado", "auchan": "Supermercado",
    "mercadona": "Supermercado", "minipreco": "Supermercado", "intermarche": "Supermercado",
    "galp": "Transportes", "bp ": "Transportes", "repsol": "Transportes", "cepsa": "Transportes", "via verde": "Transportes",
    "cp ": "Transportes", "metro": "Transportes", "carris": "Transportes", "uber": "Transportes", "bolt": "Transportes",
    "mcdonald": "Restaurantes", "burger": "Restaurantes", "telepizza": "Restaurantes", "restaurante": "Restaurantes",
    "starbucks": "Restaurantes", "cafe": "Restaurantes", "kfc": "Restaurantes", "glovo": "Restaurantes", "uber eats": "Restaurantes",
    "edp": "Contas", "galp energia": "Contas", "meo": "Contas", "nos": "Contas", "vodafone": "Contas", "nowo": "Contas",
    "agua": "Contas", "epal": "Contas", "renda": "Habitação", "credito habitacao": "Habitação",
    "netflix": "Subscrições", "spotify": "Subscrições", "hbo": "Subscrições", "disney": "Subscrições", "amazon prime": "Subscrições",
    "fnac": "Compras", "worten": "Compras", "zara": "Compras", "primark": "Compras", "amazon": "Compras",
    "farmacia": "Saúde", "hospital": "Saúde", "clinica": "Saúde",
    "ginasio": "Saúde", "fitness": "Saúde",
    "ordenado": "Salário", "salario": "Salário", "vencimento": "Salário",
    "mbway": "Transferências", "levantamento": "Levantamentos", "atm": "Levantamentos",
  };

  const ESSENTIAL_CATS = ["Supermercado", "Habitação", "Contas", "Saúde", "Transportes"];

  function categorize(desc, rules = {}) {
    const d = (desc || "").toLowerCase();
    const all = { ...DEFAULT_RULES, ...rules };
    for (const key in all) if (d.includes(key)) return all[key];
    return "Outros";
  }

  function txInMonth(transactions, mk) {
    return (transactions || []).filter((t) => (t.date || "").slice(0, 7) === mk);
  }

  /** Resumo financeiro do mês (para a app e para o widget do Life OS).
      Transferências entre contas próprias (type === "transfer") são ignoradas. */
  function financeSummary(fin, mk = monthKey(), essentialCats) {
    const ess = (essentialCats && essentialCats.length) ? essentialCats : ESSENTIAL_CATS;
    const tx = txInMonth(fin.transactions, mk);
    let income = 0, expense = 0;
    const byCat = {};
    tx.forEach((t) => {
      if (t.type === "transfer") return;
      if (t.type === "income") income += t.amount;
      else { expense += t.amount; byCat[t.category] = (byCat[t.category] || 0) + t.amount; }
    });
    // Compromissos = orçamento essencial ainda por gastar
    const budgets = fin.budgets || {};
    let committed = 0;
    ess.forEach((c) => {
      const lim = budgets[c] || 0; const spent = byCat[c] || 0;
      if (lim > spent) committed += lim - spent;
    });
    const free = income - expense - committed;
    return { income, expense, committed, free, byCat, count: tx.length, balance: income - expense };
  }

  function netWorth(fin) {
    let assets = 0, liab = 0;
    (fin.assets || []).forEach((a) => { if (a.type === "liability") liab += a.value; else assets += a.value; });
    return { assets, liab, net: assets - liab };
  }

  /** Saldo atual por método de pagamento (fonte): saldo inicial + receitas − despesas nessa fonte.
      Transferências são ignoradas (não há modelo de conta origem/destino). */
  function sourceBalances(fin) {
    const sources = fin.sources || [];
    const balances = {};
    sources.forEach((s) => { balances[s.name] = s.opening || 0; });
    (fin.transactions || []).forEach((t) => {
      if (t.type === "transfer") return;
      const acc = t.account || "Outros";
      balances[acc] = (balances[acc] || 0) + (t.type === "income" ? t.amount : -t.amount);
    });
    const known = new Set(sources.map((s) => s.name));
    const extra = Object.keys(balances).filter((n) => !known.has(n));
    const list = [
      ...sources.map((s) => ({ id: s.id, name: s.name, balance: balances[s.name] || 0 })),
      ...extra.map((n) => ({ id: null, name: n, balance: balances[n] })),
    ];
    const total = list.reduce((a, x) => a + x.balance, 0);
    return { list, total };
  }

  function isEssential(cat) { return ESSENTIAL_CATS.includes(cat); }

  /* ---------------- HÁBITOS (Life OS) ---------------- */
  function habitStreak(los, habitId, ref = new Date()) {
    const log = (los.habitLog && los.habitLog[habitId]) || {};
    let streak = 0;
    const d = new Date(ref);
    // se hoje ainda não foi marcado, conta a partir de ontem
    if (!log[UI.isoDate(d)]) d.setDate(d.getDate() - 1);
    while (log[UI.isoDate(d)]) { streak++; d.setDate(d.getDate() - 1); }
    return streak;
  }

  function gymStreak(los) {
    if (!los || !los.habits) return 0;                    // baseado no hábito "Ginásio"/"Treino" do Espiritual
    const gym = los.habits.find((h) => /gin|trein|workout|musc/i.test(h.name));
    return gym ? habitStreak(los, gym.id) : 0;
  }

  global.Domain = {
    ACTIVITY, DEFAULT_RULES, ESSENTIAL_CATS, MICRO_REF,
    mifflin, nutritionTargets, baseTargets, effectiveTargets, workoutDone, dayIntake, nutritionSummary,
    categorize, financeSummary, netWorth, sourceBalances, isEssential, txInMonth,
    habitStreak, gymStreak,
  };
})(window);
