"""Build native sprite assets from the supplied chest-only opening clip.

No video playback dependency. RGB is preserved over the source's black matte;
outside the solid chest, unpremultiplied alpha keeps light rays translucent.
The bottom watermark band is excluded before any asset is written.
"""
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import zlib

SOURCE = Path("attached_assets/chest-opening_1791097630989.mp4")
OUT = Path("artifacts/word-hunt/assets/chest-animation")
SIZE = 384
FPS = 24
COUNT = 73
GRID = 4


def png(path, width, height, pixels):
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    scanlines = b"".join(b"\0" + pixels[y * width * 4:(y + 1) * width * 4] for y in range(height))
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(scanlines, 9))
        + chunk(b"IEND", b"")
    )
    subprocess.run([
        "magick", str(path), "-define", "png:compression-level=9",
        "-define", "png:compression-filter=5", "PNG32:" + str(path)
    ], check=True)


def chest_contour(rgb):
    """Solid chest silhouette from an unlit endpoint, excluding exterior light."""
    contour = []
    for y in range(SIZE):
        row = rgb[y * SIZE * 3:(y + 1) * SIZE * 3]
        brown = [
            x for x in range(int(SIZE * .065), int(SIZE * .945))
            if row[x * 3] > 40 and row[x * 3 + 1] > 8
            and row[x * 3 + 1] < row[x * 3] * .87
            and row[x * 3 + 2] < row[x * 3] * .86
        ] if SIZE * .05 < y < SIZE * .94 else []
        contour.append((brown[0], brown[-1]) if len(brown) >= SIZE * .10 else (-1, -1))
    return contour


def isolate(rgb, frame, closed_contour, open_contour):
    rgba = bytearray(SIZE * SIZE * 4)
    opening = max(0, min(1, (frame - 25) / 17))
    for y in range(int(SIZE * 0.94)):
        row = rgb[y * SIZE * 3:(y + 1) * SIZE * 3]
        closed, opened = closed_contour[y], open_contour[y]
        if opening == 0:
            solid = closed
        elif opening == 1:
            solid = opened
        elif closed[0] < 0 or opened[0] < 0:
            solid = (-1, -1)
        else:
            solid = tuple(round(a + (b - a) * opening) for a, b in zip(closed, opened))
        for x in range(SIZE):
            r, g, b = row[x * 3:x * 3 + 3]
            brightness = max(r, g, b)
            inside = solid[0] <= x <= solid[1]
            if brightness <= 6 and not inside:
                continue
            alpha = 255 if inside else brightness
            offset = (y * SIZE + x) * 4
            rgba[offset:offset + 4] = bytes((
                min(255, round(r * 255 / alpha)),
                min(255, round(g * 255 / alpha)),
                min(255, round(b * 255 / alpha)),
                alpha,
            ))
    return rgba


def decoded_audio_digest(path):
    pcm = subprocess.check_output([
        "ffmpeg", "-v", "error", "-i", str(path), "-vn",
        "-f", "f32le", "-acodec", "pcm_f32le", "-"
    ])
    return hashlib.sha256(pcm).hexdigest()


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    raw = subprocess.check_output([
        "ffmpeg", "-v", "error", "-i", str(SOURCE), "-an",
        "-vf", f"scale={SIZE}:{SIZE}:flags=lanczos", "-pix_fmt", "rgb24",
        "-f", "rawvideo", "-"
    ])
    frame_bytes = SIZE * SIZE * 3
    assert len(raw) == COUNT * frame_bytes, "Unexpected source frame count"
    closed_contour = chest_contour(raw[:frame_bytes])
    open_contour = chest_contour(raw[-frame_bytes:])
    atlas = bytearray(SIZE * GRID * SIZE * GRID * 4)
    final = None
    for frame in range(COUNT):
        pixels = isolate(raw[frame * frame_bytes:(frame + 1) * frame_bytes], frame, closed_contour, open_contour)
        final = pixels
        column, row = frame % GRID, (frame % (GRID * GRID)) // GRID
        for y in range(SIZE):
            start = ((row * SIZE + y) * SIZE * GRID + column * SIZE) * 4
            atlas[start:start + SIZE * 4] = pixels[y * SIZE * 4:(y + 1) * SIZE * 4]
        if frame % 16 == 15 or frame == COUNT - 1:
            png(OUT / f"chest-atlas-{frame // 16}.png", SIZE * GRID, SIZE * GRID, atlas)
            atlas = bytearray(len(atlas))
        if frame in (0, 34, 44, 59, 72):
            png(Path(f"/tmp/chest-isolated-{frame}.png"), SIZE, SIZE, pixels)
    # The front rim/body is the occlusion layer: the original dumpling sits
    # behind it, inside the box. No collectible pixels are altered.
    front = bytearray(final)
    front[:round(SIZE * .529) * SIZE * 4] = bytes(round(SIZE * .529) * SIZE * 4)
    png(OUT / "chest-front.png", SIZE, SIZE, front)
    audio = OUT / "chest-opening.m4a"
    subprocess.run([
        "ffmpeg", "-v", "error", "-y", "-i", str(SOURCE),
        "-vn", "-c:a", "copy", "-movflags", "+faststart", str(audio)
    ], check=True)
    source_pcm = decoded_audio_digest(SOURCE)
    assert source_pcm == decoded_audio_digest(audio), "Extraction changed decoded audio"
    # Some preview browsers lack AAC decoding. IEEE-float WAV preserves
    # the exact decoded samples, rather than introducing a lossy transcode.
    web_audio = OUT / "chest-opening.wav"
    subprocess.run([
        "ffmpeg", "-v", "error", "-y", "-i", str(SOURCE),
        "-vn", "-c:a", "pcm_f32le", str(web_audio)
    ], check=True)
    assert source_pcm == decoded_audio_digest(web_audio), "Web audio changed decoded samples"
    manifest = {
        "source": SOURCE.name,
        "sourceSha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        "frameCount": COUNT, "fps": FPS, "frameSize": SIZE, "atlasGrid": GRID,
        "durationMs": round(COUNT * 1000 / FPS), "dumplingRevealMs": 2458,
        "watermarkExcludedFromY": int(SIZE * .94),
        "frontRimY": round(SIZE * .529),
        "decodedAudioSha256": source_pcm,
        "audioReencoded": False,
    }
    (OUT / "source-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()