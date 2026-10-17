import { describe, expect, it } from 'vitest';
import {
  AVERAGE_BEAT_SHAPE, BEAT_JITTER_MS, BREATH_PERIOD_MS, beatIntervalMsAt, breathAt, createHeartRhythm, ecgVoltageAt,
  R_PEAK_MS, randomBeatShape, RESTING_BPM_FEMALE, RESTING_BPM_MALE, restingBpmAt,
} from '../../src/ui/heartbeat-monitor/ecgRhythm';

/** A small, fast random number generator (mulberry32): the same seed gives the same beats. */
function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

// One average beat, sampled every millisecond for its first 900 ms.
const averageBeat = Array.from({ length: 900 }, (_, msIntoBeat) => ecgVoltageAt(msIntoBeat));
const lowestBetween = (fromMs: number, toMs: number) => Math.min(...averageBeat.slice(fromMs, toMs));
const highestBetween = (fromMs: number, toMs: number) => Math.max(...averageBeat.slice(fromMs, toMs));

describe('ecgRhythm: one beat (the PQRST complex)', () => {
  it('peaks at the R spike, about 1 tall, and nowhere else comes close', () => {
    const rPeakMs = averageBeat.indexOf(Math.max(...averageBeat));
    expect(Math.abs(rPeakMs - R_PEAK_MS)).toBeLessThanOrEqual(1);
    expect(averageBeat[rPeakMs]).toBeCloseTo(1, 1);
    expect(highestBetween(0, R_PEAK_MS - 30)).toBeLessThan(0.2); // P
    expect(highestBetween(R_PEAK_MS + 30, 900)).toBeLessThan(0.35); // T
  });

  it('starts with a small P wave, dips at Q and S either side of R, then a wider T wave', () => {
    expect(highestBetween(0, 120)).toBeGreaterThan(0.08); // P
    expect(lowestBetween(R_PEAK_MS - 30, R_PEAK_MS)).toBeLessThan(-0.05); // Q, below the baseline
    expect(lowestBetween(R_PEAK_MS, R_PEAK_MS + 40)).toBeLessThan(-0.15); // S, deeper than Q
    expect(highestBetween(330, 480)).toBeGreaterThan(0.2); // T
  });

  it('is flat on the baseline between beats (the T-P gap)', () => {
    expect(highestBetween(560, 900)).toBeLessThan(0.01);
    expect(lowestBetween(560, 900)).toBeGreaterThanOrEqual(0);
  });

  it('T rises slowly and falls faster', () => {
    const tPeakMs = averageBeat.indexOf(highestBetween(330, 480));
    const halfHeight = averageBeat[tPeakMs] / 2;
    const riseMs = tPeakMs - averageBeat.findIndex((voltage, ms) => ms > 300 && voltage >= halfHeight);
    const fallMs = averageBeat.findIndex((voltage, ms) => ms > tPeakMs && voltage < halfHeight) - tPeakMs;
    expect(riseMs).toBeGreaterThan(fallMs);
  });

  it('each beat varies a little: R within ±5%', () => {
    const random = createSeededRandom(7);
    const shapes = Array.from({ length: 500 }, () => randomBeatShape(random));
    const rHeights = shapes.map((shape) => shape.rHeight);
    expect(Math.min(...rHeights)).toBeGreaterThanOrEqual(0.95);
    expect(Math.max(...rHeights)).toBeLessThanOrEqual(1.05);
    expect(new Set(rHeights).size).toBe(500);
    expect(ecgVoltageAt(R_PEAK_MS, { ...AVERAGE_BEAT_SHAPE, rHeight: 1.05 })).toBeGreaterThan(ecgVoltageAt(R_PEAK_MS));
  });
});

describe('ecgRhythm: the rhythm', () => {
  it('drifts between the male and female resting rates', () => {
    const rates = Array.from({ length: 600 }, (_, second) => restingBpmAt(second * 1000));
    expect(Math.min(...rates)).toBeCloseTo(RESTING_BPM_MALE, 1);
    expect(Math.max(...rates)).toBeCloseTo(RESTING_BPM_FEMALE, 1);
  });

  it('over a long run, every beat stays within the resting range plus breathing and jitter, averaging ~65 bpm', () => {
    const random = createSeededRandom(42);
    const intervals: number[] = [];
    for (let atMs = 0; atMs < 30 * 60_000; atMs += intervals[intervals.length - 1]) intervals.push(beatIntervalMsAt(atMs, random));
    const shortestPossibleMs = (60_000 / RESTING_BPM_FEMALE) * 0.96 - BEAT_JITTER_MS;
    const longestPossibleMs = (60_000 / RESTING_BPM_MALE) * 1.04 + BEAT_JITTER_MS;
    expect(Math.min(...intervals)).toBeGreaterThanOrEqual(shortestPossibleMs);
    expect(Math.max(...intervals)).toBeLessThanOrEqual(longestPossibleMs);
    const averageBpm = (intervals.length / intervals.reduce((total, interval) => total + interval, 0)) * 60_000;
    expect(averageBpm).toBeGreaterThan(64);
    expect(averageBpm).toBeLessThan(67);
  });

  it('beats differ from one to the next', () => {
    const random = createSeededRandom(1);
    const intervals = Array.from({ length: 20 }, () => beatIntervalMsAt(0, random));
    expect(new Set(intervals.map(Math.round)).size).toBeGreaterThan(10);
  });

  it('speeds up breathing in and slows breathing out', () => {
    const noJitter = () => 0.5;
    const fullyInMs = BREATH_PERIOD_MS / 4;
    const fullyOutMs = (BREATH_PERIOD_MS * 3) / 4;
    expect(breathAt(fullyInMs)).toBeCloseTo(1);
    expect(breathAt(fullyOutMs)).toBeCloseTo(-1);
    expect(beatIntervalMsAt(fullyInMs, noJitter)).toBeLessThan(beatIntervalMsAt(fullyOutMs, noJitter) - 50);
  });

  it('the same seed gives the same beats', () => {
    const traceOf = (seed: number) => {
      const rhythm = createHeartRhythm(createSeededRandom(seed));
      return Array.from({ length: 200 }, (_, step) => rhythm.voltageAt(step * 50));
    };
    expect(traceOf(3)).toEqual(traceOf(3));
    expect(traceOf(3)).not.toEqual(traceOf(4));
  });

  it('plays beat after beat: one R spike per beat, about 65 a minute', () => {
    const rhythm = createHeartRhythm(createSeededRandom(9));
    let rSpikes = 0;
    let previousVoltage = 0;
    for (let atMs = 0; atMs < 60_000; atMs += 2) {
      const voltage = rhythm.voltageAt(atMs);
      if (previousVoltage < 0.5 && voltage >= 0.5) rSpikes++; // only an R spike reaches half its height
      previousVoltage = voltage;
    }
    expect(rSpikes).toBeGreaterThanOrEqual(62);
    expect(rSpikes).toBeLessThanOrEqual(69);
  });
});
