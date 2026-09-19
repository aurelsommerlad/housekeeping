/**
 * ============================================================================
 *  PROTOTYP-DATEN - KEINE ECHTEN DATEN
 * ============================================================================
 * Ausschliesslich fuer den UI-Prototyp der Zimmeruebersicht (siehe MIGRATION_PLAN.md,
 * Phase 0). Es besteht noch KEINE Anbindung an Apaleo oder die bestehenden
 * `/api/*`-Routen/Redis. Sobald Phase 1 die echte Datenanbindung baut, wird diese Datei
 * durch echte Fetches ersetzt.
 * ============================================================================
 */
import type { Property, Unit } from './types';

export const PROTOTYPE_PROPERTIES: Property[] = [
  { id: 'hov', code: 'HOV', name: 'HØV' },
  { id: 'husle', code: 'HUSLE', name: 'HŪSLE' },
  { id: 'alpila', code: 'ALPILA', name: 'ΛLPILΛ' },
  { id: 'laeke', code: 'LAEKE', name: 'LÆKE' },
];

export const PROTOTYPE_UNITS: Unit[] = [
  {
    id: 'hov-ros',
    propertyId: 'hov',
    name: 'ROS',
    status: 'needs_cleaning',
    turnover: { departureToday: true, nights: 4 },
    features: [
      { id: 'crib' },
      { id: 'dog' },
    ],
    assignedTo: { id: 'js', name: 'Julia S.', initials: 'JS', unitsAssigned: 4 },
  },
  {
    id: 'hov-bir',
    propertyId: 'hov',
    name: 'BIR',
    status: 'in_progress',
    turnover: { stayover: true, nights: 2 },
    features: [],
    assignedTo: { id: 'ml', name: 'Mara L.', initials: 'ML', unitsAssigned: 3 },
  },
  {
    id: 'hov-ask',
    propertyId: 'hov',
    name: 'ASK',
    status: 'inspection',
    turnover: { departureToday: true, nights: 6 },
    features: [{ id: 'sofa_bed' }],
    assignedTo: null,
  },
  {
    id: 'hov-fur',
    propertyId: 'hov',
    name: 'FUR',
    status: 'clean',
    turnover: { arrivalToday: true },
    features: [],
    assignedTo: null,
  },
  {
    id: 'hov-lyn',
    propertyId: 'hov',
    name: 'LYN',
    status: 'clean',
    turnover: { stayover: true, nights: 1 },
    needsDoubleUp: true,
    features: [{ id: 'crib', count: 2 }, { id: 'extra_guest' }, { id: 'extras' }],
    assignedTo: null,
  },
  {
    id: 'hov-eik',
    propertyId: 'hov',
    name: 'EIK',
    status: 'blocked',
    turnover: {},
    needsAttention: true,
    features: [],
    assignedTo: null,
  },
  {
    id: 'hov-vik',
    propertyId: 'hov',
    name: 'VIK',
    status: 'needs_cleaning',
    turnover: { departureToday: true, nights: 3 },
    needsDoubleUp: true,
    features: [{ id: 'dog' }, { id: 'sofa_bed' }, { id: 'crib' }],
    assignedTo: { id: 'js', name: 'Julia S.', initials: 'JS', unitsAssigned: 4 },
  },
  {
    id: 'hov-sol',
    propertyId: 'hov',
    name: 'SOL',
    status: 'in_progress',
    turnover: { arrivalToday: true },
    features: [],
    assignedTo: { id: 'ml', name: 'Mara L.', initials: 'ML', unitsAssigned: 3 },
  },
  {
    id: 'husle-nor',
    propertyId: 'husle',
    name: 'NOR',
    status: 'needs_cleaning',
    turnover: { departureToday: true, nights: 2 },
    features: [{ id: 'dog' }],
    assignedTo: { id: 'ah', name: 'Anna H.', initials: 'AH', unitsAssigned: 2 },
  },
  {
    id: 'husle-syd',
    propertyId: 'husle',
    name: 'SYD',
    status: 'clean',
    turnover: { stayover: true, nights: 5 },
    features: [],
    assignedTo: null,
  },
  {
    id: 'alpila-top',
    propertyId: 'alpila',
    name: 'TOP',
    status: 'inspection',
    turnover: { departureToday: true, nights: 7 },
    features: [{ id: 'crib' }],
    assignedTo: null,
  },
  {
    id: 'laeke-bla',
    propertyId: 'laeke',
    name: 'BLA',
    status: 'clean',
    turnover: {},
    features: [],
    assignedTo: null,
  },
];
