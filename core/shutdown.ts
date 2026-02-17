import type { ChildProcess } from 'node:child_process';

import { terminateChildProcess } from './process-runner';
import { badge } from './terminal-ui';
import type { Tone } from './types';

type SpinnerStopRef = {
  value: ((message: string, tone?: Tone) => void) | null;
};

type LoopShutdownGuard = {
  isShuttingDown: () => boolean;
  removeSignalHandlers: () => void;
  onSignal: (signal: NodeJS.Signals) => void;
  finalize: () => Promise<void>;
};

function exitCodeForSignal(signal: NodeJS.Signals): number {
  return signal === 'SIGINT' ? 130 : 143;
}

async function cleanupActiveChildren(activeChildren: Set<ChildProcess>): Promise<number> {
  if (activeChildren.size === 0) {
    return 0;
  }

  const count = activeChildren.size;
  await Promise.all([...activeChildren].map((child) => terminateChildProcess(child)));
  activeChildren.clear();
  return count;
}

async function stopIterationSpinner(
  activeSpinnerStopRef: SpinnerStopRef,
  message: string,
  tone: Tone,
): Promise<void> {
  if (!activeSpinnerStopRef.value) {
    return;
  }
  activeSpinnerStopRef.value(message, tone);
  activeSpinnerStopRef.value = null;
}

function createShutdownGuard(
  activeChildren: Set<ChildProcess>,
  activeSpinnerStopRef: SpinnerStopRef,
): Omit<LoopShutdownGuard, 'finalize' | 'onSignal'> {
  let shuttingDown = false;

  const stop = async (signal?: NodeJS.Signals) => {
    if (signal) {
      console.log();
      console.log(`${badge('SHUTDOWN', 'warn')} received ${signal}, cleaning up...`);
    }
    await stopIterationSpinner(activeSpinnerStopRef, 'cancelled', 'warn');
    const terminated = await cleanupActiveChildren(activeChildren);
    if (signal && terminated > 0) {
      console.log(
        `${badge('CLEANUP', 'success')} terminated ${terminated} running child process(es).`,
      );
    }
    if (signal) {
      process.exit(exitCodeForSignal(signal));
    }
  };

  const onSignal = (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    void stop(signal);
  };

  const removeSignalHandlers = () => {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  };

  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  return {
    isShuttingDown: () => shuttingDown,
    removeSignalHandlers,
    onSignal,
    stop,
  };
}

export function installLoopShutdownGuard(options: {
  activeChildren: Set<ChildProcess>;
  activeSpinnerStopRef: { value: ((message: string, tone?: Tone) => void) | null };
}): LoopShutdownGuard {
  const { activeChildren, activeSpinnerStopRef } = options;
  const baseGuard = createShutdownGuard(activeChildren, activeSpinnerStopRef);
  return {
    ...baseGuard,
    finalize: async () => {
      await stopIterationSpinner(activeSpinnerStopRef, 'stopped', 'warn');
      await cleanupActiveChildren(activeChildren);
      baseGuard.removeSignalHandlers();
    },
  };
}
