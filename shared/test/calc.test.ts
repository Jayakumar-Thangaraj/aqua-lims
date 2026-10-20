import { describe, expect, it } from 'vitest';
import {
  buildAlertSummary,
  checkReadings,
  classifyResult,
  classifySeverity,
  codePrefix,
  evaluateResult,
  formatCode,
  getTankHealth,
  highestSuffix,
  resolveEffectiveLimits,
  summarizeWaterChange,
  type CalcParameter,
  type CalcSpecies,
  type CalcTank,
} from '../src';

const P: Record<string, CalcParameter> = {
  pH: { code: 'pH', name: 'pH', defaultUnitSymbol: 'pH' },
  Temp: { code: 'Temp', name: 'Temperature', defaultUnitSymbol: '°C' },
  TDS: { code: 'TDS', name: 'Total Dissolved Solids', defaultUnitSymbol: 'ppm' },
  Cl2: { code: 'Cl2', name: 'Chlorine', defaultUnitSymbol: 'ppm' },
  NH3: { code: 'NH3', name: 'Ammonia', defaultUnitSymbol: 'ppm' },
  NO2: { code: 'NO2', name: 'Nitrite', defaultUnitSymbol: 'ppm' },
  NO3: { code: 'NO3', name: 'Nitrate', defaultUnitSymbol: 'ppm' },
  GH: { code: 'GH', name: 'General Hardness', defaultUnitSymbol: 'dGH' },
  KH: { code: 'KH', name: 'Carbonate Hardness', defaultUnitSymbol: 'dKH' },
  Fe: { code: 'Fe', name: 'Iron', defaultUnitSymbol: 'ppm' },
};

const sp = (speciesName: string, limits: [string, number, number][]): CalcSpecies => ({
  speciesName,
  parameterLimits: limits.map(([code, lcl, ucl]) => ({ parameter: P[code], lcl, ucl })),
});

const corydorasAeneus = sp('Corydoras aeneus', [['pH', 6, 8], ['Temp', 22, 30]]);
const corydorasAlbino = sp('Corydoras aeneus (Albino)', [['pH', 6, 8], ['Temp', 22, 30]]);
const neocaridina = sp('Neocaridina davidi', [
  ['Cl2', 0, 0], ['NH3', 0, 0], ['NO2', 0, 0], ['NO3', 0, 20], ['pH', 6, 8], ['TDS', 100, 300], ['Temp', 22, 30],
]);
const trilineatus = sp('Corydoras trilineatus', [['pH', 6, 8], ['TDS', 100, 300], ['Temp', 22, 30]]);
const dario = sp('Dario dario', [
  ['Cl2', 0, 0], ['GH', 50, 215], ['KH', 35, 143], ['NH3', 0, 0], ['NO2', 0, 0], ['NO3', 0, 20], ['pH', 6.5, 7.5], ['TDS', 100, 250], ['Temp', 20, 26],
]);
const betta = sp('Betta splendens', [['pH', 6, 8], ['TDS', 100, 300], ['Temp', 22, 30]]);

function t001(extra: Partial<CalcTank> = {}): CalcTank {
  return {
    tankName: 'River Setup Tank',
    tankSpecies: [corydorasAeneus, corydorasAlbino, neocaridina, trilineatus].map((species) => ({ species })),
    parameterOverrides: [{ parameter: P.pH, lcl: 6.0, ucl: 7.5 }],
    ...extra,
  };
}

function t002(extra: Partial<CalcTank> = {}): CalcTank {
  return {
    tankName: 'Nano Tank',
    tankSpecies: [{ species: dario }],
    parameterOverrides: [{ parameter: P.TDS, lcl: 150, ucl: 220 }],
    ...extra,
  };
}

const sample = (results: [string, number, string][]) => ({
  sampleParameters: results.map(([code, measuredValue, testedDate]) => ({ parameter: P[code], measuredValue, testedDate })),
});

const prepWP001 = { prepCode: 'WP-202608-001', readings: [{ parameter: P.TDS, measuredValue: 57, unitSymbol: null }] };

const limitsTable = (tank: CalcTank) =>
  Object.fromEntries([...resolveEffectiveLimits(tank).values()].map((l) => [l.code, [l.lcl, l.ucl, l.source]]));

describe('effective limits (§5.1)', () => {
  it('1. T001', () => {
    const t = limitsTable(t001());
    expect(t.pH).toEqual([6, 7.5, 'Tank override']);
    expect(t.Temp.slice(0, 2)).toEqual([22, 30]);
    expect(t.TDS.slice(0, 2)).toEqual([100, 300]);
    expect(t.Cl2.slice(0, 2)).toEqual([0, 0]);
    expect(t.NH3.slice(0, 2)).toEqual([0, 0]);
    expect(t.NO2.slice(0, 2)).toEqual([0, 0]);
    expect(t.NO3.slice(0, 2)).toEqual([0, 20]);
    expect(Object.keys(t)).toHaveLength(7);
  });

  it('2. T002', () => {
    const t = limitsTable(t002());
    expect(t.pH).toEqual([6.5, 7.5, 'Dario dario']);
    expect(t.TDS).toEqual([150, 220, 'Tank override']);
    expect(t.GH.slice(0, 2)).toEqual([50, 215]);
    expect(t.KH.slice(0, 2)).toEqual([35, 143]);
    expect(t.Temp.slice(0, 2)).toEqual([20, 26]);
    expect(t.NO3.slice(0, 2)).toEqual([0, 20]);
  });

  it('3. strictest window across species, source = species with the highest LCL', () => {
    const tank: CalcTank = {
      tankName: 'Mixed',
      tankSpecies: [{ species: sp('A', [['pH', 6, 8]]) }, { species: sp('B', [['pH', 6.5, 7.5]]) }],
      parameterOverrides: [],
    };
    expect(limitsTable(tank).pH).toEqual([6.5, 7.5, 'B']);
  });

  it('4. parameter code match is case-insensitive', () => {
    const lower: CalcParameter = { code: 'ph', name: 'pH', defaultUnitSymbol: 'pH' };
    const tank: CalcTank = { tankName: 'X', tankSpecies: [{ species: { speciesName: 'S', parameterLimits: [{ parameter: lower, lcl: 6, ucl: 7 }] } }], parameterOverrides: [] };
    const limits = resolveEffectiveLimits(tank);
    expect(evaluateResult(limits, P.pH, 6.5).resultStatus).toBe('OK');
  });
});

describe('result status (§5.2)', () => {
  const limits = resolveEffectiveLimits(t001());
  it('5. Sample 01 pH 6.5 on T001', () => {
    expect(evaluateResult(limits, P.pH, 6.5)).toMatchObject({ limitRange: '6.00 – 7.50', resultStatus: 'OK', isOutOfRange: false });
  });
  it('6. strict and inclusive', () => {
    expect(evaluateResult(limits, P.pH, 5.99)).toMatchObject({ resultStatus: 'Low', isOutOfRange: true });
    expect(evaluateResult(limits, P.pH, 7.51)).toMatchObject({ resultStatus: 'High', isOutOfRange: true });
    expect(classifyResult(6.0, 6, 7.5)).toBe('OK');
    expect(classifyResult(7.5, 6, 7.5)).toBe('OK');
  });
  it('7. no limit', () => {
    expect(evaluateResult(limits, P.Fe, 1)).toEqual({ limitRange: '', resultStatus: 'NoLimit', isOutOfRange: false });
  });
});

describe('tank health (§5.4)', () => {
  it('8. T001 with Sample 01 only is Stable', () => {
    expect(getTankHealth(t001({ samples: [sample([['pH', 6.5, '2026-10-14T11:53:09Z']])] }))).toEqual({
      level: 'Stable',
      summary: 'The latest result is within its limit.',
    });
  });
  it('9. T002 without results', () => {
    expect(getTankHealth(t002())).toEqual({ level: 'NoData', summary: 'No results yet for the parameters that have limits.' });
  });
  it('10. tank without limits', () => {
    expect(getTankHealth({ tankName: 'Empty', tankSpecies: [], parameterOverrides: [] })).toEqual({
      level: 'NoData',
      summary: 'No parameter limits set for this tank.',
    });
  });
  it('11. approaching a real lower bound', () => {
    expect(getTankHealth(t001({ samples: [sample([['pH', 6.1, '2026-10-14']])] }))).toEqual({
      level: 'Warning',
      summary: 'pH 6.10 near lower limit 6.00',
    });
  });
  it('12. approaching the upper bound; LCL 0 never warns low', () => {
    expect(getTankHealth(t001({ samples: [sample([['NO3', 18, '2026-10-14']])] }))).toEqual({
      level: 'Warning',
      summary: 'Nitrate 18.00 near upper limit 20.00',
    });
    expect(getTankHealth(t001({ samples: [sample([['NO3', 1, '2026-10-14']])] })).level).toBe('Stable');
  });
  it('13. zero-width limit never warns', () => {
    expect(getTankHealth(t001({ samples: [sample([['NH3', 0, '2026-10-14']])] })).level).toBe('Stable');
  });
  it('14. critical lists critical first, then approaching', () => {
    expect(getTankHealth(t001({ samples: [sample([['pH', 5.9, '2026-10-14'], ['NO3', 18, '2026-10-14']])] }))).toEqual({
      level: 'Critical',
      summary: 'pH 5.90 low (limit 6.00 – 7.50); Nitrate 18.00 near upper limit 20.00',
    });
  });
  it('15. only the latest result per parameter counts', () => {
    const tank = t001({ samples: [sample([['pH', 5.0, '2026-10-01'], ['pH', 7.0, '2026-10-10']])] });
    expect(getTankHealth(tank).level).toBe('Stable');
  });
  it('16. latest is decided across samples and tank readings', () => {
    const tank = t001({
      samples: [sample([['pH', 7.0, '2026-10-01']])],
      tankReadings: [{ readingDate: '2026-10-05', parameters: [{ parameter: P.pH, measuredValue: 5.5 }] }],
    });
    expect(getTankHealth(tank)).toEqual({ level: 'Critical', summary: 'pH 5.50 low (limit 6.00 – 7.50)' });
  });
  it('17. plural stable message', () => {
    const tank = t001({ samples: [sample([['pH', 7.0, '2026-10-01'], ['Temp', 25, '2026-10-01']])] });
    expect(getTankHealth(tank)).toEqual({ level: 'Stable', summary: 'All 2 latest results are within limits.' });
  });
});

describe('water change check (§5.3)', () => {
  it('18. WP-202608-001 vs T002 summary text', () => {
    const alerts = checkReadings(prepWP001, t002());
    expect(alerts).toEqual([
      {
        parameterName: 'Total Dissolved Solids',
        parameterCode: 'TDS',
        measuredValue: 57,
        lcl: 150,
        ucl: 220,
        severity: 'OutOfRange',
        limitSource: 'Tank override',
        unitSymbol: 'ppm',
      },
    ]);
    expect(buildAlertSummary(prepWP001, t002(), null)).toBe(
      [
        'Parameter check — WP-202608-001 vs Nano Tank',
        '',
        '  ✗  Total Dissolved Solids 57.00 ppm   limit: 150.00 – 220.00   [OUTOFRANGE]',
        '       Source: Tank override',
        '',
        '1 critical issue(s) detected — an override note is required to save.',
      ].join('\n'),
    );
  });
  it('19. the override note removes the last line and allows saving', () => {
    const blocked = summarizeWaterChange(prepWP001, t002(), '   ');
    expect(blocked).toMatchObject({ requiresOverride: true, canSave: false, criticalCount: 1 });
    const ok = summarizeWaterChange(prepWP001, t002(), 'Emergency');
    expect(ok.canSave).toBe(true);
    expect(ok.summaryText.endsWith('Source: Tank override')).toBe(true);
  });
  it('20. WP-202608-001 vs T001 (buffer 10)', () => {
    expect(checkReadings(prepWP001, t001())[0]).toMatchObject({ severity: 'OutOfRange', lcl: 100, ucl: 300 });
    expect(classifySeverity(95, 100, 300)).toBe('Borderline');
    expect(classifySeverity(89.99, 100, 300)).toBe('OutOfRange');
  });
  it('21. borderline uses max(5% of range, 0.1)', () => {
    expect(classifySeverity(7.55, 6, 7.5)).toBe('Borderline');
    expect(classifySeverity(7.6, 6, 7.5)).toBe('Borderline');
    expect(classifySeverity(7.65, 6, 7.5)).toBe('OutOfRange');
    const check = summarizeWaterChange({ prepCode: 'WP-1', readings: [{ parameter: P.pH, measuredValue: 7.55 }] }, t001(), '');
    expect(check).toMatchObject({ borderlineCount: 1, requiresOverride: false, canSave: true });
    expect(check.summaryText).toContain('  ⚠  pH                     7.55 pH   limit: 6.00 – 7.50   [BORDERLINE]');
  });
  it('22. placeholder and all-in-range texts', () => {
    expect(buildAlertSummary(null, t001(), null)).toBe('Select a tank and a prepared water batch to see the parameter comparison.');
    expect(buildAlertSummary({ prepCode: 'WP-1', readings: [{ parameter: P.pH, measuredValue: 7 }] }, t001(), null)).toBe(
      '✓ All checked parameters are within range for River Setup Tank.',
    );
  });
});

describe('codes (§5.5)', () => {
  it('23/24. prefix, padding and next sequence', () => {
    expect(codePrefix('WP', new Date(2026, 9, 19))).toBe('WP-202610-');
    expect(codePrefix('WC', new Date(2026, 0, 5))).toBe('WC-202601-');
    expect(formatCode('WP-202610-', 1)).toBe('WP-202610-001');
    expect(formatCode('WP-202610-', 1000)).toBe('WP-202610-1000');
    expect(highestSuffix('WP-202608-', ['WP-202608-001', 'WP-202608-002', 'WP-202607-009', null])).toBe(2);
  });
});

describe('copy-from-species fixture sanity', () => {
  it('Betta has three limits', () => {
    expect(betta.parameterLimits.map((l) => l.parameter?.code)).toEqual(['pH', 'TDS', 'Temp']);
  });
});
