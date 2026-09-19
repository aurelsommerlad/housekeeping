# Housekeeping Manager

Mobile Web-App (PWA) fuers Housekeeping-Management eines Hotelbetriebs, live verbunden mit der
Apaleo-API. Zwei Rollen: **Admin** (volle Kontrolle, Zuweisung, Statistik, Regeln, Userverwaltung)
und **Housekeeper** (sieht zugewiesene/relevante Zimmer, startet/beendet Reinigungen).

## Architektur

- **Frontend:** `index.html` - eine einzige Datei (HTML/CSS/JS), kein Build-Step, kein Framework.
- **Backend:** Vercel Serverless Functions unter `/api/*` (Node.js, CommonJS).
- **Persistenz:** Redis (Vercel-Marketplace-Integration "Redis" oder z. B. Upstash/Redis Cloud).
- **PMS-Anbindung:** Apaleo API ausschliesslich ueber die serverseitige Proxy-Function `/api/apaleo`.
  Der Apaleo Client Secret landet nie im Browser.

## Setup

1. Repository zu Vercel verbinden (kein Build-Command noetig, `package.json` installiert nur die
   `redis`-Dependency fuer die API-Routen).
2. Eine Redis-Datenbank ueber die Vercel-Marketplace-Integration verbinden (oder manuell
   `REDIS_URL` setzen).
3. Environment-Variablen setzen (siehe unten).
4. Deployen. Die Seed-Benutzer (`admin` / `hk1`, siehe `api/users.js`) werden beim ersten Aufruf
   von `/api/users` automatisch angelegt - danach ausschliesslich ueber den Team-Screen verwalten.

## Environment Variables

| Variable | Zweck |
|---|---|
| `APALEO_CLIENT_ID` | Apaleo API Client (Client-Credentials-Grant) |
| `APALEO_CLIENT_SECRET` | Apaleo API Client Secret |
| `REDIS_URL` | Verbindungs-URL der Redis-Datenbank (i. d. R. automatisch gesetzt) |

Der Apaleo API Client benoetigt Lese-/Schreibrechte (Scopes) fuer Inventory, Booking und
Operations.

## Backend-Routen

| Route | Zweck | Redis-Typ |
|---|---|---|
| `/api/apaleo` | Proxy zu Apaleo (Token-Handling + Weiterleitung) | - |
| `/api/users` | Benutzerverwaltung (CRUD) + Login | Hash |
| `/api/assignments` | Zimmer -> Housekeeper-Zuweisungen + Reinigungs-Timer | Hash |
| `/api/doubleups` | Zusatzausstattungs-Status pro Zimmer | Hash |
| `/api/completions` | Abgeschlossene Reinigungen (Statistik) | Liste |
| `/api/breaks` | Pausen-Log | Liste |

## Anpassungspunkte fuer einen neuen Kunden

Beim Aufsetzen fuer einen neuen Apaleo-Kunden in `index.html` anpassen:

- `PROPERTY_NAMES` - eigene Hotel-Codes und Anzeigenamen.
- `FORCED_CLEAN_INTERVAL_NIGHTS` - Zwangsreinigungs-Intervall (Standard: alle 2 Naechte).
- `DOUBLEUP_TYPES` - Liste der Zusatzausstattungs-Typen.
- CSS-Variablen in `:root` - Farbschema/Branding.
- `I18N` - benoetigte Sprachen.

In `api/users.js`:

- `SEED_USERS` - dient nur der einmaligen Erstbefuellung; danach Verwaltung ueber den
  Team-Screen der App.

## Zwangsreinigungs-Logik

Ein Zimmer gilt als "Zwangsreinigung faellig", wenn:

- Zustand ist `Dirty`,
- das Zimmer aktuell belegt ist (laufende Reservierung),
- die Anzahl der Naechte seit Anreise >= `FORCED_CLEAN_INTERVAL_NIGHTS` und durch dieses Intervall
  teilbar ist,
- und der Gast weder heute noch morgen abreist.

Die Regel ist im "Regeln"-Screen der App fuer Admins dokumentiert.

## Lokale Entwicklung

```bash
npm install
npm run dev
```

(setzt die Vercel CLI voraus: `npm i -g vercel`)
