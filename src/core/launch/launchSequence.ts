// The launch sequence: changes to saved data (upgrades, moves, repairs) that have to happen before anything reads it.
// App runs it behind the startup screen, and mounts the shared states and screens only once it's done.

import { queueStorageWrite } from '@/core/storage/storage';

/** One change to saved data, made at launch before anything reads it. */
export interface LaunchStep {
  /** What it does, in a few words: how other steps name it in `runsAfter`, and what the error screen says if it fails. */
  name: string;
  /** The names of the steps whose changes this one needs first. */
  runsAfter: readonly string[];
  /** Whether there's anything to do, e.g. whether an old setting is still saved: a launch with nothing to do runs only these. */
  needsToRun: () => Promise<boolean>;
  /** The change. It can stop partway (the app closed, a write failed) and run again next launch, so running it twice must be safe. */
  run: () => Promise<void>;
}

/** Throws unless every step comes after the steps it runs after, and no two steps share a name. */
export function checkLaunchStepOrder(launchSteps: readonly LaunchStep[]): void {
  const earlierStepNames = new Set<string>();
  for (const launchStep of launchSteps) {
    if (earlierStepNames.has(launchStep.name)) {
      throw new Error(`Two launch steps are named "${launchStep.name}".`);
    }
    const stepNamesNotYetRun = launchStep.runsAfter.filter((stepName) => !earlierStepNames.has(stepName));
    if (stepNamesNotYetRun.length > 0) {
      throw new Error(`Launch step "${launchStep.name}" is listed before ${stepNamesNotYetRun.map((stepName) => `"${stepName}"`).join(', ')}, which it runs after.`);
    }
    earlierStepNames.add(launchStep.name);
  }
}

/** Runs each step that needs to, one at a time and in order, in the storage write queue so no save runs in between.
 *  Rejects with the failed step's name and error, after which Try again runs the whole sequence again. */
export async function runLaunchSequence(launchSteps: readonly LaunchStep[]): Promise<void> {
  // A list out of order is the code's mistake, not the saved data's: refuse it before any step changes anything.
  checkLaunchStepOrder(launchSteps);
  // One at a time: the steps are few and quick. `runsAfter` is what running some side by side would go by.
  return queueStorageWrite(async () => {
    for (const launchStep of launchSteps) {
      try {
        if (await launchStep.needsToRun()) {
          await launchStep.run();
        }
      } catch (stepError) {
        throw new Error(`${launchStep.name}: ${(stepError as Error).message}`);
      }
    }
  });
}
