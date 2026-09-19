export type NavItemId = 'rooms' | 'stats' | 'doubleup' | 'rules' | 'team';

export interface NavItem {
  id: NavItemId;
  label: string;
  icon: 'bed' | 'chart' | 'layers' | 'book' | 'users';
}

/**
 * Hauptbereiche der App (Briefing Punkt 5). Bewusst ohne Admin-/Profilfunktionen - die
 * werden ueber ein separates Profil-/Einstellungssymbol geloest, nicht als gleichwertiger Tab.
 */
export const NAV_ITEMS: NavItem[] = [
  { id: 'rooms', label: 'Zimmer', icon: 'bed' },
  { id: 'stats', label: 'Statistik', icon: 'chart' },
  { id: 'doubleup', label: 'Aufdoppeln', icon: 'layers' },
  { id: 'rules', label: 'Regeln', icon: 'book' },
  { id: 'team', label: 'Team', icon: 'users' },
];
