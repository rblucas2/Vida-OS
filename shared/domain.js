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

  /** Aplica "ciclismo de nutrientes" se houve treino hoje. +12% kcal/hidratos. */
  function effectiveTargets(nut, los, dateISO = todayISO()) {
    const base = nutritionTargets(nut.profile);
    if (!base) return null;
    if (workoutDone(nut, los, dateISO)) {
      const kcal = Math.round(base.kcal * 1.12);
      const extra = kcal - base.kcal;
      return { ...base, kcal, carbs: base.carbs + Math.round(extra / 4), boosted: true };
    }
    return { ...base, boosted: false };
  }

  function workoutDone(nut, los, dateISO = todayISO()) {
    if (nut.workoutDays && nut.workoutDays[dateISO]) return true;
    // ou: hábito de ginásio marcado hoje no Life OS
    if (los && los.habits) {
      const gym = los.habits.find((h) => /gin|trein|workout|musc/i.test(h.name));
      if (gym && los.habitLog && los.habitLog[gym.id] && los.habitLog[gym.id][dateISO]) return true;
    }
    return false;
  }

  /** Soma de macros consumidos num dia. */
  function dayIntake(nut, dateISO = todayISO()) {
    const items = (nut.diary && nut.diary[dateISO]) || [];
    return items.reduce((a, it) => ({
      kcal: a.kcal + (it.kcal || 0), p: a.p + (it.p || 0), c: a.c + (it.c || 0), f: a.f + (it.f || 0),
    }), { kcal: 0, p: 0, c: 0, f: 0 });
  }

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

  /** Resumo financeiro do mês (para a app e para o widget do Life OS). */
  function financeSummary(fin, mk = monthKey()) {
    const tx = txInMonth(fin.transactions, mk);
    let income = 0, expense = 0;
    const byCat = {};
    tx.forEach((t) => {
      if (t.type === "income") income += t.amount;
      else { expense += t.amount; byCat[t.category] = (byCat[t.category] || 0) + t.amount; }
    });
    // Compromissos = orçamento essencial ainda por gastar
    const budgets = fin.budgets || {};
    let committed = 0;
    ESSENTIAL_CATS.forEach((c) => {
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
    if (!los.habits) return 0;
    const gym = los.habits.find((h) => /gin|trein|workout|musc/i.test(h.name));
    return gym ? habitStreak(los, gym.id) : 0;
  }

  global.Domain = {
    ACTIVITY, DEFAULT_RULES, ESSENTIAL_CATS,
    mifflin, nutritionTargets, effectiveTargets, workoutDone, dayIntake, nutritionSummary,
    categorize, financeSummary, netWorth, isEssential, txInMonth,
    habitStreak, gymStreak,
  };
})(window);
