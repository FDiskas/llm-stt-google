import * as history from '../../history.js';
import { isOfficial } from '../../engines/promptApi.js';
import { Button, Callout, CopyChip, KindTag, StatusPill, StepHeader, percent, plural, useController, useToast } from '../common.jsx';
import { Icon } from '../icons.jsx';

const GOOD_WER = 0.15;
const OK_WER = 0.3;

function Recommendation({ language, engines, enginesState, go }) {
  const groups = history.aggregate(language.code);
  const totalRuns = groups.reduce((n, g) => n + g.runs, 0);

  if (!groups.length) {
    return (
      <section className="card reco-card empty-reco">
        <h2>Dar nėra duomenų</h2>
        <p>Atlik bent vieną testą su {language.gen} kalba, tada čia pamatysi rekomendaciją.</p>
        <Button variant="primary" onClick={() => go('test')}>Eiti į testą <Icon.ArrowRight size={16} /></Button>
      </section>
    );
  }

  const best = groups[0];
  const stateOf = (id) => enginesState[engines.findIndex((e) => e.id === id)];
  const deviceGroups = groups.filter((g) => g.kind === 'device' && g.avgWer != null);
  const bestDevice = [...deviceGroups].sort((a, b) => a.avgWer - b.avgWer)[0];

  const insights = [];
  if (totalRuns < 3) {
    insights.push(['info', 'Atlik bent 3 testus su skirtingomis frazėmis, tada rekomendacija bus patikimesnė.']);
  }
  if (stateOf('ws-local')?.status === 'unsupported') {
    insights.push(['warn', `Chrome neturi ${language.gen} kalbos paketo įrenginyje, todėl integruotas atpažinimas be interneto šiai kalbai neveikia.`]);
  }
  if (!isOfficial(language.code)) {
    insights.push(['warn', `Gemini Nano ${language.gen} kalbos oficialiai nepalaiko, todėl jo rezultatai gali būti nestabilūs.`]);
  }
  if (!bestDevice || bestDevice.avgWer > OK_WER) {
    insights.push(['bad', `Nė vienas įrenginyje veikiantis modelis nepasiekė gero tikslumo. Visiškai privačiam ${language.gen} kalbos atpažinimui verta išbandyti kitus atvirus modelius, pvz., kalbai pritaikytą Parakeet, Whisper (large-v3-turbo) arba Meta MMS, kurie veikia naršyklėje per WebGPU.`]);
  } else if (bestDevice.avgWer <= GOOD_WER) {
    insights.push(['ok', `${bestDevice.engine} veikia gerai ir be interneto: vidutiniškai ${percent(bestDevice.avgWer)} žodžių klaidų.`]);
  }
  if (best.kind === 'cloud') {
    insights.push(['info', 'Geriausiai pasirodė debesies variantas. Jis tinka tik tada, jei leidžiama siųsti garsą į Google ir yra internetas.']);
  }

  return (
    <>
      <section className="card reco-card">
        <p className="eyebrow">Tavo testuose geriausiai pasirodė</p>
        <div className="reco-head">
          <span className="reco-icon"><Icon.Trophy size={26} /></span>
          <div>
            <h2>{best.engine}</h2>
            <KindTag kind={best.kind} />
          </div>
        </div>
        <ul className="reco-facts">
          <li><b>{best.avgWer == null ? '–' : percent(best.avgWer)}</b><span>vid. žodžių klaidų</span></li>
          <li><b>{best.runs}</b><span>{plural(best.runs, ['testas', 'testai', 'testų']).replace(/^\d+ /, '')}</span></li>
          <li><b>👍 {best.up} · 👎 {best.down}</b><span>tavo balsai</span></li>
          <li><b>{best.kind === 'cloud' ? 'Reikia' : 'Nereikia'}</b><span>interneto</span></li>
        </ul>
        {groups.length > 1 && (
          <div className="reco-compare">
            {groups.map((g, i) => (
              <div key={g.key} className="reco-row">
                <span className="reco-rank">{i + 1}</span>
                <span className="reco-name">{g.engine}</span>
                <span className="reco-bar"><span style={{ width: `${g.avgWer == null ? 0 : Math.max(3, (1 - Math.min(1, g.avgWer)) * 100)}%` }} /></span>
                <span className="reco-val">{g.avgWer == null ? '–' : percent(g.avgWer)}</span>
              </div>
            ))}
            <p className="muted small">Juosta rodo tikslumą (100 % − žodžių klaidos). Eiliškumą pirmiausia lemia tavo balsai, o jiems lygiems – mažesnis klaidų procentas.</p>
          </div>
        )}
      </section>

      <div className="insights">
        {insights.map(([tone, text], i) => <Callout key={i} tone={tone}>{text}</Callout>)}
      </div>
    </>
  );
}

function NanoCleanup({ engine }) {
  const state = useController(engine.ctrl);
  const toast = useToast();
  return (
    <article className="card cleanup-card">
      <header className="cleanup-head">
        <h3>Gemini Nano</h3>
        <StatusPill status={state.status} />
        {engine.loaded && (
          <Button size="sm" onClick={() => engine.ctrl.act(async () => { await engine.unload(); toast('Gemini Nano iškeltas iš atminties'); })}>
            Iškelti iš atminties
          </Button>
        )}
      </header>
      <p>Tinklalapis negali ištrinti Chrome integruotų modelių, jis gali tik iškelti juos iš atminties. Iš disko (~4 GB) ištrinsi taip:</p>
      <ol className="steps-list">
        <li>
          <b>Paprasčiausia.</b> Atidaryk <CopyChip text="chrome://settings/system" /> ir išjunk <b>On-device AI</b>.
          Chrome ištrins modelį ir nebesiųs jo iš naujo. Šis jungiklis diegiamas palaipsniui, todėl tavo versijoje jo gali dar nebūti.
        </li>
        <li>
          <b>Rankiniu būdu.</b> Nustatyk <CopyChip text="chrome://flags/#prompt-api-for-gemini-nano" /> į <i>Disabled</i> ir paleisk Chrome iš naujo.
          Tada uždaryk Chrome ir ištrink aplanką <code>OptGuideOnDeviceModel</code>. Tikslų kelią rasi <CopyChip text="chrome://on-device-internals" /> stulpelyje „Weights Path“. Dažniausiai:
          <ul>
            <li>Windows: <CopyChip text="%LOCALAPPDATA%\Google\Chrome\User Data\OptGuideOnDeviceModel" /></li>
            <li>macOS: <CopyChip text="~/Library/Application Support/Google/Chrome/OptGuideOnDeviceModel" /></li>
          </ul>
        </li>
      </ol>
      <p className="muted small">Chrome modelį ištrina ir pats, kai diske trūksta vietos. Kol modelio nėra, neveikia ir kitos jį naudojančios Chrome funkcijos.</p>
    </article>
  );
}

function SpeechCleanup({ engine }) {
  const state = useController(engine.ctrl);
  return (
    <article className="card cleanup-card">
      <header className="cleanup-head">
        <h3>Chrome kalbos paketai</h3>
        <StatusPill status={state.status} />
      </header>
      <p>Web Speech API leidžia paketus įdiegti, bet ne pašalinti.</p>
      <ul className="steps-list">
        <li>Chrome tuos pačius paketus (SODA) naudoja ir funkcijai „Live Caption“. Jei kalba matoma <CopyChip text="chrome://settings/captions" />, ją pašalinus ten gali būti pašalintas ir paketas.</li>
        <li>Įdiegti paketai matomi <CopyChip text="chrome://components" /> kaip „SODA“ įrašai.</li>
        <li>Nebenaudojamus paketus Chrome išvalo pats.</li>
      </ul>
    </article>
  );
}

function ParakeetCleanup({ engine }) {
  const state = useController(engine.ctrl);
  const toast = useToast();
  const stored = state.status === 'ready' || state.status === 'loaded';
  const remove = () => {
    if (!confirm(`Ištrinti ${engine.name} modelio failus iš šios naršyklės?`)) return;
    engine.ctrl.act(async () => { await engine.remove(); toast(`${engine.name} ištrintas`); });
  };
  return (
    <article className="card cleanup-card">
      <header className="cleanup-head">
        <h3>{engine.name}</h3>
        <StatusPill status={state.status} />
        {engine.loaded && (
          <Button size="sm" onClick={() => engine.ctrl.act(async () => { await engine.unload(); toast(`${engine.name} iškeltas iš atminties`); })}>
            Iškelti iš atminties
          </Button>
        )}
        {stored && !state.busy && (
          <Button size="sm" variant="danger" onClick={remove}><Icon.Trash size={14} /> Ištrinti</Button>
        )}
      </header>
      <p>Šį modelį atsisiuntė pats tinklalapis, todėl jis saugomas šios svetainės IndexedDB talpykloje ir jį galima ištrinti mygtuku.</p>
      <p className="muted small">Failai taip pat dingsta išvalius šios svetainės duomenis naršyklės nustatymuose.</p>
    </article>
  );
}

export function StepRecommend({ step, total, language, engines, enginesState, go }) {
  const nano = engines.find((e) => e.id === 'nano');
  const local = engines.find((e) => e.id === 'ws-local');
  const parakeets = engines.filter((e) => e.repoId);
  return (
    <>
      <StepHeader step={step} total={total} title="Rekomendacijos"
        lead={`Remiantis tavo testais ir balsais su ${language.gen} kalba.`} />

      <Recommendation language={language} engines={engines} enginesState={enginesState} go={go} />

      <h2 className="section-title">Atsisiųsti modeliai ir jų trynimas</h2>
      <p className="muted section-lead">Chrome nuorodų negalima atidaryti iš tinklalapio. Nukopijuok jas ir įklijuok į adreso juostą.</p>
      <div className="cleanup-grid">
        {nano && <NanoCleanup engine={nano} />}
        {local && <SpeechCleanup engine={local} />}
        {parakeets.map((e) => <ParakeetCleanup key={e.id} engine={e} />)}
      </div>

      <div className="restart">
        <Button onClick={() => go('language')}><Icon.ArrowLeft size={16} /> Keisti kalbą</Button>
        <Button variant="primary" onClick={() => go('phrase')}>Testuoti kitą frazę <Icon.ArrowRight size={16} /></Button>
      </div>
    </>
  );
}
