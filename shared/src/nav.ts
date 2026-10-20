import type { EntityKey } from './entities';

export type NavNode =
  | { kind: 'group'; id: string; caption: string; icon?: string; items: NavNode[] }
  | { kind: 'entity'; id: string; entity: EntityKey; caption?: string }
  | { kind: 'link'; id: string; caption: string; path: string; icon?: string; adminOnly?: boolean; permission?: string };

// Final effective XAF navigation (KPI and Reports are out of scope), plus Home and Administration.
export const NAVIGATION: NavNode[] = [
  { kind: 'link', id: 'home', caption: 'Home', path: '/', icon: 'NAV_Home' },
  {
    kind: 'group',
    id: 'sampling',
    caption: 'Sampling',
    icon: 'NAV_Sampling',
    items: [
      { kind: 'entity', id: 'sample', entity: 'sample' },
      { kind: 'entity', id: 'sampleParameter', entity: 'sampleParameter' },
    ],
  },
  {
    kind: 'group',
    id: 'species',
    caption: 'Species',
    icon: 'NAV_Species',
    items: [{ kind: 'entity', id: 'speciesParameterLimit', entity: 'speciesParameterLimit' }],
  },
  {
    kind: 'group',
    id: 'tankReadings',
    caption: 'Tank Readings',
    icon: 'NAV_TankReadings',
    items: [
      { kind: 'entity', id: 'tankReading', entity: 'tankReading' },
      { kind: 'entity', id: 'tankReadingParameter', entity: 'tankReadingParameter' },
    ],
  },
  {
    kind: 'group',
    id: 'tanks',
    caption: 'Tanks',
    icon: 'NAV_Tanks',
    items: [
      { kind: 'entity', id: 'tank', entity: 'tank' },
      { kind: 'entity', id: 'tankParameterOverride', entity: 'tankParameterOverride' },
      { kind: 'entity', id: 'tankSpecies', entity: 'tankSpecies' },
    ],
  },
  {
    kind: 'group',
    id: 'utils',
    caption: 'Utils',
    icon: 'NAV_Utils',
    items: [
      { kind: 'entity', id: 'aquaticEnvironment', entity: 'aquaticEnvironment', caption: 'Aquatic Environments' },
      {
        kind: 'group',
        id: 'measurements',
        caption: 'Measurements',
        icon: 'NAV_Measurements',
        items: [
          { kind: 'entity', id: 'measurementType', entity: 'measurementType', caption: 'Measurement Types' },
          { kind: 'entity', id: 'unit', entity: 'unit', caption: 'Units' },
        ],
      },
      {
        kind: 'group',
        id: 'waterQuality',
        caption: 'Water Quality',
        icon: 'NAV_WaterQuality',
        items: [
          { kind: 'entity', id: 'category', entity: 'category', caption: 'Categories' },
          { kind: 'entity', id: 'parameter', entity: 'parameter', caption: 'Parameters' },
        ],
      },
      {
        kind: 'group',
        id: 'supplies',
        caption: 'Supplies',
        icon: 'NAV_Supplies',
        items: [
          { kind: 'entity', id: 'waterSource', entity: 'waterSource', caption: 'Water Sources' },
          { kind: 'entity', id: 'treatmentType', entity: 'treatmentType', caption: 'Treatment Types' },
        ],
      },
      {
        kind: 'group',
        id: 'inhabitants',
        caption: 'Inhabitants',
        icon: 'NAV_Inhabitants',
        items: [
          { kind: 'entity', id: 'speciesGroup', entity: 'speciesGroup', caption: 'Species Groups' },
          { kind: 'entity', id: 'speciesList', entity: 'species', caption: 'Species' },
        ],
      },
    ],
  },
  {
    kind: 'group',
    id: 'waterManagement',
    caption: 'Water Management',
    icon: 'NAV_WaterManagement',
    items: [
      { kind: 'entity', id: 'waterPreparation', entity: 'waterPreparation', caption: 'Water Preparations' },
      { kind: 'entity', id: 'waterChange', entity: 'waterChange', caption: 'Water Change Logs' },
    ],
  },
  {
    kind: 'group',
    id: 'administration',
    caption: 'Administration',
    icon: 'NAV_Admin',
    items: [
      { kind: 'link', id: 'users', caption: 'Users', path: '/admin/users', icon: 'NAV_Users', adminOnly: true },
      { kind: 'link', id: 'roles', caption: 'Roles', path: '/admin/roles', icon: 'NAV_Roles', adminOnly: true },
      { kind: 'link', id: 'auditLog', caption: 'Audit Log', path: '/admin/audit-log', icon: 'NAV_AuditLog', adminOnly: true },
    ],
  },
];
