"""Overlay the MERO chroma-key banner onto letterboxed vertical videos.

Usage: python insert_ads.py <input.mp4> <output.mp4> <banner_height_px> <y_px> <t1> [t2 ...] [--test SECONDS]
The banner (1280x720, green #18B528) is cropped to its graphic band, keyed,
scaled to banner_height_px and centred horizontally at y_px. While an ad plays
the video's own sound is ducked to 30 % and the banner voice is mixed on top.
"""
import subprocess, sys

BANNER = r"C:\Users\doting\Downloads\ор\mero-vpn\promo\mero_banner_voice.mp4"
AD_LEN = 8.1      # banner duration, seconds
DUCK = 0.3        # original volume during an ad
FADE = 0.35       # duck in/out ramp, seconds


def main():
    args = sys.argv[1:]
    test = None
    if "--test" in args:
        i = args.index("--test"); test = float(args[i + 1]); del args[i:i + 2]
    src, out, height, y, *times = args
    height, y, times = int(height), int(y), [float(t) for t in times]

    cmd = ["ffmpeg", "-v", "error", "-y", "-i", src]
    for t in times:
        cmd += ["-i", BANNER]

    chains, last = [], "0:v"
    for n, t in enumerate(times, start=1):
        chains.append(
            f"[{n}:v]setpts=PTS-STARTPTS+{t}/TB,crop=1280:640:0:60,scale=-2:{height},"
            f"chromakey=0x18B528:0.13:0.05,despill=type=green,format=yuva420p[b{n}]")
        chains.append(f"[{last}][b{n}]overlay=x=(W-w)/2:y={y}:eof_action=pass[v{n}]")
        last = f"v{n}"

    # duck the original track around each ad with short ramps
    parts = []
    for t in times:
        a, b = t, t + AD_LEN
        parts.append(f"if(between(t,{a - FADE},{a}),1-(1-{DUCK})*(t-{a - FADE})/{FADE},"
                     f"if(between(t,{a},{b}),{DUCK},"
                     f"if(between(t,{b},{b + FADE}),{DUCK}+(1-{DUCK})*(t-{b})/{FADE},1)))")
    gain = "*".join(f"({p})" for p in parts) if parts else "1"
    chains.append(f"[0:a]aresample=44100,volume='{gain}':eval=frame[duck]")
    mix = ["[duck]"]
    for n, t in enumerate(times, start=1):
        ms = int(t * 1000)  # amix ignores input start times, so delay the voice explicitly
        chains.append(f"[{n}:a]asetpts=PTS-STARTPTS,aresample=44100,aformat=channel_layouts=stereo,"
                      f"adelay={ms}|{ms},volume=1.15[a{n}]")
        mix.append(f"[a{n}]")
    chains.append(f"{''.join(mix)}amix=inputs={len(mix)}:duration=first:normalize=0,alimiter=limit=0.97[aout]")

    cmd += ["-filter_complex", ";".join(chains), "-map", f"[{last}]", "-map", "[aout]"]
    if test:
        cmd += ["-t", str(test)]
    cmd += ["-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "30",
            "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out]
    subprocess.run(cmd, check=True)


if __name__ == "__main__":
    main()
