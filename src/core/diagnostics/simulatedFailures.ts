// Simulated failures, for checking the error screens on a real device
// (Settings > Risky actions > Debug). They change no saved data.

import { settings } from '@/core/storage/storage';

/** Make the next load of the saved projects fail once, as a storage failure would. */
export async function failNextProjectLoad(): Promise<void> {
  await settings.set('debug.failNextProjectLoad', '1');
}

/** Throws if a failed load was asked for. The flag is cleared first, so Try again then loads normally. */
export async function throwIfProjectLoadShouldFail(): Promise<void> {
  const failNextProjectLoadFlag = await settings.get('debug.failNextProjectLoad');
  if (failNextProjectLoadFlag !== '1') {
    return;
  }
  await settings.remove('debug.failNextProjectLoad');
  throw new Error("Simulated failure: the saved projects couldn't be loaded (Risky actions > Debug).");
}
