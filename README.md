# Housekeeping Manager

Mobile Web-App (PWA) fuers Housekeeping-Management eines Hotelbetriebs, live verbunden mit der
Apaleo-API. Zwei Rollen: **admin** (voller Zugriff auf `/admin`: Zuweisung, Statistik, Regeln,
Userverwaltung) und **housekeeping** (sieht zugewiesene/relevante Zimmer, startet/beendet
Reinigungen).

## Architektur

- **Frontend:** eine gemeinsame Engine `app.js` (Vanilla JS, kein Build-Step, kein Framework),
  die von zwei duennen HTML-Shells geladen wird:
  - `index.html` - Housekeeping-/Mitarbeiterbereich unter `/`.
  - `admin/index.html` - Verwaltungsbereich unter `/admin` (siehe unten).
  Beide teilen sich `styles.css` und `app.js`; `document.body.dataset.mode` (`staff`/`admin`)
  steuert Nav, Standard-Screen und Login-/Setup-Verhalten.
- **Backend:** Vercel Serverless Functions unter `/api/*` (Node.js, CommonJS).
- **Persistenz:** Redis (Vercel-Marketplace-Integration "Redis" oder z. B. Upstash/Redis Cloud).
- **PMS-Anbindung:** Apaleo API ausschliesslich ueber die serverseitige Proxy-Function `/api/apaleo`.
  Der Apaleo Client Secret landet nie im Browser.
- **Routing:** `vercel.json` rewritet `/admin` (mit und ohne Trailing Slash) zuverlaessig auf
  `/admin/index.html`, damit ein direkter Aufruf oder Reload auf Vercel nicht zu einem 404 fuehrt.

## Adminbereich (`/admin`) und Authentifizierung

- **Ersteinrichtung:** Beim allerersten Aufruf von `/admin` prueft der Server (`GET /api/auth`),
  ob bereits ein Administrator existiert. Ist das nicht der Fall, zeigt `/admin` automatisch ein
  Registrierungsformular (Vorname, Nachname, E-Mail, Passwort, Passwort wiederholen). Nach dem
  Absenden wird der erste Admin angelegt und der Benutzer automatisch eingeloggt.
- **Danach nur noch Login:** Sobald ein Admin existiert, zeigt `/admin` fuer nicht eingeloggte
  Benutzer ausschliesslich einen reduzierten Login (E-Mail + Passwort). Die Registrierung ist
  **serverseitig** gesperrt - `POST /api/auth` mit `action: "register-admin"` liefert danach immer
  `403`, unabhaengig davon, was das Frontend anzeigt. Ein atomarer Redis-Lock (`SET ... NX`)
  verhindert zusaetzlich, dass zwei gleichzeitige Requests einen zweiten Admin anlegen koennten.
- **Rollen-Trennung:** Ein Login unter `/admin` sendet `scope: "admin"` mit; der Server erstellt in
  diesem Fall nur dann eine Session, wenn der Benutzer tatsaechlich `role === "admin"` ist - ein
  Housekeeping-Konto bekommt dort unter keinen Umstaenden eine Session, selbst wenn Passwort und
  E-Mail korrekt sind. Umgekehrt koennen Admins sich weiterhin ganz normal auch am `/`-Bereich
  anmelden.
- **Session:** rein serverseitig via HttpOnly-Cookie (`hk_session`). Das Cookie traegt nur ein
  zufaelliges, undurchsichtiges Token - die eigentlichen Sessiondaten (Benutzer-ID, Rolle) liegen
  in Redis (`hk:session:<token>`, 30 Tage gleitend verlaengert). `Secure` wird automatisch gesetzt,
  sobald die Anfrage ueber HTTPS laeuft (auf Vercel immer der Fall); `SameSite=Lax` schuetzt vor
  CSRF. Es gibt **keinen** clientseitigen Login-Zustand mehr in `localStorage` - ein Reload prueft
  die Session immer per `GET /api/auth`.
- **Passwoerter:** werden ausschliesslich serverseitig mit `bcrypt` (12 Runden, ueber `bcryptjs`)
  gehasht gespeichert (Feld `passwordHash`). Es gibt keine Klartext-Passwoerter im Code, im
  Repository oder im Browser.
- **API-Schutz:** Jede Route unter `/api/*` (ausser `/api/auth`) verlangt eine gueltige Session
  (`requireSession`). Administrative Aktionen sind zusaetzlich per `requireAdmin` bzw. gezielten
  Rollenchecks abgesichert:
  - `/api/users` - Lesen fuer jede angemeldete Person, Anlegen/Aendern/Loeschen nur Admin.
  - `/api/assignments` - `set`/`bulkSet`/`clearProperty` (Zuweisung an andere, Massen-Reset) nur
    Admin; `startTimer`/`stopTimer`/`clear` nur fuer das eigene zugewiesene Zimmer (oder Admin).
  - `/api/doubleups` - `set` (Zusatzausstattung markieren) nur Admin, `clear` fuer jede
    angemeldete Person.
  - `/api/apaleo`, `/api/completions`, `/api/breaks` - jede angemeldete Person.
  Ein Housekeeping-Konto kann also weder per UI-Manipulation noch per direktem API-Aufruf
  Admin-Funktionen ausloesen - die Pruefung erfolgt ausschliesslich serverseitig anhand der
  Session, nie anhand von Angaben aus dem Request-Body.

### Rollenmodell

Kanonische Rollen ab dieser Version: `admin` und `housekeeping`. Alle Berechtigungspruefungen im
Code lauten `role === 'admin'` (bzw. das Gegenteil) - jeder andere Wert zaehlt als Housekeeping.
Das schliesst die frueher verwendete Bezeichnung `housekeeper` explizit mit ein, siehe Migration
unten.

## Migration von der fruehen Version

Die urspruengliche Version dieser App seedete beim ersten Start automatisch Demo-Benutzer
(`admin`/`admin123`, `hk1`/`hk1123`) mit Klartext-Passwoertern in Redis. Das automatische Seeding
wurde entfernt - eine neue, leere Redis-Datenbank zeigt unter `/admin` daher korrekt den
Setup-Screen.

Falls bereits eine Installation mit diesen alten Demo-Benutzern in Redis existiert:

- `hasAnyAdmin()` findet den alten Seed-Admin und `/admin` zeigt sofort den Login (kein erneutes
  Setup noetig).
- Ein Login mit dem alten Klartext-Passwort funktioniert weiterhin (`api/_users.js#verifyLogin`
  erkennt den fehlenden `passwordHash` und vergleicht einmalig gegen das alte Klartextfeld).
  Direkt beim ersten erfolgreichen Login wird das Konto transparent auf einen bcrypt-Hash
  umgestellt und das Klartextfeld geloescht - ohne Zutun des Nutzers.
- **Empfehlung:** nach dem ersten Login mit einem alten Seed-Konto das Passwort im Team-Screen
  aendern, da `admin123`/`hk1123` oeffentlich bekannte Demo-Zugangsdaten waren.

Die Redis-Strukturen fuer Assignments, Doubleups, Completions und Breaks sind unveraendert und
wurden durch dieses Update nicht angefasst.

## Setup

1. Repository zu Vercel verbinden (kein Build-Command noetig; `package.json` installiert die
   Dependencies `redis` und `bcryptjs` fuer die API-Routen).
2. Eine Redis-Datenbank ueber die Vercel-Marketplace-Integration verbinden (oder manuell
   `REDIS_URL` setzen).
3. Environment-Variablen setzen (siehe unten - fuer die Authentifizierung sind **keine**
   zusaetzlichen Variablen noetig).
4. Deployen und `https://<deine-domain>/admin` aufrufen -> Ersteinrichtung des ersten
   Administrators.

## Environment Variables

| Variable | Zweck |
|---|---|
| `APALEO_CLIENT_ID` | Apaleo API Client (Client-Credentials-Grant) |
| `APALEO_CLIENT_SECRET` | Apaleo API Client Secret |
| `REDIS_URL` | Verbindungs-URL der Redis-Datenbank (i. d. R. automatisch gesetzt) |

Fuer Login/Session/Passwort-Hashing sind **keine neuen Environment Variables** noetig: Sessions
sind zufaellige, in Redis gespeicherte Tokens (kein JWT-Secret erforderlich) und bcrypt braucht
keinen externen Schluessel.

Der Apaleo API Client benoetigt Lese-/Schreibrechte (Scopes) fuer Inventory, Booking und
Operations.

## Backend-Routen

| Route | Zweck | Redis-Typ | Zugriff |
|---|---|---|---|
| `/api/auth` | Setup-Status, Login, Logout, Erstregistrierung | Hash (`hk:users`) + String (Session/Lock) | oeffentlich (Registrierung nur einmalig) |
| `/api/apaleo` | Proxy zu Apaleo (Token-Handling + Weiterleitung) | - | angemeldet |
| `/api/users` | Benutzerverwaltung (CRUD) | Hash | Lesen: angemeldet · Schreiben: Admin |
| `/api/assignments` | Zimmer -> Housekeeper-Zuweisungen + Reinigungs-Timer | Hash | angemeldet, Massenaktionen: Admin |
| `/api/doubleups` | Zusatzausstattungs-Status pro Zimmer | Hash | Lesen/Clear: angemeldet · Set: Admin |
| `/api/completions` | Abgeschlossene Reinigungen (Statistik) | Liste | angemeldet |
| `/api/breaks` | Pausen-Log | Liste | angemeldet |

## Anpassungspunkte fuer einen neuen Kunden

In `app.js` anpassen:

- `PROPERTY_NAMES` - eigene Hotel-Codes und Anzeigenamen.
- `FORCED_CLEAN_INTERVAL_NIGHTS` - Zwangsreinigungs-Intervall (Standard: alle 2 Naechte).
- `DOUBLEUP_TYPES` - Liste der Zusatzausstattungs-Typen.
- `I18N` - benoetigte Sprachen.

In `styles.css`:

- CSS-Variablen in `:root` (Housekeeping-Theme) und `body.theme-admin` (Admin-Theme,
  minimalistisches Off-White-Design) - Farbschema/Branding je Bereich.

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
