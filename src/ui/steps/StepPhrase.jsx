import { Button, StepHeader } from '../common.jsx';
import { Icon } from '../icons.jsx';

export function StepPhrase({ step, total, language, samples, phraseIndex, onSelect, onEdit, onReset, saved }) {
  return (
    <>
      <StepHeader step={step} total={total} title="Kurią frazę padiktuosi?"
        lead="Pasirink frazę, kurią perskaitysi garsiai. Tekstą gali pataisyti tiesiog paspaudęs ant jo, o pakeitimai išsaugomi šioje naršyklėje." />

      <div className="phrase-list" role="radiogroup" aria-label={`${language.name} frazės`}>
        {samples.map((text, i) => {
          const selected = i === phraseIndex;
          return (
            <label key={i} className={`phrase-card ${selected ? 'selected' : ''}`}>
              <input type="radio" name="phrase" className="visually-hidden" checked={selected} onChange={() => onSelect(i)} />
              <span className="phrase-radio" aria-hidden="true">{selected && <Icon.Check size={13} />}</span>
              <span className="phrase-num">{i + 1}</span>
              <textarea
                className="phrase-input"
                rows={1}
                value={text}
                spellCheck={false}
                aria-label={`${i + 1} frazė`}
                onFocus={() => onSelect(i)}
                onChange={(e) => onEdit(i, e.target.value)}
              />
            </label>
          );
        })}
      </div>

      <div className="row-between">
        <span className="muted small">{saved === false ? 'Nepavyko išsaugoti: naršyklė blokuoja localStorage.' : 'Pakeitimai išsaugomi automatiškai.'}</span>
        <Button variant="ghost" size="sm" onClick={onReset}><Icon.Refresh size={15} /> Atkurti numatytas frazes</Button>
      </div>
    </>
  );
}
