import type { ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import type { ProviderAdapter } from '../providers/types';
import { InkLiveRunRenderer } from '../tui/tui';
import { loadBeadsSnapshot } from './beads';
import type { IterationSummary } from './live-run-state';
import { resolveRunnableCommand, terminateChildProcess } from './process-runner';
import {
  isCircuitBroken,
  loadIterationState,
  resolveIterationStatePath,
  sleep,
  writeIterationState,
} from './state';
import {
  aggregateIterationOutput,
  IterationLiveRenderer,
  runIteration as runIterationInternal,
  shouldStopFromProviderOutput as shouldStopFromProviderOutputInternal,
} from './iteration-execution';
import { resolveRunLogDirectory } from './loop-runs';
import {
  badge,
  colorize,
  ANSI,
  LiveRunRenderer,
  printSection,
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
} from './types';

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
  return runIterationInternal(
    iteration,
    stateMaxIterations,
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
  return shouldStopFromProviderOutputInternal(provider, previewEntries, lastMessageOutput);
}

export async function runLoop(options: CliOptions, provider: ProviderAdapter): Promise<void> {
  const promptPath = path.resolve(process.cwd(), options.promptPath);
  const statePath = resolveIterationStatePath(process.cwd());
  const logDir = resolveRunLogDirectory(process.cwd(), options.logDir);
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

      const aggregatedOutput = aggregateIterationOutput({
        provider,
        results,
        beadsSnapshot,
        pickedByAgent,
        liveRenderer,
        previewLines: options.previewLines,
      });
      const failed = aggregatedOutput.failed;
      const usageAggregate = aggregatedOutput.usageAggregate;
      const stopDetected = aggregatedOutput.stopDetected;
      pickedByAgent = aggregatedOutput.pickedByAgent;
      if (failed.length > 0) {
        const retryDelays = failed
          .map((entry) => provider.extractRetryDelaySeconds(entry.combinedOutput))
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
          console.log(
            `${badge(`A${entry.result.agentId}`, 'error')} exited with status ${entry.status}`,
          );
          if (entry.combinedOutput) {
            console.log(colorize(formatShort(entry.combinedOutput, 600), ANSI.red));
          }
        }
        if (liveRenderer?.isEnabled()) {
          liveRenderer.setLoopNotice('one or more agents failed', 'error');
          liveRenderer.setLoopPhase('failed');
          terminalLoopPhase = 'failed';
        }
        break;
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
