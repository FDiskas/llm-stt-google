import { useEffect, useMemo, useRef, useState } from 'react';
import * as store from '../store.js';
import { Button, Callout, ProgressBar, StatusPill, Switch, ToastProvider, useController, useToast } from '../ui/common.jsx';
import { Icon } from '../ui/icons.jsx';
import { createTtsClient } from './client.js';
import { NEUTRAL_FX, PRESETS, StreamPlayer, isNeutral, renderOffline } from './effects.js';
import { DEFAULT_COMMA_PAUSE } from './lt/synth.js';
import { VOICES, voiceSizeMb } from './voices.js';
import { encodeWav, trimTail } from './wav.js';

const DEFAULT_PREFS = {
  text: 'Labas! Aš esu Reginutė, lietuviškas balsas, kuris veikia tiesiog tavo naršyklėje.',
  speed: 1,
  presetId: 'none',
  custom: NEUTRAL_FX,
  levelRate: true,
  commaPause: DEFAULT_COMMA_PAUSE,
};

const EXAMPLES = [
  { label: 'Pasisveikinimas', text: DEFAULT_PREFS.text },
  { label: 'Skaičiai ir datos', text: 'Susitikimas 2026 m. lapkričio 18 d. 15:30. Bilietas kainuoja 9,99 Eur, kasa dirba nuo 8:00 iki 17:00.' },
  { label: 'Santrumpos', text: 'LRT praneša, kad JAV ir ES susitarė, o NATO tam pritarė.' },
  { label: 'Ilgesnis tekstas', text: 'Vilnius yra Lietuvos sostinė. Jo senamiestis įtrauktas į UNESCO pasaulio paveldo sąrašą, o per metus jį aplanko daugiau nei 1 mln. turistų.\nVasarą temperatūra kartais pakyla iki 30 °C, todėl daugelis išvažiuoja prie jūros.' },
  { label: 'Greitakalbė', text: 'Geri vyrai geroj girioj gerą girą gėrė ir gerai gyveno.' },
];

const SLIDERS = [
  { key: 'pitch', label: 'Aukštis', min: 0.5, max: 2, step: 0.01, format: (v) => `${v.toFixed(2)}×` },
  { key: 'highpass', label: 'Žemų dažnių filtras', min: 0, max: 1500, step: 10, format: (v) => (v ? `${v} Hz` : 'išjungta') },
  { key: 'lowpass', label: 'Aukštų dažnių filtras', min: 0, max: 8000, step: 50, format: (v) => (v ? `${v} Hz` : 'išjungta') },
  { key: 'drive', label: 'Iškraipymas', min: 0, max: 1, step: 0.01, format: (v) => `${Math.round(v * 100)} %` },
  { key: 'robot', label: 'Robotas', min: 0, max: 200, step: 1, format: (v) => (v ? `${v} Hz` : 'išjungta') },
  { key: 'echo', label: 'Aidas', min: 0, max: 0.8, step: 0.01, format: (v) => `${Math.round(v * 100)} %` },
  { key: 'echoTime', label: 'Aido vėlinimas', min: 0.05, max: 1, step: 0.01, format: (v) => `${Math.round(v * 1000)} ms` },
  { key: 'reverb', label: 'Erdvė (reverb)', min: 0, max: 0.9, step: 0.01, format: (v) => `${Math.round(v * 100)} %` },
  { key: 'room', label: 'Erdvės dydis', min: 0.2, max: 6, step: 0.1, format: (v) => `${v.toFixed(1)} s` },
  { key: 'rotate', label: '8D sukimasis', min: 0, max: 1, step: 0.01, format: (v) => (v ? `${v.toFixed(2)} aps./s` : 'išjungta') },
  { key: 'volume', label: 'Garsumas', min: 0.2, max: 2, step: 0.01, format: (v) => `${Math.round(v * 100)} %` },
];

const num = (v, digits = 1) => v.toLocaleString('lt-LT', { minimumFractionDigits: digits, maximumFractionDigits: digits });

function concat(chunks) {
  const out = new Float32Array(chunks.reduce((s, c) => s + c.length, 0));
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function VoiceCard({ client }) {
  const state = useController(client.ctrl);
  const { voice } = client;
  const loaded = state.status === 'loaded';
  return (
    <section className="card tts-voice">
      <div className="tts-voice-head">
        <div>
          <p className="eyebrow">Balsas</p>
          <h2>{voice.name} <span className="muted small">· {voice.language}</span></h2>
        </div>
        <StatusPill status={state.status} />
      </div>
      <p className="muted">{voice.description}</p>
      <p className="small muted">
        Pirmą kartą atsisiunčiama ~{voiceSizeMb(voice)} MB (modelis, kirčių žodynas ir eSpeak NG), vėliau failai imami iš naršyklės talpyklos.
        {' '}Licencija: <a href={voice.url} target="_blank" rel="noreferrer">{voice.license}</a>.
      </p>
      {state.status === 'downloading' && (
        <div className="tts-progress">
          <ProgressBar progress={state.progress} label="Balso atsisiuntimas" />
          <span className="small muted">{state.detail}</span>
        </div>
      )}
      {state.status === 'error' && <Callout tone="bad">{state.detail}</Callout>}
      <div className="row">
        {!loaded && (
          <Button variant="primary" disabled={state.busy} onClick={() => client.load().catch(() => {})}>
            <Icon.Download size={16} /> {state.status === 'ready' ? 'Įkelti balsą' : `Atsisiųsti (${voiceSizeMb(voice)} MB)`}
          </Button>
        )}
        {(loaded || state.status === 'ready') && (
          <Button variant="ghost" className="btn-danger" disabled={state.busy} onClick={client.remove}>
            <Icon.Trash size={16} /> Ištrinti iš naršyklės
          </Button>
        )}
      </div>
    </section>
  );
}

function EffectsCard({ prefs, update, fx }) {
  const setCustom = (key, value) => update({ presetId: 'custom', custom: { ...fx, [key]: value } });
  return (
    <section className="card">
      <p className="eyebrow">Efektai</p>
      <div className="fx-grid" role="radiogroup" aria-label="Efektas">
        {PRESETS.map((p) => (
          <button key={p.id} type="button" role="radio" aria-checked={prefs.presetId === p.id}
            className={`fx-btn ${prefs.presetId === p.id ? 'selected' : ''}`}
            onClick={() => update({ presetId: p.id })}>
            {p.name}
          </button>
        ))}
        <button type="button" role="radio" aria-checked={prefs.presetId === 'custom'}
          className={`fx-btn ${prefs.presetId === 'custom' ? 'selected' : ''}`}
          onClick={() => update({ presetId: 'custom', custom: fx })}>
          Savas
        </button>
      </div>
      <details className="fx-custom">
        <summary>Koreguoti parametrus</summary>
        <div className="fx-sliders">
          {SLIDERS.map((s) => (
            <label key={s.key} className="fx-slider">
              <span>{s.label}</span>
              <input type="range" min={s.min} max={s.max} step={s.step} value={fx[s.key]}
                onChange={(e) => setCustom(s.key, Number(e.target.value))} />
              <output>{s.format(fx[s.key])}</output>
            </label>
          ))}
          <Switch checked={fx.keepTempo} onChange={(v) => setCustom('keepTempo', v)}
            label="Keičiant aukštį išlaikyti kalbėjimo tempą" />
        </div>
      </details>
    </section>
  );
}

function ResultCard({ result, fx, playing, onReplay, onStop }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  if (!result) return null;
  const { stats, samples, sampleRate, fragments } = result;
  const speedup = stats.elapsed ? stats.seconds / stats.elapsed : 0;

  const save = async () => {
    setSaving(true);
    try {
      let blob;
      if (isNeutral(fx)) {
        blob = encodeWav([samples], sampleRate);
      } else {
        const rendered = await renderOffline(samples, sampleRate, fx);
        const channels = trimTail([rendered.getChannelData(0), rendered.getChannelData(1)], rendered.sampleRate);
        blob = encodeWav(channels, rendered.sampleRate);
      }
      download(blob, `reginute-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.wav`);
    } catch (err) {
      toast(`Nepavyko išsaugoti: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card">
      <p className="eyebrow">Rezultatas</p>
      <p>
        {num(stats.seconds)} s garso sugeneruota per {num(stats.elapsed)} s
        {speedup > 0 && <span className="muted"> ({num(speedup)}× greičiau nei realiu laiku)</span>}
        {stats.cancelled && <span className="muted"> · sustabdyta</span>}
      </p>
      <div className="row tts-actions">
        {playing
          ? <Button onClick={onStop}><Icon.Stop size={14} /> Stabdyti</Button>
          : <Button onClick={onReplay}><Icon.Play size={14} /> Klausyti dar kartą</Button>}
        <Button onClick={save} disabled={saving}><Icon.Download size={16} /> {saving ? 'Ruošiama…' : 'Atsisiųsti WAV'}</Button>
      </div>
      {fragments.length > 0 && (
        <details className="tts-ipa">
          <summary>Kaip modelis mato tekstą (fonemos)</summary>
          <p className="small muted">Skaičiai ir santrumpos išplečiami žodžiais. Kirčio ženklai: ˈ tvirtapradė, ˌ tvirtagalė, ˋ trumpinė priegaidė.</p>
          <ol>
            {fragments.map((f, i) => (
              <li key={i}><span>{f.text}</span><code>{f.ipa}</code></li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}

export function TtsApp() {
  const [prefs, setPrefs] = useState(() => store.loadTtsPrefs(DEFAULT_PREFS));
  useEffect(() => { store.saveTtsPrefs(prefs); }, [prefs]);
  const update = (patch) => setPrefs((p) => ({ ...p, ...patch }));

  const client = useMemo(() => createTtsClient(VOICES[0]), []);
  const voiceState = useController(client.ctrl);
  useEffect(() => { client.refresh(); }, [client]);

  const fx = prefs.presetId === 'custom' ? prefs.custom : (PRESETS.find((p) => p.id === prefs.presetId) ?? PRESETS[0]).fx;

  const [speaking, setSpeaking] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const job = useRef(null);
  const player = useRef(null);

  const stopPlayback = () => {
    player.current?.stop();
    player.current = null;
    setPlaying(false);
  };

  const startPlayer = () => {
    stopPlayback();
    const p = new StreamPlayer(fx, () => { if (player.current === p) setPlaying(false); });
    player.current = p;
    setPlaying(true);
    return p;
  };

  const stop = () => {
    job.current?.cancel();
    stopPlayback();
  };

  const speak = async () => {
    const text = prefs.text.trim();
    if (!text) return;
    stop();
    setError(null);
    setSpeaking(true);
    try {
      await client.load();
      const lengthScale = (client.voice.lengthScale / prefs.speed) * (fx.keepTempo ? fx.pitch : 1);
      const p = startPlayer();
      const chunks = [];
      const fragments = [];
      setResult(null);
      const opts = { lengthScale, levelRate: prefs.levelRate, commaPause: prefs.commaPause };
      const current = client.speak(text, opts, (piece) => {
        chunks.push(piece.audio);
        p.push(piece.audio, client.sampleRate);
        if (piece.text) fragments.push({ text: piece.text, ipa: piece.ipa });
      });
      job.current = current;
      const stats = await current.done;
      p.finish();
      if (job.current === current) {
        setResult({ stats, samples: concat(chunks), sampleRate: client.sampleRate, fragments });
      }
    } catch (err) {
      stopPlayback();
      setError(err.message);
    } finally {
      setSpeaking(false);
    }
  };

  const replay = () => {
    if (!result) return;
    const p = startPlayer();
    p.push(result.samples, result.sampleRate);
    p.finish();
  };

  const busyVoice = voiceState.status === 'downloading';

  return (
    <ToastProvider>
      <div className="app">
        <header className="topbar topbar-split">
          <div className="brand">
            <span className="brand-mark"><Icon.Speaker size={16} /></span>
            <span className="brand-name">Kalbos sintezė</span>
            <span className="brand-sub">Lietuviškas balsas naršyklėje</span>
          </div>
          <a className="topnav" href="./">Kalbos atpažinimo testas <Icon.ArrowRight size={14} /></a>
        </header>

        <main className="content">
          <header className="step-head">
            <h1>Tekstas į kalbą</h1>
            <p className="lead">
              Viskas vyksta tavo naršyklėje: tekstas niekur nesiunčiamas. Skaičiai, datos ir santrumpos
              išplečiami žodžiais, o kirčiai ir priegaidės dedami pagal žodyną.
            </p>
          </header>

          <VoiceCard client={client} />

          <section className="card">
            <label className="field" htmlFor="tts-text">
              <span className="eyebrow">Tekstas</span>
            </label>
            <textarea id="tts-text" rows={6} value={prefs.text} onChange={(e) => update({ text: e.target.value })}
              placeholder="Įrašyk tekstą lietuviškai…" />
            <div className="row tts-examples">
              <span className="small muted">Pavyzdžiai:</span>
              {EXAMPLES.map((ex) => (
                <Button key={ex.label} size="sm" variant="ghost" onClick={() => update({ text: ex.text })}>{ex.label}</Button>
              ))}
            </div>
            <div className="field-row">
              <label className="fx-slider tts-speed">
                <span>Greitis</span>
                <input type="range" min={0.6} max={1.6} step={0.05} value={prefs.speed}
                  onChange={(e) => update({ speed: Number(e.target.value) })} />
                <output>{num(prefs.speed, 2)}×</output>
              </label>
              <label className="fx-slider tts-speed tts-pause" title="0: pauzę ties kableliu palikti modeliui">
                <span>Pauzė ties kableliu</span>
                <input type="range" min={0} max={0.6} step={0.05} value={prefs.commaPause}
                  onChange={(e) => update({ commaPause: Number(e.target.value) })} />
                <output>{prefs.commaPause ? `${num(prefs.commaPause, 2)} s` : 'modelio'}</output>
              </label>
              <Switch checked={prefs.levelRate} onChange={(v) => update({ levelRate: v })}
                label="Lyginti tempą tarp sakinių" />
            </div>
            {error && <Callout tone="bad">{error}</Callout>}
            <div className="row tts-actions">
              <Button variant="primary" size="lg" onClick={speak} disabled={speaking || busyVoice || !prefs.text.trim()}>
                {speaking ? <><span className="spinner" /> Generuojama…</> : <><Icon.Play size={16} /> Įgarsinti</>}
              </Button>
              {(speaking || playing) && <Button size="lg" onClick={stop}><Icon.Stop size={14} /> Stabdyti</Button>}
            </div>
          </section>

          <EffectsCard prefs={prefs} update={update} fx={fx} />

          <ResultCard result={result} fx={fx} playing={playing} onReplay={replay} onStop={stopPlayback} />

          <footer className="tts-credits small muted">
            <p>
              <b>Balsas „Reginutė“</b> (<a href="https://huggingface.co/RobertasTa/lt_LT-reginute1-medium" target="_blank" rel="noreferrer">RobertasTa/lt_LT-reginute1-medium</a>, CC-BY-4.0)
              apmokytas su LIEPA garsynu (2013–2015): Vilniaus universitetas su Lietuvių kalbos institutu, Lietuvos edukologijos
              universitetu ir Šiaulių universitetu; projekto vadovas prof. Laimutis Telksnys. Hugging Face'e paskelbė MEL DYNAMICS, MB
              (<a href="https://huggingface.co/datasets/meldynamics/liepa-tts" target="_blank" rel="noreferrer">meldynamics/liepa-tts</a>).
            </p>
            <p>
              Kirčių žodynas sudarytas iš <a href="https://huggingface.co/datasets/svogunas/g2p-lt-lexicon" target="_blank" rel="noreferrer">svogunas/g2p-lt-lexicon</a> (Arūnas
              Smaliukas, CC BY 4.0) ir LIEPA anotacijų. Fonemos: <a href="https://github.com/espeak-ng/espeak-ng" target="_blank" rel="noreferrer">eSpeak NG</a> (GPL-3.0).
              Sintezė: <a href="https://github.com/OHF-Voice/piper1-gpl" target="_blank" rel="noreferrer">Piper</a> per onnxruntime-web.
              Tarimo, skaičių ir sintezės taisyklės perkeltos iš balso autoriaus Python kodo (GPL-3.0).
            </p>
          </footer>
        </main>
      </div>
    </ToastProvider>
  );
}
