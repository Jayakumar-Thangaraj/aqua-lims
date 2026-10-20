import type { EnumName } from './enums';

export type EntityKey =
  | 'measurementType'
  | 'unit'
  | 'category'
  | 'parameter'
  | 'aquaticEnvironment'
  | 'waterSource'
  | 'treatmentType'
  | 'speciesGroup'
  | 'species'
  | 'speciesParameterLimit'
  | 'tank'
  | 'tankSpecies'
  | 'tankParameterOverride'
  | 'sample'
  | 'sampleParameter'
  | 'tankReading'
  | 'tankReadingParameter'
  | 'waterPreparation'
  | 'waterPrepSource'
  | 'waterPrepTreatment'
  | 'waterPrepReading'
  | 'waterChange';

export type FieldType = 'string' | 'text' | 'number' | 'integer' | 'boolean' | 'date' | 'enum' | 'ref';

export interface FieldDef {
  name: string;
  caption: string;
  type: FieldType;
  required?: boolean;
  unique?: boolean;
  maxLength?: number;
  enumName?: EnumName;
  ref?: EntityKey;
  // Field of the referenced entity shown as the label (default: its display field).
  refLabel?: string;
  readOnly?: boolean;
  // 'now' = current timestamp on create.
  defaultValue?: string | number | boolean | null;
  placeholder?: string;
  tooltip?: string;
  rows?: number;
  nonNegative?: boolean;
  listCaption?: string;
  formCaption?: string;
  hideCaption?: boolean;
  // createdAt / updatedAt shown read-only.
  system?: boolean;
  // What happens to this reference when the referenced record is deleted.
  onTargetDelete?: 'block' | 'clear';
}

export type ComputedKind = 'text' | 'resultStatus' | 'healthLevel';

export interface ComputedDef {
  name: string;
  caption: string;
  kind: ComputedKind;
}

export interface ListColumnDef {
  field: string;
  width?: number;
  hidden?: boolean;
}

export interface FormCell {
  field?: string;
  // Fields stacked vertically in one cell.
  stack?: string[];
  // Number field with its unit selector beside it.
  unitField?: string;
  spacer?: boolean;
  width?: number;
}

export type WidgetName = 'tankHealth' | 'effectiveLimits' | 'alertSummary' | 'prepTotal' | 'readingHint';

export type FormItem =
  | { kind: 'row'; cells: FormCell[] }
  | { kind: 'field'; field: string }
  | { kind: 'section'; caption: string; items: FormItem[] }
  | { kind: 'child'; child: string }
  | { kind: 'tabs'; tabs: { caption: string; items: FormItem[] }[] }
  | { kind: 'widget'; widget: WidgetName };

export interface ChildDef {
  name: string;
  entity: EntityKey;
  foreignKey: string;
  caption: string;
  // inline: edited in the parent form, saved with it. list: read-only list, rows open their own form.
  mode: 'inline' | 'list';
  columns: ListColumnDef[];
  newCaption?: string;
  emptyText?: string;
  // Values for a new child opened from a list-mode grid; '@field' copies a field of the parent.
  newDefaults?: Record<string, string>;
  copyFromSpecies?: boolean;
}

export interface CompoundUnique {
  fields: string[];
  message: string;
  // Field that receives the error.
  field: string;
}

export interface LookupDef {
  activeOnly?: boolean;
  sortBy?: string[];
  columns?: string[];
}

export interface EntityDef {
  key: EntityKey;
  modelName: string;
  apiPath: string;
  caption: string;
  listCaption: string;
  icon: string;
  displayField: string;
  banner: string;
  // AquaBaseObject in XAF: has Active and Created/Last Updated dates.
  abo: boolean;
  hasActive: boolean;
  fields: FieldDef[];
  computed?: ComputedDef[];
  listColumns: ListColumnDef[];
  defaultSort: { field: string; desc?: boolean };
  filterRowDefault?: boolean;
  form: FormItem[];
  formWidth?: number;
  formCaption?: string;
  children?: ChildDef[];
  // Reference to the owning parent; hidden when the record is edited inside its parent.
  parentField?: string;
  lookup?: LookupDef;
  code?: { kind: 'WP' | 'WC'; field: string };
  compoundUnique?: CompoundUnique[];
  deleteBlockedMessage?: string;
  // Out-of-range red row highlight (Conditional Appearance in XAF).
  highlightOutOfRange?: boolean;
  focusField?: string;
}

const ACTIVE: FieldDef = {
  name: 'active',
  caption: 'Active',
  type: 'boolean',
  defaultValue: true,
  tooltip: 'Enable this to show elsewhere.',
};
const notes = (rows = 3): FieldDef => ({ name: 'notes', caption: 'Notes', type: 'text', rows });
const now = (name: string, caption: string): FieldDef => ({ name, caption, type: 'date', defaultValue: 'now' });
const num = (name: string, caption: string, extra: Partial<FieldDef> = {}): FieldDef => ({ name, caption, type: 'number', ...extra });
const ref = (name: string, caption: string, target: EntityKey, extra: Partial<FieldDef> = {}): FieldDef => ({
  name,
  caption,
  type: 'ref',
  ref: target,
  ...extra,
});
const row = (...cells: FormCell[]): FormItem => ({ kind: 'row', cells });
const f = (field: string, width?: number): FormCell => ({ field, width });
const field = (name: string): FormItem => ({ kind: 'field', field: name });

const RESULT_COMPUTED: ComputedDef[] = [
  { name: 'limitRange', caption: 'Limit', kind: 'text' },
  { name: 'resultStatus', caption: 'Status', kind: 'resultStatus' },
];

export const ENTITIES: Record<EntityKey, EntityDef> = {
  measurementType: {
    key: 'measurementType',
    modelName: 'MeasurementType',
    apiPath: 'measurement-types',
    caption: 'Measurement Type',
    listCaption: 'Measurement Types',
    icon: 'BO_MeasurementType',
    displayField: 'measurementTypeName',
    banner: 'Define the kinds of measurement that units are grouped under (e.g. Concentration, Temperature, Volume).',
    abo: true,
    hasActive: true,
    fields: [{ name: 'measurementTypeName', caption: 'Measurement Type', type: 'string', required: true, unique: true, maxLength: 100 }, ACTIVE],
    listColumns: [{ field: 'measurementTypeName' }],
    defaultSort: { field: 'measurementTypeName' },
    form: [field('measurementTypeName')],
    formWidth: 560,
    lookup: { activeOnly: true },
  },

  unit: {
    key: 'unit',
    modelName: 'Unit',
    apiPath: 'units',
    caption: 'Unit',
    listCaption: 'Units',
    icon: 'BO_Unit',
    displayField: 'unitName',
    banner: 'Define the units used to record measured values and volumes (e.g. Celsius, Gram, dKH).',
    abo: true,
    hasActive: true,
    fields: [
      { name: 'unitName', caption: 'Unit Name', type: 'string', required: true, unique: true, maxLength: 100 },
      { name: 'unitSymbol', caption: 'Unit Symbol', type: 'string', required: true, maxLength: 100 },
      ref('measurementTypeId', 'Measurement Type', 'measurementType'),
      { name: 'description', caption: 'Description', type: 'text', maxLength: 100, rows: 2 },
      { name: 'sortOrder', caption: 'Sort Order', type: 'integer', defaultValue: 0 },
      ACTIVE,
    ],
    listColumns: [
      { field: 'unitName', width: 175 },
      { field: 'unitSymbol' },
      { field: 'measurementTypeId', width: 109 },
      { field: 'description', width: 194 },
      { field: 'sortOrder', hidden: true },
    ],
    defaultSort: { field: 'sortOrder' },
    form: [
      {
        kind: 'section',
        caption: 'Unit',
        items: [row(f('unitName'), f('unitSymbol')), row(f('measurementTypeId', 70), f('sortOrder', 30)), field('description')],
      },
    ],
    formWidth: 640,
    lookup: { activeOnly: true, sortBy: ['sortOrder', 'unitName'], columns: ['unitSymbol', 'unitName'] },
  },

  category: {
    key: 'category',
    modelName: 'Category',
    apiPath: 'categories',
    caption: 'Category',
    listCaption: 'Categories',
    icon: 'BO_Category',
    displayField: 'categoryName',
    banner: 'Define the categories that group water quality parameters (e.g. Hardness, Nitrogen Cycle, Dissolved Solids).',
    abo: true,
    hasActive: true,
    fields: [
      { name: 'categoryName', caption: 'Category Name', type: 'string', required: true, unique: true, maxLength: 100 },
      { name: 'description', caption: 'Description', type: 'text', maxLength: 200, rows: 2 },
      ACTIVE,
    ],
    listColumns: [{ field: 'categoryName' }, { field: 'description' }, { field: 'active' }],
    defaultSort: { field: 'categoryName' },
    form: [field('categoryName'), field('description')],
    formWidth: 640,
    lookup: { activeOnly: true },
  },

  parameter: {
    key: 'parameter',
    modelName: 'Parameter',
    apiPath: 'parameters',
    caption: 'Parameter',
    listCaption: 'Parameters',
    icon: 'BO_Parameter',
    displayField: 'parameterName',
    banner:
      'Define the water quality parameters tested in samples, tank readings and water preparation (e.g. pH, Ammonia, Carbonate Hardness).',
    abo: true,
    hasActive: true,
    fields: [
      { name: 'parameterName', caption: 'Parameter Name', type: 'string', required: true, unique: true, maxLength: 100 },
      { name: 'parameterCode', caption: 'Parameter Code', type: 'string', required: true, unique: true, maxLength: 100 },
      ref('categoryId', 'Category', 'category', { required: true }),
      ref('defaultUnitId', 'Default Unit', 'unit', { refLabel: 'unitSymbol' }),
      { name: 'description', caption: 'Description', type: 'text', rows: 5 },
      { name: 'sortOrder', caption: 'Sort Order', type: 'integer', defaultValue: 0 },
      ACTIVE,
    ],
    listColumns: [
      { field: 'parameterName', width: 258 },
      { field: 'parameterCode', width: 125 },
      { field: 'categoryId', width: 112 },
      { field: 'defaultUnitId', width: 77 },
    ],
    defaultSort: { field: 'parameterName' },
    form: [
      row(f('parameterName'), f('parameterCode')),
      row(f('categoryId', 40), f('defaultUnitId', 36), f('sortOrder', 24)),
      field('description'),
    ],
    formWidth: 760,
    lookup: { sortBy: ['parameterName'] },
  },

  aquaticEnvironment: {
    key: 'aquaticEnvironment',
    modelName: 'AquaticEnvironment',
    apiPath: 'aquatic-environments',
    caption: 'Aquatic Environment',
    listCaption: 'Aquatic Environments',
    icon: 'BO_AquaticEnvironment',
    displayField: 'environment',
    banner: 'Define the water sources used in tank setup and water preparation batches (e.g. Fresh water, Marine).',
    abo: false,
    hasActive: true,
    fields: [
      { name: 'environment', caption: 'Environment', type: 'string', required: true, unique: true, maxLength: 50 },
      { name: 'description', caption: 'Description', type: 'text', maxLength: 150, rows: 3 },
      ACTIVE,
    ],
    listColumns: [{ field: 'environment' }, { field: 'description', width: 200 }, { field: 'active', width: 70 }],
    defaultSort: { field: 'environment' },
    form: [field('environment'), field('description')],
    formWidth: 640,
    lookup: { activeOnly: true },
  },

  waterSource: {
    key: 'waterSource',
    modelName: 'WaterSource',
    apiPath: 'water-sources',
    caption: 'Water Source',
    listCaption: 'Water Sources',
    icon: 'BO_WaterSource',
    displayField: 'source',
    banner:
      'Define the sources of water used in water preparation batches (e.g. Dechlorinated Tap Water, Distilled Water, Borehole / Well Water).',
    abo: false,
    hasActive: false,
    fields: [
      { name: 'source', caption: 'Source', formCaption: 'Water Source', type: 'string', required: true, unique: true, maxLength: 50 },
      { name: 'description', caption: 'Description', type: 'text', maxLength: 150, rows: 3 },
    ],
    listColumns: [{ field: 'source' }, { field: 'description' }],
    defaultSort: { field: 'source' },
    form: [row({ stack: ['source', 'description'], width: 58 }, { spacer: true, width: 42 })],
    formWidth: 720,
    lookup: { sortBy: ['source'] },
  },

  treatmentType: {
    key: 'treatmentType',
    modelName: 'TreatmentType',
    apiPath: 'treatment-types',
    caption: 'Treatment Type',
    listCaption: 'Treatment Types',
    icon: 'BO_TreatmentType',
    displayField: 'treatmentTypeName',
    banner: 'Define the treatments applied to water during preparation (e.g. Dechlorination, Clarifying, Bacterial Boosting).',
    abo: true,
    hasActive: true,
    fields: [
      { name: 'treatmentTypeName', caption: 'Treatment Type', type: 'string', required: true, unique: true, maxLength: 100 },
      { name: 'description', caption: 'Description', type: 'text', maxLength: 100, rows: 2 },
      ACTIVE,
    ],
    listColumns: [{ field: 'treatmentTypeName' }, { field: 'description' }],
    defaultSort: { field: 'treatmentTypeName' },
    filterRowDefault: true,
    form: [field('treatmentTypeName'), field('description')],
    formWidth: 640,
    lookup: { sortBy: ['treatmentTypeName'] },
  },

  speciesGroup: {
    key: 'speciesGroup',
    modelName: 'SpeciesGroup',
    apiPath: 'species-groups',
    caption: 'Species Group',
    listCaption: 'Species Group',
    icon: 'BO_SpeciesGroup',
    displayField: 'groupName',
    banner:
      'Broad genus-level category; groups closely related species that share identical water parameters and general care requirements',
    abo: true,
    hasActive: true,
    fields: [
      { name: 'groupName', caption: 'Group Name', type: 'string', required: true, unique: true, maxLength: 100 },
      { name: 'description', caption: 'Description', type: 'text', maxLength: 150, rows: 2 },
      ACTIVE,
    ],
    listColumns: [{ field: 'groupName' }, { field: 'description' }],
    defaultSort: { field: 'groupName' },
    form: [field('groupName'), field('description')],
    formWidth: 640,
    lookup: { sortBy: ['groupName'] },
  },

  species: {
    key: 'species',
    modelName: 'Species',
    apiPath: 'species',
    caption: 'Species',
    listCaption: 'Species',
    icon: 'BO_Species',
    displayField: 'speciesName',
    banner: 'Individual species entry; holds unique scientific name, common name, and specific care details within its group',
    abo: true,
    hasActive: true,
    fields: [
      {
        name: 'speciesName',
        caption: 'Species Name',
        type: 'string',
        required: true,
        unique: true,
        maxLength: 100,
        placeholder: 'e.g. Oncorhynchus mykiss',
        tooltip: 'Scientific (Latin) name of the species',
      },
      {
        name: 'commonName',
        caption: 'Common Name',
        type: 'string',
        maxLength: 100,
        placeholder: 'e.g. Rainbow trout',
        tooltip: 'Everyday name shown on reports',
      },
      ref('speciesGroupId', 'Species Group', 'speciesGroup', { placeholder: 'Select a group (optional)' }),
      { name: 'description', caption: 'Description', type: 'text', maxLength: 150, rows: 2, placeholder: 'Optional notes about this species' },
      ACTIVE,
      { name: 'updatedAt', caption: 'Last Updated On', type: 'date', system: true, readOnly: true },
    ],
    listColumns: [{ field: 'speciesName' }, { field: 'commonName' }, { field: 'speciesGroupId' }, { field: 'description' }],
    defaultSort: { field: 'speciesName' },
    form: [
      {
        kind: 'section',
        caption: 'Species Details',
        items: [
          row(f('speciesName', 50), f('commonName', 50)),
          row({ stack: ['speciesGroupId', 'updatedAt'], width: 42 }, f('description', 58)),
        ],
      },
      { kind: 'section', caption: 'Parameter Limits', items: [{ kind: 'child', child: 'parameterLimits' }] },
    ],
    formWidth: 860,
    children: [
      {
        name: 'parameterLimits',
        entity: 'speciesParameterLimit',
        foreignKey: 'speciesId',
        caption: 'Parameter Limits',
        mode: 'inline',
        columns: [
          { field: 'parameterId', width: 180 },
          { field: 'unitId', width: 80 },
          { field: 'lcl', width: 90 },
          { field: 'optimalValue', width: 90 },
          { field: 'ucl', width: 90 },
        ],
        newCaption: 'Add Parameter',
        emptyText: 'No parameter limits yet. Click Add Parameter, or Copy from Species to start from a similar species.',
        copyFromSpecies: true,
      },
    ],
    lookup: { sortBy: ['speciesName'] },
  },

  speciesParameterLimit: {
    key: 'speciesParameterLimit',
    modelName: 'SpeciesParameterLimit',
    apiPath: 'species-parameter-limits',
    caption: 'Species Parameter Limit',
    listCaption: 'Species Parameter Limit',
    icon: 'BO_SpeciesParameterLimit',
    displayField: 'parameterId',
    banner:
      'Define the acceptable lower and upper limits of each water parameter for a species (e.g. pH 6.5 – 7.5, Temperature 20 – 26 °C).',
    abo: true,
    hasActive: true,
    fields: [
      ref('speciesId', 'Species', 'species', { required: true }),
      ref('parameterId', 'Parameter', 'parameter', { required: true }),
      num('lcl', 'LCL', { required: true }),
      num('ucl', 'UCL', { required: true }),
      num('optimalValue', 'Ideal', { defaultValue: 0 }),
      ref('unitId', 'Unit', 'unit', { refLabel: 'unitSymbol' }),
      notes(4),
      ACTIVE,
    ],
    listColumns: [
      { field: 'speciesId' },
      { field: 'parameterId' },
      { field: 'lcl' },
      { field: 'ucl' },
      { field: 'optimalValue' },
      { field: 'unitId' },
    ],
    defaultSort: { field: 'speciesId' },
    parentField: 'speciesId',
    form: [
      {
        kind: 'section',
        caption: 'Species Parameter Limit',
        items: [row(f('parameterId', 60), f('optimalValue', 40)), row(f('unitId', 40), f('lcl', 30), f('ucl', 30)), field('notes')],
      },
    ],
    formWidth: 640,
    compoundUnique: [
      { fields: ['speciesId', 'parameterId'], field: 'parameterId', message: 'This parameter already has a limit for this species.' },
    ],
  },

  tank: {
    key: 'tank',
    modelName: 'Tank',
    apiPath: 'tanks',
    caption: 'Tank',
    listCaption: 'Tank',
    icon: 'BO_Tank',
    displayField: 'tankName',
    banner: 'Define the tanks being monitored, with their volume, environment and inhabitants (e.g. River Setup Tank, Nano Tank).',
    abo: true,
    hasActive: true,
    fields: [
      { name: 'tankName', caption: 'Tank Name', type: 'string', required: true, unique: true, maxLength: 100 },
      { name: 'tankCode', caption: 'Tank Code', type: 'string', required: true, unique: true, maxLength: 100 },
      num('volume', 'Volume', { nonNegative: true, defaultValue: 0 }),
      ref('sourceId', 'Source', 'aquaticEnvironment'),
      notes(3),
      ACTIVE,
    ],
    computed: [
      { name: 'healthLevel', caption: 'Health', kind: 'healthLevel' },
      { name: 'healthSummary', caption: 'Health Detail', kind: 'text' },
    ],
    listColumns: [
      { field: 'tankCode' },
      { field: 'tankName' },
      { field: 'sourceId' },
      { field: 'volume' },
      { field: 'healthLevel' },
      { field: 'healthSummary', width: 320 },
    ],
    defaultSort: { field: 'tankName' },
    form: [
      {
        kind: 'section',
        caption: 'Tank',
        items: [row(f('tankName'), f('tankCode')), row(f('volume', 50), f('sourceId', 50)), { kind: 'widget', widget: 'tankHealth' }],
      },
      field('notes'),
      {
        kind: 'tabs',
        tabs: [
          { caption: 'Tank Species', items: [{ kind: 'child', child: 'tankSpecies' }] },
          { caption: 'Parameter Overrides', items: [{ kind: 'child', child: 'parameterOverrides' }, { kind: 'widget', widget: 'effectiveLimits' }] },
          { caption: 'Samples', items: [{ kind: 'child', child: 'samples' }] },
          { caption: 'Tank Readings', items: [{ kind: 'child', child: 'tankReadings' }] },
        ],
      },
    ],
    formWidth: 920,
    children: [
      {
        name: 'tankSpecies',
        entity: 'tankSpecies',
        foreignKey: 'tankId',
        caption: 'Tank Species',
        mode: 'inline',
        columns: [{ field: 'speciesId', width: 220 }, { field: 'notes', width: 320 }, { field: 'active', width: 80 }],
        emptyText: 'No species in this tank yet. Click New to add one.',
      },
      {
        name: 'parameterOverrides',
        entity: 'tankParameterOverride',
        foreignKey: 'tankId',
        caption: 'Parameter Overrides',
        mode: 'inline',
        columns: [{ field: 'parameterId', width: 200 }, { field: 'lcl', width: 100 }, { field: 'ucl', width: 100 }, { field: 'notes', width: 260 }],
        emptyText: 'No overrides. The species limits apply.',
      },
      {
        name: 'samples',
        entity: 'sample',
        foreignKey: 'tankId',
        caption: 'Samples',
        mode: 'list',
        columns: [{ field: 'sampleCode' }, { field: 'collectedDate' }, { field: 'volume' }, { field: 'volumeUnitId' }, { field: 'status' }],
        newDefaults: { tankId: '@_id' },
        emptyText: 'No samples for this tank yet.',
      },
      {
        name: 'tankReadings',
        entity: 'tankReading',
        foreignKey: 'tankId',
        caption: 'Tank Readings',
        mode: 'list',
        columns: [{ field: 'readingDate' }, { field: 'context' }, { field: 'waterChangeId' }],
        newDefaults: { tankId: '@_id' },
        emptyText: 'No readings for this tank yet.',
      },
    ],
    lookup: { sortBy: ['tankName'] },
    deleteBlockedMessage: "This tank has samples, readings or water changes and can't be deleted. Set it inactive instead.",
  },

  tankSpecies: {
    key: 'tankSpecies',
    modelName: 'TankSpecies',
    apiPath: 'tank-species',
    caption: 'Tank Species',
    listCaption: 'Tank Species',
    icon: 'BO_TankSpecies',
    displayField: 'speciesId',
    banner:
      "Define the species kept in a tank; their parameter limits set the tank's acceptable ranges (e.g. Cherry Shrimp in River Setup Tank).",
    abo: true,
    hasActive: true,
    fields: [
      ref('tankId', 'Tank', 'tank', { required: true }),
      ref('speciesId', 'Species', 'species', { required: true, refLabel: 'commonName' }),
      notes(3),
      ACTIVE,
    ],
    listColumns: [{ field: 'tankId' }, { field: 'speciesId' }, { field: 'notes' }, { field: 'active' }],
    defaultSort: { field: 'tankId' },
    parentField: 'tankId',
    form: [field('speciesId'), field('notes')],
    formWidth: 600,
  },

  tankParameterOverride: {
    key: 'tankParameterOverride',
    modelName: 'TankParameterOverride',
    apiPath: 'tank-parameter-overrides',
    caption: 'Tank Parameter Override',
    listCaption: 'Tank Parameter Override',
    icon: 'BO_TankParameterOverride',
    displayField: 'parameterId',
    banner: 'Define tank-specific parameter limits that replace the species limits for that tank (e.g. pH 6.0 – 7.5).',
    abo: true,
    hasActive: true,
    fields: [
      ref('tankId', 'Tank', 'tank', { required: true }),
      ref('parameterId', 'Parameter', 'parameter', { required: true }),
      num('lcl', 'LCL', { required: true }),
      num('ucl', 'UCL', { required: true }),
      notes(3),
      ACTIVE,
    ],
    listColumns: [{ field: 'tankId' }, { field: 'parameterId' }, { field: 'lcl' }, { field: 'ucl' }],
    defaultSort: { field: 'tankId' },
    parentField: 'tankId',
    form: [row(f('parameterId', 50), f('lcl', 25), f('ucl', 25)), field('notes')],
    formWidth: 600,
    compoundUnique: [{ fields: ['tankId', 'parameterId'], field: 'parameterId', message: 'This tank already has an override for this parameter.' }],
  },

  sample: {
    key: 'sample',
    modelName: 'Sample',
    apiPath: 'samples',
    caption: 'Sample',
    listCaption: 'Sample',
    icon: 'BO_Sample',
    displayField: 'sampleCode',
    banner: 'Record the water samples collected from tanks for testing (e.g. weekly routine sample, post-treatment check).',
    abo: true,
    hasActive: true,
    fields: [
      { name: 'sampleCode', caption: 'Sample Code', type: 'string', required: true, unique: true, maxLength: 100 },
      ref('tankId', 'Tank', 'tank', { required: true }),
      now('collectedDate', 'Collected Date'),
      num('volume', 'Volume', { nonNegative: true, defaultValue: 0 }),
      ref('volumeUnitId', 'Volume Unit', 'unit'),
      { name: 'status', caption: 'Status', type: 'enum', enumName: 'SampleStatus', defaultValue: 'Pending' },
      notes(3),
      ACTIVE,
    ],
    listColumns: [
      { field: 'sampleCode' },
      { field: 'tankId' },
      { field: 'collectedDate' },
      { field: 'volume' },
      { field: 'volumeUnitId' },
      { field: 'status' },
    ],
    defaultSort: { field: 'sampleCode' },
    form: [
      row(f('sampleCode'), f('tankId')),
      row(f('collectedDate'), f('status')),
      row(f('volume', 50), f('volumeUnitId', 50)),
      field('notes'),
      { kind: 'section', caption: 'Sample Parameters', items: [{ kind: 'child', child: 'sampleParameters' }] },
    ],
    formWidth: 900,
    children: [
      {
        name: 'sampleParameters',
        entity: 'sampleParameter',
        foreignKey: 'sampleId',
        caption: 'Sample Parameters',
        mode: 'inline',
        columns: [
          { field: 'parameterId', width: 190 },
          { field: 'measuredValue', width: 110 },
          { field: 'unitId', width: 90 },
          { field: 'limitRange', width: 130 },
          { field: 'resultStatus', width: 100 },
          { field: 'testedDate', width: 130 },
        ],
        emptyText: 'No results yet. Click New to add a parameter result.',
      },
    ],
    lookup: { sortBy: ['sampleCode'] },
  },

  sampleParameter: {
    key: 'sampleParameter',
    modelName: 'SampleParameter',
    apiPath: 'sample-parameters',
    caption: 'Sample Parameter',
    listCaption: 'Sample Parameter',
    icon: 'BO_SampleParameter',
    displayField: 'parameterId',
    banner: "Record the result of each parameter tested in a sample, checked against the tank's limits (e.g. pH 7.0).",
    abo: true,
    hasActive: true,
    fields: [
      ref('sampleId', 'Sample', 'sample', { required: true }),
      ref('parameterId', 'Parameter', 'parameter', { required: true }),
      num('measuredValue', 'Measured Value', { required: true }),
      ref('unitId', 'Unit', 'unit', { refLabel: 'unitSymbol' }),
      now('testedDate', 'Tested Date'),
      notes(3),
      ACTIVE,
    ],
    computed: RESULT_COMPUTED,
    listColumns: [
      { field: 'sampleId' },
      { field: 'parameterId' },
      { field: 'measuredValue' },
      { field: 'unitId' },
      { field: 'limitRange' },
      { field: 'resultStatus' },
      { field: 'testedDate' },
    ],
    defaultSort: { field: 'sampleId' },
    parentField: 'sampleId',
    highlightOutOfRange: true,
    form: [
      row(f('sampleId'), f('parameterId')),
      row(f('measuredValue', 34), f('unitId', 33), f('testedDate', 33)),
      row(f('limitRange'), f('resultStatus')),
      field('notes'),
    ],
    formWidth: 700,
  },

  tankReading: {
    key: 'tankReading',
    modelName: 'TankReading',
    apiPath: 'tank-readings',
    caption: 'Tank Reading',
    listCaption: 'Tank Reading',
    icon: 'BO_TankReading',
    displayField: 'readingDate',
    banner:
      'Record the parameter readings taken from a tank at a point in time (e.g. routine check, before or after a water change).',
    abo: true,
    hasActive: true,
    fields: [
      ref('tankId', 'Tank', 'tank', { required: true }),
      now('readingDate', 'Reading Date'),
      { name: 'context', caption: 'Context', type: 'enum', enumName: 'TankReadingContext', defaultValue: 'Routine' },
      ref('waterChangeId', 'Water Change', 'waterChange', { onTargetDelete: 'clear' }),
      notes(3),
      ACTIVE,
    ],
    listColumns: [{ field: 'readingDate' }, { field: 'tankId' }, { field: 'context' }, { field: 'waterChangeId' }],
    defaultSort: { field: 'readingDate', desc: true },
    form: [
      row(f('tankId', 50), f('readingDate', 50)),
      row(f('context', 50), f('waterChangeId', 50)),
      { kind: 'widget', widget: 'readingHint' },
      field('notes'),
      { kind: 'section', caption: 'Parameters', items: [{ kind: 'child', child: 'parameters' }] },
    ],
    formWidth: 900,
    children: [
      {
        name: 'parameters',
        entity: 'tankReadingParameter',
        foreignKey: 'tankReadingId',
        caption: 'Parameters',
        mode: 'inline',
        columns: [
          { field: 'parameterId', width: 200 },
          { field: 'measuredValue', width: 120 },
          { field: 'unitId', width: 100 },
          { field: 'limitRange', width: 140 },
          { field: 'resultStatus', width: 110 },
        ],
        emptyText: 'No readings yet. Click New to add a parameter reading.',
      },
    ],
  },

  tankReadingParameter: {
    key: 'tankReadingParameter',
    modelName: 'TankReadingParameter',
    apiPath: 'tank-reading-parameters',
    caption: 'Tank Reading Parameter',
    listCaption: 'Tank Reading Parameter',
    icon: 'BO_TankReadingParameter',
    displayField: 'parameterId',
    banner:
      "Record the measured value of each parameter in a tank reading, checked against the tank's limits (e.g. Temperature 25 °C).",
    abo: true,
    hasActive: true,
    fields: [
      ref('tankReadingId', 'Tank Reading', 'tankReading', { required: true }),
      ref('parameterId', 'Parameter', 'parameter', { required: true }),
      num('measuredValue', 'Measured Value', { required: true }),
      ref('unitId', 'Unit', 'unit', { refLabel: 'unitSymbol' }),
      notes(3),
      ACTIVE,
    ],
    computed: RESULT_COMPUTED,
    listColumns: [
      { field: 'tankReadingId' },
      { field: 'parameterId' },
      { field: 'measuredValue' },
      { field: 'unitId' },
      { field: 'limitRange' },
      { field: 'resultStatus' },
    ],
    defaultSort: { field: 'tankReadingId' },
    parentField: 'tankReadingId',
    highlightOutOfRange: true,
    form: [row(f('tankReadingId'), f('parameterId')), row(f('measuredValue'), f('unitId')), row(f('limitRange'), f('resultStatus')), field('notes')],
    formWidth: 700,
  },

  waterPreparation: {
    key: 'waterPreparation',
    modelName: 'WaterPreparation',
    apiPath: 'water-preparations',
    caption: 'Water Preparation',
    listCaption: 'Water Preparation',
    icon: 'BO_WaterPreparation',
    displayField: 'prepCode',
    banner:
      'Record the water batches prepared for water changes, with their sources, treatments and readings (e.g. WP-202608-001).',
    abo: false,
    hasActive: false,
    fields: [
      { name: 'prepCode', caption: 'Prep Code', type: 'string', required: true, unique: true, maxLength: 100, readOnly: true },
      now('preparedDate', 'Prepared Date'),
      num('preparedVolume', 'Prepared Volume', { nonNegative: true, defaultValue: 0 }),
      { name: 'volumeUnit', caption: 'Volume Unit', type: 'enum', enumName: 'WaterVolumeUnit', defaultValue: 'MilliLitre' },
      { name: 'status', caption: 'Status', type: 'enum', enumName: 'WaterPreparationStatus', defaultValue: 'Preparing' },
      notes(3),
    ],
    computed: [{ name: 'preparedAmount', caption: 'Prepared Amount', kind: 'text' }],
    listColumns: [
      { field: 'prepCode', width: 130 },
      { field: 'preparedDate', width: 120 },
      { field: 'preparedAmount', width: 130 },
      { field: 'notes', width: 300 },
      { field: 'status' },
    ],
    defaultSort: { field: 'preparedDate', desc: true },
    form: [
      row(f('prepCode', 34), f('preparedDate', 33), f('status', 33)),
      row({ field: 'preparedVolume', unitField: 'volumeUnit', width: 50 }, { spacer: true, width: 50 }),
      { kind: 'widget', widget: 'prepTotal' },
      field('notes'),
      {
        kind: 'tabs',
        tabs: [
          { caption: 'Sources', items: [{ kind: 'child', child: 'sources' }] },
          { caption: 'Treatments', items: [{ kind: 'child', child: 'treatments' }] },
          { caption: 'Readings', items: [{ kind: 'child', child: 'readings' }] },
        ],
      },
    ],
    formWidth: 900,
    children: [
      {
        name: 'sources',
        entity: 'waterPrepSource',
        foreignKey: 'waterPreparationId',
        caption: 'Sources',
        mode: 'inline',
        columns: [{ field: 'sourceId', width: 260 }, { field: 'volume', width: 120 }, { field: 'volumeUnit', width: 110 }],
        emptyText: 'No source water recorded yet.',
      },
      {
        name: 'treatments',
        entity: 'waterPrepTreatment',
        foreignKey: 'waterPreparationId',
        caption: 'Treatments',
        mode: 'inline',
        columns: [
          { field: 'treatmentTypeId', width: 220 },
          { field: 'amountUsed', width: 110 },
          { field: 'amountUnitId', width: 100 },
          { field: 'appliedDate', width: 140 },
        ],
        emptyText: 'No treatments applied yet.',
      },
      {
        name: 'readings',
        entity: 'waterPrepReading',
        foreignKey: 'waterPreparationId',
        caption: 'Readings',
        mode: 'inline',
        columns: [
          { field: 'parameterId', width: 220 },
          { field: 'measuredValue', width: 120 },
          { field: 'unitId', width: 100 },
          { field: 'readingDate', width: 140 },
        ],
        emptyText: 'No readings of the prepared water yet.',
      },
    ],
    code: { kind: 'WP', field: 'prepCode' },
  },

  waterPrepSource: {
    key: 'waterPrepSource',
    modelName: 'WaterPrepSource',
    apiPath: 'water-prep-sources',
    caption: 'Water Prep Source',
    listCaption: 'Water Prep Source',
    icon: 'BO_WaterPrepSource',
    displayField: 'sourceId',
    banner: 'Record the source water and volume used in a water preparation batch (e.g. 2 L of Packaged Drinking Water).',
    abo: false,
    hasActive: false,
    fields: [
      ref('waterPreparationId', 'Water Preparation', 'waterPreparation', { required: true }),
      ref('sourceId', 'Source', 'waterSource', { required: true }),
      num('volume', 'Volume', { required: true, nonNegative: true }),
      { name: 'volumeUnit', caption: 'Volume Unit', type: 'enum', enumName: 'WaterVolumeUnit', defaultValue: 'MilliLitre' },
    ],
    listColumns: [{ field: 'waterPreparationId' }, { field: 'sourceId' }, { field: 'volume' }, { field: 'volumeUnit' }],
    defaultSort: { field: 'waterPreparationId' },
    parentField: 'waterPreparationId',
    form: [row(f('sourceId', 50), f('volume', 25), f('volumeUnit', 25))],
    formWidth: 600,
  },

  waterPrepTreatment: {
    key: 'waterPrepTreatment',
    modelName: 'WaterPrepTreatment',
    apiPath: 'water-prep-treatments',
    caption: 'Water Prep Treatment',
    listCaption: 'Water Prep Treatment',
    icon: 'BO_WaterPrepTreatment',
    displayField: 'treatmentTypeId',
    banner: 'Record the treatments applied to a water preparation batch and the amount used (e.g. 0.5 mL Dechlorination).',
    abo: false,
    hasActive: false,
    fields: [
      ref('waterPreparationId', 'Water Preparation', 'waterPreparation', { required: true }),
      ref('treatmentTypeId', 'Treatment Type', 'treatmentType', { required: true }),
      num('amountUsed', 'Amount Used', { nonNegative: true, defaultValue: 0 }),
      ref('amountUnitId', 'Amount Unit', 'unit', { refLabel: 'unitSymbol' }),
      now('appliedDate', 'Applied Date'),
      notes(3),
    ],
    listColumns: [
      { field: 'treatmentTypeId' },
      { field: 'amountUsed' },
      { field: 'amountUnitId' },
      { field: 'appliedDate' },
      { field: 'waterPreparationId' },
    ],
    defaultSort: { field: 'appliedDate', desc: true },
    parentField: 'waterPreparationId',
    form: [row(f('treatmentTypeId', 34), f('amountUsed', 22), f('amountUnitId', 22), f('appliedDate', 22)), field('notes')],
    formWidth: 760,
  },

  waterPrepReading: {
    key: 'waterPrepReading',
    modelName: 'WaterPrepReading',
    apiPath: 'water-prep-readings',
    caption: 'Water Prep Reading',
    listCaption: 'Water Prep Reading',
    icon: 'BO_WaterPrepReading',
    displayField: 'parameterId',
    banner:
      "Record the parameter readings of a prepared water batch, checked against the tank's limits before a water change (e.g. TDS 57 ppm).",
    abo: true,
    hasActive: true,
    fields: [
      ref('waterPreparationId', 'Water Preparation', 'waterPreparation', { required: true }),
      ref('parameterId', 'Parameter', 'parameter', { required: true }),
      num('measuredValue', 'Measured Value', { required: true }),
      ref('unitId', 'Unit', 'unit', { refLabel: 'unitSymbol' }),
      now('readingDate', 'Reading Date'),
      notes(3),
      ACTIVE,
    ],
    listColumns: [
      { field: 'waterPreparationId' },
      { field: 'parameterId' },
      { field: 'measuredValue' },
      { field: 'unitId' },
      { field: 'readingDate' },
    ],
    defaultSort: { field: 'readingDate', desc: true },
    parentField: 'waterPreparationId',
    form: [row(f('waterPreparationId'), f('parameterId')), row(f('measuredValue', 34), f('unitId', 33), f('readingDate', 33)), field('notes')],
    formWidth: 700,
  },

  waterChange: {
    key: 'waterChange',
    modelName: 'WaterChange',
    apiPath: 'water-changes',
    caption: 'Water Change',
    listCaption: 'Water Change Logs',
    formCaption: 'Water Change Log',
    icon: 'BO_WaterChange',
    displayField: 'changeCode',
    banner: 'Record the water changes made to tanks, with the volume removed and the prepared water added (e.g. WC-202610-001).',
    abo: false,
    hasActive: false,
    fields: [
      { name: 'changeCode', caption: 'Change Code', type: 'string', required: true, unique: true, maxLength: 100, readOnly: true },
      ref('tankId', 'Tank', 'tank', { required: true }),
      ref('waterPreparationId', 'Water Preparation', 'waterPreparation', { required: true, formCaption: 'Prepared Water' }),
      now('changeDate', 'Change Date'),
      { name: 'status', caption: 'Status', type: 'enum', enumName: 'WaterChangeStatus', defaultValue: 'Planned' },
      num('volumeRemoved', 'Removed Water', { nonNegative: true, defaultValue: 0 }),
      { name: 'volumeRemovedUnit', caption: 'Removed Water Unit', type: 'enum', enumName: 'WaterVolumeUnit', defaultValue: 'MilliLitre', hideCaption: true },
      num('volumeUsed', 'Added Water', { nonNegative: true, defaultValue: 0 }),
      { name: 'volumeUsedUnit', caption: 'Added Water Unit', type: 'enum', enumName: 'WaterVolumeUnit', defaultValue: 'MilliLitre', hideCaption: true },
      { name: 'overrideNote', caption: 'Override Note', type: 'text', rows: 2 },
      notes(3),
    ],
    computed: [
      { name: 'addedWater', caption: 'Added Water', kind: 'text' },
      { name: 'removedWater', caption: 'Removed Water', kind: 'text' },
    ],
    listColumns: [
      { field: 'changeCode', width: 130 },
      { field: 'tankId' },
      { field: 'waterPreparationId', width: 140 },
      { field: 'addedWater' },
      { field: 'removedWater' },
      { field: 'changeDate', width: 120 },
      { field: 'notes' },
      { field: 'status' },
    ],
    defaultSort: { field: 'changeDate', desc: true },
    focusField: 'tankId',
    form: [
      row(
        { stack: ['changeCode', 'tankId', 'waterPreparationId', 'changeDate', 'status'], width: 50 },
        { stack: ['volumeRemoved', 'volumeUsed'], width: 50 },
      ),
      field('overrideNote'),
      field('notes'),
      { kind: 'widget', widget: 'alertSummary' },
      { kind: 'section', caption: 'Tank Readings', items: [{ kind: 'child', child: 'tankReadings' }] },
    ],
    formWidth: 920,
    children: [
      {
        name: 'tankReadings',
        entity: 'tankReading',
        foreignKey: 'waterChangeId',
        caption: 'Tank Readings',
        mode: 'list',
        columns: [{ field: 'readingDate' }, { field: 'tankId' }, { field: 'context' }],
        newDefaults: { waterChangeId: '@_id', tankId: '@tankId', context: 'BeforeWaterChange' },
        emptyText: 'No tank readings linked to this water change.',
      },
    ],
    code: { kind: 'WC', field: 'changeCode' },
  },
};

// Number fields paired with their unit selector on the Water Change form.
export const UNIT_PAIRS: Record<string, string> = {
  volumeRemoved: 'volumeRemovedUnit',
  volumeUsed: 'volumeUsedUnit',
};

export const ENTITY_LIST: EntityDef[] = Object.values(ENTITIES);

export function entityByPath(apiPath: string): EntityDef | undefined {
  return ENTITY_LIST.find((e) => e.apiPath === apiPath);
}

export function getField(def: EntityDef, name: string): FieldDef | undefined {
  return def.fields.find((x) => x.name === name);
}

export function getComputed(def: EntityDef, name: string): ComputedDef | undefined {
  return def.computed?.find((x) => x.name === name);
}

export function columnCaption(def: EntityDef, name: string): string {
  const fd = getField(def, name);
  if (fd) return fd.listCaption ?? fd.caption;
  return getComputed(def, name)?.caption ?? name;
}

export function formCaption(fd: FieldDef): string {
  return fd.formCaption ?? fd.caption;
}

export function getChild(def: EntityDef, name: string): ChildDef | undefined {
  return def.children?.find((c) => c.name === name);
}

// Persisted (non-system) fields.
export function dataFields(def: EntityDef): FieldDef[] {
  return def.fields.filter((x) => !x.system);
}

// Every (entity, field) that references the given entity.
export function referencesTo(target: EntityKey): { entity: EntityDef; field: FieldDef }[] {
  const out: { entity: EntityDef; field: FieldDef }[] = [];
  for (const e of ENTITY_LIST)
    for (const fd of e.fields) if (fd.type === 'ref' && fd.ref === target) out.push({ entity: e, field: fd });
  return out;
}

// Child relations that are deleted together with their parent.
export function cascadeChildren(def: EntityDef): ChildDef[] {
  return (def.children ?? []).filter((c) => c.mode === 'inline');
}
