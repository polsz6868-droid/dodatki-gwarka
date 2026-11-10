// ==UserScript==
// @name         Dodatki Gwarka
// @namespace    dodatki-gwarka
// @version      3.2
// @description  Zestaw dodatków do Margonem. Przycisk „G” w grze otwiera ustawienia. Dodatki aktualizują się same.
// @author       Gwarek
// @match        *://*.margonem.pl/*
// @match        *://*.margonem.com/*
// @exclude      *://www.margonem.pl/*
// @exclude      *://www.margonem.com/*
// @exclude      *://forum.margonem.pl/*
// @exclude      *://forum.margonem.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        GM_openInTab
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @connect      raw.githubusercontent.com
// @connect      cdn.jsdelivr.net
// @connect      public-api.margonem.pl
// @connect      public-api.margonem.com
// @updateURL    https://raw.githubusercontent.com/polsz6868-droid/dodatki-gwarka/main/dodatki-gwarka.user.js
// @downloadURL  https://raw.githubusercontent.com/polsz6868-droid/dodatki-gwarka/main/dodatki-gwarka.user.js
// @run-at       document-start
// ==/UserScript==

// Starter: uruchamia dodatki z kopii zapisanej w Tampermonkeyu, sam je aktualizuje z GitHuba
// i cofa się do poprzedniej wersji, jeśli nowa nie chce się uruchomić.
(function () {
  'use strict';
  const SOURCES = [                                       // główne źródło + zapasowe, gdy GitHub nie odpowiada
    'https://raw.githubusercontent.com/polsz6868-droid/dodatki-gwarka/main/dist/',
    'https://cdn.jsdelivr.net/gh/polsz6868-droid/dodatki-gwarka@main/dist/'
  ];
  const CHECK_EVERY = 30 * 60 * 1000;                     // sprawdzanie w tle co 30 minut
  const SKIP_FRESH = 15 * 60 * 1000;                      // przy przelogowaniu: nie sprawdzaj, jeśli sprawdzano < 15 min temu

  const get = (k, d) => GM_getValue('gwl.' + k, d);
  const set = (k, v) => GM_setValue('gwl.' + k, v);
  const log = (...a) => console.log('%c[Dodatki Gwarka]', 'color:#fbbf24', ...a);
  const GWL = { onUpdate: null, say: null, pendingInfo: null, version: () => get('ver', ''), lastCheck: () => get('last', 0), check };
  const say = msg => { if (GWL.say) GWL.say(msg); else log(msg); };

  function fetchText(url) {
    return new Promise((resolve, reject) => GM_xmlhttpRequest({
      method: 'GET', url: url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), timeout: 20000,
      onload: r => (r.status === 200 ? resolve(r.responseText) : reject(new Error('HTTP ' + r.status))),
      onerror: () => reject(new Error('brak połączenia')),
      ontimeout: () => reject(new Error('serwer nie odpowiada'))
    }));
  }
  // próbuje kolejnych źródeł, aż któreś odpowie
  async function fetchAny(file) {
    let err;
    for (const base of SOURCES) {
      try { return await fetchText(base + file); } catch (e) { err = e; }
    }
    throw err;
  }
  const compile = code => new Function('GM_getValue', 'GM_setValue', 'GM_xmlhttpRequest', 'GM_openInTab', 'unsafeWindow', 'GWL', code);

  let ran = false;
  function run(code) {
    if (ran) return true;
    try { compile(code)(GM_getValue, GM_setValue, GM_xmlhttpRequest, GM_openInTab, unsafeWindow, GWL); ran = true; return true; }
    catch (e) { console.error('[Dodatki Gwarka] błąd uruchomienia:', e); return false; }
  }

  // zapis nowej wersji – poprzednia zostaje jako kopia zapasowa
  function store(code, ver) {
    const cur = get('code', '');
    if (cur && get('ver', '') !== ver) { set('prevCode', cur); set('prevVer', get('ver', '')); }
    set('code', code);
    set('ver', ver);
  }
  function rollback() {
    const prev = get('prevCode', '');
    if (!prev) return false;
    set('bad', get('ver', ''));                           // tej wersji nie pobieramy ponownie, dopóki nie wyjdzie nowsza
    set('code', prev);
    set('ver', get('prevVer', ''));
    return true;
  }

  let busy = null;
  function check(manual, force) {
    if (busy) return busy;
    busy = (async () => {
      try {
        const info = JSON.parse(await fetchAny('version.json'));
        set('last', Date.now());
        if (!info || !info.version) throw new Error('zły plik version.json');
        if (!force && info.version === get('ver', '')) { if (manual) say('Masz najnowszą wersję (' + info.version + ').'); return; }
        if (!force && info.version === get('bad', '')) { if (manual) say('Wersja ' + info.version + ' nie uruchamiała się – czekam na poprawkę.'); return; }
        const code = await fetchAny('gwarka.js?v=' + encodeURIComponent(info.version));
        if (info.size && code.length !== info.size) throw new Error('plik pobrał się niecały – spróbuję później');
        compile(code);                                    // sprawdza, czy pobrany kod jest poprawny (nie uruchamia go)
        store(code, info.version);
        set('bad', '');
        if (!ran) { if (!run(code) && rollback()) run(get('code', '')); }   // pierwsze uruchomienie – od razu
        else { GWL.pendingInfo = info; if (GWL.onUpdate) GWL.onUpdate(info); else if (manual) say('Pobrano ' + info.version + ' – odśwież stronę (F5).'); }
      } catch (e) {
        console.warn('[Dodatki Gwarka] aktualizacja:', e.message);
        if (manual) say('Nie udało się sprawdzić aktualizacji (' + e.message + ').');
      } finally { busy = null; }
    })();
    return busy;
  }

  // start: najpierw kopia z Tampermonkeya; jeśli się wysypie – poprzednia wersja; jeśli i tej brak – pobranie od nowa
  const cached = get('code', '');
  let ok = cached ? run(cached) : false;
  if (cached && !ok && rollback()) { ok = run(get('code', '')); if (ok) log('nowa wersja nie ruszyła – włączono poprzednią (' + get('ver', '') + ').'); }
  if (!ok) check(false, !!cached);
  else if (Date.now() - get('last', 0) > SKIP_FRESH) check(false);
  setInterval(() => { if (!document.hidden) check(false); }, CHECK_EVERY);

  // menu Tampermonkeya – działa nawet wtedy, gdy dodatki w grze się nie wczytały
  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand('🔄 Sprawdź aktualizacje', () => check(true));
    GM_registerMenuCommand('⬇️ Pobierz dodatki od nowa', () => check(true, true).then(() => location.reload()));
    GM_registerMenuCommand('↩️ Wróć do poprzedniej wersji', () => {
      const pv = get('prevVer', '');
      if (!pv) return say('Brak zapisanej poprzedniej wersji.');
      if (confirm('Wrócić do wersji ' + pv + '? Strona się odświeży.')) { rollback(); location.reload(); }
    });
  }
})();
