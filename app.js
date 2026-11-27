/* Amazon Radar — logica dell'app. Dati solo nel dispositivo (localStorage). */
(function () {
  'use strict';
  var KEY = 'ar_data_v2', OLD_KEY = 'amazon-risparmio-v1';
  var EMPTY = { settings: { primeEnd: '', cbBal: 0, cbExp: '', cbCap: 0 }, promos: [], subs: [], log: [], checks: {} };
  var CHECKS = [
    'Ha il badge cashback 5%? Oppure c\'è un giorno con cashback maggiorato in arrivo?',
    'Il prezzo è vicino al minimo storico su Keepa?',
    'C\'è un coupon da spuntare nella pagina del prodotto?',
    'È disponibile con Iscriviti e Risparmia?',
    'In "Altre opzioni di acquisto" c\'è un reso Seconda Mano a meno?',
    'Hai credito cashback da usare prima che scada?'
  ];

  var today = new Date(); today.setHours(0, 0, 0, 0);
  var Y = today.getFullYear();

  // ---------- memoria ----------
  function load() {
    var d = null;
    try { d = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    if (!d) { try { d = JSON.parse(localStorage.getItem(OLD_KEY)); } catch (e) {} }   // dati della versione precedente
    if (!d || !d.settings) d = JSON.parse(JSON.stringify(EMPTY));
    if (d.sample) d = JSON.parse(JSON.stringify(EMPTY));                              // gli esempi non passano
    ['promos', 'subs', 'log'].forEach(function (k) { if (!Array.isArray(d[k])) d[k] = []; });
    d.settings = Object.assign({}, EMPTY.settings, d.settings || {});
    d.checks = d.checks || {};
    delete d.sample;
    return d;
  }
  var S = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  save();

  // ---------- formati ----------
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function eur(v) { return (Number(v) || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }
  function eur0(v) { return Math.round(Number(v) || 0).toLocaleString('it-IT') + ' €'; }
  function days(s) { return s ? Math.round((new Date(s + 'T00:00:00') - today) / 864e5) : null; }
  function fdate(s, y) { return s ? new Date(s + 'T00:00:00').toLocaleDateString('it-IT', y ? { day: '2-digit', month: '2-digit', year: '2-digit' } : { day: 'numeric', month: 'short' }) : '—'; }
  function iso(d) { var z = new Date(d.getTime() - d.getTimezoneOffset() * 6e4); return z.toISOString().slice(0, 10); }
  function uid() { return Math.random().toString(36).slice(2, 9); }
  function toast(t) { var el = $('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(function () { el.classList.remove('show'); }, 1800); }

  function subCalc(s) { var yr = (Number(s.price) || 0) * 12 / Math.max(1, Number(s.every) || 1); return { yr: yr, save: yr * (Number(s.disc) || 0) / 100 }; }
  function logCalc(l) { var deal = Math.max(0, (l.normal || 0) - (l.paid || 0)), cb = (l.paid || 0) * (l.cb || 0) / 100; return { deal: deal, cb: cb, tot: deal + cb }; }

  // ---------- render ----------
  function renderHome() {
    var yl = S.log.filter(function (l) { return (l.date || '').indexOf(String(Y)) === 0; });
    var deal = 0, cb = 0, spent = 0;
    yl.forEach(function (l) { var c = logCalc(l); deal += c.deal; cb += c.cb; spent += l.paid || 0; });
    var subSave = 0, subYr = 0;
    S.subs.forEach(function (s) { var c = subCalc(s); subSave += c.save; subYr += c.yr; });
    $('yearLbl').textContent = 'Risparmiato nel ' + Y;
    $('ytd').textContent = eur(deal + cb);
    $('ytdDeal').textContent = eur(deal);
    $('ytdCb').textContent = eur(cb);
    $('ytdSub').textContent = yl.length ? (yl.length + (yl.length === 1 ? ' acquisto' : ' acquisti') + ' · ' + eur(spent) + ' spesi') : 'Registra un acquisto per iniziare';

    var st = S.settings, t = [];
    var dc = days(st.cbExp);
    t.push({ l: 'Cashback', v: eur(st.cbBal), n: st.cbExp ? (dc < 0 ? 'Credito scaduto' : 'Scade tra ' + dc + ' gg') : 'Imposta in Opzioni', alert: st.cbBal > 0 && dc !== null && dc <= 14, page: 'settings',
      meter: st.cbCap > 0 ? Math.min(100, cb / st.cbCap * 100) : null });
    var dp = days(st.primeEnd);
    t.push({ l: 'Prime Giovani', v: st.primeEnd ? (dp < 0 ? 'Finito' : dp + ' gg') : '—', n: st.primeEnd ? 'Fino al ' + fdate(st.primeEnd, true) : 'Imposta in Opzioni', alert: dp !== null && dp <= 60, page: 'settings' });
    t.push({ l: 'Iscrizioni', v: eur0(subYr / 12), n: 'al mese · −' + eur0(subSave) + '/anno', page: 'subs' });
    var next = S.promos.filter(function (p) { return !p.done && days(p.date) >= 0; }).sort(function (a, b) { return a.date.localeCompare(b.date); })[0];
    t.push({ l: 'Prossima promo', v: next ? days(next.date) + ' gg' : '—', n: next ? next.name : 'Nessuna attiva', alert: next && days(next.date) <= 7, page: 'promo' });
    $('tiles').innerHTML = t.map(function (x) {
      return '<button class="tile' + (x.alert ? ' alert' : '') + '" data-act="go" data-page="' + x.page + '"><span class="tile-l">' + esc(x.l) + '</span><span class="tile-v">' + esc(x.v) + '</span><span class="tile-n">' + esc(x.n) + '</span>' +
        (x.meter != null ? '<span class="meter" aria-label="Tetto cashback usato"><i style="width:' + x.meter.toFixed(1) + '%"></i></span>' : '') + '</button>';
    }).join('');

    $('checks').innerHTML = CHECKS.map(function (c, i) {
      return '<label class="check"><input type="checkbox" data-chk="' + i + '"' + (S.checks[i] ? ' checked' : '') + '><i></i><span>' + esc(c) + '</span></label>';
    }).join('');
  }

  function renderSubs() {
    var m = 0, sv = 0;
    S.subs.forEach(function (s) { var c = subCalc(s); m += c.yr / 12; sv += c.save; });
    $('subMonth').textContent = eur(m); $('subSave').textContent = eur(sv);
    $('subCount').textContent = S.subs.length + (S.subs.length === 1 ? ' iscrizione' : ' iscrizioni');
    var list = S.subs.slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'it'); });
    $('subList').innerHTML = list.length ? list.map(function (s) {
      var c = subCalc(s);
      return '<button class="row" data-act="editSub" data-id="' + esc(s.id) + '"><div class="row-main"><span class="row-t">' + esc(s.name) + '</span><span class="row-s">Ogni ' + esc(s.every) + (Number(s.every) === 1 ? ' mese' : ' mesi') + ' · sconto ' + esc(s.disc) + '%</span></div>' +
        '<div class="row-end"><span class="row-v">' + eur(s.price) + '</span><span class="row-s num">−' + eur(c.save) + '/anno</span></div></button>';
    }).join('') : '<p class="empty">Nessuna iscrizione. Aggiungi i prodotti che ricevi in automatico.</p>';
  }

  function renderLog() {
    var months = [];
    for (var i = 5; i >= 0; i--) { var d = new Date(today.getFullYear(), today.getMonth() - i, 1); months.push({ k: iso(d).slice(0, 7), l: d.toLocaleDateString('it-IT', { month: 'short' }).replace('.', ''), v: 0 }); }
    S.log.forEach(function (l) { months.forEach(function (m) { if ((l.date || '').indexOf(m.k) === 0) m.v += l.paid || 0; }); });
    var max = Math.max.apply(null, months.map(function (m) { return m.v; }).concat([1]));
    $('bars').innerHTML = months.map(function (m, i) {
      return '<div class="bar' + (i === 5 ? ' cur' : '') + '"><b>' + (m.v ? eur0(m.v) : '') + '</b><i style="height:' + Math.max(2, m.v / max * 100).toFixed(1) + '%"></i><span>' + esc(m.l) + '</span></div>';
    }).join('');
    $('monthTot').textContent = 'Questo mese ' + eur0(months[5].v);
    var list = S.log.slice().sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
    $('logList').innerHTML = list.length ? list.map(function (l) {
      var c = logCalc(l);
      return '<button class="row" data-act="editLog" data-id="' + esc(l.id) + '"><div class="row-main"><span class="row-t">' + esc(l.item) + '</span><span class="row-s">' + fdate(l.date, true) + ' · pagato ' + eur(l.paid) + (l.cb ? ' · cashback ' + esc(l.cb) + '%' : '') + '</span></div>' +
        '<div class="row-end"><span class="row-v' + (c.tot > 0 ? ' pos' : '') + '">' + (c.tot > 0 ? '−' + eur(c.tot) : eur(0)) + '</span></div></button>';
    }).join('') : '<p class="empty">Ancora nessun acquisto registrato.</p>';
  }

  function promoRow(p) {
    var d = days(p.date);
    var b = p.done ? '<span class="badge ok">Usata</span>' : d < 0 ? '<span class="badge">Scaduta</span>' : d <= 7 ? '<span class="badge bad">' + d + ' gg</span>' : '<span class="badge ui">' + d + ' gg</span>';
    return '<button class="row' + (p.done || d < 0 ? ' done' : '') + '" data-act="editPromo" data-id="' + esc(p.id) + '"><div class="row-main"><span class="row-t">' + esc(p.name) + '</span><span class="row-s">' + fdate(p.date, true) + (p.note ? ' · ' + esc(p.note) : '') + '</span></div><div class="row-end">' + b + '</div></button>';
  }
  function renderPromo() {
    var s = S.promos.slice().sort(function (a, b) { return a.date.localeCompare(b.date); });
    var act = s.filter(function (p) { return !p.done && days(p.date) >= 0; }), old = s.filter(function (p) { return p.done || days(p.date) < 0; }).reverse();
    $('promoList').innerHTML = act.length ? act.map(promoRow).join('') : '<p class="empty">Nessuna promo attiva. Aggiungi quelle che ricevi via email o in app.</p>';
    $('promoOld').innerHTML = old.length ? old.map(promoRow).join('') : '<p class="empty">Niente qui.</p>';
  }

  function renderSettings() {
    ['primeEnd', 'cbBal', 'cbExp', 'cbCap'].forEach(function (k) { var el = $(k); if (document.activeElement !== el) el.value = S.settings[k] || ''; });
    var th = pref('ar_theme', 'auto'), gl = pref('ar_glass', 'off');
    document.querySelectorAll('[data-theme-set]').forEach(function (b) { b.classList.toggle('active', b.dataset.themeSet === th); });
    document.querySelectorAll('[data-glass-set]').forEach(function (b) { b.classList.toggle('active', b.dataset.glassSet === gl); });
  }

  // ---------- prezzi seguiti dal bot (watchlist.json pubblicato con la pagina) ----------
  function renderWatch(w) {
    var items = Object.keys((w && w.items) || {}).map(function (a) { var x = w.items[a]; x.asin = a; return x; });
    $('watchCount').textContent = items.length ? items.length + ' prodotti' : '—';
    if (!items.length) { $('watchList').innerHTML = '<p class="empty">Il bot non segue ancora nessun prodotto. Mandagli un link Amazon su Telegram.</p>'; return; }
    items.sort(function (a, b) { return (a.title || a.asin).localeCompare(b.title || b.asin, 'it'); });
    var all = items.length, showAll = renderWatch.all;
    if (!showAll) items = items.slice(0, 5);
    $('watchList').innerHTML = items.map(function (x) {
      return '<button class="row" data-act="watch" data-asin="' + esc(x.asin) + '" data-title="' + esc(x.title || x.asin) + '"><div class="row-main"><span class="row-t">' + esc(x.title || x.asin) + '</span><span class="row-s">' + esc(x.asin) + (x.target ? ' · obiettivo ' + eur(x.target / 100) : '') + '</span></div>' +
        '<div class="row-end"><span class="row-v">' + (x.last_price ? eur(x.last_price / 100) : '—') + '</span></div></button>';
    }).join('') + (all > 5 ? '<button class="row" data-act="watchAll"><div class="row-main"><span class="row-t" style="color:var(--ui)">' + (showAll ? 'Mostra meno' : 'Mostra tutti (' + all + ')') + '</span></div></button>' : '');
    renderWatch.last = w;
  }
  function loadWatch() {
    fetch('./watchlist.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(renderWatch).catch(function () { $('watchList').innerHTML = '<p class="empty">Elenco del bot non raggiungibile da qui.</p>'; });
  }

  function renderAll() { renderHome(); renderSubs(); renderLog(); renderPromo(); renderSettings(); }

  // ---------- tema e vetro ----------
  function pref(k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } }
  function setPref(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function applyTheme() {
    var p = pref('ar_theme', 'auto');
    var light = p === 'light' || (p === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches);
    document.documentElement.setAttribute('data-theme', light ? 'light' : 'dark');
    $('metaThemeColor').setAttribute('content', light ? '#f2f2f7' : '#000000');
    $('metaStatusBar').setAttribute('content', light ? 'default' : 'black-translucent');
    var g = pref('ar_glass', 'off'), c = document.documentElement.classList;
    c.toggle('glass', g === 'on' || g === 'anim'); c.toggle('glass-anim', g === 'anim');
  }
  if (window.matchMedia) { try { matchMedia('(prefers-color-scheme: light)').addEventListener('change', applyTheme); } catch (e) {} }

  // ---------- finestra dal basso ----------
  var sheetSave = null;
  function field(f) {
    if (f.type === 'seg') return '<div class="field"><label>' + esc(f.label) + '</label><div class="seg" data-seg="' + f.key + '">' + f.options.map(function (o) {
      return '<button type="button" data-v="' + esc(o[0]) + '"' + (String(f.value) === String(o[0]) ? ' class="active"' : '') + '>' + esc(o[1]) + '</button>'; }).join('') + '</div></div>';
    if (f.type === 'textarea') return '<div class="field"><label for="f_' + f.key + '">' + esc(f.label) + '</label><textarea id="f_' + f.key + '" placeholder="' + esc(f.ph || '') + '">' + esc(f.value || '') + '</textarea></div>';
    return '<div class="field"><label for="f_' + f.key + '">' + esc(f.label) + '</label><input id="f_' + f.key + '" type="' + (f.type || 'text') + '"' + (f.type === 'number' ? ' inputmode="decimal" step="0.01" min="0"' : '') +
      ' value="' + esc(f.value == null ? '' : f.value) + '" placeholder="' + esc(f.ph || '') + '"' + (f.req ? ' required' : '') + '></div>';
  }
  function openSheet(o) {
    var rows = [], pair = [];
    o.fields.forEach(function (f) { if (f.half) { pair.push(field(f)); if (pair.length === 2) { rows.push('<div class="grid2">' + pair.join('') + '</div>'); pair = []; } } else rows.push(field(f)); });
    if (pair.length) rows.push(pair.join(''));
    $('sheet').innerHTML = '<div class="sheet-grip"></div><div class="sheet-h"><h2 id="sheetTitle">' + esc(o.title) + '</h2><button class="icon-btn" data-act="close" aria-label="Chiudi"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      (o.text ? '<p class="note">' + esc(o.text) + '</p>' : '') + rows.join('') +
      '<button class="btn primary block" data-act="sheetSave">' + esc(o.ok || 'Salva') + '</button>' +
      (o.onDelete ? '<button class="btn danger block" data-act="sheetDelete">' + esc(o.del || 'Elimina') + '</button>' : '');
    sheetSave = o; $('sheetWrap').classList.add('open');
    var first = $('sheet').querySelector('input,textarea'); if (first && !o.noFocus) setTimeout(function () { first.focus(); }, 60);
  }
  function closeSheet() { $('sheetWrap').classList.remove('open'); sheetSave = null; }
  function readSheet() {
    var v = {};
    sheetSave.fields.forEach(function (f) {
      if (f.type === 'seg') { var a = $('sheet').querySelector('[data-seg="' + f.key + '"] .active'); v[f.key] = a ? a.dataset.v : f.value; }
      else { var el = $('f_' + f.key); v[f.key] = el ? el.value.trim() : ''; }
    });
    return v;
  }
  var num = function (x) { return parseFloat(String(x).replace(',', '.')) || 0; };

  function subSheet(s) {
    var isNew = !s; s = s || { name: '', price: '', disc: 5, every: 1 };
    openSheet({ title: isNew ? 'Nuova iscrizione' : 'Iscrizione', fields: [
      { key: 'name', label: 'Prodotto', value: s.name, req: true },
      { key: 'price', label: 'Prezzo pieno €', type: 'number', value: s.price, half: true },
      { key: 'disc', label: 'Sconto %', type: 'number', value: s.disc, half: true },
      { key: 'every', label: 'Consegna', type: 'seg', value: s.every, options: [[1, '1 mese'], [2, '2'], [3, '3'], [4, '4'], [6, '6']] }],
      save: function (v) { if (!v.name) return false; var o = { name: v.name, price: num(v.price), disc: num(v.disc), every: Math.max(1, num(v.every)) };
        if (isNew) S.subs.push(Object.assign({ id: uid() }, o)); else Object.assign(s, o); },
      onDelete: isNew ? null : function () { S.subs = S.subs.filter(function (x) { return x !== s; }); } });
  }
  function logSheet(l) {
    var isNew = !l; l = l || { date: iso(today), item: '', paid: '', normal: '', cb: 0 };
    openSheet({ title: isNew ? 'Nuovo acquisto' : 'Acquisto', fields: [
      { key: 'item', label: 'Prodotto', value: l.item, req: true },
      { key: 'date', label: 'Data', type: 'date', value: l.date },
      { key: 'paid', label: 'Pagato €', type: 'number', value: l.paid, half: true },
      { key: 'normal', label: 'Prezzo normale €', type: 'number', value: l.normal, half: true, ph: 'media Keepa' },
      { key: 'cb', label: 'Cashback', type: 'seg', value: l.cb, options: [[0, 'No'], [5, '5%'], [10, '10%'], [20, '20%']] }],
      save: function (v) { if (!v.item) return false; var o = { item: v.item, date: v.date || iso(today), paid: num(v.paid), normal: num(v.normal) || num(v.paid), cb: num(v.cb) };
        if (isNew) S.log.push(Object.assign({ id: uid() }, o)); else Object.assign(l, o); },
      onDelete: isNew ? null : function () { S.log = S.log.filter(function (x) { return x !== l; }); } });
  }
  function promoSheet(p) {
    var isNew = !p; p = p || { name: '', date: '', note: '', done: false };
    openSheet({ title: isNew ? 'Nuova promo' : 'Promo', fields: [
      { key: 'name', label: 'Promo', value: p.name, req: true },
      { key: 'date', label: 'Scadenza', type: 'date', value: p.date },
      { key: 'note', label: 'Note', value: p.note, ph: 'codice, spesa minima, condizioni' },
      { key: 'done', label: 'Stato', type: 'seg', value: p.done ? 1 : 0, options: [[0, 'Da usare'], [1, 'Usata']] }],
      save: function (v) { if (!v.name || !v.date) return false; var o = { name: v.name, date: v.date, note: v.note, done: v.done === '1' };
        if (isNew) S.promos.push(Object.assign({ id: uid() }, o)); else Object.assign(p, o); },
      onDelete: isNew ? null : function () { S.promos = S.promos.filter(function (x) { return x !== p; }); } });
  }
  function find(list, id) { return S[list].filter(function (x) { return x.id === id; })[0]; }

  // ---------- azioni ----------
  function go(page) {
    document.querySelectorAll('.page').forEach(function (p) { p.classList.toggle('active', p.id === 'page-' + page); });
    document.querySelectorAll('.nav button').forEach(function (b) { b.classList.toggle('active', b.dataset.page === page); });
    window.scrollTo(0, 0);
    try { history.replaceState(null, '', page === 'home' ? location.pathname : '#' + page); } catch (e) {}
  }
  function backupText() { return JSON.stringify(S); }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act],[data-theme-set],[data-glass-set],[data-seg] button');
    if (!t) { if (e.target === $('sheetWrap')) closeSheet(); return; }
    if (t.dataset.themeSet) { setPref('ar_theme', t.dataset.themeSet); applyTheme(); renderSettings(); return; }
    if (t.dataset.glassSet) { setPref('ar_glass', t.dataset.glassSet); applyTheme(); renderSettings(); return; }
    if (t.parentNode && t.parentNode.dataset && t.parentNode.dataset.seg) { t.parentNode.querySelectorAll('button').forEach(function (b) { b.classList.toggle('active', b === t); }); return; }
    var a = t.dataset.act;
    if (a === 'go') go(t.dataset.page);
    else if (a === 'addSub') subSheet();
    else if (a === 'editSub') subSheet(find('subs', t.dataset.id));
    else if (a === 'addLog') logSheet();
    else if (a === 'editLog') logSheet(find('log', t.dataset.id));
    else if (a === 'addPromo') promoSheet();
    else if (a === 'editPromo') promoSheet(find('promos', t.dataset.id));
    else if (a === 'close') closeSheet();
    else if (a === 'sheetSave' && sheetSave) {
      if (sheetSave.save(readSheet()) === false) { toast('Compila i campi richiesti'); return; }
      var msg = sheetSave.msg; closeSheet(); save(); renderAll(); if (msg !== '') toast(msg || 'Salvato');
    } else if (a === 'sheetDelete' && sheetSave) { sheetSave.onDelete(); closeSheet(); save(); renderAll(); toast('Eliminato'); }
    else if (a === 'watchAll') { renderWatch.all = !renderWatch.all; renderWatch(renderWatch.last); }
    else if (a === 'resetChecks') { S.checks = {}; save(); renderHome(); }
    else if (a === 'watch') {
      var asin = t.dataset.asin;
      $('sheet').innerHTML = '<div class="sheet-grip"></div><div class="sheet-h"><h2 id="sheetTitle">' + esc(t.dataset.title) + '</h2><button class="icon-btn" data-act="close" aria-label="Chiudi"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
        '<p class="note">Su Keepa vedi lo storico del prezzo e puoi attivare un avviso gratuito (anche su Telegram).</p>' +
        '<a class="btn primary block" href="https://www.amazon.it/dp/' + encodeURIComponent(asin) + '" target="_blank" rel="noopener">Apri su Amazon</a>' +
        '<a class="btn block" href="https://keepa.com/#!product/8-' + encodeURIComponent(asin) + '" target="_blank" rel="noopener">Storico e avviso su Keepa</a>';
      sheetSave = null; $('sheetWrap').classList.add('open');
    }
    else if (a === 'copyBackup') {
      var txt = backupText();
      if (navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { toast('Backup copiato'); }, function () { toast('Copia non riuscita'); });
      else toast('Copia non disponibile');
    } else if (a === 'downloadBackup') {
      var blob = new Blob([backupText()], { type: 'application/json' }), u = URL.createObjectURL(blob), el = document.createElement('a');
      el.href = u; el.download = 'amazon-radar-' + iso(today) + '.json'; document.body.appendChild(el); el.click(); el.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 1000);
    } else if (a === 'importSheet') {
      openSheet({ title: 'Importa backup', msg: 'Importato', text: 'Incolla il testo del backup. Sostituisce i dati attuali.', ok: 'Importa', fields: [{ key: 'json', label: 'Backup', type: 'textarea', ph: '{"settings":…}' }],
        save: function (v) {
          try { var d = JSON.parse(v.json); if (!d || !d.settings || !Array.isArray(d.log)) throw 0;
            localStorage.setItem(KEY, JSON.stringify(d)); S = load(); save(); } catch (err) { toast('Backup non valido'); return false; } } });
    } else if (a === 'wipe') {
      openSheet({ title: 'Cancellare tutto?', text: 'Iscrizioni, acquisti, promo e impostazioni vengono eliminati da questo dispositivo. Non si può annullare.', ok: 'Annulla', fields: [], noFocus: true, msg: '',
        save: function () {}, del: 'Cancella tutti i dati', onDelete: function () { S = JSON.parse(JSON.stringify(EMPTY)); } });
    }
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.dataset.chk != null) { S.checks[t.dataset.chk] = t.checked; save(); }
    else if (t.dataset.set) { var k = t.dataset.set; S.settings[k] = (k === 'cbBal' || k === 'cbCap') ? num(t.value) : t.value; save(); renderHome(); }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });

  // ---------- avvio ----------
  $('today').textContent = today.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
  applyTheme(); renderAll(); loadWatch();
  var start = (location.hash || '').slice(1);
  if (['subs', 'log', 'promo', 'settings'].indexOf(start) >= 0) go(start);
})();
