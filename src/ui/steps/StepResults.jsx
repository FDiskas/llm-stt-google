import * as history from '../../history.js';
import { diffWords } from '../../metrics.js';
import { Button, EmptyState, KindTag, StepHeader, percent, plural, useToast } from '../common.jsx';
import { Icon } from '../icons.jsx';

const toneOf = (v) => (v <= 0.1 ? 'good' : v <= 0.3 ? 'mid' : 'bad');

function Diff({ reference, text }) {
  return diffWords(reference, text).map((t, i) => {
    if (t.type === 'eq') return <span key={i}>{t.word} </span>;
    if (t.type === 'sub') return <span key={i}><mark className="d-sub" title={`turėjo būti: ${t.expected}`}>{t.word}</mark> </span>;
    if (t.type === 'ins') return <span key={i}><mark className="d-ins" title="papildomas žodis">{t.word}</mark> </span>;
    return <span key={i}><del className="d-del" title="praleistas žodis">{t.word}</del> </span>;
  });
}

function VoteButtons({ run }) {
  return (
    <div className="vote" role="group" aria-label="Įvertinimas">
      <button type="button" className={`vote-btn ${run.vote > 0 ? 'up' : ''}`} aria-pressed={run.vote > 0}
        title="Geras rezultatas" onClick={() => history.vote(run.id, 1)}>👍</button>
      <button type="button" className={`vote-btn ${run.vote < 0 ? 'down' : ''}`} aria-pressed={run.vote < 0}
        title="Blogas rezultatas" onClick={() => history.vote(run.id, -1)}>👎</button>
    </div>
  );
}

function Metric({ value, label, primary }) {
  return (
    <div className={`metric ${primary ? 'primary' : ''} m-${toneOf(value)}`}>
      <span className="metric-value">{percent(value)}</span>
      <span className="metric-label">{label}</span>
    </div>
  );
}

function ResultCard({ run, score, rank, best, reference }) {
  return (
    <article className={`result-card ${best ? 'best' : ''}`}>
      <div className="result-rank">{best ? <Icon.Trophy size={18} /> : rank}</div>
      <div className="result-main">
        <header className="result-head">
          <h3>{run.engine}</h3>
          <KindTag kind={run.kind} />
          {best && <span className="pill pill-ok">Tiksliausias</span>}
        </header>
        <p className="result-config">{run.config}{run.timing ? ` · ${run.timing}` : ''}</p>
        {score && (
          <div className="metrics">
            <Metric value={score.wer} label="žodžių klaidų" primary />
            <Metric value={score.cer} label="raidžių klaidų" />
            <Metric value={score.werNoDiacritics} label="žodžių klaidų be diakritikų" />
          </div>
        )}
        {run.text
          ? <p className="transcript">{reference ? <Diff reference={reference} text={run.text} /> : run.text}</p>
          : <p className="transcript muted">(tuščias rezultatas)</p>}
        {run.error && <p className="run-error">{run.error}</p>}
      </div>
      <VoteButtons run={run} />
    </article>
  );
}

function Leaderboard({ lang }) {
  const groups = history.aggregate(lang, { byConfig: true });
  if (!groups.length) return null;
  return (
    <div className="table-wrap">
      <table className="board">
        <thead>
          <tr><th>#</th><th>Variklis</th><th className="num">Testai</th><th className="num">👍</th><th className="num">👎</th><th className="num">Vid. žodžių klaidų</th></tr>
        </thead>
        <tbody>
          {groups.map((g, i) => (
            <tr key={g.key}>
              <td className="num">{i + 1}</td>
              <td><strong>{g.engine}</strong><div className="muted small">{g.config}</div></td>
              <td className="num" data-label="Testai">{g.runs}</td>
              <td className="num" data-label="👍">{g.up}</td>
              <td className="num" data-label="👎">{g.down}</td>
              <td className="num" data-label="Vid. klaidų">{g.avgWer == null ? '–' : percent(g.avgWer)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AllRuns({ lang }) {
  const runs = history.runsFor(lang);
  return (
    <ul className="all-runs">
      {runs.map((r) => {
        const s = history.scoreOf(r);
        return (
          <li key={r.id}>
            <span className="all-runs-when">{new Date(r.at).toLocaleString('lt-LT', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            <span className="all-runs-engine">{r.engine}</span>
            <span className="all-runs-text" title={r.text}>{r.text || r.error || '–'}</span>
            <span className="all-runs-wer">{s ? percent(s.wer) : '–'}</span>
            <VoteButtons run={r} />
            <button type="button" className="icon-btn" title="Ištrinti šį bandymą" aria-label="Ištrinti šį bandymą"
              onClick={() => history.removeRun(r.id)}><Icon.Trash size={15} /></button>
          </li>
        );
      })}
    </ul>
  );
}

export function StepResults({ step, total, language, clip, go }) {
  const toast = useToast();
  const batch = history.latestBatch(language.code);
  const allRuns = history.runsFor(language.code);

  const header = (
    <StepHeader step={step} total={total} title="Rezultatai"
      lead="Kuo mažesnis klaidų procentas, tuo geriau. Įvertink kiekvieną rezultatą: tavo balsai lems rekomendaciją." />
  );

  if (!batch) {
    return (
      <>
        {header}
        <EmptyState title="Dar nėra rezultatų" text={`Įrašyk frazę ir paleisk testą su ${language.gen} kalba.`}
          action={<Button variant="primary" onClick={() => go('test')}>Eiti į testą <Icon.ArrowRight size={16} /></Button>} />
      </>
    );
  }

  const reference = batch.clip?.reference?.trim() ?? '';
  const rows = batch.runs
    .map((run) => ({ run, score: history.scoreOf(run) }))
    .sort((a, b) => (a.score?.wer ?? Infinity) - (b.score?.wer ?? Infinity));
  const audioUrl = clip?.clipId === batch.clip?.id ? clip.url : null;

  return (
    <>
      {header}

      <section className="card reference-card">
        <label className="field">
          <span>Lyginama su šiuo tekstu</span>
          <input value={batch.clip?.reference ?? ''} lang={language.code}
            onChange={(e) => history.setReference(batch.clip.id, e.target.value)} />
        </label>
        <p className="muted small">Jei perskaitei kiek kitaip, pataisyk tekstą ir rezultatai persiskaičiuos.</p>
        {audioUrl && <audio controls src={audioUrl} className="player" />}
      </section>

      <div className="result-list">
        {rows.map(({ run, score }, i) => (
          <ResultCard key={run.id} run={run} score={score} rank={i + 1} reference={reference}
            best={i === 0 && !!score && rows.length > 1} />
        ))}
      </div>

      <p className="legend">
        <span><mark className="d-sub">žodis</mark> neteisingas</span>
        <span><mark className="d-ins">žodis</mark> papildomas</span>
        <span><del className="d-del">žodis</del> praleistas</span>
        <span>„be diakritikų“ nekreipia dėmesio į ą, č, ę, ė, į, š, ų, ū, ž</span>
      </p>

      <details className="card history">
        <summary>
          <span>Visa istorija ({language.gen} kalba)</span>
          <span className="muted small">{plural(allRuns.length, ['bandymas', 'bandymai', 'bandymų'])}</span>
        </summary>
        <Leaderboard lang={language.code} />
        <AllRuns lang={language.code} />
        <div className="row-between">
          <span className="muted small">
            {history.isSaved() ? 'Saugoma šioje naršyklėje (localStorage).' : 'Nepavyko išsaugoti: naršyklė blokuoja localStorage.'}
          </span>
          <div className="row">
            <Button size="sm" onClick={() => { if (confirm('Atstatyti visus balsus? Bandymai liks.')) { history.resetVotes(); toast('Balsai atstatyti'); } }}>
              Atstatyti balsus
            </Button>
            <Button size="sm" variant="danger" onClick={() => { if (confirm('Ištrinti visą bandymų istoriją ir balsus (visomis kalbomis)?')) { history.clearAll(); toast('Istorija išvalyta'); } }}>
              <Icon.Trash size={14} /> Išvalyti istoriją
            </Button>
          </div>
        </div>
      </details>
    </>
  );
}
