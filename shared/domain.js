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
    if (gymWorkoutDone(dateISO)) return true;                 // app de ginásio (gymos)
    if (nut.workoutDays && nut.workoutDays[dateISO]) return true; // toggle manual na Nutrição
    // ou: hábito de ginásio marcado hoje no Life OS
    if (los && los.habits) {
      const gym = los.habits.find((h) => /gin|trein|workout|musc/i.test(h.name));
      if (gym && los.habitLog && los.habitLog[gym.id] && los.habitLog[gym.id][dateISO]) return true;
    }
    return false;
  }

  /* ---------------- INTEGRAÇÃO COM APP DE GINÁSIO (gymos) ----------------
     A app de treinos (rblucas2.github.io/gymos) guarda em localStorage a
     chave 'treino_state' = { log: { "AAAA-MM-DD": [ {name, sets, when} ] } }.
     Como o GitHub Pages serve as duas apps na MESMA origem, conseguimos lê-la
     diretamente — sem servidor, sem custos. */
  function gymState() {
    try { return JSON.parse(localStorage.getItem("treino_state")) || {}; } catch (e) { return {}; }
  }
  function gymLog() { const s = gymState(); return s.log || {}; }
  function gymConnected() { return Object.keys(gymLog()).length > 0; }
  function gymWorkoutDone(dateISO = todayISO()) { const l = gymLog(); return !!(l[dateISO] && l[dateISO].length); }
  function gymStreakReal() {
    const l = gymLog();
    const has = (dt) => { const k = UI.isoDate(dt); return l[k] && l[k].length; };
    let s = 0; const d = new Date();
    if (!has(d)) d.setDate(d.getDate() - 1);
    while (has(d)) { s++; d.setDate(d.getDate() - 1); }
    return s;
  }
  function gymWeekCount() {
    const l = gymLog(); const now = new Date(); const dow = (now.getDay() + 6) % 7;
    const monday = new Date(now); monday.setDate(now.getDate() - dow); monday.setHours(0, 0, 0, 0);
    let c = 0; for (const date in l) { if (new Date(date + "T12:00") >= monday) c += l[date].length; }
    return c;
  }
  function gymLastSession() {
    const l = gymLog(); const dates = Object.keys(l).sort();
    if (!dates.length) return null;
    const last = dates[dates.length - 1]; const arr = l[last] || [];
    return { date: last, name: (arr[arr.length - 1] || {}).name || "Treino" };
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
    if (gymConnected()) return gymStreakReal();           // dados reais da app de ginásio
    if (!los || !los.habits) return 0;                    // fallback: hábito no Life OS
    const gym = los.habits.find((h) => /gin|trein|workout|musc/i.test(h.name));
    return gym ? habitStreak(los, gym.id) : 0;
  }

  global.Domain = {
    ACTIVITY, DEFAULT_RULES, ESSENTIAL_CATS, MICRO_REF,
    mifflin, nutritionTargets, baseTargets, effectiveTargets, workoutDone, dayIntake, nutritionSummary,
    categorize, financeSummary, netWorth, isEssential, txInMonth,
    habitStreak, gymStreak,
    gymState, gymLog, gymConnected, gymWorkoutDone, gymWeekCount, gymLastSession,
  };
})(window);
