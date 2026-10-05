/* =====================================================================
   config.js — configuração da app Vida (carregado antes de tudo).
   Namespaces: "los" (dia, tarefas, hábitos, objetivos, diário, revisões,
   separadores) e "tese" (projeto da tese + trabalhos das cadeiras).
   ===================================================================== */
window.APP = {
  id: "vida",
  prefix: "vida:",
  title: "Vida",
  namespaces: ["los", "tese"],
  themeColor: { dark: "#14131b", light: "#f4f3f8" },
  legacyLabel: "Importar dados da Vida OS (Espiritual + Tese)",
  merge: {
    los: {
      ids: ["habits", "pillars", "tabs"],
      keyed: ["reviews"],
      deepKeyed: ["days", "habitLog", "journal"],
      // pilares: junta objetivos dos dois lados (por id) quando o mesmo pilar existe nos dois
      after(out, older) {
        const byId = new Map((older.pillars || []).map((p) => [p.id, p]));
        (out.pillars || []).forEach((p) => {
          const o = byId.get(p.id); if (!o) return;
          const ids = new Set((p.goals || []).map((g) => g.id));
          (o.goals || []).forEach((g) => { if (!ids.has(g.id)) (p.goals = p.goals || []).push(g); });
        });
      },
    },
    tese: { ids: ["milestones", "tasks", "works"] },
  },

  /** 1.ª abertura: traz o Espiritual (vidaos:los) e a Tese (vidaos:tese) que este browser já tem. */
  migrate() {
    const los = Store.readRaw("vidaos:los");
    const tese = Store.readRaw("vidaos:tese");
    let n = 0;
    if (los && Object.keys(los).length) { App.mergeInto("los", los); n++; }
    if (tese && Object.keys(tese).length) { App.mergeInto("tese", tese); n++; }
    const vsys = Store.readRaw("vidaos:sys") || {};
    if (vsys.gcal && vsys.gcal.clientId) Store.update("sys", (s) => { if (!s.gcal) s.gcal = vsys.gcal; }, { silent: true });
    if (n) setTimeout(() => UI.toast("Trouxe o teu Espiritual e a Tese da Vida OS ✓", 3500), 500);
  },

  /** Botão nas Definições: volta a juntar os dados locais da Vida OS e os da sincronização antiga. */
  async importLegacy() {
    let n = 0;
    const los = Store.readRaw("vidaos:los"), tese = Store.readRaw("vidaos:tese");
    if (los) { App.mergeInto("los", los); n++; }
    if (tese) { App.mergeInto("tese", tese); n++; }
    const old = (Store.readRaw("vidaos:sys") || {}).sync;
    if (old && old.url && old.key && old.code) {
      for (const ns of ["los", "tese"]) {
        try { const d = await Sync.pullLegacy(old, ns); if (d) { App.mergeInto(ns, d); n++; } } catch (e) { console.warn(e); }
      }
    }
    return n;
  },

  /** Backup completo da Vida OS (.json com "los"/"tese") também é aceite pelo "Importar cópia". */
  importBackup(obj) {
    let ok = false;
    if (obj.los) ok = App.mergeInto("los", obj.los) || ok;
    if (obj.tese) ok = App.mergeInto("tese", obj.tese) || ok;
    return ok;
  },

  manageTabs() { Tabs.manage(); },
  settingsExtra(closeSettings) { return window.VidaSettings ? window.VidaSettings(closeSettings) : []; },
};
