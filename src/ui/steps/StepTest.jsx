import { useEffect, useRef, useState } from 'react';
import { Recorder, decodeAudio, createLevelMeter } from '../../audio.js';
import * as history from '../../history.js';
import { formatClock, uid } from '../../util.js';
import { Button, Callout, EmptyState, KindTag, ProgressBar, StepHeader, plural, useController, useToast } from '../common.jsx';
import { Icon } from '../icons.jsx';

const ROW_STATES = {
  waiting: { label: 'Laukia', tone: 'muted' },
  running: { label: 'Vykdoma…', tone: 'info' },
  done: { label: 'Baigta', tone: 'ok' },
  error: { label: 'Klaida', tone: 'bad' },
  skipped: { label: 'Praleista', tone: 'muted' },
};

function RunRow({ engine, row }) {
  const model = useController(engine.ctrl);
  const s = ROW_STATES[row?.state ?? 'waiting'];
  return (
    <li className={`run-row run-${row?.state ?? 'waiting'}`}>
      <div className="run-row-head">
        <span className="run-name">{engine.name}</span>
        <KindTag kind={engine.kind} />
        <span className={`pill pill-${s.tone}`}>
          {row?.state === 'running' && <span className="spinner" aria-hidden="true" />}
          {s.label}
        </span>
      </div>
      {row?.state === 'running' && model.busy && (
        <>
          <ProgressBar progress={model.progress} label={`${engine.name} paruošimas`} />
          <p className="run-detail">{model.detail}</p>
        </>
      )}
      {(row?.text || row?.interim) && (
        <p className="run-text">{row.text} {row.interim && <span className="interim">{row.interim}</span>}</p>
      )}
      {row?.error && <p className="run-error">{row.error}</p>}
    </li>
  );
}

export function StepTest({ step, total, engines, enginesState, language, phrase, prefs, clip, setClip, go }) {
  const toast = useToast();
  const recorder = useRef(null);
  const stopMeter = useRef(null);
  const timer = useRef(null);
  const abort = useRef(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [run, setRun] = useState({ status: 'idle', rows: {} });

  const included = engines.filter((e, i) => prefs.include[e.id] && e.isUsable(enginesState[i]));
  const clipValid = clip && clip.lang === language.code && clip.reference === phrase;
  const stale = clip && !clipValid;
  const running = run.status === 'running';

  useEffect(() => () => {
    clearInterval(timer.current);
    stopMeter.current?.();
  }, []);

  async function acceptBlob(blob, label) {
    setBusy(true);
    setError(null);
    try {
      const buffer = await decodeAudio(blob);
      if (buffer.duration < 0.5) throw new Error('Įrašas per trumpas. Pabandyk dar kartą.');
      const clipId = history.createClip({
        lang: language.code,
        reference: phrase,
        duration: buffer.duration,
        label: `${label} ${new Date().toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' })}`,
      });
      if (clip?.url) URL.revokeObjectURL(clip.url);
      setClip({ url: URL.createObjectURL(blob), buffer, clipId, lang: language.code, reference: phrase, duration: buffer.duration });
      setRun({ status: 'idle', rows: {} });
    } catch (err) {
      setError(err.message.startsWith('Įrašas') ? err.message : `Nepavyko nuskaityti garso: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function toggleRecording() {
    if (!recording) {
      setError(null);
      recorder.current = new Recorder();
      try {
        await recorder.current.start();
      } catch (err) {
        setError(`Nepavyko pasiekti mikrofono: ${err.message}`);
        return;
      }
      setRecording(true);
      setSeconds(0);
      const t0 = performance.now();
      timer.current = setInterval(() => setSeconds((performance.now() - t0) / 1000), 200);
      stopMeter.current = createLevelMeter(recorder.current.stream, setLevel);
      return;
    }
    clearInterval(timer.current);
    stopMeter.current?.();
    setRecording(false);
    setLevel(0);
    await acceptBlob(await recorder.current.stop(), 'Įrašas');
  }

  async function startRun() {
    const list = included;
    const batchId = uid();
    const controller = new AbortController();
    abort.current = controller;
    setRun({ status: 'running', rows: Object.fromEntries(list.map((e) => [e.id, { state: 'waiting' }])) });
    const patch = (id, p) => setRun((r) => ({ ...r, rows: { ...r.rows, [id]: { ...r.rows[id], ...p } } }));

    for (const engine of list) {
      if (controller.signal.aborted) {
        patch(engine.id, { state: 'skipped' });
        continue;
      }
      patch(engine.id, { state: 'running', text: '', interim: '' });
      let result;
      try {
        result = await engine.run(clip.buffer, {
          signal: controller.signal,
          onUpdate: (text, interim = '') => patch(engine.id, { text, interim }),
        });
      } catch (err) {
        result = { text: '', error: err?.name === 'AbortError' ? 'Sustabdyta.' : (err?.message ?? String(err)), timing: '' };
      }
      history.addRun({
        lang: language.code,
        clipId: clip.clipId,
        batchId,
        engineId: engine.id,
        engine: engine.name,
        kind: engine.kind,
        config: engine.configLabel(),
        text: result.text,
        error: result.error ?? null,
        timing: result.timing,
        seconds: result.seconds ?? null,
        audioSec: clip.duration,
      });
      patch(engine.id, { state: result.error ? 'error' : 'done', text: result.text, interim: '', error: result.error });
    }
    abort.current = null;
    setRun((r) => ({ ...r, status: 'done' }));
    toast('Testas baigtas. Rezultatai išsaugoti.');
  }

  const hint = recording
    ? 'Kalbėk… Paspausk, kai baigsi.'
    : busy ? 'Apdorojama…'
      : clipValid ? 'Įrašyta. Paspausk, jei nori įrašyti iš naujo.' : 'Paspausk ir perskaityk frazę.';

  return (
    <>
      <StepHeader step={step} total={total} title="Įrašyk ir paleisk testą"
        lead="Perskaityk frazę garsiai, tada visi pasirinkti varikliai perrašys tą patį įrašą." />

      <div className="test-grid">
        <section className="card record-card" aria-label="Įrašymas">
          <p className="eyebrow">Perskaityk garsiai</p>
          <blockquote className="phrase-quote" lang={language.code}>„{phrase}“</blockquote>

          <div className="recorder">
            <button type="button" className={`rec-btn ${recording ? 'on' : ''}`} onClick={toggleRecording}
              disabled={busy || running} aria-label={recording ? 'Stabdyti įrašymą' : 'Pradėti įrašymą'}>
              {recording ? <Icon.Stop size={30} /> : <Icon.Mic size={30} />}
            </button>
            <div className="rec-meta">
              <span className="rec-time">{formatClock(recording ? seconds : clipValid ? clip.duration : 0)}</span>
              <span className="rec-hint">{hint}</span>
              <div className="meter" aria-hidden="true"><span style={{ transform: `scaleX(${level})` }} /></div>
            </div>
          </div>

          {clipValid && <audio controls src={clip.url} className="player" />}
          {stale && !recording && (
            <Callout tone="warn">Frazė ar kalba pasikeitė po įrašymo. Įrašyk frazę iš naujo.</Callout>
          )}
          {error && <Callout tone="bad">{error}</Callout>}

          <label className="upload-link">
            <input type="file" accept="audio/*,video/*" className="visually-hidden" disabled={busy || recording || running}
              onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) acceptBlob(f, f.name); }} />
            <Icon.Upload size={15} /> arba įkelk garso failą
          </label>
        </section>

        <section className="card run-card" aria-label="Testas">
          <div className="run-head">
            <h2>Varikliai</h2>
            <Button variant="ghost" size="sm" onClick={() => go('models')} disabled={running}>Keisti</Button>
          </div>

          {included.length === 0 ? (
            <EmptyState title="Nėra paruoštų variklių"
              text="Pasirink bent vieną variklį ir, jei reikia, atsisiųsk jo modelį."
              action={<Button variant="primary" onClick={() => go('models')}>Pasirinkti modelius</Button>} />
          ) : (
            <ul className="run-list">
              {included.map((e) => <RunRow key={e.id} engine={e} row={run.rows[e.id]} />)}
            </ul>
          )}

          <div className="run-actions">
            {running ? (
              <Button onClick={() => abort.current?.abort()}><Icon.Stop size={14} /> Stabdyti</Button>
            ) : (
              <Button variant={run.status === 'done' ? 'default' : 'primary'} size="lg"
                disabled={!clipValid || included.length === 0 || recording || busy} onClick={startRun}>
                <Icon.Play size={16} /> {run.status === 'done' ? 'Paleisti dar kartą' : 'Paleisti testą'}
              </Button>
            )}
            {run.status === 'done' && (
              <Button variant="primary" size="lg" onClick={() => go('results')}>
                Žiūrėti rezultatus <Icon.ArrowRight size={16} />
              </Button>
            )}
          </div>
          {!clipValid && included.length > 0 && <p className="muted small center">Pirmiausia įrašyk frazę.</p>}
          {clipValid && run.status === 'idle' && included.length > 0 && (
            <p className="muted small center">Bus paleista {plural(included.length, ['variklis', 'varikliai', 'variklių'])} paeiliui.</p>
          )}
        </section>
      </div>
    </>
  );
}
