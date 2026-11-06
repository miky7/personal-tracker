# Libretto Personale

My student record book as an app: study hours, workouts, protein, reading, sleep and expenses, with charts and a **weekly grade out of 30** (the Italian university scale).
It is a **PWA**: it installs on the iPhone Home Screen and on a PC (Edge), opens full screen and also works offline. Data lives on **Supabase**, so phone and computer stay in sync.

## What it does

| Section | Content |
|---|---|
| **Home** | Greeting, three rings (study, protein, workouts), the week's grade, today's tiles and a Mon–Sun strip |
| **Today** | Study (hours), workout (type and duration), protein, reading and notes, sleep (hours slept) |
| **Expenses** | Entry in 2-3 taps, recurring expenses, monthly calendar, summary by category |
| **Charts** | Study and protein over the last 14 days, workout/reading calendar, study hours per week |
| **Report** | Grade /30 (with honours), comparison with the previous week, generated summary and a day-by-day table |
| **Plan** | Editable gym workout plan |
| **Foods** | Protein content of about 45 common foods |
| **Goals** | Weight and g/kg (protein target), daily study hours, workouts per week; code for the widget |

**How the grade is computed:** the average of three ratios (each capped at 1) multiplied by 30:
hours studied / (goal × days elapsed), workouts / goal scaled to the days elapsed, days with the protein target met / days elapsed. Reading and sleep do not count toward the grade.

## iPhone widget

A Home Screen widget built with the free [Scriptable](https://scriptable.app) app: today's study hours, today's protein and this week's workouts against the goals.
The script is in [`widget/Libretto-widget.js`](widget/Libretto-widget.js); the [`widget.html`](widget.html) page is there to copy it onto the phone.
The widget reads data without logging in through a Supabase function protected by a personal key, generated in the app (Goals → *Copy widget code*) and stored only in the iPhone Keychain.

## Repository layout

```
index.html            the app (HTML, CSS and JS in a single page)
config.js             Supabase Project URL and public key
libretto-sync.js      Supabase link: sign-in, offline local copy, real-time sync
sw.js                 service worker (offline support)
manifest.json         name, icons and colours of the installed app
vendor/               supabase-js 2.117.3 (local copy, no CDN)
icons/  splash/       icons and launch screens for iPhone
img/hero.jpg          Home photo
widget.html, widget/  Scriptable widget
```

## Quick setup

1. **Supabase** (free plan): create the project, create your user, run the setup script in the SQL Editor (`docs` table, Row Level Security, `widget_new_key` and `widget_data` functions), disable new sign-ups and add `{{ .Token }}` to the *Magic Link* email template.
2. **config.js**: fill in the *Project URL* and the *anon* / *publishable* key.
3. **GitHub Pages**: *Settings → Pages → Deploy from a branch → main / (root)*. The app is served at `https://<username>.github.io/personal-tracker/`.
4. **iPhone**: Safari → Share → *Add to Home Screen*. **PC**: Edge → *Install this site as an app*.
5. Sign in with your email: you receive a code to type into the app.

The SQL script is not in this repository because it contains personal data.

## Security

- The key in `config.js` is **public by design**: on its own it gives access to no data.
- Every row in the table belongs to a user, and **Row Level Security** only allows reading and writing your own rows; the table is closed to unauthenticated users.
- New sign-ups are disabled: only the manually created user can log in.
- The widget key is not stored in plain text: the database only holds its SHA-256 hash, and generating a new key invalidates the previous one.
- **Never** put the Supabase *service_role* / *secret* key in this repository.

## Tech stack

HTML, CSS and JavaScript with no framework and no build step · Supabase (Postgres, Auth, Realtime) · Service Worker and Web App Manifest · Scriptable · Google Fonts: Bricolage Grotesque, Instrument Sans, JetBrains Mono.

Home photo from [Unsplash](https://unsplash.com).
