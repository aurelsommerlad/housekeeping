/**
 * Zentrales Datenmodell fuer den Housekeeping-UI-Prototyp.
 *
 * Wichtig (siehe Briefing Punkt 11): Status und Merkmale sind bewusst getrennte Konzepte und
 * werden nirgends vermischt.
 *  - `UnitStatus`  = der eine, verbindliche Reinigungs-/Betriebsstatus einer Einheit.
 *  - Merkmale (Abreise/Anreise/Stayover/Aufdoppeln/Extras) sind unabhaengige, zusaetzliche
 *    Eigenschaften, die parallel zum Status auftreten koennen.
 */

export type UnitStatus =
  | 'needs_cleaning'
  | 'in_progress'
  | 'inspection'
  | 'clean'
  | 'blocked';

export type UnitFeatureId = 'crib' | 'sofa_bed' | 'dog' | 'extra_guest' | 'extras';

export interface UnitFeature {
  id: UnitFeatureId;
  /** Anzahl, falls ein Merkmal mehrfach vorkommt (z. B. "2x Babybett"). Default 1. */
  count?: number;
}

export interface AssignedStaff {
  id: string;
  name: string;
  initials: string;
  /** Anzahl aktuell zugewiesener Einheiten in der aktiven Property. */
  unitsAssigned: number;
}

export interface TurnoverInfo {
  departureToday?: boolean;
  arrivalToday?: boolean;
  stayover?: boolean;
  /** Nächte seit Anreise, falls belegt. */
  nights?: number;
}

export interface Unit {
  id: string;
  propertyId: string;
  /** Kurzer Anzeigename, z. B. "ROS" - das dominante visuelle Element der Card. */
  name: string;
  status: UnitStatus;
  turnover: TurnoverInfo;
  /** "Aufdoppeln" - unabhaengig vom Reinigungsstatus, siehe Briefing Punkt 8. */
  needsDoubleUp?: boolean;
  /** Sonstige Aufmerksamkeits-Hinweise, die keinen eigenen Status rechtfertigen. */
  needsAttention?: boolean;
  features: UnitFeature[];
  assignedTo?: AssignedStaff | null;
}

export interface Property {
  id: string;
  code: string;
  name: string;
}
