// ==UserScript==
// @name         Dodatki Gwarka
// @namespace    dodatki-gwarka
// @version      3.1
// @description  Zestaw dodatków do Margonem. Przycisk „G” w grze otwiera ustawienia. Dodatki aktualizują się same.
// @author       Gwarek
// @match        *://*.margonem.pl/*
// @match        *://*.margonem.com/*
// @exclude      *://www.margonem.pl/*
// @exclude      *://www.margonem.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        GM_openInTab
// @grant        unsafeWindow
// @connect      raw.githubusercontent.com
// @connect      public-api.margonem.pl
// @connect      public-api.margonem.com
// @updateURL    https://raw.githubusercontent.com/polsz6868-droid/dodatki-gwarka/main/dodatki-gwarka.user.js
// @downloadURL  https://raw.githubusercontent.com/polsz6868-droid/dodatki-gwarka/main/dodatki-gwarka.user.js
// @run-at       document-start
// ==/UserScript==

// Starter: pobiera dodatki z GitHuba, trzyma kopię na wypadek braku internetu i sam je aktualizuje.
(function () {
  'use strict';
  const REPO = 'https://raw.githubusercontent.com/polsz6868-droid/dodatki-gwarka/main/dist/';
  const CHECK_EVERY = 30 * 60 * 1000;                     // sprawdzanie w tle co 30 minut
  const SKIP_FRESH = 15 * 60 * 1000;                      // przy przelogowaniu: nie sprawdzaj, jeśli sprawdzano < 15 min temu

  const get = (k, d) => GM_getValue('gwl.' + k, d);
  const set = (k, v) => GM_setValue('gwl.' + k, v);
  const GWL = { onUpdate: null, say: null, pendingInfo: null, version: () => get('ver', ''), lastCheck: () => get('last', 0), check };

  function fetchText(url) {
    return new Promise((resolve, reject) => GM_xmlhttpRequest({
      method: 'GET', url: url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), timeout: 20000,
      onload: r => (r.status === 200 ? resolve(r.responseText) : reject(new Error('HTTP ' + r.status))),
      onerror: () => reject(new Error('brak połączenia')),
      ontimeout: () => reject(new Error('serwer nie odpowiada'))
    }));
  }
  const compile = code => new Function('GM_getValue', 'GM_setValue', 'GM_xmlhttpRequest', 'GM_openInTab', 'unsafeWindow', 'GWL', code);

  let ran = false;
  function run(code) {
    if (ran) return;
    ran = true;
    try { compile(code)(GM_getValue, GM_setValue, GM_xmlhttpRequest, GM_openInTab, unsafeWindow, GWL); }
    catch (e) { console.error('[Dodatki Gwarka] błąd uruchomienia:', e); }
  }

  let busy = null;
  function check(manual) {
    if (busy) return busy;
    busy = (async () => {
      try {
        const info = JSON.parse(await fetchText(REPO + 'version.json'));
        set('last', Date.now());
        if (!info || !info.version) throw new Error('zły plik version.json');
        if (info.version === get('ver', '')) { if (manual && GWL.say) GWL.say('Masz najnowszą wersję (' + info.version + ').'); return; }
        const code = await fetchText(REPO + 'gwarka.js?v=' + encodeURIComponent(info.version));
        compile(code);                                    // sprawdza, czy pobrany kod jest poprawny (nie uruchamia go)
        set('code', code);
        set('ver', info.version);
        if (!ran) run(code);                              // pierwsze uruchomienie – od razu
        else { GWL.pendingInfo = info; if (GWL.onUpdate) GWL.onUpdate(info); }   // włączy się po odświeżeniu
      } catch (e) {
        console.warn('[Dodatki Gwarka] aktualizacja:', e.message);
        if (manual && GWL.say) GWL.say('Nie udało się sprawdzić aktualizacji (' + e.message + ').');
      } finally { busy = null; }
    })();
    return busy;
  }

  const cached = get('code', '');
  if (cached) run(cached);                                // od razu z kopii – gra nie czeka na internet
  // nic nie pobieramy przy każdym przelogowaniu: wersję sprawdzamy dopiero, gdy minęło 15 min od ostatniego sprawdzenia
  if (!cached || Date.now() - get('last', 0) > SKIP_FRESH) check(false);
  setInterval(() => { if (!document.hidden) check(false); }, CHECK_EVERY);
})();