import { Icon } from './icons.jsx';

export const STEPS = [
  { id: 'language', title: 'Kalba' },
  { id: 'phrase', title: 'Frazė' },
  { id: 'models', title: 'Modeliai' },
  { id: 'test', title: 'Testas' },
  { id: 'results', title: 'Rezultatai' },
  { id: 'recommend', title: 'Rekomendacijos' },
];

/** `done` marks steps that are actually complete, independent of where the user is. */
export function Stepper({ current, summaries, done, onGo }) {
  const index = STEPS.findIndex((s) => s.id === current);
  return (
    <nav className="stepper" aria-label="Vedlio žingsniai">
      <ol>
        {STEPS.map((s, i) => {
          const state = i === index ? 'current' : done[s.id] ? 'done' : 'todo';
          return (
            <li key={s.id} className={`step-item ${state}`}>
              <button type="button" onClick={() => onGo(s.id)} aria-current={i === index ? 'step' : undefined}>
                <span className="step-dot">{state === 'done' ? <Icon.Check size={14} /> : i + 1}</span>
                <span className="step-text">
                  <span className="step-title">{s.title}</span>
                  <span className="step-summary">{summaries[s.id] ?? ' '}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="stepper-progress" aria-hidden="true">
        <span style={{ width: `${(index / (STEPS.length - 1)) * 100}%` }} />
      </div>
    </nav>
  );
}
