"""Export a Hugging Face Whisper checkpoint to the ONNX layout transformers.js loads.

Output (same file names as onnx-community/whisper-large-v3-ONNX):
  onnx/encoder_model_fp16.onnx        WebGPU encoder (~1.2 GB for large-v3)
  onnx/encoder_model_q4.onnx          4-bit encoder for GPUs without shader-f16
  onnx/decoder_model_merged_q4.onnx   4-bit decoder with KV cache
  config.json, generation_config.json, preprocessor_config.json, tokenizer files

Runs once, outside the web app, with ~16 GB RAM (large-v3 is exported in fp32 first):

  pip install torch transformers optimum-onnx onnx onnxruntime
  python scripts/export_whisper_onnx.py --model akisviete/azuolas-whisper-lt --out azuolas-whisper-lt-onnx

Then upload the folder to a Hugging Face model repo:

  hf upload <user>/azuolas-whisper-lt-onnx azuolas-whisper-lt-onnx .
"""

import argparse
import gc
import shutil
import subprocess
import sys
from pathlib import Path

README = """---
license: cc-by-4.0
base_model: {model}
library_name: transformers.js
language: [lt]
pipeline_tag: automatic-speech-recognition
tags: [onnx, whisper, transformers.js]
---

# {model} (ONNX for transformers.js)

ONNX export of [{model}](https://huggingface.co/{model}) for in-browser use with
[transformers.js](https://github.com/huggingface/transformers.js).

- `onnx/encoder_model_fp16.onnx`: encoder for WebGPU with `shader-f16`
- `onnx/encoder_model_q4.onnx`: 4-bit encoder (MatMulNBits, block 32, symmetric)
- `onnx/decoder_model_merged_q4.onnx`: 4-bit decoder with KV cache

```js
import {{ pipeline }} from '@huggingface/transformers';
const asr = await pipeline('automatic-speech-recognition', '<this repo>', {{
  device: 'webgpu',
  dtype: {{ encoder_model: 'fp16', decoder_model_merged: 'q4' }},
}});
const {{ text }} = await asr(samples16k, {{ language: 'lithuanian', task: 'transcribe' }});
```

License and attribution follow the original model (CC-BY-4.0).
"""


def export_fp32(model: str, raw: Path) -> None:
    # --no-post-process: optimum would merge the two fp32 decoders (~3.5 GB each
    # for large-v3) right away, which runs out of 16 GB RAM. They are merged
    # after 4-bit quantization instead, when they are ~0.7 GB each.
    subprocess.run([
        sys.executable, "-m", "optimum.exporters.onnx",
        "--model", model,
        "--task", "automatic-speech-recognition-with-past",
        "--opset", "18",
        "--no-post-process",
        str(raw),
    ], check=True)


def merge(decoder: Path, decoder_with_past: Path, dst: Path) -> None:
    """One decoder for both the first step and the cached steps (an If node on use_cache_branch)."""
    try:
        from optimum.onnx import merge_decoders
    except ImportError:
        from optimum.onnx.graph_transformations import merge_decoders
    merge_decoders(decoder, decoder_with_past, save_path=dst, strict=False)


def to_fp16(src: Path, dst: Path) -> None:
    import onnx
    from onnxruntime.transformers.float16 import convert_float_to_float16

    model = onnx.load(str(src))  # also loads external .onnx_data
    # keep_io_types: transformers.js feeds float32 mel features.
    model = convert_float_to_float16(model, keep_io_types=True, disable_shape_infer=True)
    onnx.save(model, str(dst))  # < 2 GB for large-v3, so a single file
    del model
    gc.collect()


def to_q4(src: Path, dst: Path) -> None:
    import onnx
    try:
        from onnxruntime.quantization.matmul_nbits_quantizer import MatMulNBitsQuantizer as Quantizer
    except ImportError:  # older onnxruntime
        from onnxruntime.quantization.matmul_4bits_quantizer import MatMul4BitsQuantizer as Quantizer

    model = onnx.load(str(src))
    quant = Quantizer(model, block_size=32, is_symmetric=True)
    quant.process()
    quant.model.save_model_to_file(str(dst), use_external_data_format=False)
    del model, quant
    gc.collect()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--model", required=True, help="Whisper model on Hugging Face, e.g. akisviete/azuolas-whisper-lt")
    parser.add_argument("--out", required=True, type=Path, help="Output folder to upload")
    parser.add_argument("--keep-fp32", action="store_true", help="Keep the intermediate fp32 export")
    args = parser.parse_args()

    out: Path = args.out
    raw = out / "_fp32"
    onnx_dir = out / "onnx"
    onnx_dir.mkdir(parents=True, exist_ok=True)

    if not (raw / "decoder_with_past_model.onnx").exists():
        print(f"1/5 Exporting {args.model} to ONNX (fp32)…", flush=True)
        export_fp32(args.model, raw)
    else:
        print("1/5 fp32 export found, reusing it", flush=True)

    print("2/5 Encoder → fp16 (WebGPU)…", flush=True)
    to_fp16(raw / "encoder_model.onnx", onnx_dir / "encoder_model_fp16.onnx")

    print("3/5 Encoder and decoders → q4…", flush=True)
    to_q4(raw / "encoder_model.onnx", onnx_dir / "encoder_model_q4.onnx")
    to_q4(raw / "decoder_model.onnx", raw / "decoder_model_q4.onnx")
    to_q4(raw / "decoder_with_past_model.onnx", raw / "decoder_with_past_model_q4.onnx")

    print("4/5 Merging the q4 decoders…", flush=True)
    merge(raw / "decoder_model_q4.onnx", raw / "decoder_with_past_model_q4.onnx",
          onnx_dir / "decoder_model_merged_q4.onnx")

    print("5/5 Configs, tokenizer, README…", flush=True)
    for f in raw.iterdir():
        if f.suffix in {".json", ".txt"}:
            shutil.copy(f, out / f.name)
    (out / "README.md").write_text(README.format(model=args.model), encoding="utf-8")
    if not args.keep_fp32:
        shutil.rmtree(raw)

    print(f"\nDone: {out.resolve()}")
    for f in sorted(out.rglob("*")):
        if f.is_file():
            print(f"  {str(f.relative_to(out)):40} {f.stat().st_size / 1e6:10.1f} MB")


if __name__ == "__main__":
    main()
