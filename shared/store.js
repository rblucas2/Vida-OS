/* =====================================================================
   store.js — estado local-first partilhado entre as 3 apps
   - Cada app tem um "namespace" (los, fin, nut, sys)
   - Persiste em localStorage (mesma origem => apps veem-se umas às outras)
   - Pub/Sub para reagir a mudanças
   - Liga-se ao sync.js (opcional, gratuito) quando configurado
   ===================================================================== */
(function (global) {
  const PREFIX = "vidaos:";
  const listeners = {};       // ns -> Set(fn)
  const cache = {};           // ns -> objeto

  function key(ns) { return PREFIX + ns; }

  function load(ns) {
    if (cache[ns]) return cache[ns];
    let data = {};
    try {
      const raw = localStorage.getItem(key(ns));
      if (raw) data = JSON.parse(raw);
    } catch (e) { console.warn("store load falhou", ns, e); }
    cache[ns] = data;
    return data;
  }

  function save(ns, { silent = false, fromSync = false } = {}) {
    const data = cache[ns] || {};
    data._updatedAt = data._updatedAt || Date.now();
    try { localStorage.setItem(key(ns), JSON.stringify(data)); }
    catch (e) { console.error("store save falhou (cheio?)", e); UI && UI.toast("Erro ao guardar (armazenamento cheio?)"); }
    if (!silent) emit(ns);
    if (!fromSync && global.Sync) global.Sync.push(ns, data);
  }

  function emit(ns) {
    (listeners[ns] || []).forEach((fn) => { try { fn(cache[ns]); } catch (e) { console.error(e); } });
    (listeners["*"] || []).forEach((fn) => { try { fn(ns, cache[ns]); } catch (e) { console.error(e); } });
  }

  const Store = {
    /** Lê o objeto de estado de um namespace (referência viva). */
    get(ns) { return load(ns); },

    /** Atualiza via função mutadora: Store.update('fin', s => { s.x = 1 }) */
    update(ns, mutator, opts) {
      const data = load(ns);
      mutator(data);
      data._updatedAt = Date.now();
      save(ns, opts);
      return data;
    },

    /** Substitui o estado inteiro (usado pelo sync ao receber da cloud). */
    replace(ns, data, opts = {}) {
      cache[ns] = data || {};
      save(ns, { ...opts });
    },

    /** Garante valores por defeito sem apagar o existente. */
    ensure(ns, defaults) {
      const data = load(ns);
      let changed = false;
      for (const k in defaults) if (!(k in data)) { data[k] = defaults[k]; changed = true; }
      if (changed) save(ns, { silent: true });
      return data;
    },

    subscribe(ns, fn) {
      (listeners[ns] = listeners[ns] || new Set()).add(fn);
      return () => listeners[ns].delete(fn);
    },

    emit,

    /** Exportar tudo (backup manual). */
    exportAll() {
      const out = {};
      ["los", "fin", "nut", "sys"].forEach((ns) => { out[ns] = load(ns); });
      out._exportedAt = new Date().toISOString();
      return out;
    },

    importAll(obj) {
      ["los", "fin", "nut"].forEach((ns) => { if (obj[ns]) { cache[ns] = obj[ns]; save(ns); } });
    },
  };

  global.Store = Store;
})(window);
