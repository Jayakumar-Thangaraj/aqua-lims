import mongoose from 'mongoose';
import { codePrefix, highestSuffix, type EntityKey } from '@aqualims/shared';
import { config } from './config';
import { modelFor } from './models/registry';
import { Counter, Role, User } from './models/system';
import { hashPassword } from './services/auth';

const SEED_USER = 'seed';

// Built-in roles and accounts (XAF Updater.cs). Seeded accounts must change their password at first login.
export async function seedSecurity(): Promise<void> {
  let admins: any = await Role().findOne({ name: 'Administrators' });
  if (!admins) admins = await Role().create({ name: 'Administrators', isAdministrative: true, permissions: [] });
  let defaults: any = await Role().findOne({ name: 'Default' });
  if (!defaults) defaults = await Role().create({ name: 'Default', isAdministrative: false, permissions: [] });

  if (!(await User().findOne({ userName: 'Admin' })))
    await User().create({
      userName: 'Admin',
      passwordHash: await hashPassword(config.seedAdminPassword),
      changePasswordOnFirstLogon: true,
      roleIds: [admins._id],
    });
  if (!(await User().findOne({ userName: 'User' })))
    await User().create({
      userName: 'User',
      passwordHash: await hashPassword(config.seedUserPassword),
      changePasswordOnFirstLogon: true,
      roleIds: [defaults._id],
    });
}

async function insert(key: EntityKey, values: Record<string, unknown>): Promise<mongoose.Types.ObjectId> {
  const [doc] = await modelFor(key).create([{ ...values, createdBy: SEED_USER, updatedBy: SEED_USER }]);
  return doc._id as mongoose.Types.ObjectId;
}

const UNITS: [string, string, string, number, string, boolean][] = [
  ['pH', 'pH', 'pH', 1, 'Measures hydrogen ion concentration; scale 0–14.', true],
  ['Litre', 'L', 'Volume', 1, 'Standard metric volume unit for tank capacity, water prep batches, and sample collection', true],
  ['Gram', 'g', 'Mass', 1, 'Standard unit for measuring dry treatment products such as salts and mineral supplements', true],
  ['Celsius', '°C', 'Temperature', 1, 'Standard metric temperature unit used in most aquarium equipment and scientific references', true],
  ['Parts Per Million', 'ppm', 'Concentration', 1, 'Mass of solute per million parts of solution by weight; standard unit for NH₃, NO₂, NO₃, TDS', true],
  ['Degrees of General Hardness', 'dGH', 'Hardness', 1, 'Measures total dissolved calcium and magnesium; 1 dGH = 17.9 ppm CaCO₃', true],
  ['Fahrenheit', '°F', 'Temperature', 2, 'Imperial temperature unit; used in some US equipment readings', false],
  ['Degrees of Carbonate Hardness', 'dKH', 'Hardness', 2, 'Measures bicarbonate and carbonate ions; indicates buffering capacity and pH stability', true],
  ['Milligram', 'mg', 'Mass', 2, 'Used for very small treatment doses and medication calculations', true],
  ['Millilitre', 'mL', 'Volume', 2, 'Used for small sample volumes and precise treatment dosing', true],
  ['Milligrams per Litre', 'mg/L', 'Concentration', 2, 'Equivalent to ppm in dilute aqueous solutions; used in lab reports and scientific documentation', true],
  ['Gallon (US)', 'gal', 'Volume', 3, 'Imperial volume unit; 1 US gal = 3.785 L; used on some equipment and product labels', false],
  ['Parts Per Billion', 'ppb', 'Concentration', 3, 'Used for trace element testing such as copper, iron, and phosphate at very low levels', true],
];

const CATEGORIES: [string, string][] = [
  ['Disease & Treatment', 'Parameters monitored during medication or disease outbreak; copper levels, salt concentration'],
  ['Dissolved Solids', 'Total dissolved solids and conductivity measurements indicating overall mineral load'],
  ['Hardness', 'Calcium, magnesium, and carbonate levels affecting pH stability and livestock health'],
  ['Nitrogen Cycle', 'Parameters tracking the biological nitrogen cycle; ammonia, nitrite, and nitrate produced by livestock waste'],
  ['Physical', 'Non-chemical properties such as temperature, turbidity, and salinity'],
  ['Trace Elements', 'Minerals required in small quantities; iron, copper, iodine, and similar micronutrients'],
  ['Water Chemistry', 'Core chemical properties of water including pH and carbon dioxide'],
];

const PARAMETERS: [string, string, string, string, string | null][] = [
  ['Ammonia', 'NH3', 'Nitrogen Cycle', 'ppm', 'Toxic waste produced by livestock and decaying organic matter.'],
  ['General Hardness', 'GH', 'Hardness', 'dGH', 'Measures dissolved calcium and magnesium affecting livestock osmoregulation.'],
  ['Iron', 'Fe', 'Trace Elements', 'ppm', 'Essential micronutrient required for healthy aquatic plant growth'],
  ['Nitrate', 'NO3', 'Nitrogen Cycle', 'ppm', 'End product of the nitrogen cycle, controlled via regular water changes.'],
  ['Carbonate Hardness', 'KH', 'Hardness', 'dKH', 'Buffering capacity that stabilizes water against pH crashes.'],
  ['Chlorine', 'Cl2', 'Water Chemistry', 'ppm', 'Disinfectant found in tap water that is toxic to beneficial bacteria and livestock.'],
  ['pH', 'pH', 'Water Chemistry', 'pH', null],
  ['Temperature', 'Temp', 'Physical', '°C', null],
  ['Carbon Dioxide', 'CO2', 'Water Chemistry', 'ppm', 'Dissolved gas level critical for plant growth and livestock respiration'],
  ['Total Dissolved Solids', 'TDS', 'Dissolved Solids', 'ppm', null],
  ['Copper', 'Cu', 'Disease & Treatment', 'ppm', 'Active element in medications, lethal to invertebrates at low levels.'],
  ['Nitrite', 'NO2', 'Nitrogen Cycle', 'ppm', 'Intermediate nitrogen cycle byproduct highly toxic to aquatic life'],
];

const ENVIRONMENTS: [string, string, boolean][] = [
  ['Brackish', 'A mix of fresh water and salt water, mimicking coastal environments where rivers meet the sea.', false],
  ['Freshwater', 'Contains zero to trace amounts of dissolved salts. Mimics natural inland water bodies such as river.', true],
  ['Marine', 'Fully ocean-like water conditions with high concentrations of dissolved salts (~35 ppt).', false],
];

const WATER_SOURCES: [string, string][] = [
  ['Borehole / Well Water', 'Groundwater pumped on-site. Mineral composition varies by location; requires baseline testing before use.'],
  ['Dechlorinated Tap Water', 'Tap water treated to neutralise chlorine and chloramine. Most common direct-use freshwater source in hobby and facility settings.'],
  ['Deionised (DI) Water', 'Ion exchange removes dissolved ions. Lab-grade purity for water preparation and reagent mixing.'],
  ['Distilled Water', 'Heat-vaporised and condensed water. Removes most impurities. Used in labs and as a substitute for RO where RO units are unavailable.'],
  ['Natural Seawater', 'Collected ocean water. Used in marine facilities for direct top-up or as a culture medium. Requires pathogen screening before use.'],
  ['Packaged Drinking Water', 'Purified and packaged drinking water treated through filtration and disinfection processes.\nContains a controlled level of dissolved minerals'],
  ['Rainwater', 'Collected surface water. Naturally soft and low TDS but may carry contaminants. Used in planted and biotope tanks.'],
  ['RO Water', 'Reverse osmosis filtered water. Removes ~95-99% of dissolved solids. Standard starting point for freshwater and marine tanks.'],
  ['RO/DI Water', 'Reverse osmosis followed by deionisation. Near-zero TDS. Used where maximum purity is required (marine, sensitive species, lab prep).'],
  ['Spring Water', 'Naturally mineralised water from a spring source. Used as a quality freshwater option where RO is unavailable.'],
  ['Tap Water', 'Untreated municipal supply. Requires dechlorination before aquatic use. Baseline source in most facilities.'],
];

const TREATMENTS: [string, string][] = [
  ['Bacterial Boosting', 'Cycle support & waste reduction'],
  ['Clarifying', 'Fixes cloudy water'],
  ['Dechlorination', 'Removes chlorine and chloramine from tap water'],
  ['Demineralisation', 'Removes dissolved minerals and salts from water'],
  ['Fertilization', 'Feeds plants or corals'],
  ['Medication', 'Eradicates disease & parasites'],
  ['Mineralisation', 'Adds essential minerals and trace elements to purified water'],
  ['pH Adjustment', 'Raises or lowers pH to reach the target level'],
  ['Salinity Adjustment', 'Adjusts salt concentration for marine or brackish systems'],
];

const GROUPS: [string, string][] = [
  ['Betta', 'Labyrinth fish; males are territorial and cannot be housed together'],
  ['Corydoras', 'Armoured bottom-dwelling catfish; peaceful scavengers best kept in groups of six or more'],
  ['Dario', 'Freshwater micro-predators with vibrant male coloration; all share micro-live-food requirements and micro-territorial behavior.'],
  ['Neocaridina', 'Freshwater dwarf shrimp with many colour morphs; all share identical water parameters'],
];

const SPECIES: [string, string, string, string, boolean][] = [
  ['Betta splendens', 'Betta', 'Betta', 'Vibrant labyrinth fish; requires warm still water', false],
  ['Corydoras aeneus', 'Green Bronze Cory', 'Corydoras', 'Metallic green-bronze sheen; one of the hardiest and most adaptable corys', true],
  ['Corydoras aeneus (Albino)', 'Albino Cory', 'Corydoras', 'Captive-bred albino form of Bronze Cory; very hardy and peaceful bottom dweller', true],
  ['Corydoras trilineatus', 'Leopard Cory', 'Corydoras', 'Spotted pattern resembling a leopard; often confused with Julii Cory', true],
  ['Dario dario', 'Scarlet Badis', 'Dario', 'Compact nano badis with vibrant red bars; requires live micro-foods and plants.', true],
  ['Neocaridina davidi', 'Cherry Shrimp', 'Neocaridina', 'Dwarf shrimp in red, blue and black morphs; all variants share identical water parameters', true],
];

// [code, LCL, Ideal, UCL, unit symbol]
const LIMITS: Record<string, [string, number, number, number, string][]> = {
  'Betta splendens': [['pH', 6, 7, 8, 'pH'], ['TDS', 100, 200, 300, 'ppm'], ['Temp', 22, 26, 30, '°C']],
  'Corydoras aeneus': [['pH', 6, 7, 8, 'pH'], ['Temp', 22, 26, 30, '°C']],
  'Corydoras aeneus (Albino)': [['pH', 6, 7, 8, 'pH'], ['Temp', 22, 26, 30, '°C']],
  'Corydoras trilineatus': [['pH', 6, 7, 8, 'pH'], ['TDS', 100, 200, 300, 'ppm'], ['Temp', 22, 26, 30, '°C']],
  'Dario dario': [
    ['Cl2', 0, 0, 0, 'ppm'], ['GH', 50, 107, 215, 'ppm'], ['KH', 35, 71, 143, 'ppm'], ['NH3', 0, 0, 0, 'ppm'], ['NO2', 0, 0, 0, 'ppm'],
    ['NO3', 0, 10, 20, 'ppm'], ['pH', 6.5, 7, 7.5, 'pH'], ['TDS', 100, 150, 250, 'ppm'], ['Temp', 20, 23, 26, '°C'],
  ],
  'Neocaridina davidi': [
    ['Cl2', 0, 0, 0, 'ppm'], ['NH3', 0, 0, 0, 'ppm'], ['NO2', 0, 0, 0, 'ppm'], ['NO3', 0, 10, 20, 'ppm'], ['pH', 6, 7, 8, 'pH'],
    ['TDS', 100, 200, 300, 'ppm'], ['Temp', 22, 26, 30, '°C'],
  ],
};

export interface SeedOptions {
  demo?: boolean;
}

export async function isDomainDataPresent(): Promise<boolean> {
  return (await modelFor('parameter').countDocuments()) > 0;
}

// Reference data from the XAF database (spec §13), plus demo transactions when asked.
export async function seedReferenceData(options: SeedOptions = { demo: true }): Promise<void> {
  const mt: Record<string, mongoose.Types.ObjectId> = {};
  for (const name of ['Concentration', 'Hardness', 'Mass', 'pH', 'Temperature', 'Volume'])
    mt[name] = await insert('measurementType', { measurementTypeName: name, active: true });

  const unit: Record<string, mongoose.Types.ObjectId> = {};
  for (const [unitName, unitSymbol, type, sortOrder, description, active] of UNITS)
    unit[unitSymbol] = await insert('unit', { unitName, unitSymbol, measurementTypeId: mt[type], sortOrder, description, active });

  const category: Record<string, mongoose.Types.ObjectId> = {};
  for (const [categoryName, description] of CATEGORIES) category[categoryName] = await insert('category', { categoryName, description, active: true });

  const param: Record<string, mongoose.Types.ObjectId> = {};
  for (const [parameterName, parameterCode, cat, symbol, description] of PARAMETERS)
    param[parameterCode] = await insert('parameter', {
      parameterName,
      parameterCode,
      categoryId: category[cat],
      defaultUnitId: unit[symbol],
      description,
      sortOrder: 0,
      active: true,
    });

  const env: Record<string, mongoose.Types.ObjectId> = {};
  for (const [environment, description, active] of ENVIRONMENTS) env[environment] = await insert('aquaticEnvironment', { environment, description, active });

  const source: Record<string, mongoose.Types.ObjectId> = {};
  for (const [name, description] of WATER_SOURCES) source[name] = await insert('waterSource', { source: name, description });

  const treatment: Record<string, mongoose.Types.ObjectId> = {};
  for (const [treatmentTypeName, description] of TREATMENTS)
    treatment[treatmentTypeName] = await insert('treatmentType', { treatmentTypeName, description, active: true });

  const group: Record<string, mongoose.Types.ObjectId> = {};
  for (const [groupName, description] of GROUPS) group[groupName] = await insert('speciesGroup', { groupName, description, active: true });

  const species: Record<string, mongoose.Types.ObjectId> = {};
  for (const [speciesName, commonName, g, description, active] of SPECIES)
    species[speciesName] = await insert('species', { speciesName, commonName, speciesGroupId: group[g], description, active });

  for (const [speciesName, limits] of Object.entries(LIMITS))
    for (const [code, lcl, optimalValue, ucl, symbol] of limits)
      await insert('speciesParameterLimit', { speciesId: species[speciesName], parameterId: param[code], lcl, optimalValue, ucl, unitId: unit[symbol], active: true });

  const t001 = await insert('tank', { tankCode: 'T001', tankName: 'River Setup Tank', volume: 20, sourceId: env.Freshwater, notes: 'A basic river tank with shrimps and corys.', active: true });
  const t002 = await insert('tank', { tankCode: 'T002', tankName: 'Nano Tank', volume: 13, sourceId: env.Freshwater, notes: 'Low tech nano tank', active: true });
  for (const name of ['Corydoras aeneus', 'Corydoras aeneus (Albino)', 'Neocaridina davidi', 'Corydoras trilineatus'])
    await insert('tankSpecies', { tankId: t001, speciesId: species[name], active: true });
  await insert('tankSpecies', { tankId: t002, speciesId: species['Dario dario'], active: true });
  await insert('tankParameterOverride', { tankId: t002, parameterId: param.TDS, lcl: 150, ucl: 220, active: true });
  await insert('tankParameterOverride', { tankId: t001, parameterId: param.pH, lcl: 6.0, ucl: 7.5, active: true });

  if (options.demo) {
    const wp = await insert('waterPreparation', {
      prepCode: 'WP-202608-001',
      preparedDate: new Date('2026-08-19T00:00:00'),
      preparedVolume: 2,
      volumeUnit: 'Litre',
      status: 'Used',
      notes: 'Emergency preparation to reduce the sudden TDS spike',
    });
    await insert('waterPrepSource', { waterPreparationId: wp, sourceId: source['Packaged Drinking Water'], volume: 2, volumeUnit: 'Litre' });
    await insert('waterPrepTreatment', { waterPreparationId: wp, treatmentTypeId: treatment.Dechlorination, amountUsed: 0.5, amountUnitId: unit.mL, appliedDate: new Date('2026-08-19T17:20:09') });
    await insert('waterPrepReading', { waterPreparationId: wp, parameterId: param.TDS, measuredValue: 57, readingDate: new Date('2026-08-19T23:18:12'), active: true });

    const s01 = await insert('sample', { sampleCode: '01', tankId: t001, collectedDate: new Date('2026-10-14T11:53:09'), volume: 100, status: 'Pending', active: true });
    await insert('sampleParameter', { sampleId: s01, parameterId: param.pH, measuredValue: 6.5, testedDate: new Date('2026-10-14T11:53:09'), active: true });
  }
  await initCounters();
}

// Counters start at the highest existing code per month.
export async function initCounters(): Promise<void> {
  for (const [key, field, kind] of [['waterPreparation', 'prepCode', 'WP'], ['waterChange', 'changeCode', 'WC']] as const) {
    const docs = await modelFor(key).find({ [field]: { $regex: `^${kind}-` } }).select(field).lean();
    const prefixes = new Set((docs as any[]).map((d) => String(d[field]).slice(0, codePrefix(kind).length)));
    for (const prefix of prefixes) {
      const max = highestSuffix(prefix, (docs as any[]).map((d) => d[field]));
      await Counter().updateOne({ _id: prefix }, { $max: { seq: max } }, { upsert: true });
    }
  }
}

export async function clearDomainData(): Promise<void> {
  const names = Object.keys(mongoose.models).filter((n) => !['User', 'Role', 'ViewSetting'].includes(n));
  for (const name of names) await mongoose.model(name).deleteMany({});
}
