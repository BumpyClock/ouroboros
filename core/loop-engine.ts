import type { ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import type { ProviderAdapter } from '../providers/types';
import { InkLiveRunRenderer } from '../tui/tui';
import { extractReferencedBeadIds, loadBeadsSnapshot } from './beads';
import type { IterationSummary, LoopPhase, RunContext } from './live-run-state';
import { resolveRunnableCommand, runAgentProcess, terminateChildProcess } from './process-runner';
import {
  buildRunFileBase,
  isCircuitBroken,
  loadIterationState,
  resolveIterationStatePath,
  sleep,
  writeIterationState,
} from './state';
import {
  ANSI,
  badge,
  colorize,
  createSpinner,
  LiveRunRenderer,
  labelTone,
  printPreview,
  printSection,
  printUsageSummary,
  progressBar,
} from './terminal-ui';
import { formatShort } from './text';
import type {
  BeadIssue,
  BeadsSnapshot,
  CliOptions,
  PreviewEntry,
  RunDefinition,
  RunResult,
  Tone,
} from './types';

type IterationLiveRenderer = {
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

function createLiveRenderer(
  options: CliOptions,
  iteration: number,
  stateMaxIterations: number,
  agentIds: number[],
): IterationLiveRenderer | null {
  if (options.showRaw) {
    return null;
  }
  if (!process.stdout.isTTY) {
    return new LiveRunRenderer(iteration, stateMaxIterations, agentIds, options.previewLines);
  }
  try {
    return new InkLiveRunRenderer(iteration, stateMaxIterations, agentIds, options.previewLines);
  } catch (error) {
    const fallbackReason =
      error instanceof Error ? formatShort(error.message, 120) : 'unknown error';
    console.log(
      `${badge('TUI', 'warn')} Ink renderer unavailable, falling back (${fallbackReason})`,
    );
    return new LiveRunRenderer(iteration, stateMaxIterations, agentIds, options.previewLines);
  }
}

function buildRuns(
  iteration: number,
  parallelAgents: number,
  logDir: string,
  provider: ProviderAdapter,
  options: CliOptions,
  prompt: string,
): RunDefinition[] {
  return Array.from({ length: parallelAgents }, (_, index) => {
    const agentId = index + 1;
    const runBase = `${buildRunFileBase(iteration)}-agent-${String(agentId).padStart(2, '0')}`;
    const jsonlLogPath = path.join(logDir, `${runBase}.jsonl`);
    const lastMessagePath = path.join(logDir, `${runBase}.last-message.txt`);
    const args = provider.buildExecArgs(prompt, lastMessagePath, options);
    return { agentId, jsonlLogPath, lastMessagePath, args };
  });
}

function summarizeArgsForLog(args: string[]): string {
  return args
    .map((arg) => {
      if (arg.length > 120) {
        return `<arg:${arg.length} chars>`;
      }
      return arg;
    })
    .join(' ');
}

function printInitialSummary(
  provider: ProviderAdapter,
  options: CliOptions,
  command: string,
  promptPath: string,
  logDir: string,
  maxIterations: number,
): void {
  printSection(`${provider.displayName} Loop`);
  console.log(`${badge('PROVIDER', 'neutral')} ${provider.name}`);
  console.log(`${badge('PROJECT', 'neutral')} ${options.projectRoot}`);
  console.log(`${badge('PROJECT_KEY', 'neutral')} ${options.projectKey}`);
  console.log(`${badge('COMMAND', 'neutral')} ${colorize(command, ANSI.bold)}`);
  console.log(`${badge('PROMPT', 'neutral')} ${promptPath}`);
  console.log(`${badge('LOGS', 'neutral')} ${logDir}`);
  console.log(`${badge('LIMIT', 'neutral')} max iterations: ${maxIterations}`);
  if (options.model.trim()) {
    console.log(`${badge('MODEL', 'neutral')} ${options.model.trim()}`);
  }
  console.log(`${badge('EFFORT', 'neutral')} reasoning_effort=${options.reasoningEffort}`);
  console.log(
    `${badge('PARALLEL', options.parallelAgents > 1 ? 'warn' : 'neutral')} ${options.parallelAgents}`,
  );
  console.log(
    `${badge('YOLO', options.yolo ? 'warn' : 'muted')} ${options.yolo ? 'enabled' : 'disabled'}`,
  );
}

async function runIteration(
  iteration: number,
  stateMaxIterations: number,
  options: CliOptions,
  provider: ProviderAdapter,
  beadsSnapshot: BeadsSnapshot,
  prompt: string,
  command: string,
  logDir: string,
  activeChildren: Set<ChildProcess>,
  activeSpinnerStopRef: { value: ((message: string, tone?: Tone) => void) | null },
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
      `${badge('ITERATION', 'info')} ${iteration}/${stateMaxIterations} ${colorize(
        progressBar(iteration, stateMaxIterations),
        ANSI.cyan,
      )}`,
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
        liveRenderer?.setAgentLaunching(run.agentId, 'launching now, waiting for first response');
      }
      continue;
    }
    const readinessGate = run.agentId - 1;
    if (liveRendererEnabled) {
      liveRenderer?.setAgentQueued(
        run.agentId,
        `waiting to spawn until readiness ${readinessGate}/${runs.length}`,
      );
    }
  }

  let readinessCount = 0;
  const readinessWaiters: Array<{ target: number; resolve: () => void }> = [];
  const flushReadinessWaiters = () => {
    const remaining: Array<{ target: number; resolve: () => void }> = [];
    for (const waiter of readinessWaiters) {
      if (readinessCount >= waiter.target) {
        waiter.resolve();
      } else {
        remaining.push(waiter);
      }
    }
    readinessWaiters.length = 0;
    readinessWaiters.push(...remaining);
  };
  const releaseReadiness = () => {
    readinessCount += 1;
    flushReadinessWaiters();
  };
  const waitForReadiness = (target: number): Promise<void> => {
    if (readinessCount >= target) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      readinessWaiters.push({ target, resolve });
    });
  };

  const launchedRuns: Array<Promise<RunResult>> = [];
  for (let runIndex = 0; runIndex < runs.length; runIndex += 1) {
    const run = runs[runIndex];
    if (runIndex > 0) {
      await waitForReadiness(runIndex);
      if (liveRendererEnabled) {
        liveRenderer?.setAgentLaunching(
          run.agentId,
          `launching after readiness ${runIndex}/${runs.length}`,
        );
      } else {
        console.log(
          `${badge('SPAWN', 'muted')} launching agent ${run.agentId} after readiness ${runIndex}/${runs.length}`,
        );
      }
    }

    const launchedRun = (async (): Promise<RunResult> => {
      let trackedChild: ChildProcess | null = null;
      let readinessReleased = false;
      const releaseReadinessOnce = () => {
        if (readinessReleased) {
          return;
        }
        readinessReleased = true;
        releaseReadiness();
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
                  pickedByAgent.set(run.agentId, matchedIssue);
                  liveRenderer?.setAgentPickedBead(run.agentId, matchedIssue);
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
          onFirstResponse: () => {
            releaseReadinessOnce();
          },
        });
        return {
          agentId: run.agentId,
          jsonlLogPath: run.jsonlLogPath,
          lastMessagePath: run.lastMessagePath,
          result,
        };
      } finally {
        releaseReadinessOnce();
      }
    })();

    launchedRuns.push(launchedRun);
  }

  return {
    results: await Promise.all(launchedRuns),
    pickedByAgent,
  };
}

function printBeadsSnapshot(snapshot: BeadsSnapshot): void {
  if (!snapshot.available) {
    const suffix = snapshot.error ? ` (${formatShort(snapshot.error, 120)})` : '';
    console.log(`${badge('BEADS', 'warn')} unavailable${suffix}`);
    return;
  }
  console.log(
    `${badge('BEADS', 'info')} remaining ${snapshot.remaining} | in_progress ${snapshot.inProgress} | open ${snapshot.open} | blocked ${snapshot.blocked} | closed ${snapshot.closed}`,
  );
  for (const issue of snapshot.remainingIssues.slice(0, 3)) {
    const assignee = issue.assignee ? ` @${issue.assignee}` : '';
    console.log(`- ${issue.id} ${issue.title}${assignee}`);
  }
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

export async function runLoop(options: CliOptions, provider: ProviderAdapter): Promise<void> {
  const promptPath = path.resolve(process.cwd(), options.promptPath);
  const statePath = resolveIterationStatePath(process.cwd());
  const logDir = path.resolve(process.cwd(), options.logDir);
  const command = resolveRunnableCommand(options.command, provider.formatCommandHint);
  const activeChildren = new Set<ChildProcess>();
  const activeSpinnerStopRef: { value: ((message: string, tone?: Tone) => void) | null } = {
    value: null,
  };
  let shuttingDown = false;
  let liveRenderer: IterationLiveRenderer | null = null;

  const onSignal = (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    console.log();
    console.log(`${badge('SHUTDOWN', 'warn')} received ${signal}, cleaning up...`);
    void (async () => {
      if (activeSpinnerStopRef.value) {
        activeSpinnerStopRef.value('cancelled', 'warn');
        activeSpinnerStopRef.value = null;
      }
      if (activeChildren.size > 0) {
        const count = activeChildren.size;
        await Promise.all([...activeChildren].map((child) => terminateChildProcess(child)));
        activeChildren.clear();
        console.log(
          `${badge('CLEANUP', 'success')} terminated ${count} running child process(es).`,
        );
      }
      process.exit(signal === 'SIGINT' ? 130 : 143);
    })();
  };

  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  try {
    const state = loadIterationState(statePath, options.iterationLimit, options.iterationsSet);
    if (isCircuitBroken(state)) {
      console.log(`Circuit breaker hit: max_iterations (${state.max_iterations}) already reached`);
      return;
    }
    if (!existsSync(promptPath)) {
      throw new Error(`Prompt file not found: ${promptPath}`);
    }

    printInitialSummary(provider, options, command, promptPath, logDir, state.max_iterations);

    let stoppedByProviderMarker = false;
    let reachedCircuit = false;
    let terminalLoopPhase: 'completed' | 'stopped' | 'failed' | null = null;
    const agentIds = Array.from({ length: options.parallelAgents }, (_, index) => index + 1);
    liveRenderer = createLiveRenderer(
      options,
      state.current_iteration + 1,
      state.max_iterations,
      agentIds,
    );
    for (; state.current_iteration < state.max_iterations; ) {
      if (shuttingDown) {
        break;
      }

      const prompt = readFileSync(promptPath, 'utf8');
      state.current_iteration += 1;
      writeIterationState(statePath, state);

      const iteration = state.current_iteration;
      liveRenderer?.setIteration(iteration);
      let results: RunResult[];
      let pickedByAgent = new Map<number, BeadIssue>();
      const beadsSnapshot = await loadBeadsSnapshot(options.projectRoot);
      let iterationRun: {
        results: RunResult[];
        pickedByAgent: Map<number, BeadIssue>;
      } | null = null;
      if (!liveRenderer?.isEnabled()) {
        printBeadsSnapshot(beadsSnapshot);
      }
      try {
        iterationRun = await runIteration(
          iteration,
          state.max_iterations,
          options,
          provider,
          beadsSnapshot,
          prompt,
          command,
          logDir,
          activeChildren,
          activeSpinnerStopRef,
          liveRenderer,
        );
        results = iterationRun.results;
        pickedByAgent = iterationRun.pickedByAgent;
        const liveRendererEnabled = Boolean(liveRenderer?.isEnabled());
        if (liveRenderer && liveRendererEnabled) {
          liveRenderer.setLoopPhase('collecting');
        }

        const allSuccess = results.every((entry) => entry.result.status === 0);
        if (!liveRendererEnabled) {
          activeSpinnerStopRef.value?.(
            allSuccess ? 'responses received' : 'one or more processes exited',
            allSuccess ? 'success' : 'warn',
          );
        }
        activeSpinnerStopRef.value = null;
      } catch (error) {
        activeSpinnerStopRef.value?.('spawn failed', 'error');
        activeSpinnerStopRef.value = null;
        throw error;
      }

      const failed = results.filter((entry) => entry.result.status !== 0);
      if (failed.length > 0) {
        const retryDelays = failed
          .map((entry) =>
            provider.extractRetryDelaySeconds(`${entry.result.stdout}\n${entry.result.stderr}`),
          )
          .filter((value): value is number => value !== null);
        if (retryDelays.length === failed.length && iteration < state.max_iterations) {
          const retrySeconds = Math.max(...retryDelays);
          const retryMessage = `retry delay detected (${retrySeconds}s). waiting before next iteration`;
          if (liveRenderer?.isEnabled()) {
            liveRenderer.setLoopNotice(retryMessage, 'warn');
            liveRenderer.setRetryState(retrySeconds);
            liveRenderer.setLoopPhase('retry_wait');
          } else {
            console.log(`${badge('RETRY', 'warn')} ${retryMessage}`);
          }
          for (let remaining = retrySeconds; remaining > 0; remaining -= 1) {
            if (liveRenderer?.isEnabled()) {
              liveRenderer.setPauseState(remaining * 1000);
            }
            await sleep(1000);
          }
          if (liveRenderer?.isEnabled()) {
            liveRenderer.setPauseState(null);
            liveRenderer.setRetryState(null);
            liveRenderer.setLoopNotice('pending status', 'muted');
            liveRenderer.setLoopPhase('starting');
          }
          continue;
        }

        for (const entry of failed) {
          const combined = `${entry.result.stdout}\n${entry.result.stderr}`.trim();
          console.log(
            `${badge(`A${entry.agentId}`, 'error')} exited with status ${entry.result.status}`,
          );
          if (combined) {
            console.log(colorize(formatShort(combined, 600), ANSI.red));
          }
        }
        if (liveRenderer?.isEnabled()) {
          liveRenderer.setLoopNotice('one or more agents failed', 'error');
          liveRenderer.setLoopPhase('failed');
          terminalLoopPhase = 'failed';
        }
        break;
      }

      let stopDetected = false;
      const knownBeadIds = new Set(beadsSnapshot.byId.keys());
      let usageAggregate: UsageSummary | null = null;
      for (const entry of results) {
        const combined = `${entry.result.stdout}\n${entry.result.stderr}`.trim();
        const context = results.length > 1 ? `agent ${entry.agentId}` : undefined;
        const preview = provider.collectMessages(combined);
        if (preview.length > 0) {
          if (!liveRenderer?.isEnabled()) {
            printPreview(preview, options.previewLines, context);
          }
        } else if (existsSync(entry.lastMessagePath)) {
          const lastMessage = readFileSync(entry.lastMessagePath, 'utf8').trim();
          if (lastMessage) {
            if (!liveRenderer?.isEnabled()) {
              printPreview(
                [{ kind: 'assistant', label: 'assistant', text: formatShort(lastMessage) }],
                options.previewLines,
                context,
              );
            }
          } else {
            if (!liveRenderer?.isEnabled()) {
              printPreview([], options.previewLines, context);
            }
          }
        } else {
          if (!liveRenderer?.isEnabled()) {
            printPreview([], options.previewLines, context);
          }
        }

        if (preview.length === 0) {
          const rawPreview = provider.collectRawJsonLines(combined, options.previewLines);
          if (rawPreview.length > 0) {
            const suffix = context ? ` (${context})` : '';
            console.log(
              `${badge('FALLBACK', 'warn')} JSONL preview fallback (raw lines):${suffix}`,
            );
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
        if (picked) {
          if (!liveRenderer?.isEnabled()) {
            console.log(
              `${badge(`A${entry.agentId}`, 'muted')} picked bead ${picked.id}: ${picked.title}`,
            );
          }
        }
      }

      const summary: IterationSummary = {
        usage: usageAggregate,
        pickedBeadsByAgent: pickedByAgent,
        notice: null,
        noticeTone: 'muted',
      };
      liveRenderer?.setIterationSummary(summary);

      if (stopDetected) {
        stoppedByProviderMarker = true;
        if (liveRenderer?.isEnabled()) {
          liveRenderer.setLoopNotice('provider stop marker detected', 'success');
          liveRenderer.setLoopPhase('stopped');
          liveRenderer.setPauseState(null);
          liveRenderer.setRetryState(null);
          terminalLoopPhase = 'stopped';
        } else {
          console.log(`${badge('STOP', 'success')} provider stop marker detected`);
        }
        break;
      }

      reachedCircuit = state.current_iteration >= state.max_iterations;

      if (state.current_iteration < state.max_iterations && options.pauseMs > 0) {
        if (liveRenderer?.isEnabled()) {
          liveRenderer.setLoopNotice(`waiting ${options.pauseMs}ms`, 'muted');
          liveRenderer.setLoopPhase('paused');
          liveRenderer.setPauseState(options.pauseMs);
        } else {
          console.log(`${badge('PAUSE', 'muted')} waiting ${options.pauseMs}ms`);
        }
        for (let remaining = options.pauseMs; remaining > 0; remaining -= 1000) {
          if (liveRenderer?.isEnabled()) {
            liveRenderer.setPauseState(remaining);
          }
          await sleep(1000);
        }
        if (liveRenderer?.isEnabled()) {
          liveRenderer.setPauseState(null);
          liveRenderer.setLoopNotice('pending status', 'muted');
          liveRenderer.setLoopPhase('streaming');
        }
      } else if (liveRenderer?.isEnabled()) {
        liveRenderer.setLoopPhase('streaming');
      }
      if (liveRenderer?.isEnabled()) {
        liveRenderer.setLoopNotice('iteration complete', 'info');
      }
    }

    if (liveRenderer?.isEnabled()) {
      if (terminalLoopPhase === 'failed' || terminalLoopPhase === 'stopped') {
        liveRenderer.setLoopPhase(terminalLoopPhase);
      } else if (!stoppedByProviderMarker && isCircuitBroken(state)) {
        liveRenderer.setLoopNotice(
          `max iterations (${state.max_iterations}) reached`,
          reachedCircuit ? 'warn' : 'success',
        );
        liveRenderer.setLoopPhase('completed');
      } else {
        liveRenderer.setLoopPhase('completed');
      }
    } else if (!stoppedByProviderMarker && isCircuitBroken(state)) {
      console.log(`${badge('CIRCUIT', 'warn')} max_iterations (${state.max_iterations}) reached`);
    }
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    if (liveRenderer) {
      liveRenderer.stop('', 'success');
    }
    if (activeChildren.size > 0) {
      await Promise.all([...activeChildren].map((child) => terminateChildProcess(child)));
      activeChildren.clear();
    }
    if (activeSpinnerStopRef.value) {
      activeSpinnerStopRef.value('stopped', 'warn');
      activeSpinnerStopRef.value = null;
    }
  }
}
