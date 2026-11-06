"""Export a NeMo Parakeet TDT checkpoint to the ONNX layout parakeet.js loads.

Output (same file names as ysdede/parakeet-tdt-0.6b-v3-onnx):
  encoder-model.fp16.onnx        WebGPU path (~1.2 GB)
  encoder-model.int8.onnx        CPU/WASM fallback (~0.65 GB)
  decoder_joint-model.int8.onnx  decoder + joint, always run on WASM
  vocab.txt                      "<token> <id>" per line, blank last
  config.json, README.md

Runs once, outside the web app. Needs Linux/WSL or Google Colab (NeMo does not
install cleanly on native Windows) and ~16 GB RAM:

  pip install "nemo_toolkit[asr]" onnx onnxconverter-common onnxruntime
  python scripts/export_parakeet_onnx.py --model Noctra-labs/parakeet-tdt-0.6b-v3-lt --out parakeet-lt-onnx

Then upload the folder to a Hugging Face model repo:

  huggingface-cli upload <user>/parakeet-tdt-0.6b-v3-lt-onnx parakeet-lt-onnx .
"""

import argparse
import json
import shutil
from pathlib import Path

README = """---
license: cc-by-4.0
base_model: {model}
tags: [onnx, parakeet, asr, parakeet.js]
---

# {model} (ONNX for parakeet.js)

ONNX export of [{model}](https://huggingface.co/{model}) for in-browser use with
[parakeet.js](https://github.com/ysdede/parakeet.js).

- `encoder-model.fp16.onnx`: encoder for WebGPU
- `encoder-model.int8.onnx`: encoder for CPU (WASM)
- `decoder_joint-model.int8.onnx`: decoder + joint network
- `vocab.txt`: tokenizer vocabulary

License and attribution follow the original model (CC-BY-4.0). Check the
training data terms listed on the original model card before redistribution.
"""


def export_fp32(model_name: str, raw_dir: Path) -> None:
    import nemo.collections.asr as nemo_asr

    model = nemo_asr.models.ASRModel.from_pretrained(model_name, map_location="cpu")
    model.preprocessor.featurizer.dither = 0.0
    model.preprocessor.featurizer.pad_to = 0
    model.eval()

    # For RNNT/TDT models NeMo writes encoder-model.onnx and decoder_joint-model.onnx.
    model.export(str(raw_dir / "model.onnx"))

    with (raw_dir / "vocab.txt").open("w", encoding="utf-8") as f:
        for i, token in enumerate([*model.tokenizer.vocab, "<blk>"]):
            f.write(f"{token} {i}\n")

    cfg = model.cfg
    config = {
        "model_type": "nemo-conformer-tdt",
        "features_size": int(cfg.preprocessor.features),
        "subsampling_factor": int(cfg.encoder.subsampling_factor),
    }
    (raw_dir / "config.json").write_text(json.dumps(config, indent=2), encoding="utf-8")


def fix_mixed_precision(model, max_rounds: int = 50):
    """Repairs nodes that the fp16 converter left with float16 and float32 inputs.

    NeMo computes sequence lengths as Cast(int -> float) + arithmetic. Those Casts
    stay float32 while their Constant operands become float16, so ORT refuses to
    load the graph. Lengths must stay float32 (float16 is exact only up to 2048
    frames), so:
      - a float16 Constant operand of such a node gets a float32 copy;
      - any other float32 operand meeting real float16 activations is cast to float16.
    Repeats until shape inference finds no mixed node.
    """
    import numpy as np
    from onnx import TensorProto, helper, numpy_helper, shape_inference

    FLOATS = {TensorProto.FLOAT, TensorProto.FLOAT16}
    for round_ in range(max_rounds):
        inferred = shape_inference.infer_shapes(model)
        types = {vi.name: vi.type.tensor_type.elem_type
                 for vi in [*inferred.graph.value_info, *inferred.graph.input, *inferred.graph.output]}
        types.update({i.name: i.data_type for i in model.graph.initializer})
        producers = {o: n for n in model.graph.node for o in n.output}

        new_nodes, fixed = [], 0
        for node in model.graph.node:
            if len({types.get(i) for i in node.input if types.get(i) in FLOATS}) > 1:
                for k, name in enumerate(node.input):
                    src = producers.get(name)
                    if types.get(name) == TensorProto.FLOAT16 and src is not None and src.op_type == "Constant":
                        value = numpy_helper.to_array(src.attribute[0].t).astype(np.float32)
                        out = f"{name}_fp32"
                        new_nodes.append(helper.make_node("Constant", [], [out], name=f"{src.name}_fp32",
                                                          value=numpy_helper.from_array(value, out)))
                        node.input[k] = out
                        fixed += 1
                if len({types.get(i) for i in node.input if not i.endswith("_fp32") and types.get(i) in FLOATS}) > 1:
                    for k, name in enumerate(node.input):
                        if types.get(name) == TensorProto.FLOAT:
                            out = f"{name}_to_fp16_{node.name.replace('/', '_')}"
                            new_nodes.append(helper.make_node("Cast", [name], [out], to=TensorProto.FLOAT16,
                                                              name=f"{out}_cast"))
                            node.input[k] = out
                            fixed += 1
            new_nodes.append(node)
        if not fixed:
            # Drop the float16 Constants that were replaced by float32 copies.
            used = {i for n in model.graph.node for i in n.input} | {o.name for o in model.graph.output}
            kept = [n for n in model.graph.node if n.op_type != "Constant" or any(o in used for o in n.output)]
            dropped = len(model.graph.node) - len(kept)
            model.graph.ClearField("node")
            model.graph.node.extend(kept)
            print(f"    fp16 graph consistent after {round_} repair round(s), {dropped} unused Constant(s) removed")
            return model
        model.graph.ClearField("node")
        model.graph.node.extend(new_nodes)  # new Constants/Casts precede their consumer: order stays valid
        print(f"    round {round_ + 1}: repaired {fixed} input(s)")
    raise RuntimeError("fp16 graph still has mixed-precision nodes")


def to_fp16(src: Path, dst: Path) -> None:
    import onnx
    from onnxconverter_common import float16

    model = onnx.load(str(src))  # also loads external .data next to it
    # keep_io_types: inputs/outputs stay float32, which is what parakeet.js feeds.
    model = float16.convert_float_to_float16(model, keep_io_types=True, disable_shape_infer=True)
    model = fix_mixed_precision(model)
    onnx.save(model, str(dst))  # fp16 encoder is < 2 GB, so a single file


def to_int8(src: Path, dst: Path) -> None:
    from onnxruntime.quantization import QuantType, quantize_dynamic

    quantize_dynamic(str(src), str(dst), weight_type=QuantType.QUInt8)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--model", required=True, help="NeMo model on Hugging Face, e.g. Noctra-labs/parakeet-tdt-0.6b-v3-lt")
    parser.add_argument("--out", required=True, type=Path, help="Output folder to upload")
    parser.add_argument("--keep-fp32", action="store_true", help="Keep the intermediate fp32 export")
    args = parser.parse_args()

    out: Path = args.out
    raw = out / "_fp32"
    raw.mkdir(parents=True, exist_ok=True)

    print(f"1/4 Exporting {args.model} to ONNX (fp32)…")
    export_fp32(args.model, raw)

    print("2/4 Encoder → fp16 (WebGPU)…")
    to_fp16(raw / "encoder-model.onnx", out / "encoder-model.fp16.onnx")

    print("3/4 Encoder and decoder → int8…")
    to_int8(raw / "encoder-model.onnx", out / "encoder-model.int8.onnx")
    to_int8(raw / "decoder_joint-model.onnx", out / "decoder_joint-model.int8.onnx")

    print("4/4 Vocabulary, config, README…")
    shutil.copy(raw / "vocab.txt", out / "vocab.txt")
    shutil.copy(raw / "config.json", out / "config.json")
    (out / "README.md").write_text(README.format(model=args.model), encoding="utf-8")
    if not args.keep_fp32:
        shutil.rmtree(raw)

    print(f"\nDone: {out.resolve()}")
    for f in sorted(out.iterdir()):
        if f.is_file():
            print(f"  {f.name:34} {f.stat().st_size / 1e6:10.1f} MB")


if __name__ == "__main__":
    main()
