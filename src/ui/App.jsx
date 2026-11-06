import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { languageByCode } from '../languages.js';
import * as store from '../store.js';
import * as history from '../history.js';
import * as WS from '../engines/webSpeech.js';
import * as PA from '../engines/promptApi.js';
import { createEngines } from '../engines/catalog.js';
import { chromeMajorVersion } from '../util.js';
import { Stepper, STEPS } from './Stepper.jsx';
import { Button, Callout, ToastProvider, plural, truncate, useEnginesState } from './common.jsx';
import { Icon } from './icons.jsx';
import { StepLanguage } from './steps/StepLanguage.jsx';
import { StepPhrase } from './steps/StepPhrase.jsx';
import { StepModels } from './steps/StepModels.jsx';
import { StepTest } from './steps/StepTest.jsx';
import { StepResults } from './steps/StepResults.jsx';
import { StepRecommend } from './steps/StepRecommend.jsx';

const DEFAULT_PREFS = {
  lang: 'lt',
  phrase: {},
  include: { nano: true, 'ws-local': true, 'parakeet-v3': true, 'parakeet-v3-lt': true, 'ws-cloud': false },
  prompt: '',
  chunkSec: 20,
  quality: 'dictation',
};

const NEXT_LABEL = {
  language: 'Toliau: frazė',
  phrase: 'Toliau: modeliai',
  models: 'Toliau: testas',
  test: 'Rezultatai',
  results: 'Rekomendacijos',
};

function readStep() {
  const id = decodeURIComponent(location.hash.slice(1));
  return STEPS.some((s) => s.id === id) ? id : STEPS[0].id;
}

/** Current step lives in the URL hash, so browser back/forward also navigate the wizard. */
function useHashStep() {
  const [step, setStep] = useState(readStep);
  useEffect(() => {
    const onChange = () => setStep(readStep());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const go = useCallback((id) => {
    if (readStep() !== id || !location.hash) location.hash = id;
  }, []);
  return [step, go];
}

function EnvironmentWarning() {
  const version = chromeMajorVersion();
  const problems = [];
  if (!isSecureContext) problems.push('Puslapis turi būti atidarytas per https arba localhost.');
  if (version == null) problems.push('Šie modeliai veikia tik Google Chrome naršyklėje.');
  else if (version < 139) problems.push(`Tavo Chrome ${version} per senas: reikia 139 ar naujesnio.`);
  if (!PA.supported && !WS.supported) problems.push('Naršyklė neturi nei Prompt API, nei Web Speech API.');
  if (!problems.length) return null;
  return <Callout tone="bad">{problems.join(' ')}</Callout>;
}

export function App() {
  const [prefs, setPrefs] = useState(() => store.loadPrefs(DEFAULT_PREFS));
  useEffect(() => { store.savePrefs(prefs); }, [prefs]);
  const updatePrefs = useCallback((patch) => {
    setPrefs((p) => ({ ...p, ...(typeof patch === 'function' ? patch(p) : patch) }));
  }, []);

  const language = languageByCode(prefs.lang);
  const [samples, setSamples] = useState(() => store.loadSamples(language.code, language.samples));
  const [samplesSaved, setSamplesSaved] = useState(true);
  useEffect(() => { setSamples(store.loadSamples(language.code, language.samples)); }, [language]);
  const phraseIndex = Math.min(prefs.phrase[language.code] ?? 0, samples.length - 1);
  const phrase = (samples[phraseIndex] ?? '').trim();

  const [clip, setClip] = useState(null);

  const ctx = useRef();
  ctx.current = { language, prefs };
  const engines = useMemo(() => createEngines(() => ctx.current), []);
  const enginesState = useEnginesState(engines);

  // Availability depends on the language (and pack quality), so re-check when they change.
  useEffect(() => {
    engines.forEach((e) => e.ctrl.act(() => e.refresh()));
  }, [engines, language.code, prefs.quality]);

  useSyncExternalStore(history.subscribe, history.getVersion);

  const [step, go] = useHashStep();
  const index = STEPS.findIndex((s) => s.id === step);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.getElementById(`step-title-${index + 1}`)?.focus({ preventScroll: true });
  }, [index]);

  const selectedCount = engines.filter((e, i) => prefs.include[e.id] && e.isUsable(enginesState[i])).length;
  const batch = history.latestBatch(language.code);
  const best = history.aggregate(language.code)[0];
  const clipValid = clip && clip.lang === language.code && clip.reference === phrase;
  const summaries = {
    language: language.name,
    phrase: phrase ? `„${truncate(phrase, 18)}“` : null,
    models: plural(selectedCount, ['pasirinktas', 'pasirinkti', 'pasirinktų']),
    test: clipValid ? `Įrašas ${clip.duration.toFixed(1)} s` : null,
    results: batch ? plural(batch.runs.length, ['rezultatas', 'rezultatai', 'rezultatų']) : null,
    recommend: best?.engine ?? null,
  };
  const done = {
    language: true,
    phrase: !!phrase,
    models: selectedCount > 0,
    test: !!batch,
    results: !!batch,
    recommend: false,
  };

  const editSample = (i, text) => {
    const next = samples.map((s, j) => (j === i ? text : s));
    setSamples(next);
    setSamplesSaved(store.saveSamples(language.code, next));
  };
  const resetSamples = () => {
    if (!confirm(`Atkurti numatytas ${language.gen} kalbos frazes? Tavo pakeitimai bus prarasti.`)) return;
    store.resetSamples(language.code);
    setSamples([...language.samples]);
  };

  const total = STEPS.length;
  const common = { total, go };

  return (
    <ToastProvider>
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark"><Icon.Mic size={16} /></span>
            <span className="brand-name">Kalbos atpažinimo testas</span>
            <span className="brand-sub">Chrome modeliai</span>
          </div>
        </header>

        <Stepper current={step} summaries={summaries} done={done} onGo={go} />

        <main className="content">
          <EnvironmentWarning />

          <section className="step" hidden={step !== 'language'}>
            <StepLanguage {...common} step={1} language={language}
              onSelect={(code) => updatePrefs({ lang: code })} />
          </section>
          <section className="step" hidden={step !== 'phrase'}>
            <StepPhrase {...common} step={2} language={language} samples={samples} phraseIndex={phraseIndex}
              saved={samplesSaved}
              onSelect={(i) => updatePrefs((p) => ({ phrase: { ...p.phrase, [language.code]: i } }))}
              onEdit={editSample} onReset={resetSamples} />
          </section>
          <section className="step" hidden={step !== 'models'}>
            <StepModels {...common} step={3} active={step === 'models'} engines={engines}
              language={language} prefs={prefs} updatePrefs={updatePrefs} />
          </section>
          <section className="step" hidden={step !== 'test'}>
            <StepTest {...common} step={4} engines={engines} enginesState={enginesState} language={language}
              phrase={phrase} prefs={prefs} clip={clip} setClip={setClip} />
          </section>
          <section className="step" hidden={step !== 'results'}>
            <StepResults {...common} step={5} language={language} clip={clip} />
          </section>
          <section className="step" hidden={step !== 'recommend'}>
            <StepRecommend {...common} step={6} language={language} engines={engines} enginesState={enginesState} />
          </section>
        </main>

        <footer className="wizard-nav">
          <div className="wizard-nav-inner">
            <Button variant="ghost" onClick={() => go(STEPS[index - 1].id)} disabled={index === 0}>
              <Icon.ArrowLeft size={16} /> Atgal
            </Button>
            <span className="nav-count">{index + 1} / {total}</span>
            {index < total - 1 ? (
              <Button variant="primary" onClick={() => go(STEPS[index + 1].id)}>
                {NEXT_LABEL[step]} <Icon.ArrowRight size={16} />
              </Button>
            ) : (
              <Button variant="primary" onClick={() => go('phrase')}>
                Naujas testas <Icon.Refresh size={16} />
              </Button>
            )}
          </div>
        </footer>
      </div>
    </ToastProvider>
  );
}
