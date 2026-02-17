import type { ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { getProviderAdapter } from '../providers/registry';
import type { ProviderAdapter } from '../providers/types';
import {
  type IterationLiveRenderer,
  shouldStopFromProviderOutput as shouldStopFromProviderOutputInternal,
} from './iteration-execution';
import { runLoopController } from './loop-controller';
import { resolveRunLogDirectory } from './loop-runs';
import { resolveRunnableCommand } from './process-runner';
import { resolveDeveloperPromptPath, resolveReviewerPromptPath } from './prompts';
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
  const cwd = process.cwd();
  const promptPath = resolveDeveloperPromptPath(cwd, options.developerPromptPath);
  const reviewerPromptPath = options.reviewEnabled
    ? resolveReviewerPromptPath(cwd, options.reviewerPromptPath)
    : undefined;
  if (options.reviewEnabled) {
    if (!reviewerPromptPath) {
      throw new Error(
        'Reviewer prompt file not found. Provide --reviewer-prompt or create .ai_agents/prompts/reviewer.md',
      );
    }
    if (options.reviewerPromptPath && !existsSync(reviewerPromptPath)) {
      throw new Error(`Reviewer prompt file not found: ${reviewerPromptPath}`);
    }
  }
  const statePath = resolveIterationStatePath(cwd);
  const logDir = resolveRunLogDirectory(cwd, options.logDir);
  const command = resolveRunnableCommand(options.command, provider.formatCommandHint);
  const reviewerProvider = getProviderAdapter(options.reviewerProvider);
  const reviewerCommand =
    options.reviewerProvider === provider.name
      ? command
      : resolveRunnableCommand(
          reviewerProvider.defaults.command,
          reviewerProvider.formatCommandHint,
        );
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
      reviewerProvider,
      promptPath,
      reviewerPromptPath,
      statePath,
      logDir,
      command,
      reviewerCommand,
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
