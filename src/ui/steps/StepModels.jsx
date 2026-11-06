import { useEffect } from 'react';
import { defaultPrompt } from '../../engines/promptApi.js';
import { Button, Callout, KindTag, ProgressBar, StatusPill, StepHeader, Switch, useController } from '../common.jsx';
import { Icon } from '../icons.jsx';

function ActionButton({ engine, state }) {
  const act = (fn) => engine.ctrl.act(fn);
  if (state.busy || state.status === 'checking') return null;
  if (state.status === 'downloadable') {
    return (
      <Button variant="primary" onClick={() => act(engine.download)}>
        <Icon.Download size={16} /> Atsisiųsti{engine.size ? ` (${engine.size})` : ''}
      </Button>
    );
  }
  if (state.status === 'downloading') {
    return <Button onClick={() => act(engine.download)}><Icon.Download size={16} /> Sekti progresą</Button>;
  }
  if (state.status === 'error') {
    return <Button onClick={() => act(engine.refresh)}><Icon.Refresh size={16} /> Bandyti dar kartą</Button>;
  }
  return null;
}

function Advanced({ engine, language, prefs, updatePrefs }) {
  if (engine.id === 'nano') {
    return (
      <details className="advanced">
        <summary>Išplėstiniai nustatymai</summary>
        <label className="field">
          <span>Instrukcija modeliui</span>
          <textarea rows={4} value={prefs.prompt || defaultPrompt(language)}
            onChange={(e) => updatePrefs({ prompt: e.target.value === defaultPrompt(language) ? '' : e.target.value })} />
        </label>
        <div className="field-row">
          <label className="field inline">
            <span>Ilgą įrašą skaidyti kas</span>
            <input type="number" min={0} max={120} step={5} value={prefs.chunkSec}
              onChange={(e) => updatePrefs({ chunkSec: Math.max(0, Number(e.target.value) || 0) })} />
            <span>s (0 – neskaidyti)</span>
          </label>
          {prefs.prompt && <Button size="sm" variant="ghost" onClick={() => updatePrefs({ prompt: '' })}>Atkurti numatytą instrukciją</Button>}
        </div>
      </details>
    );
  }
  if (engine.id === 'ws-local') {
    return (
      <details className="advanced">
        <summary>Išplėstiniai nustatymai</summary>
        <label className="field inline">
          <span>Kalbos paketo kokybė</span>
          <select value={prefs.quality} onChange={(e) => updatePrefs({ quality: e.target.value })}>
            <option value="command">command (trumpos komandos)</option>
            <option value="dictation">dictation (diktavimas)</option>
            <option value="conversation">conversation (pokalbis)</option>
          </select>
        </label>
      </details>
    );
  }
  return null;
}

function EngineCard({ engine, included, onInclude, language, prefs, updatePrefs }) {
  const state = useController(engine.ctrl);
  const usable = engine.isUsable(state);
  const note = engine.languageNote();
  return (
    <article className={`engine-card ${usable && included ? 'on' : ''} ${state.status === 'unsupported' ? 'off' : ''}`}>
      <div className="engine-icon">{engine.kind === 'cloud' ? <Icon.Cloud size={22} /> : <Icon.Chip size={22} />}</div>
      <div className="engine-body">
        <div className="engine-title">
          <h3>{engine.name}</h3>
          <KindTag kind={engine.kind} />
          <StatusPill status={state.status} />
        </div>
        <p className="engine-desc">{engine.description}</p>
        {note && <p className="engine-note"><Icon.Alert size={15} /> {note}</p>}
        <ProgressBar progress={state.progress} label={`${engine.name} siuntimas`} />
        {state.detail && <p className="engine-detail">{state.detail}</p>}
        <div className="engine-actions">
          <ActionButton engine={engine} state={state} />
          <Switch checked={usable && included} disabled={!usable} onChange={onInclude}
            label={usable ? 'Įtraukti į testą' : 'Negalima testuoti'} />
        </div>
        <Advanced engine={engine} language={language} prefs={prefs} updatePrefs={updatePrefs} />
      </div>
    </article>
  );
}

export function StepModels({ step, total, active, engines, language, prefs, updatePrefs }) {
  // Re-check availability every time the step is opened (downloads may have finished meanwhile).
  useEffect(() => {
    if (active) engines.forEach((e) => e.ctrl.act(() => e.refresh()));
  }, [active, engines]);

  const setInclude = (id, value) => updatePrefs((p) => ({ include: { ...p.include, [id]: value } }));

  return (
    <>
      <StepHeader step={step} total={total} title="Paruošk modelius"
        lead={`Pasirink, kuriuos variklius testuosi su ${language.gen} kalba. Įrenginyje veikiančius modelius Chrome atsisiunčia tik paspaudus mygtuką.`} />

      <div className="engine-list">
        {engines.map((e) => (
          <EngineCard key={e.id} engine={e} language={language} prefs={prefs} updatePrefs={updatePrefs}
            included={!!prefs.include[e.id]} onInclude={(v) => setInclude(e.id, v)} />
        ))}
      </div>

      <Callout>
        Kai modelis atsisiųstas, jis lieka Chrome ir kitą kartą bus paruoštas iš karto.
        Kaip atsisiųstus modelius ištrinti, rasi paskutiniame žingsnyje.
      </Callout>
    </>
  );
}
