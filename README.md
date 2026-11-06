# Kalbos atpažinimo testas

Vedlys, kuriuo naršyklėje palyginsi Chrome integruotus ir atvirus kalbos atpažinimo (STT) modelius pasirinkta kalba. Viskas vyksta naršyklėje, serverio pusės logikos nėra.

## Paleidimas

Reikia [Bun](https://bun.sh) ir stalinio Google Chrome 139+.

```sh
bun install
bun run dev        # http://localhost:8080 (prievadą keisk su PORT=...)
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
| Google debesis | Web Speech API, `processLocally = false` | Google serveriuose |

Žinomi apribojimai (Chrome 157):
- Gemini Nano priima tik `en`, `de`, `es`, `fr`, `ja`. Kitos kalbos deklaruojamos kaip `en`, o kalba nurodoma instrukcijoje.
- Chrome neturi lietuvių ir latvių kalbų paketų įrenginyje veikiančiam atpažinimui.
- Parakeet kalbą nustato pats (25 Europos kalbos). Modelio failai siunčiami iš Hugging Face ir saugomi svetainės IndexedDB, o ONNX Runtime WASM failai kraunami iš jsDelivr CDN.

### Kitas Parakeet modelis (pvz., lietuviškas fine-tune)

1. Eksportuok NeMo modelį į ONNX (Linux/WSL arba Colab):
   `python scripts/export_parakeet_onnx.py --model Noctra-labs/parakeet-tdt-0.6b-v3-lt --out parakeet-lt-onnx`
2. Įkelk aplanką į Hugging Face: `huggingface-cli upload <user>/parakeet-tdt-0.6b-v3-lt-onnx parakeet-lt-onnx .`
3. `src/engines/catalog.js` funkcijoje `createEngines` pridėk dar vieną `parakeet(getCtx, { id, name, repoId, description, onlyLang })`.

Lietuviškas Noctra Labs modelis ([Noctra-labs/parakeet-tdt-0.6b-v3-lt](https://huggingface.co/Noctra-labs/parakeet-tdt-0.6b-v3-lt), CC-BY-4.0) taip eksportuotas į [fdiskas/parakeet-tdt-0.6b-v3-lt-onnx](https://huggingface.co/fdiskas/parakeet-tdt-0.6b-v3-lt-onnx).

## Struktūra

- `server.js`: Bun kūrimo serveris (bundlina `index.html`, JSX, CSS).
- `src/ui/`: React komponentai (`App.jsx`, `Stepper.jsx`, `steps/*`).
- `src/engines/`: varikliai (`catalog.js`), Web Speech, Prompt API ir Parakeet adapteriai.
- `scripts/export_parakeet_onnx.py`: vienkartinis NeMo → ONNX eksportas (neįeina į programą).
- `src/history.js`, `src/store.js`: istorija, balsai, nustatymai `localStorage`.
- `src/metrics.js`: WER, CER ir žodžių skirtumai.
- `patches/`: `parakeet.js` pataisa (Unicode raidės tokenizerio tarpų valyme), Bun ją pritaiko per `bun install`.

## Licencija

[MIT](LICENSE). Modeliams galioja jų pačių licencijos (pvz., Parakeet TDT ir Noctra Labs modelis: CC-BY-4.0).
