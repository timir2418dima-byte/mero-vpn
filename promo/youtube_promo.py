"""Vertical 9:16 promo cut from the screen recording: VPN on -> YouTube in 4K -> bot in profile.

Usage: python youtube_promo.py
Laggy stretches of the recording are simply not used; the VPN key and Telegram ID in the
Happ window are blurred.
"""
import subprocess

SRC = r"C:\Users\doting\Videos\2026-10-19 11-54-49.mp4"
VOICE = r"C:\Users\doting\Downloads\ор\mero-vpn\promo\voice_youtube.mp3"
BANNER = r"C:\Users\doting\Downloads\ор\mero-vpn\promo\mero_banner_voice.mp4"
OUT = r"C:\Users\doting\Downloads\MERO YouTube 4K.mp4"
FONT = "C\\:/Windows/Fonts/segoeuib.ttf"

HAPP = (632, 384, 348, 506)       # right panel of Happ: power button + selected server
BROWSER = (804, 152, 932, 592)    # browser window
FULL = "crop=490:870:715:92"      # 9:16 slice of fullscreen video, clear of YouTube UI
# the selected profile is named tg_<telegram id>; paint it over with a clean label
RELABEL = ("drawbox=x=722:y=812:w=184:h=30:color=0x1F2027:t=fill,"
           f"drawtext=fontfile='C\\:/Windows/Fonts/segoeui.ttf':text='MERO VPN · Германия':"
           "fontsize=13:fontcolor=0xD9DBE2:x=806-text_w/2:y=818")

# (source start, source end, kind)
SEGMENTS = [
    (0.9, 3.0, "happ"),
    (6.4, 7.4, "browser"),
    (12.4, 13.2, "browser"),
    (16.0, 17.2, "browser"),
    (19.2, 20.6, "crop=416:740:752:80"),  # beach: keep above YouTube's hover preview
    (23.0, 27.2, "full"),
    (40.0, 42.5, "full"),
]
# (voice start, voice end, place at output second)
VOICE_PARTS = [(0.15, 1.75, 0.2), (2.78, 6.38, 2.3), (7.40, 8.65, 7.0), (9.67, 11.95, 8.6)]
# (text, from, to) on the output timeline
CAPTIONS = [
    ("Подключаю MERO VPN", 0.15, 2.1),
    ("Включаю YouTube в 4K", 2.3, 5.1),
    ("И всё работает", 5.1, 6.9),
    ("Первый день бесплатно", 7.0, 8.5),
    ("Бот MERO VPN в профиле", 8.6, 13.2),
]


def window_shot(i, crop, extra="", fit="scale=1040:-2", lift=80):
    x, y, w, h = crop
    pre = f"{extra}," if extra else ""
    return (
        f"[s{i}]{pre}split[s{i}a][s{i}b];"
        f"[s{i}a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=24:2,eq=brightness=-0.18[bg{i}];"
        f"[s{i}b]crop={w}:{h}:{x}:{y},{fit}[fg{i}];"
        f"[bg{i}][fg{i}]overlay=(W-w)/2:(H-h)/2-{lift},setsar=1[v{i}]"
    )


def main():
    parts, labels = [], []
    for i, (a, b, kind) in enumerate(SEGMENTS):
        parts.append(f"[0:v]trim={a}:{b},setpts=PTS-STARTPTS,fps=30[s{i}]")
        if kind == "happ":
            parts.append(window_shot(i, HAPP, RELABEL, fit="scale=-2:1150", lift=150))
        elif kind == "browser":
            parts.append(window_shot(i, BROWSER))
        else:
            crop = FULL if kind == "full" else kind
            parts.append(f"[s{i}]{crop},scale=1080:1920,setsar=1[v{i}]")
        parts.append(f"[0:a]atrim={a}:{b},asetpts=PTS-STARTPTS[o{i}]")
        labels.append(f"[v{i}][o{i}]")
    total = sum(b - a for a, b, _ in SEGMENTS)
    parts.append(f"{''.join(labels)}concat=n={len(SEGMENTS)}:v=1:a=1[cv][ca]")

    # end card: the @mero_vpn_bot pill from the green-screen banner over the last shot
    end_at = total - 2.5
    parts.append(
        f"[2:v]trim=5.0:7.5,setpts=PTS-STARTPTS+{end_at}/TB,crop=1280:520:0:100,scale=1000:-2,"
        f"chromakey=0x18B528:0.13:0.05,despill=type=green,format=yuva420p[pill]")
    parts.append("[cv][pill]overlay=(W-w)/2:250:eof_action=pass[cvp]")

    caps = "[cvp]"
    for n, (text, t0, t1) in enumerate(CAPTIONS):
        out = f"[c{n}]"
        caps += (f"drawtext=fontfile='{FONT}':text='{text}':fontsize=74:fontcolor=white:"
                 f"borderw=7:bordercolor=black@0.85:x=(w-text_w)/2:y=1460:enable='between(t,{t0},{t1})'{out}")
        if n < len(CAPTIONS) - 1:
            caps += f";{out}"
    parts.append(caps)
    last_v = f"[c{len(CAPTIONS) - 1}]"

    mix = ["[bed]"]
    parts.append("[ca]volume=0.25[bed]")
    for k, (a, b, at) in enumerate(VOICE_PARTS):
        ms = int(at * 1000)
        parts.append(f"[1:a]atrim={a}:{b},asetpts=PTS-STARTPTS,aresample=48000,"
                     f"aformat=channel_layouts=stereo,adelay={ms}|{ms},volume=1.5[vo{k}]")
        mix.append(f"[vo{k}]")
    parts.append(f"{''.join(mix)}amix=inputs={len(mix)}:duration=first:normalize=0,"
                 f"alimiter=limit=0.95,afade=t=out:st={total - 0.4:.2f}:d=0.4[aout]")

    cmd = ["ffmpeg", "-v", "error", "-y", "-i", SRC, "-i", VOICE, "-i", BANNER,
           "-filter_complex", ";".join(parts), "-map", last_v, "-map", "[aout]",
           "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", "-r", "30",
           "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", OUT]
    subprocess.run(cmd, check=True)
    print(f"{OUT}: {total:.1f}s")


if __name__ == "__main__":
    main()
