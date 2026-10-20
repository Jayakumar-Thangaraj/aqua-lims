import mongoose, { Schema, type Model } from 'mongoose';
import { ENTITIES, ENTITY_LIST, dataFields, round4, type EntityDef, type EntityKey, type FieldDef } from '@aqualims/shared';
import { registerSystemModels } from './system';

export const CASE_INSENSITIVE = { locale: 'en', strength: 2 } as const;

export const COLLECTIONS: Record<EntityKey, string> = {
  measurementType: 'measurementTypes',
  unit: 'units',
  category: 'categories',
  parameter: 'parameters',
  aquaticEnvironment: 'aquaticEnvironments',
  waterSource: 'waterSources',
  treatmentType: 'treatmentTypes',
  speciesGroup: 'speciesGroups',
  species: 'species',
  speciesParameterLimit: 'speciesParameterLimits',
  tank: 'tanks',
  tankSpecies: 'tankSpecies',
  tankParameterOverride: 'tankParameterOverrides',
  sample: 'samples',
  sampleParameter: 'sampleParameters',
  tankReading: 'tankReadings',
  tankReadingParameter: 'tankReadingParameters',
  waterPreparation: 'waterPreparations',
  waterPrepSource: 'waterPrepSources',
  waterPrepTreatment: 'waterPrepTreatments',
  waterPrepReading: 'waterPrepReadings',
  waterChange: 'waterChanges',
};

const roundNumber = (v: unknown) => (v === null || v === undefined || v === '' ? null : round4(Number(v)));

function schemaPath(fd: FieldDef): Record<string, unknown> {
  switch (fd.type) {
    case 'string':
    case 'text':
      return { type: String, trim: true, default: null };
    case 'number':
      return { type: Number, set: roundNumber, default: fd.defaultValue ?? null };
    case 'integer':
      return { type: Number, default: fd.defaultValue ?? 0 };
    case 'boolean':
      return { type: Boolean, default: fd.defaultValue ?? false };
    case 'date':
      return { type: Date, default: null };
    case 'enum':
      return { type: String, default: fd.defaultValue ?? null };
    case 'ref':
      return { type: Schema.Types.ObjectId, ref: ENTITIES[fd.ref!].modelName, default: null };
  }
}

function buildSchema(def: EntityDef): Schema {
  const paths: Record<string, unknown> = {};
  for (const fd of dataFields(def)) paths[fd.name] = schemaPath(fd);
  paths.isDeleted = { type: Boolean, default: false };
  paths.deletedAt = { type: Date, default: null };
  paths.deletedBy = { type: String, default: null };
  paths.createdBy = { type: String, default: null };
  paths.updatedBy = { type: String, default: null };
  paths.legacyOid = { type: String, default: null };
  if (def.key === 'waterChange') paths.alertsSnapshot = { type: [Schema.Types.Mixed], default: [] };

  const schema = new Schema(paths as any, { timestamps: true, collection: COLLECTIONS[def.key], minimize: false });

  for (const fd of def.fields)
    if (fd.unique)
      schema.index(
        { [fd.name]: 1 },
        { unique: true, collation: CASE_INSENSITIVE, partialFilterExpression: { isDeleted: false }, name: `uniq_${fd.name}` },
      );
  for (const cu of def.compoundUnique ?? [])
    schema.index(Object.fromEntries(cu.fields.map((x) => [x, 1])), {
      unique: true,
      partialFilterExpression: { isDeleted: false },
      name: `uniq_${cu.fields.join('_')}`,
    });
  for (const fd of def.fields) if (fd.type === 'ref') schema.index({ [fd.name]: 1 });
  schema.index({ isDeleted: 1 });
  schema.index({ legacyOid: 1 }, { sparse: true });
  if (def.key === 'tankReading') schema.index({ tankId: 1, readingDate: -1 });
  if (def.key === 'waterChange') schema.index({ changeDate: -1 });
  if (def.key === 'waterPreparation') schema.index({ preparedDate: -1 });
  return schema;
}

let registered = false;

export function registerModels(): void {
  if (registered) return;
  for (const def of ENTITY_LIST)
    if (!mongoose.models[def.modelName]) mongoose.model(def.modelName, buildSchema(def));
  registerSystemModels();
  registered = true;
}

export function modelFor(key: EntityKey): Model<any> {
  registerModels();
  return mongoose.model(ENTITIES[key].modelName);
}
