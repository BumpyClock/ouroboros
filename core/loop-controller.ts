import type { ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import type { ProviderAdapter } from '../providers/types';
import { InkLiveRunRenderer } from '../tui/tui';
import { loadBeadsSnapshot } from './beads';
import {
  aggregateIterationOutput,
  type IterationLiveRenderer,
  runIteration,
  type SlotReviewOutcome,
} from './iteration-execution';
import type { IterationSummary } from './live-run-state';
import { isCircuitBroken, loadIterationState, sleep, writeIterationState } from './state';
import { ANSI, badge, colorize, LiveRunRenderer, printSection } from './terminal-ui';
import { formatShort } from './text';
import type { BeadIssue, BeadsSnapshot, CliOptions, RunResult, Tone } from './types';

type ActiveSpinnerStopRef = {
  value: ((message: string, tone?: Tone) => void) | null;
};

type ShutdownProbe = {
  isShuttingDown: () => boolean;
};

type LoopControllerInput = {
  options: CliOptions;
  provider: ProviderAdapter;
  reviewerProvider: ProviderAdapter;
  promptPath: string;
  reviewerPromptPath?: string;
  statePath: string;
  logDir: string;
  command: string;
  reviewerCommand: string;
  activeChildren: Set<ChildProcess>;
  activeSpinnerStopRef: ActiveSpinnerStopRef;
  shutdownProbe: ShutdownProbe;
};

export function shouldIgnoreStopMarkerForNoBeads(params: {
  stopDetected: boolean;
  beadsSnapshot: Pick<BeadsSnapshot, 'available' | 'remaining'>;
  pickedCount: number;
}): boolean {
  if (!params.stopDetected || !params.beadsSnapshot.available) {
    return false;
  }
  return params.pickedCount === 0 || params.beadsSnapshot.remaining <= params.pickedCount;
}

export function buildTopLevelScopePrompt(prompt: string, topLevelBeadId?: string): string {
  if (!topLevelBeadId) {
    return prompt;
  }
  const topLevelGuidance = `\n\n## Top-level scope\n- Work only on beads that are direct children of ${topLevelBeadId}.\n- If no remaining scoped beads exist, emit \`no_beads_available\` and stop.\n`;
  return `${prompt}${topLevelGuidance}`;
}

export function shouldStopFromTopLevelExhaustion(params: {
  beadMode?: CliOptions['beadMode'];
  topLevelBeadId?: string;
  beadsSnapshot: Pick<BeadsSnapshot, 'available' | 'remaining'>;
}): boolean {
  return (
    params.beadMode === 'top-level' &&
    Boolean(params.topLevelBeadId) &&
    params.beadsSnapshot.available &&
    params.beadsSnapshot.remaining <= 0
  );
}

export function shouldPrintInitialSummary(
  options: Pick<CliOptions, 'showRaw'>,
  isTty = Boolean(process.stdout.isTTY),
): boolean {
  return options.showRaw || !isTty;
}

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

export async function runLoopController(
  input: LoopControllerInput,
): Promise<IterationLiveRenderer | null> {
  const {
    options,
    provider,
    promptPath,
    statePath,
    logDir,
    command,
    activeChildren,
    activeSpinnerStopRef,
    shutdownProbe,
  } = input;

  const state = loadIterationState(statePath, options.iterationLimit, options.iterationsSet);
  if (isCircuitBroken(state)) {
    console.log(`Circuit breaker hit: max_iterations (${state.max_iterations}) already reached`);
    return null;
  }
  if (!existsSync(promptPath)) {
    throw new Error(`Prompt file not found: ${promptPath}`);
  }

  if (shouldPrintInitialSummary(options)) {
    printInitialSummary(provider, options, command, promptPath, logDir, state.max_iterations);
  }

  let stoppedByProviderMarker = false;
  let reachedCircuit = false;
  let terminalLoopPhase: 'completed' | 'stopped' | 'failed' | null = null;
  const agentIds = Array.from({ length: options.parallelAgents }, (_, index) => index + 1);
  const topLevelBeadId = options.beadMode === 'top-level' ? options.topLevelBeadId : undefined;
  const liveRenderer = createLiveRenderer(
    options,
    state.current_iteration + 1,
    state.max_iterations,
    agentIds,
  );
  for (; state.current_iteration < state.max_iterations; ) {
    if (shutdownProbe.isShuttingDown()) {
      break;
    }

    const basePrompt = readFileSync(promptPath, 'utf8');
    const prompt = buildTopLevelScopePrompt(basePrompt, topLevelBeadId);
    state.current_iteration += 1;
    writeIterationState(statePath, state);

    const iteration = state.current_iteration;
    liveRenderer?.setIteration(iteration);
    let results: RunResult[];
    let pickedByAgent = new Map<number, BeadIssue>();
    let iterationReviewOutcomes = new Map<number, SlotReviewOutcome>();
    const beadsSnapshot = await loadBeadsSnapshot(options.projectRoot, topLevelBeadId);
    if (
      shouldStopFromTopLevelExhaustion({
        beadMode: options.beadMode,
        topLevelBeadId,
        beadsSnapshot,
      })
    ) {
      if (liveRenderer?.isEnabled()) {
        liveRenderer.setLoopNotice(
          `top-level scope exhausted: ${topLevelBeadId ?? 'unavailable'}`,
          'success',
        );
      } else {
        const topLevelHint = topLevelBeadId ? ` for ${topLevelBeadId}` : '';
        console.log(`${badge('BEADS', 'success')} top-level scoped work exhausted${topLevelHint}`);
      }
      terminalLoopPhase = 'completed';
      break;
    }
    if (!liveRenderer?.isEnabled()) {
      printBeadsSnapshot(beadsSnapshot);
    }
    try {
      const iterationRun = await runIteration(
        iteration,
        state.max_iterations,
        options,
        provider,
        input.reviewerProvider,
        input.reviewerCommand,
        beadsSnapshot,
        prompt,
        promptPath,
        command,
        logDir,
        activeChildren,
        activeSpinnerStopRef,
        liveRenderer,
        input.reviewerPromptPath,
      );
      results = iterationRun.results;
      pickedByAgent = iterationRun.pickedByAgent;
      iterationReviewOutcomes = iterationRun.reviewOutcomes;
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
      reviewOutcomes: iterationReviewOutcomes,
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
        liveRenderer?.markIterationRetry(iteration);
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
        liveRenderer.setIterationOutcome(iteration, 'failed');
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

    const pickedCount = pickedByAgent.size;
    const shouldIgnoreStopMarker = shouldIgnoreStopMarkerForNoBeads({
      stopDetected,
      beadsSnapshot,
      pickedCount,
    });
    if (shouldIgnoreStopMarker) {
      liveRenderer?.setIterationOutcome(iteration, 'success');
      if (liveRenderer?.isEnabled()) {
        liveRenderer.setLoopNotice(
          'provider stop marker detected, but picked work suggests continuing',
          'muted',
        );
      } else {
        console.log(
          `${badge('DELAY', 'warn')} stop marker ignored because this iteration picked ${pickedCount} bead(s)`,
        );
      }
      continue;
    }

    if (stopDetected) {
      stoppedByProviderMarker = true;
      liveRenderer?.setIterationOutcome(iteration, 'success');
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
    liveRenderer?.setIterationOutcome(iteration, 'success');
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

  return liveRenderer;
}
