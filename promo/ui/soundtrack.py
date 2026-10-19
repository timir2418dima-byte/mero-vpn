"""120 BPM loop for the MERO UI animation + UI sound effects snapped to the measured beat grid.

Usage: python soundtrack.py out.wav
1. Synthesize a 7-bar loop (14 s), rendered over three cycles so note tails wrap seamlessly.
2. Analyse the result with numpy: spectral-flux onsets -> tempo by autocorrelation -> beat phase.
3. Snap every UI event to the nearest measured onset and mix the UI sounds on top.
Everything is generated here, so there are no music rights to clear.
"""
import subprocess, sys
import numpy as np
from scipy.signal import butter, sosfilt

SR, BPM, BARS = 44100, 120, 7
SPB = 60 / BPM
LOOP = BARS * 4 * SPB                  # 14.0 s
N = int(LOOP * SR)
rng = np.random.default_rng(3)


def filt(x, kind, f, order=2):
    return sosfilt(butter(order, f, btype=kind, fs=SR, output='sos'), x)


def env(n, a, d, curve=4.0):
    t = np.arange(n) / SR
    return np.clip(t / max(a, 1e-4), 0, 1) * np.exp(-curve * np.maximum(t - a, 0) / max(d, 1e-4))


def put(buf, sig, at, gain=1.0):
    i = int(round(at * SR))
    if i < 0:
        sig, i = sig[-i:], 0
    j = min(len(buf), i + len(sig))
    if j > i:
        buf[i:j] += sig[: j - i] * gain


def noise(sec):
    return rng.standard_normal(int(sec * SR))


# ---------------- instruments ----------------
def kick():
    n = int(.4 * SR); t = np.arange(n) / SR
    f = 48 + 90 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, .001, .25, 3.2)


def clap():
    n = int(.3 * SR)
    x = filt(noise(.3), 'band', [900, 5000])
    e = sum(env(n, .0005, .012, 3) * (np.arange(n) >= int(k * SR)) for k in (0, .011, .022)) + env(n, .02, .16, 4) * .7
    return x * e * .6


def hat(d=.03):
    n = int(.12 * SR)
    return filt(noise(.12), 'high', 8000) * env(n, .0005, d, 4)


def shaker():
    n = int(.08 * SR)
    return filt(noise(.08), 'band', [5000, 11000]) * env(n, .008, .03, 3) * .5


def epiano(freq, sec=1.2):
    n = int(sec * SR); t = np.arange(n) / SR
    mod = np.sin(2 * np.pi * freq * 2 * t) * 1.2 * np.exp(-t * 5)
    tone = np.sin(2 * np.pi * freq * t + mod) + .25 * np.sin(2 * np.pi * freq * 2 * t)
    return tone * env(n, .004, .7, 3)


def bass(freq, sec):
    n = int(sec * SR); t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * freq * t) + .35 * np.sin(2 * np.pi * freq * 2 * t) + .12 * np.sin(2 * np.pi * freq * 3 * t)
    return tone * np.clip(t / .008, 0, 1) * np.clip((sec - t) / .04, 0, 1)


def nf(name):
    names = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
    return 440 * 2 ** ((names[name[0]] + 12 * (int(name[-1]) + 1) - 69) / 12)


CHORDS = [  # (bass root, chord tones) one per bar; the 7th bar resolves back to bar 1
    ('A1', ['C4', 'E4', 'G4', 'A3']), ('F1', ['A3', 'C4', 'E4', 'F3']), ('C2', ['E4', 'G4', 'B3', 'C4']),
    ('G1', ['B3', 'D4', 'E4', 'G3']), ('A1', ['C4', 'E4', 'G4', 'A3']), ('F1', ['A3', 'C4', 'E4', 'F3']),
    ('G1', ['B3', 'D4', 'F4', 'G3']),
]


def music_loop():
    """Three cycles long; the middle cycle is the seamless loop."""
    buf = np.zeros(N * 3)
    for cyc in range(3):
        o = cyc * LOOP
        for b in range(BARS * 4):
            at = o + b * SPB
            put(buf, kick(), at, .9)
            if b % 2 == 1:
                put(buf, clap(), at, .5)
            put(buf, hat(), at + SPB / 2, .35)
            for s in range(4):
                put(buf, shaker(), at + s * SPB / 4, .18 if s % 2 else .1)
        for bar, (root, tones) in enumerate(CHORDS):
            at = o + bar * 4 * SPB
            r = nf(root)
            for off, dur, mult in ((0, .45, 1), (.75, .2, 1), (1.5, .45, 2), (2.5, .2, 1), (3.25, .45, 1.5)):
                put(buf, filt(bass(r * mult, dur * SPB * 2), 'low', 380), at + off * SPB, .42)
            for off in (.5, 1.5, 2.5, 3.5):     # off-beat keys
                chord = sum(epiano(nf(x), .6) for x in tones)
                put(buf, chord, at + off * SPB, .06)
    return buf[N:2 * N]


# ---------------- beat analysis ----------------
def analyse(x):
    hop, win = 256, 1024
    frames = 1 + (len(x) - win) // hop
    idx = np.arange(win)[None, :] + hop * np.arange(frames)[:, None]
    spec = np.abs(np.fft.rfft(x[idx] * np.hanning(win), axis=1))
    diff = np.maximum(np.diff(np.log1p(spec), axis=0), 0)
    flux = np.concatenate([[0], diff.sum(axis=1)])
    flux /= flux.max()
    low = np.fft.rfftfreq(win, 1 / SR) < 150          # kick band: the downbeat lives here, not in the hats
    kick_flux = np.concatenate([[0], diff[:, low].sum(axis=1)])
    kick_flux /= kick_flux.max()
    fps = SR / hop
    ac = np.correlate(flux - flux.mean(), flux - flux.mean(), 'full')[len(flux) - 1:]
    lags = np.arange(len(ac)) / fps
    ok = (lags > 60 / 180) & (lags < 60 / 80)
    period = lags[ok][np.argmax(ac[ok])]
    bpm = 60 / period
    # beat phase: offset that collects the most onset energy on the grid
    offs = np.arange(0, period, 1 / fps)
    score = [kick_flux[np.clip(((np.arange(0, len(x) / SR - o, period) + o) * fps).astype(int), 0, len(flux) - 1)].sum() for o in offs]
    phase = offs[int(np.argmax(score))]
    # onset peaks (local maxima above threshold)
    peaks = [i for i in range(1, len(flux) - 1) if flux[i] > .25 and flux[i] >= flux[i - 1] and flux[i] > flux[i + 1]]
    return bpm, phase, np.array(peaks) / fps


# ---------------- UI sounds ----------------
def click():
    n = int(.05 * SR)
    return filt(noise(.05), 'band', [2000, 7000]) * env(n, .0003, .006, 3) * .8 + \
        np.sin(2 * np.pi * 1800 * np.arange(n) / SR) * env(n, .0003, .012, 3) * .3


def tock(f=900):
    n = int(.09 * SR); t = np.arange(n) / SR
    return np.sin(2 * np.pi * f * t * (1 - .25 * t / .09)) * env(n, .001, .035, 3)


def pop(f0=420, f1=260):
    n = int(.12 * SR); t = np.arange(n) / SR
    fr = f0 + (f1 - f0) * t / .12
    return np.sin(2 * np.pi * np.cumsum(fr) / SR) * env(n, .002, .05, 3)


def chime(notes):
    out = np.zeros(int(1.0 * SR))
    for k, f in enumerate(notes):
        n = int(.8 * SR); t = np.arange(n) / SR
        tone = (np.sin(2 * np.pi * f * t) + .3 * np.sin(2 * np.pi * f * 3 * t)) * env(n, .003, .45, 3)
        put(out, tone, k * .07)
    return out


def key():
    n = int(.04 * SR)
    return filt(noise(.04), 'band', [1500, 6000]) * env(n, .0003, .008, 3) * .7


EVENTS = [(t, 'click') for t in (0.5, 3.0, 4.0, 5.0, 5.5, 8.5, 9.0, 9.5, 10.0, 10.5)] + \
    [(6.0, 'grab'), (7.0, 'grab'), (6.45, 'release'), (7.75, 'release'), (1.0, 'pop'), (2.5, 'pop'), (3.5, 'pop'),
     (6.5, 'pop'), (8.0, 'pop'), (9.75, 'pop'), (11.0, 'pop'), (12.0, 'pop'), (13.5, 'pop'),
     (2.0, 'chime'), (13.0, 'chime2'), (11.5, 'tick'),
     (12.5, 'key'), (12.625, 'key'), (12.75, 'key'), (12.875, 'key'), (13.0, 'enter')]


def main(out):
    music = music_loop()
    bpm, phase, peaks = analyse(music)
    print(f'measured tempo {bpm:.2f} bpm, first downbeat at {phase * 1000:.1f} ms, {len(peaks)} onset peaks')
    ui = np.zeros(N * 3)
    snapped = []
    for t, kind in EVENTS:
        near = peaks[np.argmin(np.abs(peaks - t))] if len(peaks) else t
        at = near if abs(near - t) < .04 else t
        snapped.append(abs(at - t) * 1000)
        sig = {'click': click(), 'grab': tock(700), 'release': tock(1100) * .7, 'pop': pop() * .55,
               'chime': chime([880, 1318.5]) * .35, 'chime2': chime([1046.5, 1568]) * .35, 'tick': tock(1500) * .5,
               'key': key(), 'enter': tock(600) * 1.1}[kind]
        for c in range(3):  # wrap tails across the loop seam
            put(ui, sig, at + c * LOOP, .9)
    ui = ui[N:2 * N]
    print(f'UI events snapped to measured onsets, mean offset {np.mean(snapped):.1f} ms, max {np.max(snapped):.1f} ms')
    mix = music * .55 + ui * .7
    mix = np.tanh(mix * 1.2) / np.tanh(1.2)
    mix *= .89 / np.max(np.abs(mix))
    pcm = (np.stack([mix, mix], 1) * 32767).astype('<i2').tobytes()
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 's16le', '-ar', str(SR), '-ac', '2', '-i', '-', out], input=pcm, check=True)
    print('wrote', out)


if __name__ == '__main__':
    main(sys.argv[1])
