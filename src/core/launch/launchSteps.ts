// Every launch step, in the order they run (launchSequence.ts says what a step is). Add a step after the ones it runs after.

import { moveUploadsFrom050TestBuilds } from '@/core/icons/uploadsFrom050TestBuilds';
import type { LaunchStep } from './launchSequence';

export const LAUNCH_STEPS: readonly LaunchStep[] = [
  moveUploadsFrom050TestBuilds,
];
