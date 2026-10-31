// Simulated failures, for checking the error screens on a real device
// (Settings > Risky actions > Debug). They change no saved data.

import { AppSettingsStore } from '@/core/app-settings/appSettingsStore';

/** Make the next load of the saved projects fail once, as a storage failure would. */
export async function failNextProjectLoad(): Promise<void> {
  await AppSettingsStore.save({ failNextProjectLoad: true });
}

/** Throws if a failed load was asked for. The flag is cleared first, so Try again then loads normally. */
export async function throwIfProjectLoadShouldFail(): Promise<void> {
  const { failNextProjectLoad: projectLoadShouldFail } = await AppSettingsStore.load();
  if (!projectLoadShouldFail) {
    return;
  }
  await AppSettingsStore.save({ failNextProjectLoad: false });
  throw new Error("Simulated failure: the saved projects couldn't be loaded (Risky actions > Debug).");
}
