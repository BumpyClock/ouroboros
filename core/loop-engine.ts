import type { ChildProcess } from 'node:child_process';
import path from 'node:path';
import type { ProviderAdapter } from '../providers/types';
import {
  type IterationLiveRenderer,
  shouldStopFromProviderOutput as shouldStopFromProviderOutputInternal,
} from './iteration-execution';
import { runLoopController } from './loop-controller';
import { resolveRunLogDirectory } from './loop-runs';
import { resolveRunnableCommand } from './process-runner';
import { installLoopShutdownGuard } from './shutdown';
import { resolveIterationStatePath } from './state';
import type { CliOptions, PreviewEntry, Tone } from './types';

type ActiveSpinnerStopRef = {
  value: ((message: string, tone?: Tone) => void) | null;
};

export function shouldStopFromProviderOutput(
  provider: ProviderAdapter,
  previewEntries: PreviewEntry[],
  lastMessageOutput: string,
): boolean {
  return shouldStopFromProviderOutputInternal(provider, previewEntries, lastMessageOutput);
}

export async function runLoop(options: CliOptions, provider: ProviderAdapter): Promise<void> {
  const promptPath = path.resolve(process.cwd(), options.promptPath);
  const statePath = resolveIterationStatePath(process.cwd());
  const logDir = resolveRunLogDirectory(process.cwd(), options.logDir);
  const command = resolveRunnableCommand(options.command, provider.formatCommandHint);
  const activeChildren = new Set<ChildProcess>();
  const activeSpinnerStopRef: ActiveSpinnerStopRef = {
    value: null,
  };
  const shutdownGuard = installLoopShutdownGuard({
    activeChildren,
    activeSpinnerStopRef,
  });

  let liveRenderer: IterationLiveRenderer | null = null;
  try {
    liveRenderer = await runLoopController({
      options,
      provider,
      promptPath,
      statePath,
      logDir,
      command,
      activeChildren,
      activeSpinnerStopRef,
      shutdownProbe: shutdownGuard,
    });
  } finally {
    shutdownGuard.removeSignalHandlers();
    liveRenderer?.stop('', 'success');
    await shutdownGuard.finalize();
  }
}
