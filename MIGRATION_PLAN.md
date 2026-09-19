# Migrationsplan: Housekeeping-App -> Next.js + TypeScript + Tailwind CSS

Dieses Dokument analysiert die bestehende Architektur und beschreibt den geplanten,
schrittweisen Umbau auf denselben Stack wie das UNIQUE PLACES Owner Center (Next.js + React +
TypeScript + Tailwind CSS, Deployment auf Vercel). Es ist die Grundlage fuer alle folgenden
Umbau-Schritte und wird bei jeder Phase aktualisiert.

## 1. Bestandsaufnahme: aktuelle Architektur

| Bereich | Heutiger Stand |
|---|---|
| Frontend (Staff) | `index.html` (schlanke HTML-Shell) + `app.js` (~1000 Zeilen Vanilla JS: State, Rendering per `innerHTML`, Event-Delegation) + `styles.css` |
| Frontend (Admin) | `admin/index.html`, laedt **dasselbe** `app.js`/`styles.css` mit `data-mode="admin"` |
| PWA | `manifest.json`, `sw.js` (Service Worker, cached App-Shell), Icons unter `/icons/*.png` |
| Backend | Eigenstaendige Vercel Serverless Functions unter `/api/*.js` (CommonJS, `module.exports = async (req, res) => {...}`, kein Next.js) |
| Auth | `api/_auth.js` (bcrypt, HttpOnly-Cookie-Session in Redis), `api/_users.js` (Datenzugriff), `api/auth.js` (Login/Setup/Logout) |
| Persistenz | Redis (`api/_redis.js`, `redis`-npm-Client), Hashes/Listen fuer Users/Assignments/Doubleups/Completions/Breaks |
| PMS-Anbindung | `api/apaleo.js` als serverseitiger Proxy zu Apaleo (Token-Handling, Secret bleibt serverseitig) |
| Routing auf Vercel | Statisches Ausliefern von `index.html`/`admin/index.html` als Dateien; `vercel.json` rewritet `/admin` -> `/admin/index.html` |
| Build | **Kein Build-Schritt.** `package.json` installiert nur Laufzeit-Dependencies (`redis`, `bcryptjs`) fuer die API-Functions. Deployment ist "Dateien hochladen". |

**Wichtige Eigenschaft, die die Migration bestimmt:** Die `/api/*.js`-Dateien sind bereits
"nackte" Vercel Serverless Functions im projekt-root-`/api`-Verzeichnis - **kein**
Next.js-spezifisches Format (`pages/api` oder `app/**/route.ts`). Vercel unterstuetzt es
offiziell, ein Root-Level-`/api`-Verzeichnis **unabhaengig vom erkannten Frontend-Framework**
als zusaetzliche Serverless Functions auszuliefern. Das bedeutet konkret:

> **Die bestehenden API-Routen koennen unveraendert liegen bleiben, auch nachdem das Projekt als
> Next.js-Projekt erkannt wird.** Es ist fuer diesen Migrationsschritt keinerlei Aenderung an
> `api/*.js` noetig.

## 2. Zielarchitektur

- **Next.js (App Router) + TypeScript + Tailwind CSS v4**, exakt wie das Owner Center.
- `/api/*.js` bleibt unangetastet liegen (siehe oben) - die Backend-Logik wird **nicht**
  migriert, portiert oder umgeschrieben.
- Design-Tokens (Farben aus dem Owner Center) werden zentral in Tailwinds CSS-basiertem
  `@theme`-Block (`app/globals.css`) definiert - das ist gleichzeitig die "Single Source of
  Truth" fuer Farben/Radii, ohne ein separates Package (auf Wunsch bewusst noch **kein**
  gemeinsames npm-/Shared-Package zwischen Owner Center und Housekeeping).
- Wiederverwendbare UI-Bausteine (Button, Badge, Card, Chip, StatusPill, Avatar) als React-
  Komponenten unter `components/ui/`, damit sie spaeter 1:1 in ein gemeinsames Package
  ausgelagert werden koennten, ohne heute schon diesen Schritt zu erzwingen.

## 3. Der zentrale Zielkonflikt: Next.js uebernimmt `/`

Sobald `next.config.mjs` + `app/page.tsx` existieren und Vercel das Next.js-Framework erkennt,
**baut und rendert Next.js die Route `/` vollstaendig selbst** - ein zusaetzliches, rohes
`index.html` im Projekt-Root wird von diesem Punkt an nicht mehr ausgeliefert (Next.js/Vercel
serviert bei einem erkannten Framework nur noch `public/` als statische Passthrough-Dateien,
keine beliebigen Root-HTML-Dateien mehr). Das Gleiche gilt fuer `/admin` (der bestehende
`vercel.json`-Rewrite auf `admin/index.html` verliert seine Wirkung, sobald Next.js die
Build-Pipeline uebernimmt).

**Das ist unvermeidbar, sobald "gleicher Stack wie Owner Center" + "npm run build/lint
funktionieren ueber Next.js" gleichzeitig gelten sollen** - es laesst sich nicht softwareseitig
umgehen, ohne auf Next.js zu verzichten. Die bestehenden Dateien (`index.html`,
`admin/index.html`, `app.js`, `styles.css`, `manifest.json`, `sw.js`) werden in diesem Schritt
**nicht geloescht** (Vorgabe: nichts entfernen) - sie bleiben unveraendert im Repository liegen,
sind aber ab dem Moment, in dem dieser Branch deployt wird, ueber die Live-URL nicht mehr
erreichbar, weil Next.js die Routen `/` und `/admin` uebernimmt.

**Empfehlung:** Diesen Branch zunaechst nur ueber die Vercel-Preview-URL begutachten (nicht auf
den Production-Branch mergen), bis Phase 2/3 unten die eigentliche Housekeeping-/Admin-Logik in
Next.js-Seiten portiert haben. Bis dahin zeigt `/` bewusst nur den neuen UI-Prototyp mit
Beispieldaten (siehe Abschnitt 5) - keine echten Daten, kein Login.

## 4. Warum Tailwind v4 (CSS-first) statt `tailwind.config.ts`

Tailwind CSS v4 (aktuelle Major-Version) definiert Design-Tokens direkt in CSS ueber einen
`@theme { --color-x: ...; }`-Block statt in einer separaten JS-Konfigurationsdatei. Das erzeugt
automatisch passende Utility-Klassen (`bg-page`, `text-ink`, `border-line`, ...) **und** stellt
dieselben Werte als rohe CSS-Custom-Properties bereit - genau das, was Punkt 17 des Briefings
("Design Tokens zentral definieren") verlangt, ganz ohne zusaetzliche Abstraktionsebene. Ein
`tailwind.config.ts` ist fuer den aktuellen Umfang nicht noetig.

## 5. Phasenplan

- **Phase 0 (dieser Schritt):** Next.js/TypeScript/Tailwind-Grundgeruest, Design-Tokens,
  App-Shell, Branding, responsive Navigation, Property-Switcher, Zimmerübersicht als reiner
  UI-Prototyp mit lokalen, klar gekennzeichneten Beispieldaten. Keine Apaleo-Integration, keine
  Auth, kein Redis-Zugriff aus dem neuen Frontend. `/api/*.js` unveraendert.
- **Phase 1 (spaeter, nach Freigabe):** Echte Datenanbindung der Zimmeruebersicht an die
  bestehenden `/api/*`-Routen (fetch-Client analog zum bisherigen `backendGet`/`backendPost` aus
  `app.js`, jetzt typisiert). Login-Flow (`/api/auth`) als Next.js-Seite nachbauen.
  Detailansicht, Zuweisung, Zusatzausstattung, Statistik, Regeln, Team - jeweils als eigene
  Route/Komponente, unter Wiederverwendung der bestehenden API-Vertraege.
- **Phase 2 (erledigt):** `/admin` als eigene Next.js-Route (`app/admin/page.tsx`) mit
  Setup-/Login-Screen, plus native Route Handler unter `app/api/auth/{setup-status,setup,
  login,logout,me}/route.ts`. Grund: der in Phase 0 angenommene Parallelbetrieb von Next.js
  und dem alten `vercel.json`-Rewrite auf `admin/index.html` erwies sich auf der echten
  Vercel-Preview als nicht funktionsfaehig (siehe Bugreport - `vercel.json`-Rewrites haben
  Vorrang vor Next.js' eigenem Routing und haben `/admin` faelschlich auf die alte, nicht mehr
  zuverlaessig ausgelieferte statische Datei umgeleitet). `vercel.json` wurde deshalb bereits
  entfernt. Die neuen Route Handler nutzen dieselbe Redis-/bcrypt-/Session-Logik wie die
  bestehenden `/api/*.js`-Funktionen (`api/_redis.js`, `api/_auth.js`, `api/_users.js` werden
  direkt wiederverwendet, nicht dupliziert) - nur die Cookie-Anbindung ist neu, weil Next.js
  Route Handler das Web-Request/Response-API statt Node's klassischem (req,res) verwenden.
  Zusaetzlich wurde dabei ein Robustheitsbug in `api/_redis.js` behoben: bei einer
  Redis-Stoerung haengte ein Request zuvor unbegrenzt (node-redis' Offline-Queue +
  Standard-Reconnect), statt zuegig mit einem Fehler zu antworten.
- **Phase 3 (spaeter):** PWA-Wiederherstellung (Manifest/Service Worker/Icons nach `public/`
  migrieren, `metadata`-API von Next.js fuer `manifest.json`/Icons nutzen).
- **Phase 4 (spaeter, nach vollstaendiger Paritaet):** Aufraeumen - `index.html`,
  `admin/index.html`, `app.js`, `styles.css` (alte Vanilla-Variante) entfernen, sobald alle
  Funktionen nachgebaut und getestet sind.

## 6. Lokale Entwicklung waehrend der Uebergangsphase

- `npm run dev` startet ab sofort `next dev` (Next.js Dev-Server) fuer das neue Frontend.
- Der Next-Dev-Server liefert **kein** `/api/*` aus (das ist reines Vercel-Serverless-Terrain,
  keine Next.js Route Handler). Um die bestehenden API-Routen lokal mitzutesten, weiterhin
  `vercel dev` verwenden (deckt sowohl `/api/*.js` als auch - sobald erkannt - das Next.js-Frontend
  ab). Diese Doppelspurigkeit ist eine bewusste Uebergangsloesung fuer Phase 0/1.

## 7. Nicht angefasst in diesem Schritt

- Keine Datei unter `api/` wurde inhaltlich veraendert.
- `manifest.json`, `sw.js`, `icons/`, `index.html`, `admin/index.html`, `app.js`, `styles.css`
  bleiben vollstaendig erhalten (nur nicht mehr live erreichbar, siehe Abschnitt 3).
- Keine Apaleo-, Redis- oder Auth-Anbindung im neuen Next.js-Code.
