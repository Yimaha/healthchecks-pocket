// The maths behind HeartbeatMonitor: one heartbeat's ECG trace (the PQRST
// complex) and the rhythm of beats, with the small natural wobble of a real
// resting heart. Only HeartbeatMonitor (and its test) use it.

/** Resting heart rates the rhythm drifts between. A wearables study of ~92k
 *  adults (Quer et al., PLOS ONE 2020) found a mean of 65.5 bpm, with women
 *  2-3 bpm above men at every age. */
export const RESTING_BPM_MALE = 64;
export const RESTING_BPM_FEMALE = 67;

/** One slow drift from the male to the female rate and back. */
const RATE_DRIFT_PERIOD_MS = 30_000;
/** One breath: ~13 a minute, an adult at rest (12-16). */
export const BREATH_PERIOD_MS = 4_600;
/** The heart speeds up breathing in, slows breathing out (respiratory sinus arrhythmia): ±4% beat length. */
const SINUS_ARRHYTHMIA_FRACTION = 0.04;
/** Beat-to-beat variation on top of that (resting heart rate variability is ~20-40 ms). */
export const BEAT_JITTER_MS = 30;

/** How tall this beat's waves are (R = 1 on an average beat); each beat varies a little. */
export interface BeatShape {
  pHeight: number;
  rHeight: number;
  tHeight: number;
}

export const AVERAGE_BEAT_SHAPE: BeatShape = { pHeight: 0.12, rHeight: 1, tHeight: 0.28 };

// Where each wave peaks, in ms after the beat starts (the start of the P
// wave), and how wide it is (a Gaussian's sigma). Textbook ECG timings: P
// ~90 ms, PR segment ~80 ms, QRS ~90 ms, ST ~100 ms, T ~160 ms; only the
// flat gap after T changes with the heart rate.
const P_PEAK_MS = 45;
const P_SIGMA_MS = 17;
const Q_PEAK_MS = 182;
const Q_SIGMA_MS = 6;
const Q_DEPTH = 0.15; // the R spike's foot fills some of it in: about -0.1 drawn
/** The R spike's tip: when the beat "thumps". */
export const R_PEAK_MS = 202;
const R_SIGMA_MS = 8;
const S_PEAK_MS = 224;
const S_SIGMA_MS = 7;
const S_DEPTH = 0.24;
const T_PEAK_MS = 400;
const T_RISE_SIGMA_MS = 48; // T rises slowly and falls faster
const T_FALL_SIGMA_MS = 30;

const gaussian = (atMs: number, peakMs: number, sigmaMs: number) => Math.exp(-((atMs - peakMs) ** 2) / (2 * sigmaMs * sigmaMs));

/** The trace's height at `msIntoBeat` ms after the beat starts: 0 is the
 *  baseline, an average R spike is 1, Q and S dip below 0. */
export function ecgVoltageAt(msIntoBeat: number, shape: BeatShape = AVERAGE_BEAT_SHAPE): number {
  const tSigmaMs = msIntoBeat < T_PEAK_MS ? T_RISE_SIGMA_MS : T_FALL_SIGMA_MS;
  return (
    shape.pHeight * gaussian(msIntoBeat, P_PEAK_MS, P_SIGMA_MS) -
    Q_DEPTH * shape.rHeight * gaussian(msIntoBeat, Q_PEAK_MS, Q_SIGMA_MS) +
    shape.rHeight * gaussian(msIntoBeat, R_PEAK_MS, R_SIGMA_MS) -
    S_DEPTH * shape.rHeight * gaussian(msIntoBeat, S_PEAK_MS, S_SIGMA_MS) +
    shape.tHeight * gaussian(msIntoBeat, T_PEAK_MS, tSigmaMs)
  );
}

/** Where in its breath the monitor is at `atMs`: 1 fully breathed in, -1 fully out. */
export const breathAt = (atMs: number) => Math.sin((2 * Math.PI * atMs) / BREATH_PERIOD_MS);

/** The resting rate at `atMs`, drifting slowly between the male and female averages. */
export function restingBpmAt(atMs: number): number {
  const midpointBpm = (RESTING_BPM_MALE + RESTING_BPM_FEMALE) / 2;
  const driftBpm = (RESTING_BPM_FEMALE - RESTING_BPM_MALE) / 2;
  return midpointBpm + driftBpm * Math.sin((2 * Math.PI * atMs) / RATE_DRIFT_PERIOD_MS);
}

/** How long the beat starting at `atMs` lasts: the resting rate, shortened
 *  breathing in and lengthened breathing out, plus a little jitter. */
export function beatIntervalMsAt(atMs: number, random: () => number): number {
  const restingIntervalMs = 60_000 / restingBpmAt(atMs);
  const jitterMs = (random() * 2 - 1) * BEAT_JITTER_MS;
  return restingIntervalMs * (1 - SINUS_ARRHYTHMIA_FRACTION * breathAt(atMs)) + jitterMs;
}

/** A slightly different beat each time: R ±5%, P and T a little. */
export function randomBeatShape(random: () => number): BeatShape {
  const vary = (average: number, fraction: number) => average * (1 + (random() * 2 - 1) * fraction);
  return {
    pHeight: vary(AVERAGE_BEAT_SHAPE.pHeight, 0.12),
    rHeight: vary(AVERAGE_BEAT_SHAPE.rHeight, 0.05),
    tHeight: vary(AVERAGE_BEAT_SHAPE.tHeight, 0.08),
  };
}

export interface HeartRhythm {
  /** The trace's height at `atMs`, moving on to the beat playing then. Times must only move forward. */
  voltageAt(atMs: number): number;
  /** When the current beat's R spike is. */
  readonly rPeakAtMs: number;
}

/** The beats one after another from 0 ms, each with its own length and shape. */
export function createHeartRhythm(random: () => number): HeartRhythm {
  let beatStartMs = 0;
  let beatIntervalMs = beatIntervalMsAt(beatStartMs, random);
  let beatShape = randomBeatShape(random);
  return {
    voltageAt(atMs) {
      while (atMs >= beatStartMs + beatIntervalMs) {
        beatStartMs += beatIntervalMs;
        beatIntervalMs = beatIntervalMsAt(beatStartMs, random);
        beatShape = randomBeatShape(random);
      }
      return ecgVoltageAt(atMs - beatStartMs, beatShape);
    },
    get rPeakAtMs() {
      return beatStartMs + R_PEAK_MS;
    },
  };
}
