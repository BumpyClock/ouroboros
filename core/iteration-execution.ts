import type { ChildProcess } from 'node:child_process';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import type { ProviderAdapter } from '../providers/types';
import { extractReferencedTaskIds } from './beads';
import type {
  AgentReviewPhase,
  IterationSummary,
  LiveRunAgentTab,
  LoopPhase,
  RunContext,
} from './live-run-state';
import { buildRuns, summarizeArgsForLog } from './loop-runs';
import { runAgentProcess } from './process-runner';
import {
  buildReviewerContext,
  isReviewResult,
  parseReviewerVerdict,
  type ReviewResult,
} from './review';
import { buildRunFileBase } from './state';
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
  CliOptions,
  PreviewEntry,
  RunResult,
  TaskIssue,
  TasksSnapshot,
  Tone,
  UsageSummary,
} from './types';

export type IterationLiveRenderer = {
  isEnabled(): boolean;
  setIteration(iteration: number): void;
  update(agentId: number, entry: PreviewEntry): void;
  setTasksSnapshot(snapshot: TasksSnapshot | null): void;
  setAgentLogPath(agentId: number, path: string): void;
  setRunContext(context: RunContext): void;
  setIterationSummary(summary: IterationSummary): void;
  setLoopNotice(message: string, tone: Tone): void;
  setPauseState(msRemaining: number | null): void;
  setRetryState(secondsRemaining: number | null): void;
  markIterationRetry(iteration: number): void;
  setIterationOutcome(iteration: number, outcome: 'success' | 'failed'): void;
  setLoopPhase(phase: LoopPhase): void;
  setAgentPickedTask(agentId: number, issue: TaskIssue): void;
  setAgentQueued(agentId: number, message: string): void;
  setAgentLaunching(agentId: number, message: string): void;
  setAgentActiveTab(agentId: number, tab: LiveRunAgentTab): void;
  setAgentReviewPhase(agentId: number, phase: AgentReviewPhase): void;
  clearAgentReviewPhase(agentId: number): void;
  stop(message: string, tone?: Tone): void;
};

type LegacyIterationLiveRenderer = {
  setBeadsSnapshot?: (snapshot: TasksSnapshot | null) => void;
  setAgentPickedBead?: (agentId: number, issue: TaskIssue) => void;
};

function setRendererTasksSnapshot(
  renderer: IterationLiveRenderer | null,
  snapshot: TasksSnapshot | null,
): void {
  if (!renderer) {
    return;
  }
  const compatRenderer = renderer as IterationLiveRenderer & LegacyIterationLiveRenderer;
  if (typeof compatRenderer.setTasksSnapshot === 'function') {
    compatRenderer.setTasksSnapshot(snapshot);
    return;
  }
  compatRenderer.setBeadsSnapshot?.(snapshot);
}

function setRendererPickedTask(
  renderer: IterationLiveRenderer | null,
  agentId: number,
  issue: TaskIssue,
): void {
  if (!renderer) {
    return;
  }
  const compatRenderer = renderer as IterationLiveRenderer & LegacyIterationLiveRenderer;
  if (typeof compatRenderer.setAgentPickedTask === 'function') {
    compatRenderer.setAgentPickedTask(agentId, issue);
    return;
  }
  compatRenderer.setAgentPickedBead?.(agentId, issue);
}

type ActiveSpinnerStopRef = {
  value: ((message: string, tone?: Tone) => void) | null;
};

export type SlotReviewOutcome = {
  passed: boolean;
  fixAttempts: number;
  lastVerdict?: ReviewResult;
  failureReason?: string;
};

export type AggregatedIterationOutput = {
  pickedByAgent: Map<number, TaskIssue>;
  usageAggregate: UsageSummary | null;
  failed: Array<{
    status: number | null;
    combinedOutput: string;
    result: RunResult;
  }>;
  stopDetected: boolean;
  reviewOutcomes: Map<number, SlotReviewOutcome>;
};

function findMatchedRemainingTaskIssue(
  text: string,
  remainingTaskIds: Set<string>,
  tasksById: Map<string, TaskIssue>,
): TaskIssue | null {
  const matchedIds = extractReferencedTaskIds(text, remainingTaskIds);
  if (matchedIds.length === 0) {
    return null;
  }
  return tasksById.get(matchedIds[0]) ?? null;
}

function captureGitDiff(): string {
  try {
    return execSync('git diff HEAD', {
      encoding: 'utf8',
      timeout: 15_000,
      maxBuffer: 1024 * 1024,
    });
  } catch {
    return '(git diff unavailable)';
  }
}

export type SlotReviewInput = {
  agentId: number;
  iteration: number;
  implementResult: RunResult;
  pickedTask: TaskIssue;
  options: CliOptions;
  provider: ProviderAdapter;
  reviewerProvider: ProviderAdapter;
  reviewerPrompt: string;
  command: string;
  reviewerCommand: string;
  logDir: string;
  activeChildren: Set<ChildProcess>;
  liveRendererEnabled: boolean;
  liveRenderer: IterationLiveRenderer | null;
};

export async function runSlotReviewLoop(
  input: SlotReviewInput,
  runAgentProcessFn: typeof runAgentProcess = runAgentProcess,
): Promise<SlotReviewOutcome> {
  const {
    agentId,
    iteration,
    implementResult,
    pickedTask,
    options,
    provider,
    reviewerProvider,
    reviewerPrompt,
    command,
    reviewerCommand,
    logDir,
    activeChildren,
    liveRendererEnabled,
    liveRenderer,
  } = input;

  const maxFix = options.reviewMaxFixAttempts;
  let lastImplementOutput = `${implementResult.result.stdout}\n${implementResult.result.stderr}`;
  let lastImplementLogPath = implementResult.jsonlLogPath;
  let previousFollowUp: string | undefined;

  const clearReviewPhase = () => {
    liveRenderer?.clearAgentReviewPhase(agentId);
  };

  try {
    for (let fixAttempt = 0; fixAttempt <= maxFix; fixAttempt += 1) {
      const phase = fixAttempt === 0 ? 'review' : `re-review (fix ${fixAttempt})`;
      const reviewLogBase = `${buildRunFileBase(iteration)}-agent-${String(agentId).padStart(2, '0')}-review-${fixAttempt}`;
      const reviewLogPath = path.join(logDir, `${reviewLogBase}.jsonl`);
      const reviewLastMessagePath = path.join(logDir, `${reviewLogBase}.last-message.txt`);

      // Signal reviewing phase to live renderer
      liveRenderer?.setAgentReviewPhase(agentId, {
        phase: 'reviewing',
        fixAttempt,
        taskId: pickedTask.id,
      });
      liveRenderer?.setAgentLogPath(agentId, reviewLogPath);

      if (!liveRendererEnabled) {
        console.log(`${badge(`A${agentId}`, 'muted')} ${phase} for task ${pickedTask.id}`);
      }

      const gitDiff = captureGitDiff();
      const reviewerContext = buildReviewerContext({
        task: pickedTask,
        implementerOutput: lastImplementOutput.slice(0, 50_000),
        implementerLogPath: lastImplementLogPath,
        gitDiff,
        parallelAgents: options.parallelAgents,
        fixAttempt: fixAttempt > 0 ? fixAttempt : undefined,
        previousFollowUp,
      });

      const fullReviewerPrompt = `${reviewerPrompt}\n\n${reviewerContext}`;
      const reviewOptions: CliOptions = { ...options, model: options.reviewerModel };
      const reviewerArgs = reviewerProvider.buildExecArgs(
        fullReviewerPrompt,
        reviewLastMessagePath,
        reviewOptions,
      );

      let trackedChild: ChildProcess | null = null;
      const reviewResult = await runAgentProcessFn({
        prompt: fullReviewerPrompt,
        command: reviewerCommand,
        args: reviewerArgs,
        logPath: reviewLogPath,
        showRaw: false,
        formatCommandHint: reviewerProvider.formatCommandHint,
        onChildChange: (child) => {
          if (child) {
            trackedChild = child;
            activeChildren.add(child);
          } else if (trackedChild) {
            activeChildren.delete(trackedChild);
            trackedChild = null;
          }
        },
      });

      const reviewOutput = `${reviewResult.stdout}\n${reviewResult.stderr}`.trim();
      if (reviewResult.status !== 0) {
        const reviewerFailureReason = `reviewer process exited with status ${reviewResult.status}`;
        if (!liveRendererEnabled) {
          console.log(`${badge(`A${agentId}`, 'error')} ${reviewerFailureReason}`);
        }
        clearReviewPhase();
        return {
          passed: false,
          fixAttempts: fixAttempt,
          failureReason: reviewerFailureReason,
        };
      }
      const verdict = parseReviewerVerdict(reviewOutput);

      if (!isReviewResult(verdict)) {
        if (!liveRendererEnabled) {
          console.log(
            `${badge(`A${agentId}`, 'error')} reviewer output parse failed: ${verdict.reason}`,
          );
        }
        clearReviewPhase();
        return {
          passed: false,
          fixAttempts: fixAttempt,
          failureReason: `reviewer contract violation: ${verdict.reason}`,
        };
      }

      if (!liveRendererEnabled) {
        console.log(
          `${badge(`A${agentId}`, verdict.verdict === 'pass' ? 'success' : 'warn')} reviewer verdict: ${verdict.verdict}`,
        );
      }

      if (verdict.verdict === 'pass') {
        clearReviewPhase();
        return { passed: true, fixAttempts: fixAttempt, lastVerdict: verdict };
      }

      // Drift detected — run fix agent if attempts remain
      if (fixAttempt >= maxFix) {
        clearReviewPhase();
        return {
          passed: false,
          fixAttempts: fixAttempt,
          lastVerdict: verdict,
          failureReason: `drift unresolved after ${maxFix} fix attempt(s)`,
        };
      }

      const fixLogBase = `${buildRunFileBase(iteration)}-agent-${String(agentId).padStart(2, '0')}-fix-${fixAttempt + 1}`;
      const fixLogPath = path.join(logDir, `${fixLogBase}.jsonl`);
      const fixLastMessagePath = path.join(logDir, `${fixLogBase}.last-message.txt`);

      // Signal fixing phase to live renderer
      liveRenderer?.setAgentReviewPhase(agentId, {
        phase: 'fixing',
        fixAttempt: fixAttempt + 1,
        taskId: pickedTask.id,
      });
      liveRenderer?.setAgentLogPath(agentId, fixLogPath);

      if (!liveRendererEnabled) {
        console.log(
          `${badge(`A${agentId}`, 'info')} fix attempt ${fixAttempt + 1}/${maxFix} for task ${pickedTask.id}`,
        );
      }

      const fixPrompt = `The reviewer found drift in your implementation of task ${pickedTask.id}: ${pickedTask.title}\n\nReviewer feedback:\n${verdict.followUpPrompt}\n\nPlease fix the issues described above.`;
      const fixArgs = provider.buildExecArgs(fixPrompt, fixLastMessagePath, options);

      let fixTrackedChild: ChildProcess | null = null;
      const fixResult = await runAgentProcessFn({
        prompt: fixPrompt,
        command,
        args: fixArgs,
        logPath: fixLogPath,
        showRaw: false,
        formatCommandHint: provider.formatCommandHint,
        onChildChange: (child) => {
          if (child) {
            fixTrackedChild = child;
            activeChildren.add(child);
          } else if (fixTrackedChild) {
            activeChildren.delete(fixTrackedChild);
            fixTrackedChild = null;
          }
        },
      });

      if (fixResult.status !== 0) {
        const fixFailureReason = `fixer process exited with status ${fixResult.status}`;
        if (!liveRendererEnabled) {
          console.log(`${badge(`A${agentId}`, 'error')} ${fixFailureReason}`);
        }
        clearReviewPhase();
        return {
          passed: false,
          fixAttempts: fixAttempt + 1,
          failureReason: fixFailureReason,
        };
      }

      lastImplementOutput = `${fixResult.stdout}\n${fixResult.stderr}`;
      lastImplementLogPath = fixLogPath;
      previousFollowUp = verdict.followUpPrompt;
    }

    clearReviewPhase();
    return {
      passed: false,
      fixAttempts: maxFix,
      failureReason: `drift unresolved after ${maxFix} fix attempt(s)`,
    };
  } finally {
    clearReviewPhase();
  }
}

export async function runIteration(
  iteration: number,
  stateMaxIterations: number,
  options: CliOptions,
  provider: ProviderAdapter,
  reviewerProvider: ProviderAdapter,
  reviewerCommand: string,
  tasksSnapshot: TasksSnapshot,
  prompt: string,
  promptPath: string,
  command: string,
  logDir: string,
  activeChildren: Set<ChildProcess>,
  activeSpinnerStopRef: ActiveSpinnerStopRef,
  liveRenderer: IterationLiveRenderer | null,
  reviewerPromptPath?: string,
): Promise<{
  results: RunResult[];
  pickedByAgent: Map<number, TaskIssue>;
  reviewOutcomes: Map<number, SlotReviewOutcome>;
}> {
  const runs = buildRuns(iteration, options.parallelAgents, logDir, provider, options, prompt);
  const liveRendererEnabled = Boolean(liveRenderer?.isEnabled());
  const startedAt = Date.now();
  const model = options.model.trim();
  const runContext: RunContext = {
    startedAt,
    loopLabel: `${provider.displayName} Loop`,
    provider: provider.name,
    project: options.projectRoot,
    projectKey: options.projectKey,
    commandPath: command,
    promptPath,
    logDir,
    maxIterations: stateMaxIterations,
    model: model.length > 0 ? model : undefined,
    reasoningEffort: options.reasoningEffort,
    parallelAgents: options.parallelAgents,
    yolo: options.yolo,
    command: `${command} ${summarizeArgsForLog(runs[0].args)}`,
    batch: `target ${runs.length} parallel agent(s), staged startup`,
    agentLogPaths: new Map<number, string>(),
  };
  liveRenderer?.setRunContext(runContext);
  liveRenderer?.setLoopNotice('iteration started', 'info');
  liveRenderer?.setLoopPhase('starting');
  setRendererTasksSnapshot(liveRenderer, tasksSnapshot);

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
  const pickedByAgent = new Map<number, TaskIssue>();
  const reviewOutcomes = new Map<number, SlotReviewOutcome>();
  const remainingTaskIds = new Set(tasksSnapshot.remainingIssues.map((issue) => issue.id));
  const reviewerPrompt =
    options.reviewEnabled && reviewerPromptPath && existsSync(reviewerPromptPath)
      ? readFileSync(reviewerPromptPath, 'utf8')
      : null;
  for (const run of runs) {
    if (run.agentId === 1) {
      if (liveRendererEnabled) {
        liveRenderer?.setAgentLaunching(
          run.agentId,
          'launching now, waiting for first picked task',
        );
      }
      continue;
    }
    const previousAgentId = run.agentId - 1;
    if (liveRendererEnabled) {
      liveRenderer?.setAgentQueued(
        run.agentId,
        `waiting to spawn until A${previousAgentId} picked a task`,
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
        liveRenderer?.setAgentLaunching(run.agentId, `launching after A${runIndex} picked a task`);
      } else {
        console.log(
          `${badge(
            'SPAWN',
            'muted',
          )} launching agent ${run.agentId} after A${runIndex} picked a task`,
        );
      }
    }

    const launchedRun = (async (): Promise<RunResult> => {
      let trackedChild: ChildProcess | null = null;
      let readinessReleased = false;
      let pickedTaskSet = false;
      const releasePickedReadinessOnce = () => {
        if (readinessReleased) {
          return;
        }
        readinessReleased = true;
        releasePickedReadiness();
      };

      const markPickedTask = (issue: TaskIssue) => {
        if (pickedTaskSet) {
          return;
        }
        pickedByAgent.set(run.agentId, issue);
        pickedTaskSet = true;
        setRendererPickedTask(liveRenderer, run.agentId, issue);
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
            const matchedFromRawLine = findMatchedRemainingTaskIssue(
              line,
              remainingTaskIds,
              tasksSnapshot.byId,
            );
            if (matchedFromRawLine) {
              markPickedTask(matchedFromRawLine);
            }

            const previewEntries = provider.previewEntriesFromLine(line);
            for (const entry of previewEntries) {
              const matchedFromEntry = findMatchedRemainingTaskIssue(
                entry.text,
                remainingTaskIds,
                tasksSnapshot.byId,
              );
              if (matchedFromEntry) {
                markPickedTask(matchedFromEntry);
              }
            }

            const liveEntries = previewEntries.filter(
              (entry) =>
                entry.kind === 'reasoning' ||
                entry.kind === 'tool' ||
                entry.kind === 'assistant' ||
                entry.kind === 'error',
            );
            for (const entry of liveEntries) {
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

        if (!pickedTaskSet) {
          const combined = `${result.stdout}\n${result.stderr}`;
          const fallbackIssue = findMatchedRemainingTaskIssue(
            combined,
            remainingTaskIds,
            tasksSnapshot.byId,
          );
          if (fallbackIssue) {
            markPickedTask(fallbackIssue);
          }
        }

        if (!pickedTaskSet) {
          releasePickedReadinessOnce();
        }

        const implementRunResult: RunResult = {
          agentId: run.agentId,
          jsonlLogPath: run.jsonlLogPath,
          lastMessagePath: run.lastMessagePath,
          result,
        };

        // Run slot-local review/fix loop if review enabled and a task was picked
        const pickedTask = pickedByAgent.get(run.agentId);
        if (options.reviewEnabled && reviewerPrompt && pickedTask && result.status === 0) {
          const outcome = await runSlotReviewLoop({
            agentId: run.agentId,
            iteration,
            implementResult: implementRunResult,
            pickedTask,
            options,
            provider,
            reviewerProvider,
            reviewerPrompt,
            command,
            reviewerCommand,
            logDir,
            activeChildren,
            liveRendererEnabled,
            liveRenderer,
          });
          reviewOutcomes.set(run.agentId, outcome);
        }

        return implementRunResult;
      } finally {
        releasePickedReadinessOnce();
      }
    })();

    launchedRuns.push(launchedRun);
  }

  return {
    results: await Promise.all(launchedRuns),
    pickedByAgent,
    reviewOutcomes,
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
  tasksSnapshot: TasksSnapshot;
  pickedByAgent: Map<number, TaskIssue>;
  liveRenderer: IterationLiveRenderer | null;
  previewLines: number;
  reviewOutcomes: Map<number, SlotReviewOutcome>;
}): AggregatedIterationOutput {
  const {
    provider,
    results,
    tasksSnapshot,
    pickedByAgent,
    liveRenderer,
    previewLines,
    reviewOutcomes,
  } = params;

  const failed: AggregatedIterationOutput['failed'] = [];
  let usageAggregate: UsageSummary | null = null;
  let stopDetected = false;

  const remainingTaskIds = new Set(tasksSnapshot.remainingIssues.map((issue) => issue.id));
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
      const fallbackIssue = findMatchedRemainingTaskIssue(
        combined,
        remainingTaskIds,
        tasksSnapshot.byId,
      );
      if (fallbackIssue) {
        pickedByAgent.set(entry.agentId, fallbackIssue);
      }
    }
    const picked = pickedByAgent.get(entry.agentId);
    if (picked && !liveRenderer?.isEnabled()) {
      console.log(
        `${badge(`A${entry.agentId}`, 'muted')} picked task ${picked.id}: ${picked.title}`,
      );
    }

    const reviewOutcome = reviewOutcomes.get(entry.agentId);
    if (reviewOutcome && !reviewOutcome.passed) {
      const reason = reviewOutcome.failureReason ?? 'review drift unresolved';
      failed.push({
        status: null,
        combinedOutput: `review failed for agent ${entry.agentId}: ${reason}`,
        result: entry,
      });
      if (!liveRenderer?.isEnabled()) {
        console.log(
          `${badge(`A${entry.agentId}`, 'error')} ${reason} (${reviewOutcome.fixAttempts} fix attempt(s))`,
        );
      }
    }
  }

  return {
    pickedByAgent,
    usageAggregate,
    failed,
    stopDetected,
    reviewOutcomes,
  };
}
