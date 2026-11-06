import { useEffect, useState } from 'react';
import { LANGUAGES } from '../../languages.js';
import * as WS from '../../engines/webSpeech.js';
import { isOfficial } from '../../engines/promptApi.js';
import { StepHeader } from '../common.jsx';
import { Icon } from '../icons.jsx';

const WS_STATES = {
  available: { mark: '✓', tone: 'ok', title: 'Kalbos paketas įdiegtas' },
  downloadable: { mark: '↓', tone: 'warn', title: 'Kalbos paketą galima atsisiųsti' },
  downloading: { mark: '↓', tone: 'warn', title: 'Kalbos paketas siunčiamas' },
  unavailable: { mark: '✕', tone: 'bad', title: 'Chrome neturi šios kalbos paketo' },
  unknown: { mark: '…', tone: 'muted', title: 'Tikrinama' },
  error: { mark: '?', tone: 'muted', title: 'Nepavyko patikrinti' },
};

function useOnDeviceSupport() {
  const [support, setSupport] = useState({});
  useEffect(() => {
    if (!WS.onDeviceApi) return;
    for (const l of LANGUAGES) {
      WS.availability({ lang: l.bcp47, processLocally: true })
        .catch(() => 'error')
        .then((status) => setSupport((s) => ({ ...s, [l.code]: status })));
    }
  }, []);
  return support;
}

function SupportChip({ label, state }) {
  return (
    <span className={`support support-${state.tone}`} title={state.title}>
      <b>{state.mark}</b> {label}
    </span>
  );
}

export function StepLanguage({ step, total, language, onSelect }) {
  const support = useOnDeviceSupport();

  return (
    <>
      <StepHeader step={step} total={total} title="Kokia kalba kalbėsi?"
        lead="Pasirink kalbą. Prie kiekvienos matysi, ar Chrome ją supranta be interneto." />

      <div className="lang-grid" role="radiogroup" aria-label="Kalba">
        {LANGUAGES.map((l) => {
          const selected = l.code === language.code;
          const ws = WS.onDeviceApi ? WS_STATES[support[l.code] ?? 'unknown'] ?? WS_STATES.error : WS_STATES.error;
          const nano = isOfficial(l.code)
            ? { mark: '✓', tone: 'ok', title: 'Gemini Nano oficialiai palaiko šią kalbą' }
            : { mark: '~', tone: 'warn', title: 'Oficialiai nepalaikoma, bet galima bandyti per instrukciją' };
          return (
            <button key={l.code} type="button" role="radio" aria-checked={selected}
              className={`lang-card ${selected ? 'selected' : ''}`} onClick={() => onSelect(l.code)}>
              <span className="lang-top">
                <span className="lang-code">{l.code.toUpperCase()}</span>
                <span className="lang-check" aria-hidden="true"><Icon.Check size={14} /></span>
              </span>
              <span className="lang-name">{l.name}</span>
              <span className="lang-sub">{l.gen[0].toUpperCase() + l.gen.slice(1)} kalba</span>
              <span className="lang-support">
                <SupportChip label="Chrome atpažinimas" state={ws} />
                <SupportChip label="Gemini Nano" state={nano} />
              </span>
            </button>
          );
        })}
      </div>

      <p className="legend">
        <span><b className="t-ok">✓</b> palaiko</span>
        <span><b className="t-warn">↓</b> galima atsisiųsti</span>
        <span><b className="t-warn">~</b> oficialiai nepalaiko, bet galima bandyti</span>
        <span><b className="t-bad">✕</b> nepalaiko</span>
      </p>
    </>
  );
}
