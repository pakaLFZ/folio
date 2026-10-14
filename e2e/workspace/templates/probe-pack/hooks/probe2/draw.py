"""Test hook: draws a flat PNG at the box size without matplotlib, and can be
told to sleep, fail, warn, crash or draw the wrong size."""
import os
import struct
import sys
import time
import zlib

from folio_hook import fail, run, warn


def png(path, w, h, grey):
    """Write a w x h grey PNG."""
    row = b"\x00" + bytes([grey]) * w
    raw = zlib.compress(row * h)
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 0, 0, 0, 0)) + chunk(b"IDAT", raw) + chunk(b"IEND", b""))


def draw(request):
    """Draw, following the test switches in the inputs."""
    i = request.inputs
    if i.get("sleep"):
        time.sleep(float(i["sleep"]))
    if i.get("crash"):
        os._exit(3)
    if i.get("fail"):
        fail("asked to fail")
    if i.get("warn"):
        warn(i["warn"], field="warn")
    w, h = request.size_pixels
    if i.get("wrong_size"):
        w += 40
    tmp = request.out + ".part"
    png(tmp, w, h, 200)
    os.replace(tmp, request.out)


if __name__ == "__main__":
    run(draw)
