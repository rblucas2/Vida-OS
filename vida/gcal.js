/* =====================================================================
   gcal.js — Google Calendar (2 sentidos), client-side, sem servidor.
   OAuth via Google Identity Services (token flow) + Calendar REST v3.
   O utilizador cria um "OAuth Client ID" (grátis) e cola-o nas Definições.
   ===================================================================== */
(function (global) {
  const SCOPE = "https://www.googleapis.com/auth/calendar.events";
  const BASE = "https://www.googleapis.com/calendar/v3";
  let tokenClient = null, accessToken = null, tokenExp = 0;
  const cbs = new Set();

  function cfg() { return (Store.get("sys").gcal) || {}; }
  function clientId() { return cfg().clientId || ""; }
  function calendarId() { return cfg().calendarId || "primary"; }
  function enabled() { return !!clientId(); }
  function connected() { return !!accessToken && Date.now() < tokenExp; }
  function notify() { cbs.forEach((f) => { try { f(connected()); } catch (e) {} }); }

  function loadGIS() {
    return new Promise((res, rej) => {
      if (global.google && google.accounts && google.accounts.oauth2) return res();
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client"; s.async = true; s.defer = true;
      s.onload = () => res(); s.onerror = () => rej(new Error("Não foi possível carregar o Google (sem ligação?)"));
      document.head.appendChild(s);
    });
  }

  /** Pede um token de acesso. interactive=true mostra o popup de consentimento. */
  async function connect(interactive = true) {
    if (!clientId()) throw new Error("Falta o Client ID do Google (Definições → Integração).");
    await loadGIS();
    return new Promise((resolve, reject) => {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId(), scope: SCOPE,
        callback: (resp) => {
          if (resp && resp.error) { reject(new Error(resp.error_description || resp.error)); return; }
          accessToken = resp.access_token;
          tokenExp = Date.now() + ((resp.expires_in ? resp.expires_in : 3500) * 1000) - 60000;
          notify(); resolve(accessToken);
        },
        error_callback: (err) => reject(new Error((err && err.message) || "Autorização cancelada")),
      });
      tokenClient.requestAccessToken({ prompt: interactive ? "consent" : "" });
    });
  }

  function disconnect() {
    if (accessToken && global.google && google.accounts && google.accounts.oauth2) {
      try { google.accounts.oauth2.revoke(accessToken); } catch (e) {}
    }
    accessToken = null; tokenExp = 0; notify();
  }

  async function ensureToken() { if (connected()) return accessToken; return connect(true); }

  async function api(path, opts = {}, retry = true) {
    const tok = await ensureToken();
    const r = await fetch(BASE + path, { ...opts, headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json", ...(opts.headers || {}) } });
    if (r.status === 401 && retry) { accessToken = null; tokenExp = 0; return api(path, opts, false); }
    if (!r.ok) throw new Error("Google API " + r.status + ": " + (await r.text()).slice(0, 200));
    return r.status === 204 ? null : r.json();
  }

  async function listEvents(timeMinISO, timeMaxISO) {
    const q = new URLSearchParams({ timeMin: timeMinISO, timeMax: timeMaxISO, singleEvents: "true", orderBy: "startTime", maxResults: "100" });
    const j = await api(`/calendars/${encodeURIComponent(calendarId())}/events?` + q.toString());
    return (j && j.items) || [];
  }
  async function createEvent(ev) {
    const body = { summary: ev.summary, description: ev.description || "" };
    if (ev.allDay) { body.start = { date: ev.start }; body.end = { date: ev.end || ev.start }; }
    else { body.start = { dateTime: ev.start }; body.end = { dateTime: ev.end }; }
    return api(`/calendars/${encodeURIComponent(calendarId())}/events`, { method: "POST", body: JSON.stringify(body) });
  }
  async function deleteEvent(id) { return api(`/calendars/${encodeURIComponent(calendarId())}/events/${encodeURIComponent(id)}`, { method: "DELETE" }); }

  global.GCal = {
    enabled, connected, connect, disconnect, listEvents, createEvent, deleteEvent, calendarId, clientId,
    onChange(f) { cbs.add(f); return () => cbs.delete(f); },
    origin() { return location.origin; },
  };
})(window);
