import { useEffect, useState } from 'react';
import { convertVolume, enumCaption, n2, type WidgetName } from '@aqualims/shared';
import { api, toQuery } from '../api/client';
import { HealthBadge, IconError, IconInfo, IconSuccess, IconWarning } from '../components/Icons';
import { Callout } from '../components/Modal';
import { useForm } from './FormContext';

function TankHealthWidget() {
  const { record, isNew } = useForm();
  if (isNew) return null;
  return (
    <div className="form-row" style={{ gridTemplateColumns: '1fr 2fr' }}>
      <div className="field">
        <span className="field-label">Health</span>
        <div className="readonly-value">
          <HealthBadge level={record?.healthLevel} />
        </div>
      </div>
      <div className="field">
        <span className="field-label">Health Detail</span>
        <div className="readonly-value">{record?.healthSummary || <span className="muted">—</span>}</div>
      </div>
    </div>
  );
}

function EffectiveLimitsWidget() {
  const { record, isNew } = useForm();
  if (isNew) return <Callout kind="info">Effective limits appear after the tank is saved.</Callout>;
  const limits: any[] = record?.effectiveLimits ?? [];
  const conflicts: string[] = record?.conflicts ?? [];
  return (
    <div className="effective-limits">
      <h4 className="sub-title">
        Effective limits <span className="muted">(saved values: species limits, strictest wins; overrides replace them)</span>
      </h4>
      {conflicts.length > 0 && (
        <Callout kind="warning">Species in this tank have no overlapping range for: {conflicts.join(', ')}</Callout>
      )}
      {limits.length === 0 ? (
        <p className="muted">No limits apply to this tank yet.</p>
      ) : (
        <table className="grid-table inline">
          <thead>
            <tr>
              <th>Parameter</th>
              <th className="num">LCL</th>
              <th className="num">UCL</th>
              <th>Unit</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {limits.map((l) => (
              <tr key={l.parameterCode} className={l.lcl > l.ucl ? 'out-of-range' : undefined}>
                <td>{l.parameterName}</td>
                <td className="num">{n2(l.lcl)}</td>
                <td className="num">{n2(l.ucl)}</td>
                <td>{l.unitSymbol}</td>
                <td>{l.source === 'Tank override' ? <strong>Tank override</strong> : l.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// Live comparison of the prepared water against the tank's limits (Water Change form).
function AlertSummaryWidget() {
  const { values, setExtra } = useForm();
  const [check, setCheck] = useState<any>(null);
  const [showText, setShowText] = useState(false);
  const tankId = values.tankId ?? '';
  const prepId = values.waterPreparationId ?? '';
  const note = values.overrideNote ?? '';

  useEffect(() => {
    const controller = new AbortController();
    const t = setTimeout(() => {
      api(`/water-changes/check${toQuery({ tankId, waterPreparationId: prepId, overrideNote: note })}`, { signal: controller.signal })
        .then((result) => {
          setCheck(result);
          setExtra('waterChangeCheck', result);
        })
        .catch(() => undefined);
    }, 250);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [tankId, prepId, note]); // eslint-disable-line react-hooks/exhaustive-deps

  const ready = tankId && prepId;
  return (
    <div className="field">
      <div className="field-label alert-head">
        Alert Summary
        {check && (
          <button type="button" className="link-btn" onClick={() => setShowText((s) => !s)}>
            {showText ? 'Show table' : 'Show plain text'}
          </button>
        )}
      </div>
      {!check ? (
        <div className="alert-panel">Checking…</div>
      ) : showText || !ready ? (
        <pre className="alert-text" aria-live="polite">{check.summaryText}</pre>
      ) : check.alerts.length === 0 ? (
        <div className="alert-panel alert-ok" aria-live="polite">
          <IconSuccess size={15} /> {check.summaryText}
        </div>
      ) : (
        <div className="alert-panel" aria-live="polite">
          <table className="grid-table inline">
            <thead>
              <tr>
                <th></th>
                <th>Parameter</th>
                <th className="num">Measured</th>
                <th>Limit</th>
                <th>Severity</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {check.alerts.map((a: any) => (
                <tr key={a.parameterCode} className={a.severity === 'OutOfRange' ? 'out-of-range' : 'borderline'}>
                  <td aria-hidden className="severity-icon">{a.severity === 'OutOfRange' ? <IconError size={14} /> : <IconWarning size={14} />}</td>
                  <td>{a.parameterName}</td>
                  <td className="num">
                    {n2(a.measuredValue)} {a.unitSymbol}
                  </td>
                  <td>
                    {n2(a.lcl)} – {n2(a.ucl)}
                  </td>
                  <td>{a.severity === 'OutOfRange' ? 'Out of range' : 'Borderline'}</td>
                  <td>{a.limitSource}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {check.requiresOverride && !note.trim() && (
            <Callout kind="danger">{check.criticalCount} critical issue(s) detected — an override note is required to save.</Callout>
          )}
        </div>
      )}
    </div>
  );
}

function PrepTotalWidget() {
  const { children, values } = useForm();
  const sources = children.sources ?? [];
  if (sources.length === 0) return null;
  const unit = values.volumeUnit ?? 'MilliLitre';
  const total = sources.reduce((sum, s) => sum + (Number(s.volume) || 0) * (convertVolume(1, s.volumeUnit ?? 'MilliLitre', unit) || 0), 0);
  return (
    <p className="hint">
      <IconInfo size={13} /> Total from sources: <strong>{n2(total)} {enumCaption('WaterVolumeUnit', unit)}</strong>
      {Math.abs(total - (Number(values.preparedVolume) || 0)) > 0.005 && ' (differs from Prepared Volume)'}
    </p>
  );
}

function ReadingHintWidget() {
  const { values, labels } = useForm();
  const [wcTank, setWcTank] = useState<string | null>(null);
  const wcId = values.waterChangeId;
  useEffect(() => {
    if (!wcId) {
      setWcTank(null);
      return;
    }
    api(`/water-changes/${wcId}`).then((wc) => setWcTank(wc.tankId)).catch(() => setWcTank(null));
  }, [wcId]);
  if (!wcId) return null;
  const hints: string[] = [];
  if (!['BeforeWaterChange', 'AfterWaterChange'].includes(values.context))
    hints.push(`This reading is linked to water change ${labels.waterChangeId ?? ''}, but its context is "${enumCaption('TankReadingContext', values.context)}".`);
  if (wcTank && values.tankId && wcTank !== values.tankId) hints.push("The linked water change is for a different tank.");
  if (hints.length === 0) return null;
  return (
    <Callout kind="warning">
      {hints.map((h) => (
        <div key={h}>{h}</div>
      ))}
    </Callout>
  );
}

export function Widget({ name }: { name: WidgetName }) {
  switch (name) {
    case 'tankHealth':
      return <TankHealthWidget />;
    case 'effectiveLimits':
      return <EffectiveLimitsWidget />;
    case 'alertSummary':
      return <AlertSummaryWidget />;
    case 'prepTotal':
      return <PrepTotalWidget />;
    case 'readingHint':
      return <ReadingHintWidget />;
  }
}
