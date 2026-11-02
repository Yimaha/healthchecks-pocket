import { describe, expect, it } from 'vitest';
import { checkLaunchStepOrder, runLaunchSequence, type LaunchStep } from '@/core/launch/launchSequence';
import { LAUNCH_STEPS } from '@/core/launch/launchSteps';
import { queueStorageWrite } from '@/core/storage/storage';

const aMoment = () => new Promise<void>((resolve) => setTimeout(resolve, 10));

/** A step that writes down in `stepCalls` what the runner asks of it. */
function recordingStep(name: string, stepCalls: string[], options: { needsToRun?: boolean; runsAfter?: string[]; work?: () => Promise<void> } = {}): LaunchStep {
  return {
    name,
    runsAfter: options.runsAfter ?? [],
    needsToRun: async () => {
      stepCalls.push(`${name}: needs to run?`);
      return options.needsToRun ?? true;
    },
    run: async () => {
      stepCalls.push(`${name}: run`);
      await options.work?.();
      stepCalls.push(`${name}: done`);
    },
  };
}

describe('launch sequence', () => {
  it('runs each step that needs to, one at a time and in order', async () => {
    const stepCalls: string[] = [];
    await runLaunchSequence([
      recordingStep('first', stepCalls, { work: aMoment }),
      recordingStep('nothing to do', stepCalls, { needsToRun: false }),
      recordingStep('last', stepCalls, { runsAfter: ['first'] }),
    ]);
    expect(stepCalls).toEqual([
      'first: needs to run?', 'first: run', 'first: done',
      'nothing to do: needs to run?',
      'last: needs to run?', 'last: run', 'last: done',
    ]);
  });

  it('stops at a failed step, saying which one failed', async () => {
    const stepCalls: string[] = [];
    const failingWork = async () => {
      throw new Error('Storage full');
    };
    await expect(runLaunchSequence([recordingStep('Move the uploads', stepCalls, { work: failingWork }), recordingStep('later', stepCalls)]))
      .rejects.toThrow('Move the uploads: Storage full');
    expect(stepCalls).toEqual(['Move the uploads: needs to run?', 'Move the uploads: run']);
  });

  it('refuses a list with a step before one it runs after, before any step runs', async () => {
    const stepCalls: string[] = [];
    await expect(runLaunchSequence([recordingStep('second', stepCalls, { runsAfter: ['first'] }), recordingStep('first', stepCalls)]))
      .rejects.toThrow('Launch step "second" is listed before "first", which it runs after.');
    expect(stepCalls).toEqual([]);
  });

  it('refuses two steps with the same name', () => {
    expect(() => checkLaunchStepOrder([recordingStep('same', []), recordingStep('same', [])])).toThrow('Two launch steps are named "same".');
  });

  it('runs in the storage write queue: a save queued while it runs waits until it\'s done', async () => {
    const stepCalls: string[] = [];
    const launchSequenceRun = runLaunchSequence([recordingStep('slow', stepCalls, { work: aMoment })]);
    const save = queueStorageWrite(async () => {
      stepCalls.push('save');
    });
    await Promise.all([launchSequenceRun, save]);
    expect(stepCalls).toEqual(['slow: needs to run?', 'slow: run', 'slow: done', 'save']);
  });

  it('the app\'s own steps each come after the steps they run after', () => {
    expect(() => checkLaunchStepOrder(LAUNCH_STEPS)).not.toThrow();
  });
});
