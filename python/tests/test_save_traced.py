"""folio_hook.save_traced: a script's figure saved at exactly its box, with a
trace file beside it that names the script, its inputs and the image's hash.

Run: python python/tests/test_save_traced.py (exit 1 on a failure).
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("MPLBACKEND", "Agg")

import matplotlib.pyplot as plt  # noqa: E402
from PIL import Image  # noqa: E402

from folio_hook import SlotSize, save_traced  # noqa: E402

SIZES = [(300, 200), (439.6, 360.2), (194.2, 151.7)]


def problems_at(folder: Path, w: float, h: float) -> list[str]:
    data = folder / "data.csv"
    data.write_text("a,b\n1,2\n")
    fig = plt.figure(figsize=SlotSize(w, h).figsize)
    fig.add_subplot().bar(["a", "b"], [1, 2])
    image = folder / f"fig-{w}.png"
    record = save_traced(fig, image, script=__file__, inputs=[data])
    found = []
    want = (int(w * 200 / 72 + 0.5), int(h * 200 / 72 + 0.5))
    if Image.open(image).size != want:
        found.append(f"{Image.open(image).size} px, want {want}")
    if record["box"] != {"w": w, "h": h}:
        found.append(f"box {record['box']}")
    if json.loads(image.with_name(f"{image.name}.trace.json").read_text()) != record:
        found.append("trace file differs from the returned record")
    if record["output"]["sha256"] != hashlib.sha256(image.read_bytes()).hexdigest():
        found.append("output sha256 is not the image's")
    if record["source"]["inputs"] != [{"path": str(data.resolve()), "sha256": hashlib.sha256(data.read_bytes()).hexdigest()}]:
        found.append(f"inputs {record['source']['inputs']}")
    if " py " not in record["source"]["command"] or not record["source"]["command"].endswith(Path(sys.argv[0]).name):
        found.append(f"command {record['source']['command']} is not folio py with this script")
    if tuple(round(v * 72, 2) for v in fig.get_size_inches()) != (w, h):
        found.append(f"figure left at {fig.get_size_inches()} in")
    plt.close(fig)
    return found


def refuses_other_formats(folder: Path) -> list[str]:
    try:
        save_traced(plt.figure(), folder / "fig.jpg")
    except ValueError:
        return []
    return ["a .jpg was saved"]


def main() -> int:
    failed = 0
    with tempfile.TemporaryDirectory() as tmp:
        checks = [(f"{w} x {h} pt", lambda w=w, h=h: problems_at(Path(tmp), w, h)) for w, h in SIZES]
        for name, check in [*checks, ("refuses .jpg", lambda: refuses_other_formats(Path(tmp)))]:
            found = check()
            failed += bool(found)
            print(f"{'FAIL' if found else 'PASS'}  {name}  {'; '.join(found)}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
