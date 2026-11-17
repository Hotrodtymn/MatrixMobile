"""Offline host check; never uses a microphone. Requires sherpa-onnx==2.0.1,
numpy, onnx, sentencepiece in an isolated Python environment. Positive/negative
fixtures must be explicitly supplied synthesized 16 kHz mono PCM16 WAV files.
This does not validate Android AssetManager/JNI, microphone capture or Samsung.
"""
import argparse, hashlib, json, wave
from pathlib import Path
import numpy as np
import onnx
import sentencepiece
import sherpa_onnx

root = Path(__file__).resolve().parents[1] / 'modules/hey-matrix'
assets = root / 'android/src/main/assets/hey-matrix'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--positive-wav', type=Path, required=True)
parser.add_argument('--negative-wav', type=Path, required=True)
args = parser.parse_args()
for name, digest in json.loads((root / 'artifacts.sha256.json').read_text()).items():
    assert hashlib.sha256((root / name).read_bytes()).hexdigest() == digest, name
pieces = sentencepiece.SentencePieceProcessor(model_file=str(assets / 'bpe.model')).encode('HEY MATRIX', out_type=str)
line = (assets / 'keywords.txt').read_text(encoding='utf-8').strip()
assert ' '.join(pieces) + ' :1.5 #0.35 @HEY_MATRIX' == line
encoder = 'encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx'
metadata = {v.key: v.value for v in onnx.load(str(assets / encoder)).metadata_props}
assert metadata['model_type'] == 'zipformer2'
kws = sherpa_onnx.KeywordSpotter(tokens=str(assets / 'tokens.txt'), encoder=str(assets / encoder),
    decoder=str(assets / 'decoder-epoch-12-avg-2-chunk-16-left-64.onnx'),
    joiner=str(assets / 'joiner-epoch-12-avg-2-chunk-16-left-64.int8.onnx'),
    keywords_file=str(assets / 'keywords.txt'), num_threads=1, sample_rate=16000,
    feature_dim=80, max_active_paths=4, num_trailing_blanks=2, keywords_score=1.5, keywords_threshold=0.25)
print('Pinned files, model metadata, BPE phrase configuration and native initialization: PASS')
def detect(path):
    with wave.open(str(path)) as audio:
        assert (audio.getframerate(), audio.getnchannels(), audio.getsampwidth()) == (16000, 1, 2)
        samples = np.frombuffer(audio.readframes(audio.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    samples = np.concatenate([samples, np.zeros(16000, dtype=np.float32)])
    stream = kws.create_stream()
    hits = 0
    for offset in range(0, len(samples), 1600):
        stream.accept_waveform(16000, samples[offset:offset + 1600])
        while kws.is_ready(stream):
            kws.decode_stream(stream)
            result = kws.get_result(stream)
            if result:
                assert result == 'HEY_MATRIX', 'Unexpected configured keyword label'
                hits += 1
                kws.reset_stream(stream)
    return hits
assert detect(args.positive_wav) >= 1, 'Positive synthesized fixture did not trigger'
assert detect(args.negative_wav) == 0, 'Negative synthesized fixture triggered'
print('Supplied synthesized positive/negative fixtures: PASS (not a device accuracy test)')
