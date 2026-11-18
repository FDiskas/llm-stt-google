# Kalbos atpažinimo testas

Vedlys, kuriuo naršyklėje palyginsi Chrome integruotus ir atvirus kalbos atpažinimo (STT) modelius pasirinkta kalba. Viskas vyksta naršyklėje, serverio pusės logikos nėra.

Antras puslapis, `tts.html`, atlieka atvirkštinį darbą: įgarsina lietuvišką tekstą balsu „Reginutė“ ir leidžia pritaikyti garso efektus (žr. [Kalbos sintezė](#kalbos-sintezė-ttshtml)).

## Paleidimas

Reikia [Bun](https://bun.sh) ir stalinio Google Chrome 139+.

```sh
bun install
bun run dev        # http://localhost:8080 ir http://localhost:8080/tts.html (prievadą keisk su PORT=...)
bun run build      # statinė versija į dist/
```

Puslapis turi būti atidarytas per `https` arba `localhost` (mikrofonas ir Prompt API veikia tik saugiame kontekste).

### GitHub Pages

`.github/workflows/pages.yml` kiekvieną `main` šakos push'ą subuildina ir publikuoja į GitHub Pages. Vieną kartą įjunk: **Settings → Pages → Source: GitHub Actions**.

## Žingsniai

1. **Kalba.** Pasirink kalbą. Prie kiekvienos parodoma, ar Chrome ją palaiko įrenginyje ir Gemini Nano modelyje.
2. **Frazė.** Pasirink vieną iš 5 frazių. Jas galima redaguoti, pakeitimai saugomi `localStorage` atskirai kiekvienai kalbai.
3. **Modeliai.** Pasirink variklius ir atsisiųsk modelius su progreso juosta.
4. **Testas.** Įrašyk frazę (arba įkelk failą). Visi pasirinkti varikliai paeiliui perrašo tą patį įrašą.
5. **Rezultatai.** Matysi žodžių klaidas (WER), raidžių klaidas (CER), žodžių klaidas be diakritikų ir paryškintus skirtumus. Kiekvieną rezultatą gali įvertinti 👍 / 👎. Čia rasi ir visą istoriją su lyderių lentele.
6. **Rekomendacijos.** Geriausias variklis pagal tavo balsus ir vidutines klaidas, pastabos ir instrukcijos, kaip ištrinti atsisiųstus modelius.

Naviguoti galima žingsnių juosta, mygtukais „Atgal“ / „Toliau“ ir naršyklės atgal mygtuku: žingsnis saugomas URL (`#models`, `#test`, …).

## Varikliai

| Variklis | API | Kur veikia |
| --- | --- | --- |
| Gemini Nano | Prompt API (`LanguageModel`) su garso įvestimi | Įrenginyje (~4 GB, reikia GPU su daugiau nei 4 GB VRAM) |
| Chrome kalbos atpažinimas | Web Speech API, `processLocally = true` | Įrenginyje (kalbos paketas) |
| Parakeet TDT 0.6B v3 | [parakeet.js](https://github.com/ysdede/parakeet.js) (onnxruntime-web) | Įrenginyje: WebGPU fp16 (~1,3 GB) arba CPU int8 (~0,7 GB), jei GPU nepalaiko `shader-f16` |
| Whisper Paprika LT v3 | [transformers.js](https://github.com/huggingface/transformers.js), [aztekvisur/paprika-whisper-lt-v3-onnx](https://huggingface.co/aztekvisur/paprika-whisper-lt-v3-onnx) | Įrenginyje: WebGPU fp16 + q4 (~1,5 GB), be fp16 tik q4 (~0,7 GB) |
| Whisper Ąžuolas LT | transformers.js, [fdiskas/azuolas-whisper-lt-onnx](https://huggingface.co/fdiskas/azuolas-whisper-lt-onnx) | Įrenginyje: WebGPU fp16 + q4 (~2,0 GB), be fp16 tik q4 (~1,2 GB) |
| Google debesis | Web Speech API, `processLocally = false` | Google serveriuose |

Žinomi apribojimai (Chrome 157):
- Gemini Nano priima tik `en`, `de`, `es`, `fr`, `ja`. Kitos kalbos deklaruojamos kaip `en`, o kalba nurodoma instrukcijoje.
- Chrome neturi lietuvių ir latvių kalbų paketų įrenginyje veikiančiam atpažinimui.
- Parakeet kalbą nustato pats (25 Europos kalbos). Modelio failai siunčiami iš Hugging Face ir saugomi svetainės IndexedDB, o ONNX Runtime WASM failai kraunami iš jsDelivr CDN.
- Whisper modeliai saugomi svetainės Cache Storage. Lietuviški fine-tune'ai rašo mažosiomis raidėmis, be skyrybos, o skaičius rašo žodžiais.

### Kitas Parakeet modelis (pvz., lietuviškas fine-tune)

1. Eksportuok NeMo modelį į ONNX (Linux/WSL arba Colab):
   `python scripts/export_parakeet_onnx.py --model Noctra-labs/parakeet-tdt-0.6b-v3-lt --out parakeet-lt-onnx`
2. Įkelk aplanką į Hugging Face: `huggingface-cli upload <user>/parakeet-tdt-0.6b-v3-lt-onnx parakeet-lt-onnx .`
3. `src/engines/catalog.js` funkcijoje `createEngines` pridėk dar vieną `parakeet(getCtx, { id, name, repoId, description, onlyLang })`.

Lietuviškas Noctra Labs modelis ([Noctra-labs/parakeet-tdt-0.6b-v3-lt](https://huggingface.co/Noctra-labs/parakeet-tdt-0.6b-v3-lt), CC-BY-4.0) taip eksportuotas į [fdiskas/parakeet-tdt-0.6b-v3-lt-onnx](https://huggingface.co/fdiskas/parakeet-tdt-0.6b-v3-lt-onnx).

### Lietuviški Whisper modeliai

Pagal viešus testus (WER, mažiau yra geriau) lietuvių kalbai tiksliausi papildomai apmokyti Whisper modeliai:

| Modelis | FLEURS LT | Common Voice LT |
| --- | --- | --- |
| [Ąžuolas](https://huggingface.co/akisviete/azuolas-whisper-lt) (large-v3, 1,55 mlrd.) | 9,1 % | 4,6 % |
| [Paprika v3](https://huggingface.co/kristijonas/paprika-whisper-lt-v3) (large-v3-turbo, 0,8 mlrd.) | 12,1 % | 8,6 % |
| [kmynas-parakeet v3](https://huggingface.co/kristijonas/kmynas-parakeet-lt-v3) (0,6 mlrd.) | 17,7 % | 22,9 % |

Kitą Whisper modelį į transformers.js formatą (fp16 ir q4 encoderis, q4 decoderis) eksportuosi taip:

1. `pip install torch transformers accelerate optimum-onnx onnx onnx-ir onnxruntime` (veikia ir Windows, reikia ~16 GB RAM).
2. `python scripts/export_whisper_onnx.py --model akisviete/azuolas-whisper-lt --out azuolas-whisper-lt-onnx`
3. `hf upload <user>/azuolas-whisper-lt-onnx azuolas-whisper-lt-onnx .`
4. `src/engines/catalog.js` pridėk `hubModel(getCtx, WH, { id, name, repoId, sizes, description, onlyLang })`.

## Kalbos sintezė (`tts.html`)

Lietuviško teksto įgarsinimas naršyklėje, be serverio. Balsas: [RobertasTa/lt_LT-reginute1-medium](https://huggingface.co/RobertasTa/lt_LT-reginute1-medium) (Piper/VITS, LIEPA garsynas, CC-BY-4.0). Pirmą kartą atsisiunčiama ~85 MB, failai saugomi svetainės Cache Storage (`tts-cache`).

Kaip tekstas virsta garsu (viskas vyksta Web Worker'yje, todėl puslapis neužstringa):

1. **Skaičių ir santrumpų plėtimas** (`src/tts/lt/expand.js`): „2026 m. lapkričio 18 d. 15:30“, „9,99 Eur“, „45 proc.“, „LRT“ išrašomi žodžiais tinkamu linksniu.
2. **Fonemos** (`src/tts/lt/phonemize.js`): [eSpeak NG](https://github.com/espeak-ng/espeak-ng) WASM (npm `espeak-ng`, kraunamas iš jsDelivr) duoda IPA, o kirčių žodynas (`lt_kirciai.tsv`, 189 tūkst. formų) perkelia kirtį ir parenka priegaidę (ˈ ˌ ˋ). Vien eSpeak kirčiuoja teisingai apie pusę žodžių.
3. **Sintezė** (`src/tts/lt/synth.js`, `src/tts/piper.js`): tekstas skaidomas ties . , ! ? : ; – -, kiekvienas fragmentas sintezuojamas su onnxruntime-web (WASM), jo tempas išlyginamas, tyla apkarpoma ir įterpiamos išmatuotos pauzės. Pauzę ties kableliu (numatyta 0,25 s) galima keisti; 0 palieka kablelį modeliui, kaip originaliame recepte, bet tada pauzė beveik negirdima.
4. **Efektai** (`src/tts/effects.js`): Web Audio grafas (filtrai, iškraipymas, žiedinis moduliatorius, aidas, reverb, 8D sukimas). Tas pats grafas naudojamas grojant ir eksportuojant WAV (`OfflineAudioContext`). Aukščio efektai su „išlaikyti tempą“ sintezuoja lėčiau, o paskui pagreitina grojimą, todėl keičiasi tik balso aukštis.

Grojimas prasideda nuo pirmo fragmento, dar nesugeneravus viso teksto. Sugeneruotą WAV gali įkelti į STT vedlio 4 žingsnį ir patikrinti, kaip modeliai atpažįsta sintetinę kalbą.

`src/tts/lt/*` yra JS perkėlimas iš balso autoriaus Python kodo (`phonemize_lithuanian.py`, `skaiciu_pletiklis.py`, `synth_reginute.py`, GPL-3.0). Taisyklių paaiškinimai ir matavimai yra originaluose. Worker'is buildinamas atskirai (`tts-worker.js`), nes Bun HTML bundleris nesiekia `new Worker(...)`.

## Struktūra

- `server.js`: Bun kūrimo serveris (bundlina `index.html` ir `tts.html`, JSX, CSS; `tts-worker.js` kompiliuoja kiekvienos užklausos metu).
- `src/tts/`: kalbos sintezės puslapis (`TtsApp.jsx`), worker'is, eSpeak ir Piper adapteriai, efektai, WAV; `src/tts/lt/`: lietuvių kalbos taisyklės (GPL-3.0).
- `src/ui/`: React komponentai (`App.jsx`, `Stepper.jsx`, `steps/*`).
- `src/engines/`: varikliai (`catalog.js`), Web Speech, Prompt API, Parakeet ir Whisper adapteriai.
- `scripts/export_parakeet_onnx.py`, `scripts/export_whisper_onnx.py`: vienkartiniai eksportai į ONNX (neįeina į programą).
- `src/history.js`, `src/store.js`: istorija, balsai, nustatymai `localStorage`.
- `src/metrics.js`: WER, CER ir žodžių skirtumai.
- `patches/`: `parakeet.js` pataisa (Unicode raidės tokenizerio tarpų valyme), Bun ją pritaiko per `bun install`.

## Licencija

[MIT](LICENSE). Modeliams galioja jų pačių licencijos (pvz., Parakeet TDT ir Noctra Labs modelis: CC-BY-4.0).

Išimtis: `src/tts/lt/` failai yra GPL-3.0 (perkelti iš GPL-3.0 kodo), o eSpeak NG taip pat GPL-3.0, todėl subuildintas `tts.html` puslapis kaip visuma platinamas pagal GPL-3.0. Balsas „Reginutė“ ir kirčių žodynas: CC-BY-4.0, autorių nurodymai pateikti puslapio apačioje.
