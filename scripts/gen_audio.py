"""Synthesizes all game audio (no samples, no licensing): SFX + a seamless medieval lute loop.
Writes assets/audio/*.mp3 (via ffmpeg) and src/audio/manifest.ts.

    python scripts/gen_audio.py
"""
import os, subprocess, wave, tempfile
import numpy as np

SR = 44100
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'audio')
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(7)


def t(d):
    return np.arange(int(SR * d)) / SR


def env(d, a=0.002, k=8.0):
    x = t(d)
    e = np.exp(-k * x)
    na = max(1, int(a * SR))
    e[:na] *= np.linspace(0, 1, na)
    return e


def band(sig, lo, hi):
    """zero-phase FFT band-pass"""
    n = len(sig)
    f = np.fft.rfftfreq(n, 1 / SR)
    S = np.fft.rfft(sig)
    m = ((f >= lo) & (f <= hi)).astype(float)
    # soft edges
    m = np.convolve(m, np.hanning(31) / np.hanning(31).sum(), mode='same')
    return np.fft.irfft(S * m, n)


def noise(d):
    return rng.standard_normal(int(SR * d))


def sine_sweep(f0, f1, d):
    x = t(d)
    f = f0 * (f1 / f0) ** (x / d)
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def partials(freqs, amps, d, k):
    x = t(d)
    out = np.zeros_like(x)
    for f, a, kk in zip(freqs, amps, k):
        out += a * np.sin(2 * np.pi * f * x + rng.random() * 6) * np.exp(-kk * x)
    return out


def saw(f, d, vib=0.0, vr=5.0):
    x = t(d)
    ph = np.cumsum(f * (1 + vib * np.sin(2 * np.pi * vr * x))) / SR
    return 2 * (ph % 1) - 1


def lowpass(sig, fc):
    return band(sig, 0, fc)


def pluck(freq, d, bright=0.5, decay=0.996):
    """Karplus-Strong plucked string, vectorised per period."""
    n = int(SR * d)
    N = max(2, int(SR / freq))
    buf = rng.uniform(-1, 1, N)
    buf = band(np.tile(buf, 4), 0, 1500 + 6000 * bright)[:N]
    out = np.zeros(n + N)
    out[:N] = buf
    i = N
    while i < n + N:
        prev = out[i - N:i]
        nxt = decay * 0.5 * (prev + np.roll(prev, 1))
        m = min(N, n + N - i)
        out[i:i + m] = nxt[:m]
        i += N
    return out[N:n + N]


def reverb(sig, secs=1.4, mix=0.22):
    ir = rng.standard_normal(int(SR * secs)) * np.exp(-np.linspace(0, 6, int(SR * secs)))
    ir = band(ir, 200, 7000)
    ir /= np.abs(ir).sum() / 12
    n = len(sig) + len(ir)
    wet = np.fft.irfft(np.fft.rfft(sig, n) * np.fft.rfft(ir, n), n)[:len(sig) + len(ir) - 1]
    out = np.zeros(len(wet))
    out[:len(sig)] += sig * (1 - mix)
    out += wet * mix
    return out


def norm(sig, peak=0.9):
    m = np.max(np.abs(sig)) or 1
    return sig / m * peak


def pad(sig, d):
    return np.concatenate([sig, np.zeros(max(0, int(SR * d) - len(sig)))])


def mix(*parts):
    n = max(len(p) for p in parts)
    out = np.zeros(n)
    for p in parts:
        out[:len(p)] += p
    return out


def at(sig, start, total):
    out = np.zeros(total)
    s = int(start * SR)
    e = min(total, s + len(sig))
    if s < total:
        out[s:e] += sig[:e - s]
    return out


# ------------------------------------------------------------------ SFX
def sfx():
    S = {}
    # axe on wood: pitch-dropping body thump + woody crack
    S['chop'] = norm(mix(0.9 * sine_sweep(180, 70, 0.12) * env(0.12, 0.001, 30), 0.6 * band(noise(0.08), 700, 3200) * env(0.08, 0.001, 55)), 0.8)
    # pick on rock: inharmonic metal clink
    S['mine'] = norm(mix(partials([1450, 3990, 7800], [1, 0.5, 0.25], 0.35, [22, 30, 40]), 0.5 * band(noise(0.03), 2000, 9000) * env(0.03, 0.0005, 120)), 0.7)
    # mallet on timber
    S['hammer'] = norm(mix(0.8 * sine_sweep(260, 150, 0.09) * env(0.09, 0.001, 40), 0.5 * band(noise(0.06), 400, 1800) * env(0.06, 0.001, 60)), 0.75)
    # sword clash
    S['sword'] = norm(mix(partials([920, 2150, 3580, 5170, 7300], [1, 0.7, 0.5, 0.35, 0.2], 0.6, [7, 9, 12, 15, 20]), 0.8 * band(noise(0.05), 3000, 12000) * env(0.05, 0.0005, 70)), 0.7)
    # arrow whoosh + soft thunk
    wh = band(noise(0.28), 700, 4200) * np.sin(np.linspace(0, np.pi, int(SR * 0.28))) ** 2
    S['arrow'] = norm(mix(0.8 * wh, at(0.4 * sine_sweep(160, 90, 0.05) * env(0.05, 0.001, 50), 0.26, int(SR * 0.34))), 0.55)
    # catapult stone impact
    S['impact'] = norm(mix(sine_sweep(90, 40, 0.5) * env(0.5, 0.002, 7), 0.7 * lowpass(noise(0.6), 900) * env(0.6, 0.002, 6)), 0.9)
    # town bell (three strikes)
    bell = partials([220, 440, 523, 660, 880, 1100, 1320], [0.6, 1, 0.5, 0.4, 0.35, 0.2, 0.15], 2.6, [1.2, 1.6, 2.2, 2.6, 3.2, 4, 5])
    S['bell'] = norm(reverb(mix(bell, at(bell, 0.75, int(SR * 3.4)), at(bell, 1.5, int(SR * 4.1))), 1.6, 0.3), 0.85)
    # age-up fanfare: brass chord D - G - D (lowpassed saws with swell)
    def brass(notes, d):
        out = np.zeros(int(SR * d))
        for f in notes:
            s = lowpass(saw(f, d, 0.004, 5.5) + 0.5 * saw(f * 1.003, d), 2600)
            e = np.minimum(1, t(d) / 0.08) * np.exp(-0.9 * t(d))
            out += s * e
        return out
    fan = mix(brass([146.8, 185, 220, 293.7], 1.0), at(brass([196, 246.9, 293.7, 392], 0.9), 0.55, int(SR * 1.45)),
              at(brass([146.8, 220, 293.7, 370, 440], 1.7), 1.1, int(SR * 2.8)))
    S['ageup'] = norm(reverb(fan, 1.8, 0.28), 0.9)
    # construction complete: bright pluck arpeggio
    S['built'] = norm(reverb(mix(pluck(659.3, 1.0, 0.8), at(pluck(830.6, 0.9, 0.8), 0.09, int(SR * 1.0)), at(pluck(987.8, 0.9, 0.8), 0.18, int(SR * 1.1))), 1.0, 0.25), 0.7)
    # unit ready: short horn call
    S['trained'] = norm(reverb(lowpass(saw(293.7, 0.45, 0.006), 1800) * np.minimum(1, t(0.45) / 0.05) * np.exp(-3 * t(0.45)), 0.8, 0.2), 0.6)
    # war horn alert
    horn = lowpass(saw(110, 1.4, 0.01, 4.5) + 0.6 * saw(165, 1.4, 0.01, 4.3), 900) * np.minimum(1, t(1.4) / 0.2) * np.minimum(1, (1.4 - t(1.4)) / 0.3)
    S['alert'] = norm(reverb(horn, 1.4, 0.25), 0.85)
    # UI
    S['click'] = norm(band(noise(0.02), 1500, 6000) * env(0.02, 0.0005, 250), 0.45)
    S['select'] = norm(mix(0.8 * sine_sweep(520, 380, 0.07) * env(0.07, 0.001, 45), 0.3 * band(noise(0.03), 1000, 4000) * env(0.03, 0.0005, 120)), 0.45)
    S['command'] = norm(mix(0.8 * sine_sweep(380, 520, 0.08) * env(0.08, 0.001, 38), 0.2 * band(noise(0.03), 1000, 4000) * env(0.03, 0.0005, 120)), 0.45)
    # death thud & building collapse
    S['death'] = norm(mix(sine_sweep(120, 50, 0.3) * env(0.3, 0.002, 14), 0.4 * lowpass(noise(0.2), 1200) * env(0.2, 0.002, 20)), 0.7)
    rumble = lowpass(noise(1.8), 500) * np.minimum(1, t(1.8) / 0.05) * np.exp(-2.2 * t(1.8))
    crackle = band(noise(1.8), 1500, 6000) * (rng.random(int(SR * 1.8)) > 0.985) * np.exp(-2.5 * t(1.8))
    S['collapse'] = norm(mix(rumble, 0.6 * crackle, sine_sweep(70, 35, 1.2) * env(1.2, 0.005, 3)), 0.9)
    S['coin'] = norm(mix(partials([2637, 3520], [1, 0.6], 0.25, [18, 22]), at(partials([3136, 4186], [0.8, 0.4], 0.25, [18, 22]), 0.06, int(SR * 0.31))), 0.4)
    return S


# ------------------------------------------------------------------ music
def music():
    bpm = 84
    beat = 60 / bpm
    bar = beat * 4
    # D dorian progression, 16 bars
    prog = ['Dm', 'C', 'Dm', 'Am', 'F', 'C', 'G', 'Dm', 'Dm', 'C', 'F', 'C', 'Dm', 'Am', 'G', 'Dm']
    chords = {
        'Dm': [146.8, 220.0, 293.7, 349.2], 'C': [130.8, 196.0, 261.6, 329.6], 'Am': [110.0, 220.0, 261.6, 329.6],
        'F': [174.6, 220.0, 261.6, 349.2], 'G': [98.0, 196.0, 246.9, 293.7],
    }
    total = int(SR * bar * len(prog))
    lute = np.zeros(total)
    pattern = [0, 2, 1, 3, 2, 1, 3, 2]  # eighth-note arpeggio over chord tones
    for b, ch in enumerate(prog):
        notes = chords[ch]
        for i, idx in enumerate(pattern):
            st = b * bar + i * beat / 2
            f = notes[idx]
            vel = 0.9 if i % 4 == 0 else 0.6
            lute += at(vel * pluck(f, 1.6, 0.35 + 0.1 * (i % 2), 0.9965), st, total)
    # recorder melody (bars 1-8 and 9-16 variation), notes in Hz with lengths in beats
    D5, E5, F5, G5, A5, C5, B4, A4, C6 = 587.3, 659.3, 698.5, 784.0, 880.0, 523.3, 493.9, 440.0, 1046.5
    phrase = [(A4, 1), (D5, 1), (E5, 1), (F5, 1), (E5, 2), (D5, 1), (C5, 1), (D5, 3), (0, 1),
              (F5, 1), (G5, 1), (A5, 2), (G5, 1), (F5, 1), (E5, 2), (D5, 1), (E5, 1), (C5, 2), (D5, 4)]
    phrase2 = [(D5, 1), (F5, 1), (A5, 2), (C6, 1), (A5, 1), (G5, 2), (F5, 1), (E5, 1), (F5, 2), (0, 2),
               (E5, 1), (F5, 1), (G5, 1), (A5, 1), (G5, 2), (E5, 2), (F5, 1), (E5, 1), (C5, 1), (E5, 1), (D5, 4)]
    flute = np.zeros(total)
    for start_bar, ph in ((0, phrase), (8, phrase2)):
        pos = start_bar * bar
        for f, beats in ph:
            d = beats * beat
            if f:
                x = t(d)
                vib = 1 + 0.006 * np.sin(2 * np.pi * 5.2 * x) * np.minimum(1, x / 0.3)
                tone = np.sin(2 * np.pi * np.cumsum(f * vib) / SR) + 0.25 * np.sin(4 * np.pi * np.cumsum(f * vib) / SR)
                breath = 0.015 * band(noise(d), 2000, 7000)
                e = np.minimum(1, x / 0.06) * np.minimum(1, (d - x) / 0.08)
                flute += at((tone + breath) * e * 0.32, pos, total)
            pos += d
    # drone D2 + A2 with slow swell
    x = np.arange(total) / SR
    drone = (np.sin(2 * np.pi * 73.4 * x) + 0.7 * np.sin(2 * np.pi * 110 * x) + 0.25 * np.sin(2 * np.pi * 146.8 * x)) * (0.55 + 0.45 * np.sin(2 * np.pi * x / (bar * 4)) ** 2)
    drone = lowpass(drone, 600) * 0.12
    # frame drum on 1 and 3, soft jingle on off-beats
    drum = np.zeros(total)
    thump = sine_sweep(110, 55, 0.35) * env(0.35, 0.002, 11)
    jingle = band(noise(0.12), 5000, 12000) * env(0.12, 0.001, 40)
    for b in range(len(prog)):
        for k in range(4):
            st = b * bar + k * beat
            if k in (0, 2):
                drum += at(thump * (0.7 if k == 0 else 0.5), st, total)
            drum += at(jingle * 0.08, st + beat / 2, total)
    song = lute * 0.55 + flute + drone + drum * 0.5
    wet = reverb(song, 2.2, 0.26)
    # seamless loop: fold the reverb tail back onto the start
    loop = wet[:total].copy()
    tail = wet[total:]
    loop[:len(tail)] += tail
    return norm(loop, 0.8)


def write_mp3(name, sig, kbps):
    pcm = (np.clip(sig, -1, 1) * 32767).astype(np.int16)
    fd, tmp = tempfile.mkstemp(suffix='.wav')
    os.close(fd)
    with wave.open(tmp, 'wb') as wf:
        wf.setnchannels(1); wf.setsampwidth(2); wf.setframerate(SR); wf.writeframes(pcm.tobytes())
    out = os.path.join(OUT, name + '.mp3')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp, '-codec:a', 'libmp3lame', '-b:a', f'{kbps}k', out], check=True)
    os.remove(tmp)


if __name__ == '__main__':
    effects = sfx()
    for k, v in effects.items():
        write_mp3(k, np.concatenate([np.zeros(int(SR * 0.005)), v]), 96)
    write_mp3('music_main', music(), 112)
    keys = list(effects) + ['music_main']
    lines = ['// AUTO-GENERATED by scripts/gen_audio.py — do not edit', '/* eslint-disable */', '',
             'export const AUDIO = {']
    for k in keys:
        lines.append(f"  {k}: require('../../assets/audio/{k}.mp3'),")
    lines.append('} as const;')
    lines.append('export type SoundKey = Exclude<keyof typeof AUDIO, \'music_main\'>;')
    os.makedirs(os.path.join(ROOT, 'src', 'audio'), exist_ok=True)
    with open(os.path.join(ROOT, 'src', 'audio', 'manifest.ts'), 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(lines) + '\n')
    print('wrote', len(keys), 'audio files')
