import type { ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import type { ProviderAdapter } from '../providers/types';
import { extractReferencedBeadIds } from './beads';
import type { IterationSummary, LoopPhase, RunContext } from './live-run-state';
import { buildRuns, summarizeArgsForLog } from './loop-runs';
import { runAgentProcess } from './process-runner';
import {
  ANSI,
  badge,
  colorize,
  createSpinner,
  labelTone,
  printPreview,
  printUsageSummary,
  progressBar,
} from './terminal-ui';
import { formatShort } from './text';
import type {
  BeadIssue,
  BeadsSnapshot,
  CliOptions,
  PreviewEntry,
  RunResult,
  Tone,
  UsageSummary,
} from './types';

export type IterationLiveRenderer = {
  isEnabled(): boolean;
  setIteration(iteration: number): void;
  update(agentId: number, entry: PreviewEntry): void;
  setBeadsSnapshot(snapshot: BeadsSnapshot | null): void;
  setAgentLogPath(agentId: number, path: string): void;
  setRunContext(context: RunContext): void;
  setIterationSummary(summary: IterationSummary): void;
  setLoopNotice(message: string, tone: Tone): void;
  setPauseState(msRemaining: number | null): void;
  setRetryState(secondsRemaining: number | null): void;
  setLoopPhase(phase: LoopPhase): void;
  setAgentPickedBead(agentId: number, issue: BeadIssue): void;
  setAgentQueued(agentId: number, message: string): void;
  setAgentLaunching(agentId: number, message: string): void;
  stop(message: string, tone?: Tone): void;
};

type ActiveSpinnerStopRef = {
  value: ((message: string, tone?: Tone) => void) | null;
};

export type AggregatedIterationOutput = {
  pickedByAgent: Map<number, BeadIssue>;
  usageAggregate: UsageSummary | null;
  failed: Array<{
    status: number | null;
    combinedOutput: string;
    result: RunResult;
  }>;
  stopDetected: boolean;
};

export async function runIteration(
  iteration: number,
  stateMaxIterations: number,
  options: CliOptions,
  provider: ProviderAdapter,
  beadsSnapshot: BeadsSnapshot,
  prompt: string,
  command: string,
  logDir: string,
  activeChildren: Set<ChildProcess>,
  activeSpinnerStopRef: ActiveSpinnerStopRef,
  liveRenderer: IterationLiveRenderer | null,
): Promise<{
  results: RunResult[];
  pickedByAgent: Map<number, BeadIssue>;
}> {
  const runs = buildRuns(iteration, options.parallelAgents, logDir, provider, options, prompt);
  const liveRendererEnabled = Boolean(liveRenderer?.isEnabled());
  const startedAt = Date.now();
  const runContext = {
    startedAt,
    command: `${command} ${summarizeArgsForLog(runs[0].args)}`,
    batch: `target ${runs.length} parallel agent(s), staged startup`,
    agentLogPaths: new Map<number, string>(),
  };
  liveRenderer?.setRunContext(runContext);
  liveRenderer?.setLoopNotice('iteration started', 'info');
  liveRenderer?.setLoopPhase('starting');
  liveRenderer?.setBeadsSnapshot(beadsSnapshot);

  const startedAtLabel = new Date(startedAt).toLocaleTimeString();
  if (!liveRendererEnabled) {
    console.log();
    console.log(
      `${badge('ITERATION', 'info')} ${iteration}/${stateMaxIterations} ${colorize(progressBar(iteration, stateMaxIterations), ANSI.cyan)}`,
    );
    console.log(`${badge('START', 'muted')} ${startedAtLabel}`);
    console.log(`${badge('RUN', 'muted')} ${runContext.command}`);
    console.log(`${badge('BATCH', 'muted')} ${runContext.batch}`);
    for (const run of runs) {
      console.log(`${badge(`A${run.agentId}`, 'muted')} ${run.jsonlLogPath}`);
      liveRenderer?.setAgentLogPath(run.agentId, run.jsonlLogPath);
    }
  } else {
    for (const run of runs) {
      liveRenderer?.setAgentLogPath(run.agentId, run.jsonlLogPath);
    }
  }
  if (options.showRaw && !liveRendererEnabled) {
    console.log(`${badge('STREAM', 'warn')} raw event stream enabled`);
  }

  const spinner =
    options.showRaw || liveRendererEnabled
      ? null
      : createSpinner(
          `running ${runs.length} ${provider.name} agent(s) for iteration ${iteration}`,
        );
  activeSpinnerStopRef.value = liveRendererEnabled ? null : (spinner?.stop ?? null);

  const liveSeen = new Set<string>();
  const liveCountByAgent = new Map<number, number>();
  const pickedByAgent = new Map<number, BeadIssue>();
  const knownBeadIds = new Set(beadsSnapshot.byId.keys());
  for (const run of runs) {
    if (run.agentId === 1) {
      if (liveRendererEnabled) {
        liveRenderer?.setAgentLaunching(
          run.agentId,
          'launching now, waiting for first picked bead',
        );
      }
      continue;
    }
    const previousAgentId = run.agentId - 1;
    if (liveRendererEnabled) {
      liveRenderer?.setAgentQueued(
        run.agentId,
        `waiting to spawn until A${previousAgentId} picked a bead`,
      );
    }
  }

  let pickedReadinessCount = 0;
  const pickedReadinessWaiters: Array<{ target: number; resolve: () => void }> = [];
  const flushPickedReadinessWaiters = () => {
    const remaining: Array<{ target: number; resolve: () => void }> = [];
    for (const waiter of pickedReadinessWaiters) {
      if (pickedReadinessCount >= waiter.target) {
        waiter.resolve();
      } else {
        remaining.push(waiter);
      }
    }
    pickedReadinessWaiters.length = 0;
    pickedReadinessWaiters.push(...remaining);
  };
  const releasePickedReadiness = () => {
    pickedReadinessCount += 1;
    flushPickedReadinessWaiters();
  };
  const waitForPicked = (target: number): Promise<void> => {
    if (pickedReadinessCount >= target) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      pickedReadinessWaiters.push({ target, resolve });
    });
  };

  const launchedRuns: Array<Promise<RunResult>> = [];
  for (let runIndex = 0; runIndex < runs.length; runIndex += 1) {
    const run = runs[runIndex];
    if (runIndex > 0) {
      await waitForPicked(runIndex);
      if (liveRendererEnabled) {
        liveRenderer?.setAgentLaunching(run.agentId, `launching after A${runIndex} picked a bead`);
      } else {
        console.log(
          `${badge(
            'SPAWN',
            'muted',
          )} launching agent ${run.agentId} after A${runIndex} picked a bead`,
        );
      }
    }

    const launchedRun = (async (): Promise<RunResult> => {
      let trackedChild: ChildProcess | null = null;
      let readinessReleased = false;
      let pickedBeadSet = false;
      const releasePickedReadinessOnce = () => {
        if (readinessReleased) {
          return;
        }
        readinessReleased = true;
        releasePickedReadiness();
      };

      const markPickedBead = (issue: BeadIssue) => {
        if (pickedBeadSet) {
          return;
        }
        pickedByAgent.set(run.agentId, issue);
        pickedBeadSet = true;
        liveRenderer?.setAgentPickedBead(run.agentId, issue);
        releasePickedReadinessOnce();
      };

      try {
        const result = await runAgentProcess({
          prompt,
          command,
          args: run.args,
          logPath: run.jsonlLogPath,
          showRaw: options.showRaw,
          formatCommandHint: provider.formatCommandHint,
          onChildChange: (child) => {
            if (child) {
              trackedChild = child;
              activeChildren.add(child);
            } else if (trackedChild) {
              activeChildren.delete(trackedChild);
              trackedChild = null;
            }
          },
          onStdoutLine: (line) => {
            if (options.showRaw) {
              return;
            }
            const liveEntries = provider
              .previewEntriesFromLine(line)
              .filter(
                (entry) =>
                  entry.kind === 'reasoning' ||
                  entry.kind === 'tool' ||
                  entry.kind === 'assistant' ||
                  entry.kind === 'error',
              );
            for (const entry of liveEntries) {
              const matchedIds = extractReferencedBeadIds(entry.text, knownBeadIds);
              if (matchedIds.length > 0) {
                const matchedIssue = beadsSnapshot.byId.get(matchedIds[0]);
                if (matchedIssue) {
                  markPickedBead(matchedIssue);
                }
              }
              if (liveRendererEnabled) {
                liveRenderer?.update(run.agentId, entry);
                continue;
              }
              const key = `${run.agentId}:${entry.kind}:${entry.text}`;
              if (liveSeen.has(key)) {
                continue;
              }
              liveSeen.add(key);
              const count = (liveCountByAgent.get(run.agentId) ?? 0) + 1;
              liveCountByAgent.set(run.agentId, count);
              if (count > 20 && entry.kind !== 'assistant' && entry.kind !== 'error') {
                continue;
              }
              if (process.stdout.isTTY) {
                process.stdout.write('\r\x1b[2K');
              }
              const agentPrefix = runs.length > 1 ? `${badge(`A${run.agentId}`, 'muted')} ` : '';
              const entryBadge = badge(entry.label.toUpperCase(), labelTone(entry.label));
              console.log(
                `${badge('LIVE', 'info')} ${agentPrefix}${entryBadge} ${formatShort(entry.text, 180)}`,
              );
            }
          },
        });

        if (!pickedBeadSet) {
          const combined = `${result.stdout}\n${result.stderr}`;
          const fallbackIds = extractReferencedBeadIds(combined, knownBeadIds);
          if (fallbackIds.length > 0) {
            const fallbackIssue = beadsSnapshot.byId.get(fallbackIds[0]);
            if (fallbackIssue) {
              markPickedBead(fallbackIssue);
            }
          }
        }

        if (!pickedBeadSet) {
          releasePickedReadinessOnce();
        }
        return {
          agentId: run.agentId,
          jsonlLogPath: run.jsonlLogPath,
          lastMessagePath: run.lastMessagePath,
          result,
        };
      } finally {
        releasePickedReadinessOnce();
      }
    })();

    launchedRuns.push(launchedRun);
  }

  return {
    results: await Promise.all(launchedRuns),
    pickedByAgent,
  };
}

export function shouldStopFromProviderOutput(
  provider: ProviderAdapter,
  previewEntries: PreviewEntry[],
  lastMessageOutput: string,
): boolean {
  if (provider.hasStopMarker(lastMessageOutput)) {
    return true;
  }
  return previewEntries.some(
    (entry) =>
      (entry.kind === 'assistant' || entry.kind === 'message') &&
      provider.hasStopMarker(entry.text),
  );
}

export function aggregateIterationOutput(params: {
  provider: ProviderAdapter;
  results: RunResult[];
  beadsSnapshot: BeadsSnapshot;
  pickedByAgent: Map<number, BeadIssue>;
  liveRenderer: IterationLiveRenderer | null;
  previewLines: number;
}): AggregatedIterationOutput {
  const { provider, results, beadsSnapshot, pickedByAgent, liveRenderer, previewLines } = params;

  const failed: AggregatedIterationOutput['failed'] = [];
  let usageAggregate: UsageSummary | null = null;
  let stopDetected = false;

  const knownBeadIds = new Set(beadsSnapshot.byId.keys());
  for (const entry of results) {
    const combined = `${entry.result.stdout}\n${entry.result.stderr}`.trim();
    const context = results.length > 1 ? `agent ${entry.agentId}` : undefined;
    if (entry.result.status !== 0) {
      failed.push({
        status: entry.result.status,
        combinedOutput: combined,
        result: entry,
      });
    }

    const preview = provider.collectMessages(combined);
    if (preview.length > 0) {
      if (!liveRenderer?.isEnabled()) {
        printPreview(preview, previewLines, context);
      }
    } else if (existsSync(entry.lastMessagePath)) {
      const lastMessage = readFileSync(entry.lastMessagePath, 'utf8').trim();
      if (lastMessage) {
        if (!liveRenderer?.isEnabled()) {
          printPreview(
            [{ kind: 'assistant', label: 'assistant', text: formatShort(lastMessage) }],
            previewLines,
            context,
          );
        }
      } else if (!liveRenderer?.isEnabled()) {
        printPreview([], previewLines, context);
      }
    } else if (!liveRenderer?.isEnabled()) {
      printPreview([], previewLines, context);
    }

    if (preview.length === 0) {
      const rawPreview = provider.collectRawJsonLines(combined, previewLines);
      if (rawPreview.length > 0) {
        const suffix = context ? ` (${context})` : '';
        console.log(`${badge('FALLBACK', 'warn')} JSONL preview fallback (raw lines):${suffix}`);
        if (!liveRenderer?.isEnabled()) {
          for (const rawLine of rawPreview) {
            console.log(`- ${colorize(formatShort(rawLine, 200), ANSI.dim)}`);
          }
        }
      }
    }

    const usage = provider.extractUsageSummary(combined);
    if (usage) {
      usageAggregate = usageAggregate
        ? {
            inputTokens: usageAggregate.inputTokens + usage.inputTokens,
            cachedInputTokens: usageAggregate.cachedInputTokens + usage.cachedInputTokens,
            outputTokens: usageAggregate.outputTokens + usage.outputTokens,
          }
        : {
            inputTokens: usage.inputTokens,
            cachedInputTokens: usage.cachedInputTokens,
            outputTokens: usage.outputTokens,
          };
      if (!liveRenderer?.isEnabled()) {
        printUsageSummary(usage, context);
      }
    }

    const lastMessageOutput = existsSync(entry.lastMessagePath)
      ? readFileSync(entry.lastMessagePath, 'utf8')
      : '';
    if (shouldStopFromProviderOutput(provider, preview, lastMessageOutput)) {
      stopDetected = true;
    }

    if (!pickedByAgent.has(entry.agentId)) {
      const fallbackIds = extractReferencedBeadIds(combined, knownBeadIds);
      if (fallbackIds.length > 0) {
        const fallbackIssue = beadsSnapshot.byId.get(fallbackIds[0]);
        if (fallbackIssue) {
          pickedByAgent.set(entry.agentId, fallbackIssue);
        }
      }
    }
    const picked = pickedByAgent.get(entry.agentId);
    if (picked && !liveRenderer?.isEnabled()) {
      console.log(
        `${badge(`A${entry.agentId}`, 'muted')} picked bead ${picked.id}: ${picked.title}`,
      );
    }
  }

  return {
    pickedByAgent,
    usageAggregate,
    failed,
    stopDetected,
  };
}
