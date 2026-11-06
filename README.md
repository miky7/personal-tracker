# Libretto Personale

Il mio libretto di studente in forma di app: ore di studio, allenamenti, proteine, lettura, sonno e spese, con grafici e un **voto settimanale in trentesimi**.
È una **PWA**: si installa sulla schermata Home dell'iPhone e su PC (Edge), si apre a tutto schermo e funziona anche offline. I dati stanno su **Supabase**, così telefono e computer restano sincronizzati.

## Cosa fa

| Sezione | Contenuto |
|---|---|
| **Home** | Saluto, tre anelli (studio, proteine, allenamenti), voto della settimana, riquadri del giorno e striscia lun–dom |
| **Oggi** | Studio (ore), allenamento (tipo e durata), proteine, lettura e note, sonno (ore dormite) |
| **Spese** | Inserimento in 2-3 tocchi, spese ricorrenti, calendario del mese, resoconto per categoria |
| **Grafici** | Studio e proteine degli ultimi 14 giorni, calendario allenamenti/lettura, ore di studio per settimana |
| **Resoconto** | Voto /30 (con lode), confronto con la settimana prima, testo generato e tabella giorno per giorno |
| **Scheda** | Scheda della palestra modificabile |
| **Alimenti** | Proteine di circa 45 cibi comuni |
| **Obiettivi** | Peso e g/kg (fabbisogno proteico), ore di studio al giorno, allenamenti a settimana; codice per il widget |

**Come nasce il voto:** media di tre rapporti (al massimo 1 ciascuno) moltiplicata per 30:
ore studiate / (obiettivo × giorni trascorsi), allenamenti / obiettivo proporzionato ai giorni trascorsi, giorni con proteine coperte / giorni trascorsi. Lettura e sonno non entrano nel voto.

## Widget per iPhone

Widget nella schermata Home fatto con l'app gratuita [Scriptable](https://scriptable.app): ore di studio di oggi, proteine di oggi e allenamenti della settimana rispetto agli obiettivi.
Lo script è in [`widget/Libretto-widget.js`](widget/Libretto-widget.js); la pagina [`widget.html`](widget.html) serve a copiarlo sul telefono.
Il widget legge i dati senza login tramite una funzione Supabase protetta da una chiave personale, generata nell'app (Obiettivi → *Copia codice per il widget*) e salvata solo nel Portachiavi dell'iPhone.

## Struttura del repo

```
index.html            l'app (HTML, CSS e JS in un'unica pagina)
config.js             Project URL e chiave pubblica di Supabase
libretto-sync.js      collegamento a Supabase: accesso, copia locale offline, sincronizzazione in tempo reale
sw.js                 service worker (funzionamento offline)
manifest.json         nome, icone e colori dell'app installata
vendor/               supabase-js 2.117.3 (copia locale, niente CDN)
icons/  splash/       icone e schermate di avvio per iPhone
img/hero.jpg          foto della Home
widget.html, widget/  widget per Scriptable
```

## Installazione in breve

1. **Supabase** (piano gratuito): crea il progetto, crea il tuo utente, esegui nel SQL Editor lo script di installazione (tabella `docs`, Row Level Security, funzioni `widget_new_key` e `widget_data`), disattiva le nuove iscrizioni e aggiungi `{{ .Token }}` al modello email *Magic Link*.
2. **config.js**: inserisci *Project URL* e chiave *anon* / *publishable*.
3. **GitHub Pages**: *Settings → Pages → Deploy from a branch → main / (root)*. L'app è su `https://<utente>.github.io/libretto/`.
4. **iPhone**: Safari → Condividi → *Aggiungi alla schermata Home*. **PC**: Edge → *Installa questo sito come app*.
5. Accesso con la tua email: arriva un codice da scrivere nell'app.

Lo script SQL non è in questo repo perché contiene dati personali.

## Sicurezza

- La chiave in `config.js` è **pubblica per natura**: da sola non dà accesso a nessun dato.
- Ogni riga della tabella appartiene a un utente e la **Row Level Security** permette di leggere e scrivere solo le proprie righe; agli utenti non autenticati la tabella è chiusa.
- Le nuove iscrizioni sono disattivate: può entrare solo l'utente creato a mano.
- La chiave del widget non è salvata in chiaro: nel database c'è solo la sua impronta SHA-256, e generarne una nuova invalida la precedente.
- **Mai** mettere in questo repo la chiave *service_role* / *secret* di Supabase.

## Tecnologie

HTML, CSS e JavaScript senza framework e senza build · Supabase (Postgres, Auth, Realtime) · Service Worker e Web App Manifest · Scriptable · Font Google: Bricolage Grotesque, Instrument Sans, JetBrains Mono.

Foto della Home da [Unsplash](https://unsplash.com).
