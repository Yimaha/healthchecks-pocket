import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LaunchStep } from '@/core/launch/launchSequence';
import { platform } from '@/platform';
import { check } from '../../fixtures/healthchecks';
import { answerConfirms, fakeServer, startApp, text } from '../../helpers';

// Each test sets its own launch steps instead of the app's.
const launchStepsForTest = vi.hoisted((): LaunchStep[] => []);
vi.mock('@/core/launch/launchSteps', () => ({ LAUNCH_STEPS: launchStepsForTest }));

const checkRows = () => document.querySelectorAll('.check-row');

/** A step that fails its first `failures` runs with "Storage unavailable", then works. */
function stepFailing(failures: number): LaunchStep {
  let failuresLeft = failures;
  return {
    name: 'Move the uploads',
    runsAfter: [],
    needsToRun: async () => true,
    run: async () => {
      if (failuresLeft-- > 0) {
        throw new Error('Storage unavailable');
      }
    },
  };
}

beforeEach(() => {
  launchStepsForTest.length = 0;
});

describe('launch sequence', () => {
  it('shows the startup screen until the steps are done, and nothing reads saved data before then', async () => {
    fakeServer([{ key: 'key-home', checks: [check] }]);
    let finishStep = () => {};
    const stepStarted = vi.fn();
    launchStepsForTest.push({
      name: 'Slow step',
      runsAfter: [],
      needsToRun: async () => true,
      run: () => new Promise<void>((resolve) => {
        stepStarted();
        finishStep = resolve;
      }),
    });
    const loadSetting = vi.spyOn(platform, 'load');
    const loadSecret = vi.spyOn(platform, 'loadSecret');
    startApp();
    await waitFor(() => expect(stepStarted).toHaveBeenCalled());
    expect(text(screen.getByRole('status'))).toBe('Getting Healthchecks Pocket ready…');
    expect(loadSetting).not.toHaveBeenCalled();
    expect(loadSecret).not.toHaveBeenCalled();
    const background = document.querySelector('.aurora');
    expect(background).not.toBeNull();

    finishStep();
    await waitFor(() => expect(checkRows()).toHaveLength(1));
    expect(document.querySelector('.aurora')).toBe(background); // the same one, not drawn again from the start
  });

  it('a failed step shows the error screen; Try again runs the steps again', async () => {
    fakeServer([{ key: 'key-home', checks: [check] }]);
    launchStepsForTest.push(stepFailing(1));
    const { user } = startApp();
    expect(text(await screen.findByRole('alert'))).toBe("Couldn't get Healthchecks Pocket ready Move the uploads: Storage unavailable");
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(checkRows()).toHaveLength(1));
  });

  it('Reset the app on that screen deletes everything and starts at the first-launch setup', async () => {
    fakeServer([]);
    launchStepsForTest.push(stepFailing(1));
    answerConfirms(true);
    const { user } = startApp();
    await screen.findByRole('alert');

    await user.click(screen.getByRole('button', { name: 'Reset the app' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Welcome to Healthchecks Pocket'));
    expect(Object.keys(localStorage).filter((storageKey) => storageKey.startsWith('healthchecks-pocket.'))).toEqual([]);
  });
});
