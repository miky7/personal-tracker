// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-brown; icon-glyph: heartbeat;

/* =====================================================================
   Libretto Personale · widget per Scriptable (misura media; va anche piccola)
   Mostra: ore di studio di oggi / obiettivo, proteine di oggi / fabbisogno,
   allenamenti della settimana / obiettivo.

   Primo avvio: apri lo script dentro Scriptable (tocca ▶). Ti chiede di
   incollare il codice copiato dal Libretto (Obiettivi → "Copia codice per il
   widget"). Il codice resta solo nel Portachiavi di questo iPhone.
   Per cambiarlo: riapri lo script in Scriptable e scegli "Cambia codice".
   ===================================================================== */

const KC = "libretto_widget_cfg";
const FM = FileManager.local();
const DIR = FM.joinPath(FM.cacheDirectory(), "libretto-widget");
if (!FM.fileExists(DIR)) FM.createDirectory(DIR, true);
const CACHE = FM.joinPath(DIR, "last.json");
const BG = FM.joinPath(DIR, "hero.jpg");

// Colori del Libretto (tema scuro)
const C = {
  bg: new Color("#0A1114"),
  shade: new Color("#060D10"),
  fg: new Color("#F4F7F8"),
  muted: new Color("#F4F7F8", 0.62),
  track: new Color("#F4F7F8", 0.16),
  study: new Color("#8F9CFF"),
  prot: new Color("#FF9A55"),
  train: new Color("#4BD493"),
  ok: new Color("#4BD493"),
};

// ---------- configurazione ----------
function readCfg() {
  if (!Keychain.contains(KC)) return null;
  try { return JSON.parse(Keychain.get(KC)); } catch (e) { return null; }
}
function parseBlob(t) {
  const p = String(t || "").trim().split("|");
  if (p.length !== 5 || p[0] !== "LIBRETTO") return null;
  const [, site, url, anon, key] = p;
  if (!/^https:\/\//.test(url) || key.length < 32) return null;
  return { site, url: url.replace(/\/+$/, ""), anon, key };
}
async function askCfg(msg) {
  const a = new Alert();
  a.title = "Collega il Tracker";
  a.message = (msg ? msg + "\n\n" : "") + "Nel Tracker apri Obiettivi → \"Copia codice per il widget\", poi incolla qui.";
  a.addTextField("LIBRETTO|https://…", Pasteboard.paste() || "");
  a.addAction("Salva");
  a.addCancelAction("Annulla");
  if (await a.present() === -1) return null;
  const cfg = parseBlob(a.textFieldValue(0));
  if (!cfg) return askCfg("Il testo incollato non sembra il codice giusto.");
  Keychain.set(KC, JSON.stringify(cfg));
  return cfg;
}

// ---------- dati ----------
async function load(cfg) {
  const r = new Request(cfg.url + "/rest/v1/rpc/widget_data");
  r.method = "POST";
  r.timeoutInterval = 15;
  r.headers = { "apikey": cfg.anon, "Content-Type": "application/json", "Accept": "application/json" };
  if (/^eyJ/.test(cfg.anon)) r.headers["Authorization"] = "Bearer " + cfg.anon;
  r.body = JSON.stringify({ p_key: cfg.key });
  const j = await r.loadJSON();
  const code = r.response && r.response.statusCode;
  if (code && code >= 400) {
    const m = (j && (j.message || j.hint)) || ("errore " + code);
    const e = new Error(m); e.auth = /chiave/i.test(m); throw e;
  }
  j.fetchedAt = Date.now();
  FM.writeString(CACHE, JSON.stringify(j));
  return j;
}
function cached() {
  try { return FM.fileExists(CACHE) ? JSON.parse(FM.readString(CACHE)) : null; } catch (e) { return null; }
}

// ---------- disegno ----------
const nf = v => (Math.round(v * 10) / 10).toLocaleString("it-IT");
const DAYS = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
const MONTHS = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
function dayLabel(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return DAYS[dt.getDay()] + " " + d + " " + MONTHS[m - 1];
}
function hhmm(ms) { const d = new Date(ms); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }

function widgetWidth(family) {
  const sw = Device.screenSize().width;
  const medium = sw >= 428 ? 364 : sw >= 414 ? 360 : sw >= 402 ? 345 : sw >= 390 ? 338 : sw >= 375 ? 329 : 292;
  return family === "small" ? Math.round(medium * 0.47) : medium;
}

function bar(frac, color, w, h) {
  const s = 3, dc = new DrawContext();
  dc.size = new Size(w * s, h * s); dc.opaque = false; dc.respectScreenScale = false;
  const r = (h * s) / 2;
  let p = new Path(); p.addRoundedRect(new Rect(0, 0, w * s, h * s), r, r);
  dc.addPath(p); dc.setFillColor(C.track); dc.fillPath();
  const f = Math.max(0, Math.min(1, frac || 0));
  if (f > 0) {
    const fw = Math.max(h * s, w * s * f);
    p = new Path(); p.addRoundedRect(new Rect(0, 0, fw, h * s), r, r);
    dc.addPath(p); dc.setFillColor(color); dc.fillPath();
  }
  return dc.getImage();
}

async function background(cfg, w, h) {
  let img = null;
  try {
    if (FM.fileExists(BG) && (Date.now() - FM.modificationDate(BG).getTime()) < 7 * 864e5) img = FM.readImage(BG);
    else if (cfg && cfg.site) {
      img = await new Request(cfg.site.replace(/\/?$/, "/") + "img/hero.jpg").loadImage();
      FM.writeImage(BG, img);
    }
  } catch (e) { img = FM.fileExists(BG) ? FM.readImage(BG) : null; }
  const s = 3, W = w * s, H = h * s, dc = new DrawContext();
  dc.size = new Size(W, H); dc.respectScreenScale = false;
  dc.setFillColor(C.bg); dc.fillRect(new Rect(0, 0, W, H));
  if (img) {
    // riempie il riquadro, centrato un po' in alto (sul corridore e sul tramonto)
    const k = Math.max(W / img.size.width, H / img.size.height);
    const iw = img.size.width * k, ih = img.size.height * k;
    dc.drawImageInRect(img, new Rect((W - iw) / 2, (H - ih) * 0.45, iw, ih));
  }
  // velo scuro: più denso a sinistra, dove sta il testo
  const steps = 24;
  for (let i = 0; i < steps; i++) {
    const a = 0.86 - 0.42 * (i / (steps - 1));
    dc.setFillColor(new Color("#060D10", a));
    dc.fillRect(new Rect(Math.floor(W * i / steps), 0, Math.ceil(W / steps) + 1, H));
  }
  dc.setFillColor(new Color("#060D10", 0.25)); dc.fillRect(new Rect(0, 0, W, H));
  return dc.getImage();
}

function row(parent, color, label, value, unit, frac, w, done) {
  const top = parent.addStack(); top.centerAlignContent();
  const dot = top.addText("●"); dot.font = Font.systemFont(9); dot.textColor = color;
  top.addSpacer(5);
  const l = top.addText(label); l.font = Font.semiboldSystemFont(12); l.textColor = C.muted;
  top.addSpacer();
  const v = top.addText(value); v.font = Font.boldRoundedSystemFont(15); v.textColor = done ? C.ok : C.fg;
  const u = top.addText(" " + unit); u.font = Font.mediumSystemFont(11); u.textColor = C.muted;
  parent.addSpacer(4);
  const img = parent.addImage(bar(frac, color, w, 6)); img.imageSize = new Size(w, 6);
}

async function build(d, cfg, note) {
  const fam = config.widgetFamily || "medium";
  const W = widgetWidth(fam), H = fam === "small" ? 155 : 155;
  const pad = 15, inner = W - pad * 2;
  const w = new ListWidget();
  w.setPadding(pad - 2, pad, pad - 2, pad);
  w.backgroundColor = C.bg;
  try { w.backgroundImage = await background(cfg, W, H); } catch (e) {}
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

  // intestazione
  const h = w.addStack(); h.centerAlignContent();
  const b = h.addText("Personal Tracker"); b.font = Font.heavyRoundedSystemFont(14); b.textColor = C.fg;
  const dt = h.addText("."); dt.font = Font.heavyRoundedSystemFont(14); dt.textColor = C.prot;
  h.addSpacer();
  if (d && fam !== "small") {
    const t = h.addText(dayLabel(d.date)); t.font = Font.semiboldMonospacedSystemFont(10); t.textColor = C.muted;
  }
  w.addSpacer(fam === "small" ? 6 : 8);

  if (!d) {
    const t = w.addText(note || "Nessun dato"); t.font = Font.mediumSystemFont(12); t.textColor = C.fg;
    return w;
  }

  if (fam === "small") {
    const lines = [
      [C.study, nf(d.study) + " / " + nf(d.study_goal) + " h", d.study / d.study_goal],
      [C.prot, Math.round(d.protein) + " / " + d.protein_goal + " g", d.protein / d.protein_goal],
      [C.train, d.trained_week + " / " + d.train_target + " sett.", d.trained_week / d.train_target],
    ];
    lines.forEach(([c, txt, f], i) => {
      const t = w.addText(txt); t.font = Font.boldRoundedSystemFont(14); t.textColor = f >= 1 ? C.ok : C.fg;
      w.addSpacer(3);
      const im = w.addImage(bar(f, c, inner, 5)); im.imageSize = new Size(inner, 5);
      if (i < 2) w.addSpacer(7);
    });
  } else {
    row(w, C.study, "Studio oggi", nf(d.study) + " / " + nf(d.study_goal), "h", d.study / d.study_goal, inner, d.study >= d.study_goal);
    w.addSpacer(8);
    row(w, C.prot, "Proteine oggi", Math.round(d.protein) + " / " + d.protein_goal, "g", d.protein / d.protein_goal, inner, d.protein >= d.protein_goal);
    w.addSpacer(8);
    row(w, C.train, "Allenamenti settimana", d.trained_week + " / " + d.train_target, "", d.trained_week / d.train_target, inner, d.trained_week >= d.train_target);
  }

  w.addSpacer();
  const f = w.addStack();
  const ft = f.addText(note ? note : (d.logged ? "agg. " + hhmm(d.fetchedAt || Date.now()) : "oggi non ancora registrata · " + hhmm(d.fetchedAt || Date.now())));
  ft.font = Font.mediumSystemFont(9); ft.textColor = note ? C.prot : C.muted;
  return w;
}

// ---------- avvio ----------
let cfg = readCfg();
let stop = false;
if (config.runsInApp) {
  if (cfg) {
    const a = new Alert();
    a.title = "Personal Tracker";
    a.addAction("Mostra il widget");
    a.addAction("Cambia codice");
    a.addCancelAction("Chiudi");
    const r = await a.present();
    if (r === 1) cfg = await askCfg();
    if (r === -1) stop = true;
  } else {
    cfg = await askCfg();
  }
}

let data = null, note = null;
if (stop) {
  // chiuso dall'utente
} else if (!cfg) {
  note = "Apri questo script in Scriptable per collegarlo al Tracker.";
} else {
  try { data = await load(cfg); }
  catch (e) {
    if (e.auth) { note = "Codice non valido: copialo di nuovo dal Tracker."; }
    else {
      data = cached();
      note = data ? "offline · dati delle " + hhmm(data.fetchedAt) : "Nessuna connessione.";
      // i dati salvati di un altro giorno non valgono più per "oggi"
      const today = new Date(); const iso = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
      if (data && data.date !== iso) { data = { ...data, date: iso, study: 0, protein: 0, logged: false, trained_today: false }; }
    }
  }
}

if (!stop) {
  const widget = await build(data, cfg, note);
  if (config.runsInWidget) Script.setWidget(widget);
  else if (config.widgetFamily === "small") await widget.presentSmall();
  else await widget.presentMedium();
}
Script.complete();
