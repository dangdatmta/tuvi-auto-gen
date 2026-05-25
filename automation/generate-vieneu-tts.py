from __future__ import annotations

import argparse
from pathlib import Path

from vieneu import Vieneu


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate heroic Vietnamese VieNeu narration.")
    parser.add_argument("--text-file", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--voice", default="Tuyen")
    parser.add_argument("--mode", default="standard")
    parser.add_argument("--emotion", default="storytelling")
    parser.add_argument("--temperature", type=float, default=0.95)
    parser.add_argument("--top-k", type=int, default=50)
    parser.add_argument("--max-chars", type=int, default=170)
    args = parser.parse_args()

    text = Path(args.text_file).read_text(encoding="utf-8").strip()
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)

    tts = Vieneu(mode=args.mode, emotion=args.emotion)
    try:
        voice = tts.get_preset_voice(args.voice)
        audio = tts.infer(
            text=text,
            voice=voice,
            temperature=args.temperature,
            top_k=args.top_k,
            max_chars=args.max_chars,
            show_progress=False,
        )
        tts.save(audio, output)
        print(f"Saved: {output}")
        print(f"Duration: {len(audio) / tts.sample_rate:.2f}s")
    finally:
        tts.close()


if __name__ == "__main__":
    main()
