"""Synthesizes the 15 s soundtrack for the MERO motion video: music, sound effects and the voiceover.

Usage: python soundtrack.py voice_raw.mp3 out.wav
Everything here is generated from oscillators and noise, so there are no third-party music rights.
"""
import subprocess, sys
import numpy as np
from scipy.signal import butter, sosfilt

SR, DUR = 44100, 15.0
N = int(SR * DUR)
rng = np.random.default_rng(7)
t_all = np.arange(N) / SR


def bus():
    return np.zeros(N)


def place(dst, sig, at, gain=1.0):
    i = int(at * SR)
    if i >= N:
        return
    j = min(N, i + len(sig))
    dst[i:j] += sig[: j - i] * gain


def env(n, a=0.005, d=0.2, curve=4.0):
    t = np.arange(n) / SR
    att = np.clip(t / max(a, 1e-4), 0, 1)
    return att * np.exp(-curve * np.maximum(t - a, 0) / max(d, 1e-4))


def filt(x, kind, f, order=2):
    sos = butter(order, f, btype=kind, fs=SR, output='sos')
    return sosfilt(sos, x)


def noise(sec):
    return rng.standard_normal(int(sec * SR))


# ---------- drums ----------
def kick(sec=0.35):
    n = int(sec * SR); t = np.arange(n) / SR
    freq = 45 + 110 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(freq) / SR
    return np.sin(ph) * env(n, 0.001, 0.22, 3.5) + filt(noise(sec), 'high', 3000) * env(n, 0.0005, 0.01, 6) * 0.3


def snare(sec=0.25):
    n = int(sec * SR)
    body = np.sin(2 * np.pi * 190 * np.arange(n) / SR) * env(n, 0.001, 0.06, 4)
    return filt(noise(sec), 'band', [1200, 6000]) * env(n, 0.001, 0.12, 4) * 0.8 + body * 0.4


def hat(sec=0.06, open_=False):
    n = int(sec * SR)
    return filt(noise(sec), 'high', 7000) * env(n, 0.0005, 0.12 if open_ else 0.025, 4)


# ---------- tonal ----------
def saw(freq, sec, harmonics=12):
    t = np.arange(int(sec * SR)) / SR
    return sum(np.sin(2 * np.pi * freq * k * t) / k for k in range(1, harmonics + 1)) * 0.6


def tri(freq, sec):
    t = np.arange(int(sec * SR)) / SR
    return sum(((-1) ** ((k - 1) // 2)) * np.sin(2 * np.pi * freq * k * t) / (k * k) for k in (1, 3, 5, 7)) * 0.8


def whoosh(sec=0.6, up=True):
    n = int(sec * SR)
    x = noise(sec)
    lo, hi = filt(x, 'band', [300, 1200]), filt(x, 'band', [1500, 7000])
    ramp = np.linspace(0, 1, n) if up else np.linspace(1, 0, n)
    shape = np.sin(np.linspace(0, np.pi, n)) ** 1.5
    return (lo * (1 - ramp) + hi * ramp) * shape * 0.9


def impact(sec=1.4):
    n = int(sec * SR); t = np.arange(n) / SR
    freq = 32 + 50 * np.exp(-t * 6)
    boom = np.sin(2 * np.pi * np.cumsum(freq) / SR) * env(n, 0.002, 0.9, 3)
    crash = filt(noise(sec), 'high', 2500) * env(n, 0.001, 0.5, 5) * 0.35
    return boom + crash


def blip(f0, f1, sec=0.12):
    n = int(sec * SR); t = np.arange(n) / SR
    freq = f0 + (f1 - f0) * (t / sec)
    return np.sin(2 * np.pi * np.cumsum(freq) / SR) * env(n, 0.002, sec * 0.6, 3)


def glitch(sec, seed):
    r = np.random.default_rng(seed)
    out = np.zeros(int(sec * SR)); pos = 0
    while pos < len(out):
        seg = int(r.uniform(0.015, 0.05) * SR)
        f = r.choice([220, 440, 660, 880, 1320, 1760])
        tt = np.arange(seg) / SR
        sq = np.sign(np.sin(2 * np.pi * f * tt))
        sq = np.round(sq * 4) / 4  # crushed
        out[pos:pos + seg] = sq[: len(out) - pos] * r.uniform(0.25, 0.6)
        pos += seg
    return out


def main(voice_path, out_path):
    music, sfx, voice = bus(), bus(), bus()

    # --- part 1: broken internet (0 - 3.6 s) ---
    drone_t = t_all[: int(4.4 * SR)]
    drone = (np.sin(2 * np.pi * 55 * drone_t) + 0.6 * np.sin(2 * np.pi * 55.7 * drone_t) + 0.3 * np.sin(2 * np.pi * 110.4 * drone_t))
    drone *= np.clip(drone_t / 0.4, 0, 1) * np.clip((4.4 - drone_t) / 0.6, 0, 1) * 0.22
    music[: len(drone)] += drone
    for k in range(14):  # clock-like ticks, like a stalled loader
        place(music, hat(0.04), 0.25 + k * 0.25, 0.5)
    for at, dur, seed in [(1.62, 0.2, 1), (2.85, 0.13, 2), (3.25, 0.35, 3)]:
        place(sfx, filt(glitch(dur, seed), 'band', [300, 5000]), at, 0.5)
    place(sfx, whoosh(0.5, up=True), 0.0, 0.5)       # player slides in

    # --- transition: riser into impact ---
    rise_s = 0.8; n = int(rise_s * SR); tt = np.arange(n) / SR
    riser = np.sin(2 * np.pi * np.cumsum(200 + 1300 * (tt / rise_s) ** 2) / SR) * (tt / rise_s) ** 2 * 0.35
    riser += filt(noise(rise_s), 'high', 2000) * (tt / rise_s) ** 3 * 0.5
    place(sfx, riser, 3.55)
    place(sfx, impact(), 4.35, 0.95)

    # --- part 2: beat from 4.45 s, 120 bpm ---
    beat0, spb = 4.45, 0.5
    bars = [(55.0, [220.0, 261.63, 329.63]), (43.65, [174.61, 220.0, 261.63]),
            (65.41, [261.63, 329.63, 392.0]), (49.0, [196.0, 246.94, 293.66])]
    nbeats = int((DUR - beat0) / spb) + 1
    for b in range(nbeats):
        at = beat0 + b * spb
        if at >= DUR - 0.3:
            break
        place(music, kick(), at, 0.95)
        if b % 2 == 1:
            place(music, snare(), at, 0.45)
        place(music, hat(0.05), at + spb / 2, 0.28)
        place(music, hat(0.04), at, 0.12)
        root, chord = bars[(b // 4) % 4]
        for s in (0, 0.25):  # bass on 8ths, sidechain-ish pump
            nb = int(0.23 * SR)
            note = filt(saw(root * 2, 0.23), 'low', 420) * env(nb, 0.004, 0.18, 2.5)
            place(music, note, at + s, 0.34)
        if b % 4 == 0:  # pad per bar
            pad = sum(tri(f, 2.0) for f in chord)
            pn = len(pad); pt = np.arange(pn) / SR
            pad *= np.clip(pt / 0.25, 0, 1) * np.clip((2.0 - pt) / 0.3, 0, 1) * 0.07
            place(music, filt(pad, 'low', 2200), at)

    # --- sound effects for the visuals ---
    place(sfx, blip(900, 300, 0.08), 6.0, 0.6)            # power click
    place(sfx, impact(0.9), 6.0, 0.55)
    place(sfx, whoosh(0.7, up=False), 6.02, 0.45)         # shockwave
    place(sfx, whoosh(0.45, up=True), 7.05, 0.5)          # brand zooms past
    place(sfx, whoosh(0.4, up=False), 7.4, 0.4)           # player returns
    place(sfx, blip(1200, 2400, 0.14), 9.0, 0.45)         # 4K pop
    place(sfx, filt(noise(0.5), 'high', 8000) * env(int(0.5 * SR), 0.01, 0.3, 3), 9.05, 0.35)  # shine
    place(sfx, blip(700, 1100, 0.1), 10.05, 0.4)          # free day chip
    place(sfx, whoosh(0.45, up=True), 11.35, 0.5)         # out to CTA
    place(sfx, impact(1.0), 11.85, 0.45)
    place(sfx, blip(800, 1600, 0.12), 12.55, 0.4)          # pill

    # --- voiceover phrases (source in, source out, place at) ---
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', voice_path, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    v = np.frombuffer(raw, dtype=np.float32).astype(np.float64)
    phrases = [(0.15, 1.45, 0.30), (2.40, 4.10, 1.75), (5.06, 6.60, 4.45),
               (7.61, 9.89, 7.60), (10.88, 12.15, 10.10), (13.15, 14.35, 12.30)]
    duck = np.ones(N)
    for a, b, at in phrases:
        seg = v[int(a * SR):int(b * SR)].copy()
        fade = int(0.012 * SR)
        seg[:fade] *= np.linspace(0, 1, fade); seg[-fade:] *= np.linspace(1, 0, fade)
        place(voice, seg, at)
        i0, i1 = int((at - 0.08) * SR), int((at + len(seg) / SR + 0.12) * SR)
        duck[max(0, i0):min(N, i1)] = 0.42
    duck = filt(duck, 'low', 6)  # smooth gain changes
    voice = filt(voice, 'high', 90)
    voice *= 1.0 / (np.max(np.abs(voice)) + 1e-9) * 0.9

    mix = music * duck * 0.55 + sfx * (0.6 + 0.4 * duck) * 0.6 + voice
    tail = int(0.5 * SR)
    mix[-tail:] *= np.linspace(1, 0, tail)
    mix = np.tanh(mix * 1.1) / np.tanh(1.1)
    mix *= 0.89 / np.max(np.abs(mix))
    stereo = np.stack([mix, mix], axis=1)
    pcm = (stereo * 32767).astype('<i2').tobytes()
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 's16le', '-ar', str(SR), '-ac', '2', '-i', '-', out_path],
                   input=pcm, check=True)
    print('wrote', out_path)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
