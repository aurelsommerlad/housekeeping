/* ======================= Konfiguration (pro Kunde anpassen) ======================= */
const APP_VERSION = '2.0.0';
const APP_MODE = (document.body && document.body.dataset && document.body.dataset.mode) || 'staff';

// Apaleo-Hauscode -> Anzeigename. Beim Kunden-Rollout ersetzen.
const PROPERTY_NAMES = {
  'BER01': 'Berlin Mitte',
  'MUC02': 'Muenchen Zentrum',
  'HAM03': 'Hamburg Hafen',
};

// Zusatzausstattungs-Typen ("Aufdoppeln"). id = interner Schluessel, icon = Anzeige, label = I18N-Key.
const DOUBLEUP_TYPES = [
  { id: 'crib', icon: '\u{1F476}', label: 'doubleup_crib' },
  { id: 'sofabed', icon: '\u{1F6CB}️', label: 'doubleup_sofabed' },
  { id: 'dog', icon: '\u{1F415}', label: 'doubleup_dog' },
  { id: 'extra', icon: '➕', label: 'doubleup_extra' },
];

// Zwangsreinigungs-Intervall (Naechte). Alle N Naechte seit Anreise faellig.
const FORCED_CLEAN_INTERVAL_NIGHTS = 2;

// Polling-Intervall fuer Live-Daten (ms).
const POLL_INTERVAL = 30000;

/* ======================= I18N ======================= */
const I18N = {
  de: {
    app_name: 'Housekeeping', login_title: 'Anmelden', username: 'Benutzername', password: 'Passwort',
    login_btn: 'Anmelden', login_error: 'Benutzername oder Passwort falsch.',
    nav_rooms: 'Zimmer', nav_doubleup: 'Extras', nav_stats: 'Statistik', nav_rules: 'Regeln', nav_team: 'Team',
    logout: 'Abmelden', my_rooms: 'Meine Zimmer', all_rooms: 'Alle Zimmer',
    filter_all: 'Alle', filter_forced: 'Zwangsreinigung', filter_dirty: 'Dirty', filter_inspect: 'Inspektion',
    filter_clean: 'Clean', filter_doubleup: 'Extras',
    st_forced: 'Zwangsreinigung', st_dirty: 'Dirty', st_running: 'Laeuft', st_clean: 'Clean',
    st_inspect: 'Inspektion', st_locked: 'Gesperrt',
    multiselect: 'Mehrfachauswahl', multiselect_on: 'Auswahl beenden', assign_selected: 'Ausgewaehlte zuweisen',
    clear_all: 'Alle Zuweisungen aufheben', clear_all_confirm: 'Wirklich alle Zuweisungen dieses Hauses aufheben?',
    confirm: 'Bestaetigen', cancel: 'Abbrechen', close: 'Schliessen',
    room_detail: 'Zimmer', condition: 'Zustand', guest_comment: 'Reservierungskommentar',
    assign_to: 'Zuweisen an', unassigned: 'Nicht zugewiesen', workload: 'Zimmer', doubleup_needed: 'Zusatzausstattung',
    doubleup_crib: 'Babybett', doubleup_sofabed: 'Schlafsofa', doubleup_dog: 'Hund', doubleup_extra: 'Extras',
    note: 'Notiz', save: 'Speichern', start_clean: 'Reinigung starten', pause_clean: 'Pausieren',
    resume_clean: 'Fortsetzen', finish_clean: 'Reinigung abschliessen', complete_inspection: 'Inspektion abschliessen',
    finish_doubleup: 'Zusatzausstattung erledigt', running_since: 'Laeuft seit', elapsed: 'Verstrichen',
    stats_today: 'Heute', stats_month: 'Monat', stats_year: 'Jahr', cleaned_rooms: 'Zimmer gereinigt',
    avg_time: 'Ø Zeit', fastest: 'Schnellste', by_housekeeper: 'Leistung pro Housekeeper',
    recent_completions: 'Letzte Abschluesse', no_data: 'Keine Daten vorhanden.',
    rules_title: 'Aktive Regeln', rule_forced_t: 'Zwangsreinigung', rule_forced_d:
      'Ein belegtes, als "Dirty" markiertes Zimmer wird alle {{n}} Naechte seit Anreise zur Zwangsreinigung markiert - ausser der Gast reist heute oder morgen ab.',
    rule_dirty_t: 'Automatisch Dirty nach Check-out', rule_dirty_d:
      'Sobald ein Gast auscheckt, setzt Apaleo den Zimmerzustand automatisch auf "Dirty".',
    rule_inspect_t: 'Inspektions-Workflow', rule_inspect_d:
      'Nach Abschluss der Reinigung wechselt das Zimmer zu "Inspektion". Ein Admin prueft und setzt final auf "Clean".',
    rule_turnover_t: 'Same-Day-Turnover', rule_turnover_d:
      'Reist am selben Tag ein neuer Gast an, wird bei der Reinigung der Kommentar der Folgereservierung angezeigt statt des abreisenden Gasts.',
    team_title: 'Team', new_user: 'Neuer Benutzer', role: 'Rolle', role_admin: 'Admin', role_housekeeper: 'Housekeeping',
    properties: 'Haeuser', all_properties: 'Alle', name: 'Name', delete: 'Loeschen', delete_confirm: 'Benutzer wirklich loeschen?',
    breaks_title: 'Pause', break_start: 'Pause starten', break_end: 'Pause beenden', on_break: 'In Pause',
    select_property: 'Bitte Haus auswaehlen.', loading: 'Lade Daten...', no_rooms: 'Keine Zimmer gefunden.',
    saved: 'Gespeichert.', toggle_double: 'Zusatzausstattung markieren',
    setup_title: 'Ersteinrichtung', admin_subtitle: 'Adminbereich',
    first_name: 'Vorname', last_name: 'Nachname', email: 'E-Mail',
    password_confirm: 'Passwort wiederholen', create_admin_btn: 'Admin-Konto erstellen',
    err_fill_all: 'Bitte alle Felder ausfuellen.', err_password_mismatch: 'Die Passwoerter stimmen nicht ueberein.',
    checking: 'Wird geladen...', err_no_admin_access: 'Kein Zugriff auf den Adminbereich.',
  },
  en: {
    app_name: 'Housekeeping', login_title: 'Sign in', username: 'Username', password: 'Password',
    login_btn: 'Sign in', login_error: 'Wrong username or password.',
    nav_rooms: 'Rooms', nav_doubleup: 'Extras', nav_stats: 'Stats', nav_rules: 'Rules', nav_team: 'Team',
    logout: 'Sign out', my_rooms: 'My rooms', all_rooms: 'All rooms',
    filter_all: 'All', filter_forced: 'Forced clean', filter_dirty: 'Dirty', filter_inspect: 'Inspection',
    filter_clean: 'Clean', filter_doubleup: 'Extras',
    st_forced: 'Forced clean', st_dirty: 'Dirty', st_running: 'In progress', st_clean: 'Clean',
    st_inspect: 'Inspection', st_locked: 'Locked',
    multiselect: 'Multi-select', multiselect_on: 'End selection', assign_selected: 'Assign selected',
    clear_all: 'Clear all assignments', clear_all_confirm: 'Really clear all assignments for this property?',
    confirm: 'Confirm', cancel: 'Cancel', close: 'Close',
    room_detail: 'Room', condition: 'Condition', guest_comment: 'Reservation comment',
    assign_to: 'Assign to', unassigned: 'Unassigned', workload: 'rooms', doubleup_needed: 'Extra setup',
    doubleup_crib: 'Crib', doubleup_sofabed: 'Sofa bed', doubleup_dog: 'Dog', doubleup_extra: 'Extras',
    note: 'Note', save: 'Save', start_clean: 'Start cleaning', pause_clean: 'Pause',
    resume_clean: 'Resume', finish_clean: 'Finish cleaning', complete_inspection: 'Complete inspection',
    finish_doubleup: 'Extra setup done', running_since: 'Running since', elapsed: 'Elapsed',
    stats_today: 'Today', stats_month: 'Month', stats_year: 'Year', cleaned_rooms: 'Rooms cleaned',
    avg_time: 'Avg. time', fastest: 'Fastest', by_housekeeper: 'Performance by housekeeper',
    recent_completions: 'Recent completions', no_data: 'No data available.',
    rules_title: 'Active rules', rule_forced_t: 'Forced cleaning', rule_forced_d:
      'An occupied room marked "Dirty" is flagged for forced cleaning every {{n}} nights since arrival - unless the guest departs today or tomorrow.',
    rule_dirty_t: 'Auto-Dirty after check-out', rule_dirty_d:
      'As soon as a guest checks out, Apaleo automatically sets the room condition to "Dirty".',
    rule_inspect_t: 'Inspection workflow', rule_inspect_d:
      'After cleaning is finished, the room moves to "Inspection". An admin reviews it and sets it to "Clean".',
    rule_turnover_t: 'Same-day turnover', rule_turnover_d:
      'If a new guest arrives the same day, the comment of the following reservation is shown instead of the departing guest’s.',
    team_title: 'Team', new_user: 'New user', role: 'Role', role_admin: 'Admin', role_housekeeper: 'Housekeeping',
    properties: 'Properties', all_properties: 'All', name: 'Name', delete: 'Delete', delete_confirm: 'Really delete this user?',
    breaks_title: 'Break', break_start: 'Start break', break_end: 'End break', on_break: 'On break',
    select_property: 'Please select a property.', loading: 'Loading data...', no_rooms: 'No rooms found.',
    saved: 'Saved.', toggle_double: 'Mark extra setup',
    setup_title: 'Initial setup', admin_subtitle: 'Admin area',
    first_name: 'First name', last_name: 'Last name', email: 'Email',
    password_confirm: 'Confirm password', create_admin_btn: 'Create admin account',
    err_fill_all: 'Please fill in all fields.', err_password_mismatch: 'Passwords do not match.',
    checking: 'Loading...', err_no_admin_access: 'No access to the admin area.',
  },
  pl: {
    app_name: 'Housekeeping', login_title: 'Zaloguj sie', username: 'Nazwa uzytkownika', password: 'Haslo',
    login_btn: 'Zaloguj', login_error: 'Bledny login lub haslo.',
    nav_rooms: 'Pokoje', nav_doubleup: 'Dodatki', nav_stats: 'Statystyki', nav_rules: 'Zasady', nav_team: 'Zespol',
    logout: 'Wyloguj', my_rooms: 'Moje pokoje', all_rooms: 'Wszystkie pokoje',
    filter_all: 'Wszystkie', filter_forced: 'Sprzatanie wymuszone', filter_dirty: 'Brudny', filter_inspect: 'Inspekcja',
    filter_clean: 'Czysty', filter_doubleup: 'Dodatki',
    st_forced: 'Wymuszone', st_dirty: 'Brudny', st_running: 'W trakcie', st_clean: 'Czysty',
    st_inspect: 'Inspekcja', st_locked: 'Zablokowany',
    multiselect: 'Wybor wielokrotny', multiselect_on: 'Zakoncz wybor', assign_selected: 'Przypisz zaznaczone',
    clear_all: 'Usun wszystkie przypisania', clear_all_confirm: 'Na pewno usunac wszystkie przypisania tego obiektu?',
    confirm: 'Potwierdz', cancel: 'Anuluj', close: 'Zamknij',
    room_detail: 'Pokoj', condition: 'Stan', guest_comment: 'Komentarz do rezerwacji',
    assign_to: 'Przypisz do', unassigned: 'Nieprzypisany', workload: 'pokoi', doubleup_needed: 'Dodatkowe wyposazenie',
    doubleup_crib: 'Lozeczko', doubleup_sofabed: 'Rozklad. sofa', doubleup_dog: 'Pies', doubleup_extra: 'Inne',
    note: 'Notatka', save: 'Zapisz', start_clean: 'Rozpocznij sprzatanie', pause_clean: 'Pauza',
    resume_clean: 'Wznow', finish_clean: 'Zakoncz sprzatanie', complete_inspection: 'Zakoncz inspekcje',
    finish_doubleup: 'Wyposazenie gotowe', running_since: 'Trwa od', elapsed: 'Uplynelo',
    stats_today: 'Dzis', stats_month: 'Miesiac', stats_year: 'Rok', cleaned_rooms: 'Posprzatane pokoje',
    avg_time: 'Sr. czas', fastest: 'Najszybsze', by_housekeeper: 'Wyniki pracownikow',
    recent_completions: 'Ostatnie zakonczenia', no_data: 'Brak danych.',
    rules_title: 'Aktywne zasady', rule_forced_t: 'Sprzatanie wymuszone', rule_forced_d:
      'Zajety pokoj oznaczony jako "Brudny" jest oznaczany do wymuszonego sprzatania co {{n}} noce od przyjazdu - chyba ze gosc wyjezdza dzis lub jutro.',
    rule_dirty_t: 'Auto-Brudny po wymeldowaniu', rule_dirty_d:
      'Po wymeldowaniu goscia Apaleo automatycznie ustawia stan pokoju na "Brudny".',
    rule_inspect_t: 'Proces inspekcji', rule_inspect_d:
      'Po zakonczeniu sprzatania pokoj przechodzi w stan "Inspekcja". Admin sprawdza i ustawia "Czysty".',
    rule_turnover_t: 'Zmiana tego samego dnia', rule_turnover_d:
      'Jesli nowy gosc przyjezdza tego samego dnia, pokazywany jest komentarz kolejnej rezerwacji zamiast wyjezdzajacego goscia.',
    team_title: 'Zespol', new_user: 'Nowy uzytkownik', role: 'Rola', role_admin: 'Admin', role_housekeeper: 'Housekeeping',
    properties: 'Obiekty', all_properties: 'Wszystkie', name: 'Imie', delete: 'Usun', delete_confirm: 'Na pewno usunac uzytkownika?',
    breaks_title: 'Przerwa', break_start: 'Rozpocznij przerwe', break_end: 'Zakoncz przerwe', on_break: 'Na przerwie',
    select_property: 'Wybierz obiekt.', loading: 'Ladowanie...', no_rooms: 'Brak pokoi.',
    saved: 'Zapisano.', toggle_double: 'Oznacz dodatkowe wyposazenie',
    setup_title: 'Pierwsza konfiguracja', admin_subtitle: 'Panel administratora',
    first_name: 'Imie', last_name: 'Nazwisko', email: 'E-mail',
    password_confirm: 'Powtorz haslo', create_admin_btn: 'Utworz konto administratora',
    err_fill_all: 'Wypelnij wszystkie pola.', err_password_mismatch: 'Hasla nie sa identyczne.',
    checking: 'Ladowanie...', err_no_admin_access: 'Brak dostepu do panelu administratora.',
  },
  ro: {
    app_name: 'Housekeeping', login_title: 'Autentificare', username: 'Utilizator', password: 'Parola',
    login_btn: 'Autentificare', login_error: 'Utilizator sau parola gresite.',
    nav_rooms: 'Camere', nav_doubleup: 'Extra', nav_stats: 'Statistici', nav_rules: 'Reguli', nav_team: 'Echipa',
    logout: 'Deconectare', my_rooms: 'Camerele mele', all_rooms: 'Toate camerele',
    filter_all: 'Toate', filter_forced: 'Curatare fortata', filter_dirty: 'Murdar', filter_inspect: 'Inspectie',
    filter_clean: 'Curat', filter_doubleup: 'Extra',
    st_forced: 'Fortata', st_dirty: 'Murdar', st_running: 'In curs', st_clean: 'Curat',
    st_inspect: 'Inspectie', st_locked: 'Blocat',
    multiselect: 'Selectie multipla', multiselect_on: 'Incheie selectia', assign_selected: 'Atribuie selectia',
    clear_all: 'Sterge toate atribuirile', clear_all_confirm: 'Sigur stergi toate atribuirile acestei proprietati?',
    confirm: 'Confirma', cancel: 'Anuleaza', close: 'Inchide',
    room_detail: 'Camera', condition: 'Stare', guest_comment: 'Comentariu rezervare',
    assign_to: 'Atribuie lui', unassigned: 'Neatribuit', workload: 'camere', doubleup_needed: 'Dotare suplimentara',
    doubleup_crib: 'Patut', doubleup_sofabed: 'Canapea extensibila', doubleup_dog: 'Caine', doubleup_extra: 'Altele',
    note: 'Nota', save: 'Salveaza', start_clean: 'Incepe curatenia', pause_clean: 'Pauza',
    resume_clean: 'Continua', finish_clean: 'Finalizeaza curatenia', complete_inspection: 'Finalizeaza inspectia',
    finish_doubleup: 'Dotare finalizata', running_since: 'Ruleaza din', elapsed: 'Timp scurs',
    stats_today: 'Azi', stats_month: 'Luna', stats_year: 'An', cleaned_rooms: 'Camere curatate',
    avg_time: 'Timp mediu', fastest: 'Cel mai rapid', by_housekeeper: 'Performanta pe angajat',
    recent_completions: 'Ultimele finalizari', no_data: 'Nu exista date.',
    rules_title: 'Reguli active', rule_forced_t: 'Curatare fortata', rule_forced_d:
      'O camera ocupata marcata "Murdar" este semnalata pentru curatare fortata la fiecare {{n}} nopti de la sosire - cu exceptia cazului in care oaspetele pleaca azi sau maine.',
    rule_dirty_t: 'Auto-Murdar dupa check-out', rule_dirty_d:
      'Imediat ce un oaspete face check-out, Apaleo seteaza automat starea camerei pe "Murdar".',
    rule_inspect_t: 'Flux de inspectie', rule_inspect_d:
      'Dupa finalizarea curateniei, camera trece la "Inspectie". Un admin verifica si seteaza "Curat".',
    rule_turnover_t: 'Rotatie in aceeasi zi', rule_turnover_d:
      'Daca un oaspete nou soseste in aceeasi zi, la curatenie se afiseaza comentariul rezervarii urmatoare, nu al celui care pleaca.',
    team_title: 'Echipa', new_user: 'Utilizator nou', role: 'Rol', role_admin: 'Admin', role_housekeeper: 'Housekeeping',
    properties: 'Proprietati', all_properties: 'Toate', name: 'Nume', delete: 'Sterge', delete_confirm: 'Sigur stergi acest utilizator?',
    breaks_title: 'Pauza', break_start: 'Incepe pauza', break_end: 'Termina pauza', on_break: 'In pauza',
    select_property: 'Selecteaza o proprietate.', loading: 'Se incarca...', no_rooms: 'Nicio camera gasita.',
    saved: 'Salvat.', toggle_double: 'Marcheaza dotare suplimentara',
    setup_title: 'Configurare initiala', admin_subtitle: 'Zona de administrare',
    first_name: 'Prenume', last_name: 'Nume', email: 'E-mail',
    password_confirm: 'Confirma parola', create_admin_btn: 'Creeaza cont de admin',
    err_fill_all: 'Completeaza toate campurile.', err_password_mismatch: 'Parolele nu coincid.',
    checking: 'Se incarca...', err_no_admin_access: 'Fara acces la zona de administrare.',
  },
};

function t(key, vars) {
  const dict = I18N[S.lang] || I18N.de;
  let str = dict[key] !== undefined ? dict[key] : (I18N.de[key] !== undefined ? I18N.de[key] : key);
  if (vars) {
    for (const k of Object.keys(vars)) str = str.split('{{' + k + '}}').join(vars[k]);
  }
  return str;
}

/* ======================= State ======================= */
const S = {
  screen: 'checking',
  lang: localStorage.getItem('hk_lang') || 'de',
  user: null,
  setupRequired: false,
  loginError: '',
  loading: false,
  properties: [],
  activeProperty: localStorage.getItem('hk_active_property') || null,
  units: [],
  reservations: { inHouse: [], departToday: [], departTomorrow: [], arriveToday: [] },
  assignments: {},
  doubleups: {},
  users: [],
  completions: [],
  breaks: [],
  myRoomsOnly: true,
  filter: 'all',
  multiSelect: false,
  selectedRooms: new Set(),
  detailRoomKey: null,
  onBreak: false,
  toast: null,
  now: Date.now(),
};

function saveLang() { localStorage.setItem('hk_lang', S.lang); }
function saveActiveProperty() {
  if (S.activeProperty) localStorage.setItem('hk_active_property', S.activeProperty);
}

/* ======================= Utility ======================= */
function todayISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function addDaysISO(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function dateOnly(dtStr) {
  if (!dtStr) return null;
  return String(dtStr).slice(0, 10);
}
function nightsSince(arrivalIso, refIso) {
  const a = new Date(arrivalIso + 'T00:00:00');
  const r = new Date(refIso + 'T00:00:00');
  return Math.round((r - a) / 86400000);
}
function formatDuration(seconds) {
  seconds = Math.max(0, Math.round(seconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}
function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function showToast(msg) {
  S.toast = msg;
  render();
  setTimeout(() => { if (S.toast === msg) { S.toast = null; render(); } }, 2200);
}

/* ======================= API-Helfer ======================= */
async function apaleo(path, method, body) {
  const res = await fetch('/api/apaleo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, method: method || 'GET', body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('Apaleo-Fehler ' + res.status));
  return data;
}
async function backendGet(name) {
  const res = await fetch('/api/' + name);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('Fehler ' + res.status));
  return data;
}
async function backendPost(name, payload) {
  const res = await fetch('/api/' + name, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('Fehler ' + res.status));
  return data;
}

/* ======================= Login / Session =======================
   Die Session laeuft ausschliesslich ueber ein HttpOnly-Cookie, das der Server bei /api/auth
   setzt/prueft - der Browser (und damit dieses Skript) sieht das Sessiontoken nie. localStorage
   wird nur noch fuer harmlose UI-Praeferenzen (Sprache, zuletzt gewaehltes Haus) verwendet. */
function allowedProperties(user) {
  if (!user) return [];
  if (user.properties === 'alle' || user.properties === 'all') return S.properties.map((p) => p.code);
  return Array.isArray(user.properties) ? user.properties : [];
}

async function tryRestoreSession() {
  S.screen = 'checking';
  try {
    const data = await backendGet('auth');
    S.setupRequired = !!data.setupRequired;
    if (data.authenticated && data.user) {
      if (APP_MODE === 'admin' && data.user.role !== 'admin') {
        // Sicherheitsnetz: der Server verweigert einem Housekeeping-Konto bereits das Anlegen
        // einer Admin-Session (scope-Check in /api/auth) - das hier greift nur bei Altsitzungen.
        try { await backendPost('auth', { action: 'logout' }); } catch (e) { /* ignore */ }
        S.user = null;
        S.loginError = t('err_no_admin_access');
        S.screen = S.setupRequired ? 'setup' : 'login';
      } else {
        S.user = data.user;
        await afterLogin();
        return;
      }
    } else {
      S.user = null;
      S.screen = (APP_MODE === 'admin' && S.setupRequired) ? 'setup' : 'login';
    }
  } catch (e) {
    S.user = null;
    S.screen = 'login';
  }
  render();
}

async function doLogin(identifier, password) {
  S.loginError = '';
  S.loading = true; render();
  try {
    const payload = { action: 'login', identifier, password };
    if (APP_MODE === 'admin') payload.scope = 'admin';
    const { user } = await backendPost('auth', payload);
    S.user = user;
    await afterLogin();
  } catch (e) {
    S.loginError = e.message || t('login_error');
  }
  S.loading = false;
  render();
}

async function doRegisterAdmin(fields) {
  S.loginError = '';
  S.loading = true; render();
  try {
    const { user } = await backendPost('auth', { action: 'register-admin', ...fields });
    S.user = user;
    S.setupRequired = false;
    await afterLogin();
  } catch (e) {
    S.loginError = e.message || t('login_error');
    // Serverseitig ist die Registrierung nun gesperrt - beim naechsten Aufruf Login anzeigen.
    if (/bereits ein Administrator/i.test(S.loginError)) S.screen = 'login';
  }
  S.loading = false;
  render();
}

async function doLogout() {
  try { await backendPost('auth', { action: 'logout' }); } catch (e) { /* ignore */ }
  S.user = null;
  S.screen = (APP_MODE === 'admin' && S.setupRequired) ? 'setup' : 'login';
  S.units = [];
  S.detailRoomKey = null;
  render();
}

async function afterLogin() {
  S.screen = 'rooms';
  S.loading = true; render();
  try {
    await loadProperties();
    const allowed = allowedProperties(S.user);
    if (!allowed.includes(S.activeProperty)) S.activeProperty = allowed[0] || null;
    saveActiveProperty();
    await refreshAll();
  } catch (e) {
    showToast(e.message);
  }
  S.loading = false;
  render();
  startPolling();
}

/* ======================= Datenladen ======================= */
async function loadProperties() {
  const data = await apaleo('/inventory/v1/properties?pageSize=200');
  const list = (data.properties || data.results || []).filter((p) => PROPERTY_NAMES[p.id || p.code]);
  S.properties = list.map((p) => ({ code: p.id || p.code, name: PROPERTY_NAMES[p.id || p.code] || p.name }));
}

async function loadUnits(propertyCode) {
  const data = await apaleo('/inventory/v1/units?propertyIds=' + encodeURIComponent(propertyCode) + '&pageSize=500');
  return data.units || data.results || [];
}

async function loadReservations(propertyCode) {
  const today = todayISO();
  const tomorrow = addDaysISO(today, 1);
  const [inHouse, departToday, departTomorrow, arriveToday] = await Promise.all([
    apaleo('/booking/v1/reservations?propertyId=' + encodeURIComponent(propertyCode) + '&status=InHouse&pageSize=500'),
    apaleo('/booking/v1/reservations?propertyId=' + encodeURIComponent(propertyCode) + '&dateFilter=Departure&from=' + today + '&to=' + today + '&status=InHouse,CheckedOut&pageSize=500'),
    apaleo('/booking/v1/reservations?propertyId=' + encodeURIComponent(propertyCode) + '&dateFilter=Departure&from=' + tomorrow + '&to=' + tomorrow + '&status=InHouse,Confirmed&pageSize=500'),
    apaleo('/booking/v1/reservations?propertyId=' + encodeURIComponent(propertyCode) + '&dateFilter=Arrival&from=' + today + '&to=' + today + '&status=InHouse,Confirmed&pageSize=500'),
  ]);
  return {
    inHouse: inHouse.reservations || inHouse.results || [],
    departToday: departToday.reservations || departToday.results || [],
    departTomorrow: departTomorrow.reservations || departTomorrow.results || [],
    arriveToday: arriveToday.reservations || arriveToday.results || [],
  };
}

async function loadBackendState() {
  const [assignRes, doubleRes, usersRes, compRes, breakRes] = await Promise.all([
    backendGet('assignments'), backendGet('doubleups'), backendGet('users'), backendGet('completions'), backendGet('breaks'),
  ]);
  S.assignments = assignRes.assignments || {};
  S.doubleups = doubleRes.doubleups || {};
  S.users = usersRes.users || [];
  S.completions = compRes.completions || [];
  S.breaks = breakRes.breaks || [];
  if (S.user) {
    const openBreak = S.breaks.find((b) => b.housekeeperId === S.user.id && b.end === null);
    S.onBreak = !!openBreak;
  }
}

async function refreshAll() {
  if (!S.activeProperty) return;
  const [units, reservations] = await Promise.all([
    loadUnits(S.activeProperty),
    loadReservations(S.activeProperty),
    loadBackendState(),
  ]);
  S.units = units;
  S.reservations = reservations;
}

let pollTimer = null;
function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    if (!S.user || !S.activeProperty || document.hidden) return;
    try { await refreshAll(); render(); } catch (e) { /* still show cached state */ }
  }, POLL_INTERVAL);
  setInterval(() => { S.now = Date.now(); if (S.screen === 'rooms' || S.detailRoomKey) render(); }, 1000);
}

/* ======================= Room-Berechnung ======================= */
function roomKey(propertyCode, roomNumber) { return propertyCode + '_' + roomNumber; }

function buildRooms() {
  const today = todayISO();
  const tomorrow = addDaysISO(today, 1);
  const byUnit = {};
  for (const r of S.reservations.inHouse) {
    const uid = r.unit && (r.unit.id || r.unit.code);
    if (uid) byUnit[uid] = r;
  }
  const departsToday = new Set(S.reservations.departToday.map((r) => r.unit && (r.unit.id || r.unit.code)).filter(Boolean));
  const departsTomorrow = new Set(S.reservations.departTomorrow.map((r) => r.unit && (r.unit.id || r.unit.code)).filter(Boolean));
  const arrivesTodayMap = {};
  for (const r of S.reservations.arriveToday) {
    const uid = r.unit && (r.unit.id || r.unit.code);
    if (uid) arrivesTodayMap[uid] = r;
  }

  return S.units.map((u) => {
    const number = u.name || u.id || u.unitGroup && u.unitGroup.name || '?';
    const key = roomKey(S.activeProperty, number);
    const condition = (u.condition && (u.condition.cleaningStatus || u.condition)) || u.condition || 'Clean';
    const currentRes = byUnit[u.id];
    const occupied = !!currentRes;
    const departsTodayFlag = departsToday.has(u.id);
    const departsTomorrowFlag = departsTomorrow.has(u.id);
    const arrivesTodayRes = arrivesTodayMap[u.id];

    let nights = null;
    if (currentRes && currentRes.arrival) nights = nightsSince(dateOnly(currentRes.arrival), today);

    const forced = condition === 'Dirty' && occupied && nights !== null && nights >= FORCED_CLEAN_INTERVAL_NIGHTS &&
      nights % FORCED_CLEAN_INTERVAL_NIGHTS === 0 && !departsTodayFlag && !departsTomorrowFlag;

    const assignment = S.assignments[key] || null;
    const doubleup = S.doubleups[key] || null;
    const running = !!(assignment && assignment.cleaningStartedAt);
    const elapsed = assignment ? (assignment.elapsedSeconds || 0) + (running ? Math.round((S.now - assignment.cleaningStartedAt) / 1000) : 0) : 0;

    let comment = '';
    if (departsTodayFlag && arrivesTodayRes) comment = arrivesTodayRes.comment || (arrivesTodayRes.booker && arrivesTodayRes.booker.comment) || '';
    else if (currentRes) comment = currentRes.comment || '';

    return {
      key, unitId: u.id, number, condition,
      occupied, currentRes, departsTodayFlag, departsTomorrowFlag, arrivesTodayRes,
      nights, forced, assignment, doubleup, running, elapsed, comment,
      guestName: currentRes ? [currentRes.primaryGuest && currentRes.primaryGuest.firstName, currentRes.primaryGuest && currentRes.primaryGuest.lastName].filter(Boolean).join(' ') : '',
    };
  }).sort((a, b) => String(a.number).localeCompare(String(b.number), undefined, { numeric: true }));
}

function roomStatusClass(room) {
  if (room.condition === 'OutOfService' || room.condition === 'OutOfOrder') return 'st-locked';
  if (room.forced) return 'st-forced';
  if (room.running) return 'st-running';
  if (room.condition === 'CleanToBeInspected') return 'st-inspect';
  if (room.condition === 'Dirty') return 'st-dirty';
  return 'st-clean';
}
function roomStatusLabel(room) {
  if (room.condition === 'OutOfService' || room.condition === 'OutOfOrder') return t('st_locked');
  if (room.forced) return t('st_forced');
  if (room.running) return t('st_running');
  if (room.condition === 'CleanToBeInspected') return t('st_inspect');
  if (room.condition === 'Dirty') return t('st_dirty');
  return t('st_clean');
}

/* ======================= Aktionen ======================= */
async function setUnitCondition(unitId, condition) {
  await apaleo('/operations/v1/units-condition', 'PUT', { unitIds: [unitId], condition });
}

async function actionAssign(key, hk) {
  await backendPost('assignments', { action: 'set', key, housekeeperId: hk.id, housekeeperName: hk.name });
  await loadBackendState(); render();
}
async function actionUnassign(key) {
  await backendPost('assignments', { action: 'clear', key });
  await loadBackendState(); render();
}
async function actionBulkAssign(keys, hk) {
  await backendPost('assignments', { action: 'bulkSet', keys, housekeeperId: hk.id, housekeeperName: hk.name });
  S.multiSelect = false; S.selectedRooms = new Set();
  await loadBackendState(); render();
  showToast(t('saved'));
}
async function actionClearAllAssignments() {
  await backendPost('assignments', { action: 'clearProperty', property: S.activeProperty });
  await loadBackendState(); render();
}
async function actionStartTimer(room) {
  let hkId = room.assignment ? room.assignment.housekeeperId : S.user.id;
  let hkName = room.assignment ? room.assignment.housekeeperName : S.user.name;
  await backendPost('assignments', { action: 'startTimer', key: room.key, housekeeperId: hkId, housekeeperName: hkName });
  await loadBackendState(); render();
}
async function actionPauseTimer(room) {
  await backendPost('assignments', { action: 'stopTimer', key: room.key });
  await loadBackendState(); render();
}
async function actionFinishClean(room) {
  S.loading = true; render();
  try {
    const elapsedNow = room.elapsed;
    await setUnitCondition(room.unitId, 'CleanToBeInspected');
    await backendPost('completions', {
      action: 'add',
      entry: {
        property: S.activeProperty, room: room.number,
        housekeeperId: room.assignment ? room.assignment.housekeeperId : S.user.id,
        housekeeperName: room.assignment ? room.assignment.housekeeperName : S.user.name,
        type: 'clean', durationSeconds: elapsedNow, finishedAt: Date.now(),
      },
    });
    await backendPost('assignments', { action: 'clear', key: room.key });
    await refreshAll();
    S.detailRoomKey = null;
    showToast(t('saved'));
  } catch (e) { showToast(e.message); }
  S.loading = false; render();
}
async function actionCompleteInspection(room) {
  S.loading = true; render();
  try {
    await setUnitCondition(room.unitId, 'Clean');
    await refreshAll();
    S.detailRoomKey = null;
  } catch (e) { showToast(e.message); }
  S.loading = false; render();
}
async function actionToggleDoubleType(room, typeId) {
  const current = room.doubleup && room.doubleup.types ? room.doubleup.types.slice() : [];
  const idx = current.indexOf(typeId);
  if (idx >= 0) current.splice(idx, 1); else current.push(typeId);
  if (current.length === 0) {
    await backendPost('doubleups', { action: 'clear', key: room.key });
  } else {
    await backendPost('doubleups', { action: 'set', key: room.key, types: current, note: room.doubleup ? room.doubleup.note : '' });
  }
  await loadBackendState(); render();
}
async function actionFinishDoubleup(room) {
  await backendPost('doubleups', { action: 'clear', key: room.key });
  await backendPost('completions', {
    action: 'add',
    entry: { property: S.activeProperty, room: room.number, housekeeperId: S.user.id, housekeeperName: S.user.name, type: 'doubleup', durationSeconds: 0, finishedAt: Date.now() },
  });
  await loadBackendState(); render();
  showToast(t('saved'));
}
async function actionToggleBreak() {
  if (S.onBreak) await backendPost('breaks', { action: 'end', housekeeperId: S.user.id });
  else await backendPost('breaks', { action: 'start', housekeeperId: S.user.id, housekeeperName: S.user.name });
  await loadBackendState(); render();
}
async function actionSaveUser(userForm) {
  await backendPost('users', { action: 'set', user: userForm });
  await loadBackendState(); render();
  showToast(t('saved'));
}
async function actionDeleteUser(username) {
  await backendPost('users', { action: 'delete', username });
  await loadBackendState(); render();
}

/* ======================= Rendering ======================= */
function render() {
  const app = document.getElementById('app');
  if (S.screen === 'checking') { app.innerHTML = renderChecking(); return; }
  if (!S.user) {
    if (APP_MODE === 'admin') {
      app.innerHTML = S.screen === 'setup' ? renderSetup() : renderAdminLogin();
    } else {
      app.innerHTML = renderLogin();
    }
    return;
  }
  app.innerHTML = renderHeader() + renderPropertyBar() + '<div class="content">' + renderScreen() + '</div>' + renderNav() +
    (S.detailRoomKey ? renderRoomModal() : '') + (S.toast ? '<div class="toast">' + escapeHtml(S.toast) + '</div>' : '');
}

function renderChecking() {
  return `<div class="login-wrap"><div class="loading">${t('checking')}</div></div>`;
}

function renderLogin() {
  return `
  <div class="login-wrap">
    <div class="logo">🧹</div>
    <h1>${t('app_name')}</h1>
    <div class="ver">v${APP_VERSION}</div>
    <div class="field">
      <label>${t('username')}</label>
      <input type="text" id="login-username" autocapitalize="off" autocomplete="username">
    </div>
    <div class="field">
      <label>${t('password')}</label>
      <input type="password" id="login-password" autocomplete="current-password">
    </div>
    <button class="btn block" data-action="login" style="max-width:300px;">${S.loading ? '...' : t('login_btn')}</button>
    <div class="error-msg">${escapeHtml(S.loginError)}</div>
    <div class="langrow">
      ${['de', 'en', 'pl', 'ro'].map((l) => `<button class="${S.lang === l ? 'active' : ''}" data-action="lang" data-lang="${l}">${l.toUpperCase()}</button>`).join('')}
    </div>
  </div>`;
}

function renderAdminLogin() {
  return `
  <div class="login-wrap">
    <div class="wordmark" style="margin-bottom:4px;">HOUSEKEEPING</div>
    <div style="color:var(--text-dim);font-size:12px;margin-bottom:30px;">${t('admin_subtitle')}</div>
    <div class="field">
      <label>${t('email')}</label>
      <input type="email" id="login-username" autocapitalize="off" autocomplete="username">
    </div>
    <div class="field">
      <label>${t('password')}</label>
      <input type="password" id="login-password" autocomplete="current-password">
    </div>
    <button class="btn block" data-action="admin-login" style="max-width:300px;">${S.loading ? '...' : t('login_btn')}</button>
    <div class="error-msg">${escapeHtml(S.loginError)}</div>
  </div>`;
}

function renderSetup() {
  return `
  <div class="login-wrap">
    <div class="wordmark" style="margin-bottom:4px;">HOUSEKEEPING</div>
    <div style="color:var(--text-dim);font-size:12px;margin-bottom:30px;">${t('setup_title')}</div>
    <div class="field">
      <label>${t('first_name')}</label>
      <input type="text" id="setup-firstname" autocomplete="given-name">
    </div>
    <div class="field">
      <label>${t('last_name')}</label>
      <input type="text" id="setup-lastname" autocomplete="family-name">
    </div>
    <div class="field">
      <label>${t('email')}</label>
      <input type="email" id="setup-email" autocomplete="email">
    </div>
    <div class="field">
      <label>${t('password')}</label>
      <input type="password" id="setup-password" autocomplete="new-password">
    </div>
    <div class="field">
      <label>${t('password_confirm')}</label>
      <input type="password" id="setup-password2" autocomplete="new-password">
    </div>
    <button class="btn block" data-action="admin-register" style="max-width:300px;">${S.loading ? '...' : t('create_admin_btn')}</button>
    <div class="error-msg">${escapeHtml(S.loginError)}</div>
  </div>`;
}

function renderHeader() {
  const role = S.user.role === 'admin' ? t('role_admin') : t('role_housekeeper');
  return `
  <div class="hdr">
    <div>
      <h1>${t('app_name')}</h1>
      <div class="sub">${escapeHtml(S.user.name)} · ${role} · v${APP_VERSION}</div>
    </div>
    <div class="hdr-actions">
      ${S.user.role !== 'admin' ? `<button class="break-pill ${S.onBreak ? 'on' : ''}" data-action="toggle-break">☕ ${S.onBreak ? t('break_end') : t('break_start')}</button>` : ''}
      <button class="iconbtn" data-action="logout" title="${t('logout')}">⎋</button>
    </div>
  </div>`;
}

function renderPropertyBar() {
  const allowed = allowedProperties(S.user);
  const props = S.properties.filter((p) => allowed.includes(p.code));
  if (props.length === 0) return `<div class="propbar"><span style="color:var(--text-dim);font-size:13px;">${t('select_property')}</span></div>`;
  return '<div class="propbar">' + props.map((p) =>
    `<button class="propchip ${S.activeProperty === p.code ? 'active' : ''}" data-action="select-property" data-code="${escapeHtml(p.code)}">${escapeHtml(p.name)}</button>`
  ).join('') + '</div>';
}

function renderNav() {
  const items = S.user.role === 'admin'
    ? [['rooms', '🛏️', t('nav_rooms')], ['doubleup', '➕', t('nav_doubleup')], ['stats', '📊', t('nav_stats')], ['rules', '📋', t('nav_rules')], ['team', '👥', t('nav_team')]]
    : [['rooms', '🛏️', t('nav_rooms')], ['doubleup', '➕', t('nav_doubleup')]];
  return '<div class="nav">' + items.map(([id, icon, label]) =>
    `<button class="${S.screen === id ? 'active' : ''}" data-action="nav" data-screen="${id}"><span class="ic">${icon}</span>${escapeHtml(label)}</button>`
  ).join('') + '</div>';
}

function renderScreen() {
  if (S.loading && S.units.length === 0) return `<div class="loading">${t('loading')}</div>`;
  if (!S.activeProperty) return `<div class="empty">${t('select_property')}</div>`;
  switch (S.screen) {
    case 'rooms': return renderRoomsScreen();
    case 'doubleup': return renderDoubleupScreen();
    case 'stats': return renderStatsScreen();
    case 'rules': return renderRulesScreen();
    case 'team': return renderTeamScreen();
    default: return renderRoomsScreen();
  }
}

function visibleRooms() {
  let rooms = buildRooms();
  if (S.user.role !== 'admin' && S.myRoomsOnly) {
    rooms = rooms.filter((r) => r.assignment && r.assignment.housekeeperId === S.user.id);
  }
  switch (S.filter) {
    case 'forced': rooms = rooms.filter((r) => r.forced); break;
    case 'dirty': rooms = rooms.filter((r) => r.condition === 'Dirty'); break;
    case 'inspect': rooms = rooms.filter((r) => r.condition === 'CleanToBeInspected'); break;
    case 'clean': rooms = rooms.filter((r) => r.condition === 'Clean'); break;
    case 'doubleup': rooms = rooms.filter((r) => r.doubleup && r.doubleup.types && r.doubleup.types.length); break;
  }
  return rooms;
}

function renderRoomsScreen() {
  const rooms = visibleRooms();
  const filters = [['all', 'filter_all', null], ['forced', 'filter_forced', 'var(--danger)'], ['dirty', 'filter_dirty', '#d9782f'],
    ['inspect', 'filter_inspect', 'var(--info)'], ['clean', 'filter_clean', 'var(--success)'], ['doubleup', 'filter_doubleup', 'var(--primary)']];
  let html = '<div class="filterbar">' + filters.map(([id, label, color]) =>
    `<button class="fchip ${S.filter === id ? 'active' : ''}" data-action="set-filter" data-filter="${id}">${color ? `<span class="dot" style="background:${color}"></span>` : ''}${t(label)}</button>`
  ).join('') + '</div>';

  html += '<div class="toolrow">';
  if (S.user.role !== 'admin') {
    html += `<button class="btn secondary" data-action="toggle-myrooms">${S.myRoomsOnly ? t('all_rooms') : t('my_rooms')}</button>`;
  }
  if (S.user.role === 'admin') {
    html += `<button class="btn ${S.multiSelect ? 'danger' : 'secondary'}" data-action="toggle-multiselect">${S.multiSelect ? t('multiselect_on') : t('multiselect')}</button>`;
    if (S.multiSelect && S.selectedRooms.size > 0) {
      html += `<button class="btn" data-action="open-bulk-assign">${t('assign_selected')} (${S.selectedRooms.size})</button>`;
    }
    html += `<button class="btn ghost" data-action="clear-all-assignments">${t('clear_all')}</button>`;
  }
  html += '</div>';

  if (rooms.length === 0) {
    html += `<div class="empty">${t('no_rooms')}</div>`;
  } else {
    html += '<div class="grid">' + rooms.map((r) => {
      const cls = roomStatusClass(r);
      const selected = S.selectedRooms.has(r.key);
      const dbl = r.doubleup && r.doubleup.types && r.doubleup.types.length;
      return `<div class="tile ${cls} ${selected ? 'selected' : ''}" data-action="open-room" data-key="${escapeHtml(r.key)}">
        ${dbl ? `<span class="badge">${DOUBLEUP_TYPES.filter(dt => r.doubleup.types.includes(dt.id)).map(dt => dt.icon).join('')}</span>` : ''}
        <div class="num">${escapeHtml(String(r.number))}</div>
        <div class="stat">${roomStatusLabel(r)}</div>
        ${r.running ? `<div class="pulse"></div><div class="stat">${formatDuration(r.elapsed)}</div>` : ''}
      </div>`;
    }).join('') + '</div>';
  }
  return html;
}

function renderDoubleupScreen() {
  const rooms = buildRooms().filter((r) => r.doubleup && r.doubleup.types && r.doubleup.types.length);
  if (rooms.length === 0) return `<div class="empty">${t('no_data')}</div>`;
  return '<div class="section"><h2>' + t('doubleup_needed') + '</h2>' + rooms.map((r) => `
    <div class="card">
      <div class="row"><b>${t('room_detail')} ${escapeHtml(String(r.number))}</b>
        <button class="btn secondary" data-action="open-room" data-key="${escapeHtml(r.key)}">${t('room_detail')}</button>
      </div>
      <div class="chiprow">${DOUBLEUP_TYPES.filter((dt) => r.doubleup.types.includes(dt.id)).map((dt) => `<span class="togglechip on">${dt.icon} ${t(dt.label)}</span>`).join('')}</div>
      ${r.doubleup.note ? `<div class="comment-box">${escapeHtml(r.doubleup.note)}</div>` : ''}
    </div>`).join('') + '</div>';
}

function statsFor(range) {
  const now = new Date();
  const list = S.completions.filter((c) => c.property === S.activeProperty && c.type === 'clean');
  const filtered = list.filter((c) => {
    const d = new Date(c.finishedAt);
    if (range === 'today') return d.toDateString() === now.toDateString();
    if (range === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    return d.getFullYear() === now.getFullYear();
  });
  const durations = filtered.map((c) => c.durationSeconds).filter((s) => s > 0);
  const avg = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  const fastest = durations.length ? Math.min(...durations) : 0;
  return { count: filtered.length, avg, fastest, list: filtered };
}

function renderStatsScreen() {
  const today = statsFor('today'), month = statsFor('month'), year = statsFor('year');
  const byHk = {};
  for (const c of year.list) {
    const name = c.housekeeperName || c.housekeeperId || '?';
    byHk[name] = (byHk[name] || 0) + 1;
  }
  const maxHk = Math.max(1, ...Object.values(byHk));
  const recent = S.completions.filter((c) => c.property === S.activeProperty).slice(-15).reverse();

  let html = '<div class="section"><h2>' + t('stats_today') + '</h2><div class="statgrid">' +
    `<div class="stattile"><div class="v">${today.count}</div><div class="l">${t('cleaned_rooms')}</div></div>` +
    `<div class="stattile"><div class="v">${today.avg ? formatDuration(today.avg) : '-'}</div><div class="l">${t('avg_time')}</div></div>` +
    `<div class="stattile"><div class="v">${today.fastest ? formatDuration(today.fastest) : '-'}</div><div class="l">${t('fastest')}</div></div>` +
    '</div>';

  html += '<h2>' + t('stats_month') + ' / ' + t('stats_year') + '</h2><div class="statgrid">' +
    `<div class="stattile"><div class="v">${month.count}</div><div class="l">${t('stats_month')}</div></div>` +
    `<div class="stattile"><div class="v">${year.count}</div><div class="l">${t('stats_year')}</div></div>` +
    `<div class="stattile"><div class="v">${year.avg ? formatDuration(year.avg) : '-'}</div><div class="l">${t('avg_time')}</div></div>` +
    '</div>';

  html += '<h2>' + t('by_housekeeper') + '</h2><div class="card">' +
    (Object.keys(byHk).length === 0 ? `<span style="color:var(--text-dim);font-size:13px;">${t('no_data')}</span>` :
      Object.entries(byHk).sort((a, b) => b[1] - a[1]).map(([name, count]) => `
        <div class="bar-row"><div class="bar-name">${escapeHtml(name)}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${(count / maxHk) * 100}%"></div></div>
          <div class="bar-val">${count}</div></div>`).join('')) +
    '</div>';

  html += '<h2>' + t('recent_completions') + '</h2><div class="card">' +
    (recent.length === 0 ? `<span style="color:var(--text-dim);font-size:13px;">${t('no_data')}</span>` :
      recent.map((c) => `<div class="list-item"><span>${t('room_detail')} ${escapeHtml(String(c.room))} · ${escapeHtml(c.housekeeperName || '')}</span><span>${c.durationSeconds ? formatDuration(c.durationSeconds) : ''}</span></div>`).join('')) +
    '</div></div>';
  return html;
}

function renderRulesScreen() {
  const rules = [
    ['rule_forced_t', 'rule_forced_d', { n: FORCED_CLEAN_INTERVAL_NIGHTS }],
    ['rule_dirty_t', 'rule_dirty_d', null],
    ['rule_inspect_t', 'rule_inspect_d', null],
    ['rule_turnover_t', 'rule_turnover_d', null],
  ];
  return '<div class="section"><h2>' + t('rules_title') + '</h2>' + rules.map(([tt, dd, vars]) => `
    <div class="rule-item"><div class="t">${t(tt)}</div><div class="d">${t(dd, vars)}</div></div>`).join('') + '</div>';
}

function renderTeamScreen() {
  const users = S.users;
  let html = '<div class="section"><h2>' + t('team_title') + '</h2>';
  html += `<button class="btn block" data-action="new-user" style="margin-bottom:12px;">+ ${t('new_user')}</button>`;
  html += users.map((u) => `
    <div class="card">
      <div class="row"><b>${escapeHtml(u.name)}</b><span class="badge-role ${u.role === 'admin' ? 'admin' : ''}">${u.role === 'admin' ? t('role_admin') : t('role_housekeeper')}</span></div>
      <div class="row" style="margin-top:6px;color:var(--text-dim);font-size:12.5px;">
        <span>@${escapeHtml(u.username)}</span>
        <span>${u.properties === 'alle' || u.properties === 'all' ? t('all_properties') : (Array.isArray(u.properties) ? u.properties.join(', ') : '')}</span>
      </div>
      <div class="row" style="margin-top:10px;">
        <button class="btn secondary" data-action="edit-user" data-username="${escapeHtml(u.username)}">${t('save')}</button>
        <button class="btn danger" data-action="delete-user" data-username="${escapeHtml(u.username)}">${t('delete')}</button>
      </div>
    </div>`).join('');
  html += '</div>';
  return html;
}

/* ======================= Room-Detail-Modal ======================= */
function renderRoomModal() {
  const room = buildRooms().find((r) => r.key === S.detailRoomKey);
  if (!room) return '';
  const isAdmin = S.user.role === 'admin';
  const propHks = S.users.filter((u) => u.role !== 'admin' &&
    (u.properties === 'alle' || u.properties === 'all' || (Array.isArray(u.properties) && u.properties.includes(S.activeProperty))));
  const workload = {};
  for (const k of Object.keys(S.assignments)) {
    const a = S.assignments[k];
    if (a && k.startsWith(S.activeProperty + '_')) workload[a.housekeeperId] = (workload[a.housekeeperId] || 0) + 1;
  }
  const selectedTypes = room.doubleup && room.doubleup.types ? room.doubleup.types : [];

  let html = `<div class="modal-overlay" data-action="close-modal"><div class="modal">
    <h3>${t('room_detail')} ${escapeHtml(String(room.number))}</h3>
    <div style="color:var(--text-dim);font-size:12.5px;margin-bottom:6px;">${t('condition')}: ${roomStatusLabel(room)}${room.guestName ? ' · ' + escapeHtml(room.guestName) : ''}</div>`;

  if (room.comment) {
    html += `<div class="comment-box"><b>${t('guest_comment')}:</b><br>${escapeHtml(room.comment)}</div>`;
  }

  if (room.running || (room.assignment && room.assignment.elapsedSeconds)) {
    html += `<div class="timer-display">${formatDuration(room.elapsed)}</div>`;
  }

  if (isAdmin) {
    html += `<h4 style="margin:14px 0 6px;font-size:13px;color:var(--text-dim);">${t('assign_to')}</h4>`;
    html += `<div class="hk-item ${!room.assignment ? 'assigned' : ''}"><span>${t('unassigned')}</span>${!room.assignment ? '✓' : `<button class="btn secondary" data-action="unassign" data-key="${escapeHtml(room.key)}">${t('unassigned')}</button>`}</div>`;
    html += propHks.map((hk) => {
      const isAssigned = room.assignment && room.assignment.housekeeperId === hk.id;
      return `<div class="hk-item ${isAssigned ? 'assigned' : ''}" data-action="assign-hk" data-key="${escapeHtml(room.key)}" data-hkid="${escapeHtml(hk.id)}" data-hkname="${escapeHtml(hk.name)}">
        <span>${escapeHtml(hk.name)} (${workload[hk.id] || 0} ${t('workload')})</span>${isAssigned ? '✓' : ''}</div>`;
    }).join('');

    html += `<h4 style="margin:14px 0 6px;font-size:13px;color:var(--text-dim);">${t('doubleup_needed')}</h4>`;
    html += '<div class="chiprow">' + DOUBLEUP_TYPES.map((dt) =>
      `<button class="togglechip ${selectedTypes.includes(dt.id) ? 'on' : ''}" data-action="toggle-double" data-key="${escapeHtml(room.key)}" data-type="${dt.id}">${dt.icon} ${t(dt.label)}</button>`
    ).join('') + '</div>';

    if (room.condition === 'CleanToBeInspected') {
      html += `<button class="btn block" style="margin-top:14px;" data-action="complete-inspection" data-key="${escapeHtml(room.key)}">${t('complete_inspection')}</button>`;
    }
  } else {
    const mine = room.assignment && room.assignment.housekeeperId === S.user.id;
    if (selectedTypes.length > 0) {
      html += `<div class="chiprow">${DOUBLEUP_TYPES.filter((dt) => selectedTypes.includes(dt.id)).map((dt) => `<span class="togglechip on">${dt.icon} ${t(dt.label)}</span>`).join('')}</div>`;
      html += `<button class="btn secondary block" style="margin-top:8px;" data-action="finish-doubleup" data-key="${escapeHtml(room.key)}">${t('finish_doubleup')}</button>`;
    }
    if (room.condition === 'Dirty' || room.forced) {
      html += '<div style="margin-top:14px;display:flex;gap:8px;">';
      if (!room.running) {
        html += `<button class="btn block" data-action="start-clean" data-key="${escapeHtml(room.key)}">${t('start_clean')}</button>`;
      } else {
        html += `<button class="btn secondary block" data-action="pause-clean" data-key="${escapeHtml(room.key)}">${t('pause_clean')}</button>`;
      }
      html += '</div>';
      if (mine || !room.assignment) {
        html += `<button class="btn block" style="margin-top:8px;background:var(--success);" data-action="finish-clean" data-key="${escapeHtml(room.key)}">${t('finish_clean')}</button>`;
      }
    }
  }

  html += `<button class="btn ghost block" style="margin-top:14px;" data-action="close-modal">${t('close')}</button>`;
  html += '</div></div>';
  return html;
}

/* ======================= Bulk-Assign / User-Form Overlays (einfache prompt-basierte Eingabe) ======================= */
function openBulkAssignPicker() {
  const propHks = S.users.filter((u) => u.role !== 'admin' &&
    (u.properties === 'alle' || u.properties === 'all' || (Array.isArray(u.properties) && u.properties.includes(S.activeProperty))));
  if (propHks.length === 0) { showToast(t('unassigned')); return; }
  const names = propHks.map((h, i) => (i + 1) + ') ' + h.name).join('\n');
  const pick = prompt(t('assign_to') + ':\n' + names);
  const idx = parseInt(pick, 10) - 1;
  if (propHks[idx]) actionBulkAssign(Array.from(S.selectedRooms), propHks[idx]);
}

function openUserForm(existing) {
  const username = prompt(t('username'), existing ? existing.username : '');
  if (!username) return;
  const name = prompt(t('name'), existing ? existing.name : '') || username;
  const email = prompt(t('email'), existing ? existing.email || '' : '') || (existing ? existing.email : '');
  const role = (prompt(t('role') + ' (admin/housekeeping)', existing ? existing.role : 'housekeeping') || 'housekeeping').trim();
  const propsRaw = prompt(t('properties') + ' ("alle" oder Codes mit Komma, z.B. BER01,MUC02)', existing ? (existing.properties === 'alle' ? 'alle' : (existing.properties || []).join(',')) : 'alle');
  const properties = propsRaw && propsRaw.trim().toLowerCase() !== 'alle' ? propsRaw.split(',').map((s) => s.trim()).filter(Boolean) : 'alle';
  const password = prompt(t('password') + (existing ? ' (leer lassen = unveraendert)' : ''), '');
  actionSaveUser({ username, name, email, role: role === 'admin' ? 'admin' : 'housekeeping', properties, password: password || undefined });
}

/* ======================= Event-Delegation ======================= */
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;

  try {
    switch (action) {
      case 'login': {
        const u = document.getElementById('login-username').value.trim();
        const p = document.getElementById('login-password').value;
        if (u && p) await doLogin(u, p);
        break;
      }
      case 'admin-login': {
        const u = document.getElementById('login-username').value.trim();
        const p = document.getElementById('login-password').value;
        if (u && p) await doLogin(u, p);
        break;
      }
      case 'admin-register': {
        const firstName = document.getElementById('setup-firstname').value.trim();
        const lastName = document.getElementById('setup-lastname').value.trim();
        const email = document.getElementById('setup-email').value.trim();
        const password = document.getElementById('setup-password').value;
        const passwordConfirm = document.getElementById('setup-password2').value;
        if (!firstName || !lastName || !email || !password) { S.loginError = t('err_fill_all'); render(); break; }
        if (password !== passwordConfirm) { S.loginError = t('err_password_mismatch'); render(); break; }
        await doRegisterAdmin({ firstName, lastName, email, password, passwordConfirm });
        break;
      }
      case 'lang': S.lang = el.dataset.lang; saveLang(); render(); break;
      case 'logout': await doLogout(); break;
      case 'select-property':
        S.activeProperty = el.dataset.code; saveActiveProperty(); S.loading = true; render();
        await refreshAll(); S.loading = false; render();
        break;
      case 'nav': S.screen = el.dataset.screen; S.multiSelect = false; S.selectedRooms = new Set(); render(); break;
      case 'set-filter': S.filter = el.dataset.filter; render(); break;
      case 'toggle-myrooms': S.myRoomsOnly = !S.myRoomsOnly; render(); break;
      case 'toggle-multiselect':
        S.multiSelect = !S.multiSelect; S.selectedRooms = new Set(); render();
        break;
      case 'open-bulk-assign': openBulkAssignPicker(); break;
      case 'clear-all-assignments':
        if (confirm(t('clear_all_confirm'))) await actionClearAllAssignments();
        break;
      case 'open-room':
        if (S.multiSelect) {
          const key = el.dataset.key;
          if (S.selectedRooms.has(key)) S.selectedRooms.delete(key); else S.selectedRooms.add(key);
          render();
        } else {
          S.detailRoomKey = el.dataset.key; render();
        }
        break;
      case 'close-modal':
        if (el.classList.contains('modal-overlay') && e.target !== el) break;
        S.detailRoomKey = null; render();
        break;
      case 'assign-hk': await actionAssign(el.dataset.key, { id: el.dataset.hkid, name: el.dataset.hkname }); break;
      case 'unassign': await actionUnassign(el.dataset.key); break;
      case 'toggle-double': await actionToggleDoubleType(buildRooms().find(r => r.key === el.dataset.key), el.dataset.type); break;
      case 'start-clean': await actionStartTimer(buildRooms().find(r => r.key === el.dataset.key)); break;
      case 'pause-clean': await actionPauseTimer(buildRooms().find(r => r.key === el.dataset.key)); break;
      case 'finish-clean': await actionFinishClean(buildRooms().find(r => r.key === el.dataset.key)); break;
      case 'finish-doubleup': await actionFinishDoubleup(buildRooms().find(r => r.key === el.dataset.key)); break;
      case 'complete-inspection': await actionCompleteInspection(buildRooms().find(r => r.key === el.dataset.key)); break;
      case 'toggle-break': await actionToggleBreak(); break;
      case 'new-user': openUserForm(null); break;
      case 'edit-user': openUserForm(S.users.find((u) => u.username === el.dataset.username)); break;
      case 'delete-user':
        if (confirm(t('delete_confirm'))) await actionDeleteUser(el.dataset.username);
        break;
    }
  } catch (err) {
    showToast(err.message || String(err));
  }
});

/* ======================= Boot ======================= */
console.log('Housekeeping Manager v' + APP_VERSION + ' (' + APP_MODE + ')');
if (APP_MODE === 'staff' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}
render();
tryRestoreSession();
