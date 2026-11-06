/* Libretto Personale: collegamento a Supabase.
   Offre alla pagina lo stesso database che aveva l'artifact (window.claude.use('db')):
   collection(c).onSnapshot / collection(c).doc(id).set|delete / doc('c/id').onSnapshot|set.
   I dati stanno nella tabella public.docs (una riga per documento, contenuto in jsonb).
   Copia locale + coda delle modifiche: l'app funziona anche offline e sincronizza appena torna la rete. */
(function(){
  'use strict';
  var CFG = window.LIBRETTO_CONFIG || {};
  // Accetta anche l'indirizzo copiato con /rest/v1/ in fondo: a Supabase serve solo https://xxxx.supabase.co
  if (CFG.url) CFG.url = String(CFG.url).trim().replace(/\/(rest|auth)\/v1\/?.*$/i, '').replace(/\/+$/, '');
  if (CFG.anonKey) CFG.anonKey = String(CFG.anonKey).trim();
  var CONFIGURED = !!(CFG.url && CFG.anonKey && !/INCOLLA/.test(CFG.url + CFG.anonKey));
  var COLLS = ['days', 'expenses', 'settings', 'plan'];
  var K_CACHE = 'lp_sb_cache', K_OUT = 'lp_sb_outbox', K_USER = 'lp_sb_user';

  function lsGet(k){ try { return JSON.parse(localStorage.getItem(k)); } catch(e){ return null; } }
  function lsSet(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }
  function clone(v){ return v == null ? v : JSON.parse(JSON.stringify(v)); }
  function $(s){ return document.querySelector(s); }

  var cache = lsGet(K_CACHE) || {};
  COLLS.forEach(function(c){ if (!cache[c] || typeof cache[c] !== 'object') cache[c] = {}; });
  var outbox = lsGet(K_OUT) || [];
  var listeners = [];           // {coll, id|null, fn}
  var sb = null, channel = null, flushing = false, pulling = false;

  function saveLocal(){ lsSet(K_CACHE, cache); lsSet(K_OUT, outbox); syncBanner(); }

  function emit(coll){
    listeners.forEach(function(l){
      if (l.coll !== coll) return;
      try {
        if (l.id == null) {
          var docs = Object.keys(cache[coll]).map(function(id){ var d = cache[coll][id]; return { id: id, data: function(){ return clone(d); } }; });
          l.fn({ docs: docs, size: docs.length, empty: !docs.length });
        } else {
          var d = cache[coll][l.id];
          l.fn({ id: l.id, exists: d !== undefined, data: function(){ return clone(d); } });
        }
      } catch(e){ console.error(e); }
    });
  }
  function emitAll(){ COLLS.forEach(emit); }

  function applyOp(op){
    if (op.op === 'set') cache[op.coll][op.id] = clone(op.data);
    else delete cache[op.coll][op.id];
  }
  function queue(op){
    outbox = outbox.filter(function(o){ return !(o.coll === op.coll && o.id === op.id); });
    outbox.push(op);
    applyOp(op); saveLocal(); emit(op.coll);
    flush();
  }

  async function flush(){
    if (!sb || flushing || !outbox.length) return;
    if (navigator.onLine === false) { syncBanner(); return; }
    flushing = true;
    try {
      while (outbox.length) {
        var op = outbox[0], res;
        if (op.op === 'set') res = await sb.from('docs').upsert({ coll: op.coll, id: op.id, data: op.data }, { onConflict: 'user_id,coll,id' });
        else res = await sb.from('docs').delete().eq('coll', op.coll).eq('id', op.id);
        if (res.error) throw res.error;
        if (outbox[0] === op) outbox.shift();
        saveLocal();
      }
    } catch(e){ console.warn('Sincronizzazione rimandata', e); }
    flushing = false; syncBanner();
  }

  async function pull(){
    if (!sb || pulling || navigator.onLine === false) return;
    pulling = true;
    try {
      var all = [], from = 0, step = 1000;
      for (;;) {
        var r = await sb.from('docs').select('coll,id,data').range(from, from + step - 1);
        if (r.error) throw r.error;
        all = all.concat(r.data || []);
        if (!r.data || r.data.length < step) break;
        from += step;
      }
      var fresh = {}; COLLS.forEach(function(c){ fresh[c] = {}; });
      all.forEach(function(row){ if (fresh[row.coll]) fresh[row.coll][row.id] = row.data; });
      cache = fresh;
      outbox.forEach(applyOp);              // le modifiche non ancora inviate restano valide
      saveLocal(); emitAll();
    } catch(e){ console.warn('Lettura dal server non riuscita, uso la copia locale', e); }
    pulling = false;
  }

  function listenRealtime(){
    if (!sb || channel) return;
    channel = sb.channel('libretto-docs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'docs' }, function(p){
        var row = p.eventType === 'DELETE' ? p.old : p.new;
        if (!row || !cache[row.coll]) return;
        if (outbox.some(function(o){ return o.coll === row.coll && o.id === row.id; })) return;
        if (p.eventType === 'DELETE') delete cache[row.coll][row.id];
        else cache[row.coll][row.id] = row.data;
        saveLocal(); emit(row.coll);
      })
      .subscribe();
  }

  function refresh(){ flush().then(pull); }

  /* ---------- database come quello dell'artifact ---------- */
  function docRef(coll, id){
    return {
      id: id,
      set: function(data){ queue({ op: 'set', coll: coll, id: id, data: clone(data), t: Date.now() }); return Promise.resolve(); },
      delete: function(){ queue({ op: 'del', coll: coll, id: id, t: Date.now() }); return Promise.resolve(); },
      get: function(){ var d = cache[coll][id]; return Promise.resolve({ id: id, exists: d !== undefined, data: function(){ return clone(d); } }); },
      onSnapshot: function(fn){ var l = { coll: coll, id: id, fn: fn }; listeners.push(l); setTimeout(function(){ emit(coll); }, 0); return function(){ listeners = listeners.filter(function(x){ return x !== l; }); }; }
    };
  }
  function collRef(coll){
    if (COLLS.indexOf(coll) < 0) throw new Error('Collezione sconosciuta: ' + coll);
    return {
      doc: function(id){ return docRef(coll, id); },
      onSnapshot: function(fn){ var l = { coll: coll, id: null, fn: fn }; listeners.push(l); setTimeout(function(){ emit(coll); }, 0); return function(){ listeners = listeners.filter(function(x){ return x !== l; }); }; }
    };
  }
  var db = {
    collection: collRef,
    doc: function(path){ var p = String(path).split('/'); return collRef(p[0]).doc(p[1]); }
  };

  /* ---------- accesso con email ---------- */
  var readyResolve; var ready = new Promise(function(r){ readyResolve = r; });
  window.claude = { use: function(name){ return name === 'db' ? ready : Promise.resolve(null); } };

  function gate(msg){
    var g = $('#gate'); if (!g) return;
    g.hidden = false; document.documentElement.classList.add('gated');
    if (msg) $('#gMsg').textContent = msg;
  }
  function ungate(){ var g = $('#gate'); if (g) g.hidden = true; document.documentElement.classList.remove('gated'); }

  function startApp(user){
    if (user && user.email) lsSet(K_USER, user.email);
    var em = lsGet(K_USER); if ($('#acctMail')) $('#acctMail').textContent = em || '';
    ungate();
    readyResolve(db);
    listenRealtime();
    refresh();
  }

  function syncBanner(){
    var b = $('#syncBanner'); if (!b) return;
    var off = navigator.onLine === false;
    b.hidden = !(outbox.length && off);
  }

  function setupGateUI(){
    var step = 'email', email = '';
    var form = $('#gForm'), inp = $('#gInput'), btn = $('#gBtn'), back = $('#gBack');
    function toEmail(){ step = 'email'; inp.type = 'email'; inp.inputMode = 'email'; inp.autocomplete = 'email'; inp.value = email; inp.placeholder = 'nome@esempio.it'; $('#gLbl').textContent = 'La tua email'; btn.textContent = 'Inviami il codice'; back.hidden = true; }
    function toCode(){ step = 'code'; inp.type = 'text'; inp.inputMode = 'numeric'; inp.autocomplete = 'one-time-code'; inp.value = ''; inp.placeholder = '123456'; $('#gLbl').textContent = 'Codice ricevuto per email'; btn.textContent = 'Entra'; back.hidden = false; inp.focus(); }
    back.onclick = function(){ toEmail(); $('#gMsg').textContent = ''; };
    form.onsubmit = async function(ev){
      ev.preventDefault();
      if (!sb) return;
      btn.disabled = true;
      try {
        if (step === 'email') {
          email = inp.value.trim().toLowerCase();
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { $('#gMsg').textContent = 'Controlla l’email.'; return; }
          var r = await sb.auth.signInWithOtp({ email: email, options: { shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname } });
          if (r.error) throw r.error;
          $('#gMsg').textContent = 'Ti ho mandato un’email: scrivi qui il codice (oppure, su PC, tocca il link).';
          toCode();
        } else {
          var code = inp.value.replace(/\D/g, '');
          var v = await sb.auth.verifyOtp({ email: email, token: code, type: 'email' });
          if (v.error) throw v.error;
          startApp(v.data.user);
        }
      } catch(e){
        var m = (e && e.message) || '';
        $('#gMsg').textContent = /rate|seconds/i.test(m) ? 'Troppe richieste: aspetta un minuto e riprova.'
          : step === 'code' && /expired|invalid|token/i.test(m) ? 'Codice scaduto o sbagliato: richiedine un altro.'
          : /api key|apikey|path/i.test(m) ? 'Configurazione di Supabase sbagliata: controlla URL e chiave in config.js.'
          : /not allowed|signups|not found/i.test(m) ? 'Questa email non è abilitata.'
          : 'Non è andata: ' + (m || 'controlla la connessione');
      } finally { btn.disabled = false; }
    };
    toEmail();
  }

  function setupAccountUI(){
    var kb = $('#wKey'), out = $('#wKeyMsg'), lo = $('#logout');
    if (kb) kb.onclick = async function(){
      if (!sb) return;
      kb.disabled = true; out.textContent = '';
      try {
        var r = await sb.rpc('widget_new_key');
        if (r.error) throw r.error;
        var blob = ['LIBRETTO', location.origin + location.pathname, CFG.url, CFG.anonKey, r.data].join('|');
        try { await navigator.clipboard.writeText(blob); out.textContent = 'Copiato. Ora apri Scriptable e incollalo quando lo script lo chiede. La chiave precedente non vale più.'; }
        catch(e){ out.innerHTML = 'Copia a mano questo testo:<br><textarea readonly style="width:100%;min-height:90px;font-size:12px"></textarea>'; out.querySelector('textarea').value = blob; }
      } catch(e){ out.textContent = 'Non riuscito: ' + ((e && e.message) || 'serve la connessione'); }
      kb.disabled = false;
    };
    if (lo) {
      var armed = false;
      lo.onclick = async function(){
        if (!armed) { armed = true; lo.textContent = outbox.length ? 'Ci sono modifiche non inviate: tocca ancora per uscire' : 'Tocca ancora per uscire'; setTimeout(function(){ armed = false; lo.textContent = 'Esci'; }, 4000); return; }
        try { if (sb) await sb.auth.signOut(); } catch(e){}
        [K_CACHE, K_OUT, K_USER].forEach(function(k){ try { localStorage.removeItem(k); } catch(e){} });
        location.replace(location.pathname);
      };
    }
  }

  async function boot(){
    setupGateUI(); setupAccountUI(); syncBanner();
    if (!CONFIGURED) { gate('Manca la configurazione: inserisci Project URL e chiave anon nel file config.js.'); $('#gForm').hidden = true; return; }
    try {
      sb = window.supabase.createClient(CFG.url, CFG.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'lp-auth' } });
    } catch(e){ gate('Non riesco a caricare Supabase. Controlla config.js.'); return; }

    // Già entrato su questo dispositivo: apro subito con la copia locale (funziona anche offline).
    var known = lsGet(K_USER);
    if (known) startApp(null);

    sb.auth.onAuthStateChange(function(ev, session){
      if (ev === 'SIGNED_IN' && session && !known) { known = session.user.email; startApp(session.user); }
      if (ev === 'SIGNED_OUT') { lsSet(K_USER, null); known = null; gate(''); }
    });

    var s = null;
    try { var r = await sb.auth.getSession(); s = r.data && r.data.session; } catch(e){}
    if (s) { if (!known) { known = s.user.email; startApp(s.user); } }
    else if (!known) gate('');
    else if (navigator.onLine !== false) {
      // Sessione persa (per esempio dati del sito cancellati): serve un nuovo accesso.
      var u = await sb.auth.getUser().catch(function(){ return {}; });
      var e = u && u.error;
      if (e && (e.status === 401 || e.status === 403 || /session|jwt|token/i.test(e.message || ''))) { lsSet(K_USER, null); known = null; gate('Accedi di nuovo per sincronizzare.'); }
    }

    window.addEventListener('online', refresh);
    window.addEventListener('offline', syncBanner);
    document.addEventListener('visibilitychange', function(){ if (document.visibilityState === 'visible') refresh(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
