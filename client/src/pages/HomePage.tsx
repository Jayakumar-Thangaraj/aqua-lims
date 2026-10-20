import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { enumCaption, formatDate, n2 } from '@aqualims/shared';
import { api } from '../api/client';
import { EntityIcon, HealthBadge, IconEmpty, IconPlus, IconSuccess, ResultStatusBadge } from '../components/Icons';

export function HomePage() {
  const navigate = useNavigate();
  const home = useQuery({ queryKey: ['home'], queryFn: () => api<any>('/home') });
  useEffect(() => {
    document.title = 'Home - Aqua LIMS';
  }, []);
  const data = home.data ?? {};

  return (
    <div className="page">
      <div className="page-title">
        <EntityIcon name="NAV_Home" size={20} variant="tile" />
        <h1>Home</h1>
      </div>

      <div className="quick-actions">
        {data.can?.sample && (
          <button type="button" className="btn" onClick={() => navigate('/samples/new')}>
            <IconPlus size={15} /> New Sample
          </button>
        )}
        {data.can?.tankReading && (
          <button type="button" className="btn" onClick={() => navigate('/tank-readings/new')}>
            <IconPlus size={15} /> New Tank Reading
          </button>
        )}
        {data.can?.waterPreparation && (
          <button type="button" className="btn" onClick={() => navigate('/water-preparations/new')}>
            <IconPlus size={15} /> New Water Preparation
          </button>
        )}
        {data.can?.waterChange && (
          <button type="button" className="btn btn-primary" onClick={() => navigate('/water-changes/new')}>
            <IconPlus size={15} /> New Water Change
          </button>
        )}
      </div>

      {home.isLoading && <p className="muted">Loading…</p>}

      {data.tanks && (
        <section>
          <h2 className="home-title">
            <EntityIcon name="BO_Tank" /> Tank health
          </h2>
          {data.tanks.length === 0 ? (
            <div className="empty-inline">
              <IconEmpty size={18} />
              <span>No active tanks yet.</span>
            </div>
          ) : (
            <div className="tank-cards">
              {data.tanks.map((t: any) => (
                <Link key={t._id} to={`/tanks/${t._id}`} className={`tank-card health-border-${t.level.toLowerCase()}`}>
                  <div className="tank-card-head">
                    <strong>{t.tankName}</strong>
                    <span className="muted">{t.tankCode}</span>
                  </div>
                  <HealthBadge level={t.level} />
                  <p className="tank-card-summary">{t.summary}</p>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {data.outOfRange && (
        <section>
          <h2 className="home-title">
            <EntityIcon name="BO_SampleParameter" /> Out-of-range results
          </h2>
          {data.outOfRange.length === 0 ? (
            <div className="empty-inline empty-ok">
              <IconSuccess size={18} />
              <span>No out-of-range results. All recent results are within their limits.</span>
            </div>
          ) : (
            <table className="grid-table inline">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Tank</th>
                  <th>From</th>
                  <th>Parameter</th>
                  <th className="num">Value</th>
                  <th>Limit</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.outOfRange.map((r: any, i: number) => (
                  <tr key={i} className="out-of-range clickable" onClick={() => navigate(r.kind === 'Sample' ? `/samples/${r.sourceId}` : `/tank-readings/${r.sourceId}`)}>
                    <td>{formatDate(r.at)}</td>
                    <td>{r.tank}</td>
                    <td>
                      {r.kind} {r.source}
                    </td>
                    <td>{r.parameter}</td>
                    <td className="num">
                      {n2(r.value)} {r.unit}
                    </td>
                    <td>{r.limitRange}</td>
                    <td>
                      <ResultStatusBadge status={r.resultStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {data.recentWaterChanges && (
        <section>
          <h2 className="home-title">
            <EntityIcon name="BO_WaterChange" /> Recent water changes
          </h2>
          {data.recentWaterChanges.length === 0 ? (
            <div className="empty-inline">
              <IconEmpty size={18} />
              <span>No water changes recorded yet.</span>
            </div>
          ) : (
            <table className="grid-table inline">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Tank</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.recentWaterChanges.map((c: any) => (
                  <tr key={c._id} className="clickable" onClick={() => navigate(`/water-changes/${c._id}`)}>
                    <td>{c.changeCode}</td>
                    <td>{c.tank}</td>
                    <td>{formatDate(c.changeDate)}</td>
                    <td>{enumCaption('WaterChangeStatus', c.status)}</td>
                    <td>{c.overrideUsed && <span className="badge badge-danger">Override note used</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  );
}
