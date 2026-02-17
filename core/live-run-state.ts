import { formatShort } from './text';
import type { BeadIssue, BeadsSnapshot, PreviewEntry, Tone, UsageSummary } from './types';

export const LIVE_SPINNER_FRAMES = ['-', '\\', '|', '/'] as const;

export type LivePreviewLine = {
  label: string;
  tone: Tone;
  text: string;
};

export type LoopPhase =
  | 'starting'
  | 'streaming'
  | 'collecting'
  | 'reviewing'
  | 'fixing'
  | 'paused'
  | 'retry_wait'
  | 'completed'
  | 'failed'
  | 'stopped';

export type RunContext = {
  startedAt: number;
  command: string;
  batch: string;
  agentLogPaths: Map<number, string>;
};

export type IterationSummary = {
  usage: UsageSummary | null;
  pickedBeadsByAgent: Map<number, BeadIssue>;
  notice: string | null;
  noticeTone: Tone;
};

export type LiveAgentSnapshot = {
  totalEvents: number;
  lastUpdatedAt: number;
  lines: LivePreviewLine[];
};

export type AgentSpawnState = {
  phase: 'queued' | 'launching';
  message: string;
};

export type AgentReviewPhase = {
  phase: 'reviewing' | 'fixing';
  fixAttempt: number;
  beadId: string;
};

export type LiveRunAgentTab = 'dev' | 'review';

type IterationMarkerState = {
  retryCount: number;
  outcome: 'success' | 'failed' | null;
};

export type LiveRunState = {
  startedAt: number;
  frameIndex: number;
  running: boolean;
  statusMessage: string;
  statusTone: Tone;
  iteration: number;
  maxIterations: number;
  previewLines: number;
  agentIds: number[];
  agentState: Map<number, LiveAgentSnapshot>;
  agentSpawnState: Map<number, AgentSpawnState>;
  agentReviewPhase: Map<number, AgentReviewPhase>;
  agentActiveTab: Map<number, LiveRunAgentTab>;
  agentTabRestore: Map<number, LiveRunAgentTab>;
  iterationMarkers: Map<number, IterationMarkerState>;
  beadsSnapshot: BeadsSnapshot | null;
  agentPickedBeads: Map<number, BeadIssue>;
  runContext: RunContext | null;
  lastIterationSummary: IterationSummary | null;
  loopPhase: LoopPhase;
  loopNotice: string | null;
  loopNoticeTone: Tone;
  pauseMs: number | null;
  retrySeconds: number | null;
};

type Listener = () => void;
type RenderPhase = 'queued' | 'launching' | 'waiting';

export type LiveRunHeaderState = {
  running: boolean;
  elapsedSeconds: number;
  spinner: string;
  tone: Tone;
  statusMessage: string;
  iteration: number;
  maxIterations: number;
  ratio: number;
  percent: number;
};

export type LiveRunAgentSelector = {
  pickedBead: BeadIssue | null;
  statusLabel: string;
  statusTone: Tone;
  statusText: string;
  detailText: string;
  activeTab: LiveRunAgentTab;
  restoreTab: LiveRunAgentTab | null;
  lastUpdatedAt: number;
  ageSeconds: number;
  totalEvents: number;
  phase: RenderPhase;
  reviewPhase: AgentReviewPhase | null;
};

export type LiveRunIterationMarker = {
  iteration: number;
  isCurrent: boolean;
  retryCount: number;
  failed: boolean;
  succeeded: boolean;
};

export type LiveRunIterationTimeline = {
  currentIteration: number;
  maxIterations: number;
  totalRetries: number;
  totalFailed: number;
  markers: LiveRunIterationMarker[];
};

export function labelTone(label: string): Tone {
  const normalized = label.toLowerCase();
  if (normalized.includes('error')) return 'error';
  if (normalized.includes('tool') || normalized.includes('command')) return 'info';
  if (normalized.includes('reasoning')) return 'muted';
  if (normalized.includes('assistant')) return 'success';
  if (normalized.includes('warn')) return 'warn';
  return 'neutral';
}

function createInitialState(
  iteration: number,
  maxIterations: number,
  agentIds: number[],
  previewLines: number,
): LiveRunState {
  const nextAgentIds = [...agentIds].sort((left, right) => left - right);
  const activeTabs = new Map<number, LiveRunAgentTab>();
  for (const agentId of nextAgentIds) {
    activeTabs.set(agentId, 'dev');
  }
  const iterationMarkers = new Map<number, IterationMarkerState>();
  if (iteration > 0) {
    iterationMarkers.set(iteration, { retryCount: 0, outcome: null });
  }
  return {
    startedAt: Date.now(),
    frameIndex: 0,
    running: true,
    statusMessage: 'starting',
    statusTone: 'info',
    iteration,
    maxIterations,
    previewLines: Math.max(1, previewLines),
    agentIds: nextAgentIds,
    agentState: new Map<number, LiveAgentSnapshot>(),
    agentSpawnState: new Map<number, AgentSpawnState>(),
    agentReviewPhase: new Map<number, AgentReviewPhase>(),
    agentActiveTab: activeTabs,
    agentTabRestore: new Map<number, LiveRunAgentTab>(),
    iterationMarkers,
    beadsSnapshot: null,
    agentPickedBeads: new Map<number, BeadIssue>(),
    runContext: null,
    lastIterationSummary: null,
    loopPhase: 'starting',
    loopNotice: null,
    loopNoticeTone: 'muted',
    pauseMs: null,
    retrySeconds: null,
  };
}

export class LiveRunStateStore {
  private state: LiveRunState;
  private readonly listeners = new Set<Listener>();

  constructor(iteration: number, maxIterations: number, agentIds: number[], previewLines: number) {
    this.state = createInitialState(iteration, maxIterations, agentIds, previewLines);
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): LiveRunState => this.state;

  isRunning(): boolean {
    return this.state.running;
  }

  setIteration(iteration: number): void {
    const nextIteration = Math.max(0, iteration);
    const nextIterationMarkers = new Map(this.state.iterationMarkers);
    if (nextIteration > 0 && !nextIterationMarkers.has(nextIteration)) {
      nextIterationMarkers.set(nextIteration, { retryCount: 0, outcome: null });
    }
    this.state = {
      ...this.state,
      iteration: nextIteration,
      iterationMarkers: nextIterationMarkers,
    };
    this.emit();
  }

  setStatus(message: string, tone: Tone = 'info'): void {
    this.state = {
      ...this.state,
      statusMessage: message,
      statusTone: tone,
    };
    this.emit();
  }

  getHeaderState(now = Date.now()): LiveRunHeaderState {
    const safeTotal = Math.max(1, this.state.maxIterations);
    const ratio = Math.max(0, Math.min(1, this.state.iteration / safeTotal));
    return {
      running: this.state.running,
      elapsedSeconds: (now - this.state.startedAt) / 1000,
      spinner: this.state.running
        ? LIVE_SPINNER_FRAMES[this.state.frameIndex % LIVE_SPINNER_FRAMES.length]
        : '',
      tone: this.state.running ? 'info' : this.state.statusTone,
      statusMessage: this.state.statusMessage,
      iteration: this.state.iteration,
      maxIterations: this.state.maxIterations,
      ratio,
      percent: Math.round(ratio * 100),
    };
  }

  getAgentSelector(agentId: number, now = Date.now()): LiveRunAgentSelector {
    const snapshot = this.state.agentState.get(agentId);
    const pickedBead = this.state.agentPickedBeads.get(agentId) ?? null;
    const spawn = this.state.agentSpawnState.get(agentId);
    const review = this.state.agentReviewPhase.get(agentId) ?? null;
    const activeTab = this.state.agentActiveTab.get(agentId) ?? 'dev';
    const restoreTab = this.state.agentTabRestore.get(agentId) ?? null;

    if (!snapshot) {
      if (spawn?.phase === 'launching') {
        return {
          pickedBead,
          statusLabel: 'SPAWN',
          statusTone: 'info',
          statusText: 'launch in progress',
          detailText: spawn.message,
          activeTab,
          restoreTab,
          lastUpdatedAt: now,
          ageSeconds: 0,
          totalEvents: 0,
          phase: 'launching',
          reviewPhase: review,
        };
      }
      if (spawn?.phase === 'queued') {
        return {
          pickedBead,
          statusLabel: 'QUEUED',
          statusTone: 'warn',
          statusText: 'awaiting launch',
          detailText: spawn.message,
          activeTab,
          restoreTab,
          lastUpdatedAt: now,
          ageSeconds: 0,
          totalEvents: 0,
          phase: 'queued',
          reviewPhase: review,
        };
      }
      return {
        pickedBead,
        statusLabel: 'WAIT',
        statusTone: 'muted',
        statusText: 'waiting for events',
        detailText: 'waiting for events',
        activeTab,
        restoreTab,
        lastUpdatedAt: now,
        ageSeconds: 0,
        totalEvents: 0,
        phase: 'waiting',
        reviewPhase: review,
      };
    }

    const ageSeconds = Math.max(0, Math.floor((now - snapshot.lastUpdatedAt) / 1000));

    // Override status label/tone when in review/fix phase
    if (review) {
      const isFixing = review.phase === 'fixing';
      return {
        pickedBead,
        statusLabel: isFixing ? 'FIX' : 'REVIEW',
        statusTone: isFixing ? 'warn' : 'info',
        statusText: isFixing
          ? `fix attempt ${review.fixAttempt} for ${review.beadId}`
          : `reviewing ${review.beadId}`,
        detailText: `updated ${ageSeconds}s ago`,
        activeTab,
        restoreTab,
        lastUpdatedAt: snapshot.lastUpdatedAt,
        ageSeconds,
        totalEvents: snapshot.totalEvents,
        phase: 'waiting',
        reviewPhase: review,
      };
    }

    return {
      pickedBead,
      statusLabel: 'EVENTS',
      statusTone: 'muted',
      statusText: `events ${snapshot.totalEvents}`,
      detailText: `updated ${ageSeconds}s ago`,
      activeTab,
      restoreTab,
      lastUpdatedAt: snapshot.lastUpdatedAt,
      ageSeconds,
      totalEvents: snapshot.totalEvents,
      phase: 'waiting',
      reviewPhase: null,
    };
  }

  getIterationTimeline(): LiveRunIterationTimeline {
    const maxIterations = Math.max(1, this.state.maxIterations);
    const markers: LiveRunIterationMarker[] = [];
    let totalRetries = 0;
    let totalFailed = 0;
    for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
      const marker = this.state.iterationMarkers.get(iteration) ?? { retryCount: 0, outcome: null };
      totalRetries += marker.retryCount;
      if (marker.outcome === 'failed') {
        totalFailed += 1;
      }
      markers.push({
        iteration,
        isCurrent: iteration === this.state.iteration,
        retryCount: marker.retryCount,
        failed: marker.outcome === 'failed',
        succeeded: marker.outcome === 'success',
      });
    }

    return {
      currentIteration: this.state.iteration,
      maxIterations,
      totalRetries,
      totalFailed,
      markers,
    };
  }

  tickFrame(): void {
    if (!this.state.running) {
      return;
    }
    this.state = {
      ...this.state,
      frameIndex: this.state.frameIndex + 1,
    };
    this.emit();
  }

  update(agentId: number, entry: PreviewEntry): void {
    if (!this.state.running) {
      return;
    }

    const previous = this.state.agentState.get(agentId) ?? {
      totalEvents: 0,
      lastUpdatedAt: Date.now(),
      lines: [],
    };
    const nextLine: LivePreviewLine = {
      label: entry.label,
      tone: labelTone(entry.label),
      text: formatShort(entry.text, 220),
    };
    const last = previous.lines[previous.lines.length - 1];
    const nextLines =
      last && last.label === nextLine.label && last.text === nextLine.text
        ? previous.lines
        : [...previous.lines, nextLine].slice(-this.state.previewLines);

    const nextAgentState = new Map(this.state.agentState);
    nextAgentState.set(agentId, {
      totalEvents: previous.totalEvents + 1,
      lastUpdatedAt: Date.now(),
      lines: nextLines,
    });

    const nextSpawnState = new Map(this.state.agentSpawnState);
    nextSpawnState.delete(agentId);

    this.state = {
      ...this.state,
      agentState: nextAgentState,
      agentSpawnState: nextSpawnState,
      statusMessage: 'streaming events',
      statusTone: 'info',
    };
    this.emit();
  }

  setBeadsSnapshot(snapshot: BeadsSnapshot | null): void {
    this.state = {
      ...this.state,
      beadsSnapshot: snapshot,
    };
    this.emit();
  }

  setAgentPickedBead(agentId: number, issue: BeadIssue): void {
    const nextPicked = new Map(this.state.agentPickedBeads);
    nextPicked.set(agentId, issue);
    this.state = {
      ...this.state,
      agentPickedBeads: nextPicked,
    };
    this.emit();
  }

  setAgentLogPath(agentId: number, path: string): void {
    if (!this.state.runContext) {
      return;
    }
    const nextRunContext: RunContext = {
      ...this.state.runContext,
      agentLogPaths: new Map(this.state.runContext.agentLogPaths).set(agentId, path),
    };
    this.state = {
      ...this.state,
      runContext: nextRunContext,
    };
    this.emit();
  }

  setRunContext(context: RunContext): void {
    this.state = {
      ...this.state,
      runContext: {
        ...context,
        agentLogPaths: new Map(context.agentLogPaths),
      },
      loopPhase: 'starting',
    };
    this.emit();
  }

  setIterationSummary(summary: IterationSummary): void {
    this.state = {
      ...this.state,
      lastIterationSummary: {
        ...summary,
        pickedBeadsByAgent: new Map(summary.pickedBeadsByAgent),
      },
    };
    this.emit();
  }

  setLoopNotice(message: string, tone: Tone): void {
    this.state = {
      ...this.state,
      loopNotice: message,
      loopNoticeTone: tone,
    };
    this.emit();
  }

  clearLoopNotice(): void {
    this.state = {
      ...this.state,
      loopNotice: null,
      loopNoticeTone: 'muted',
    };
    this.emit();
  }

  setLoopPhase(phase: LoopPhase): void {
    this.state = {
      ...this.state,
      loopPhase: phase,
    };
    this.emit();
  }

  setPauseState(milliseconds: number | null): void {
    this.state = {
      ...this.state,
      pauseMs: milliseconds,
    };
    this.emit();
  }

  setRetryState(seconds: number | null): void {
    this.state = {
      ...this.state,
      retrySeconds: seconds,
    };
    this.emit();
  }

  setAgentActiveTab(agentId: number, tab: LiveRunAgentTab): void {
    const nextTabs = new Map(this.state.agentActiveTab);
    nextTabs.set(agentId, tab);
    this.state = { ...this.state, agentActiveTab: nextTabs };
    this.emit();
  }

  setAgentReviewPhase(agentId: number, phase: AgentReviewPhase): void {
    const hadReviewPhase = this.state.agentReviewPhase.has(agentId);
    const nextReview = new Map(this.state.agentReviewPhase);
    nextReview.set(agentId, phase);
    const nextTabs = new Map(this.state.agentActiveTab);
    const nextRestoreTabs = new Map(this.state.agentTabRestore);
    if (!hadReviewPhase) {
      nextRestoreTabs.set(agentId, nextTabs.get(agentId) ?? 'dev');
    }
    nextTabs.set(agentId, 'review');
    this.state = {
      ...this.state,
      agentReviewPhase: nextReview,
      agentActiveTab: nextTabs,
      agentTabRestore: nextRestoreTabs,
    };
    this.emit();
  }

  clearAgentReviewPhase(agentId: number): void {
    const nextReview = new Map(this.state.agentReviewPhase);
    nextReview.delete(agentId);
    const nextTabs = new Map(this.state.agentActiveTab);
    const nextRestoreTabs = new Map(this.state.agentTabRestore);
    nextTabs.set(agentId, nextRestoreTabs.get(agentId) ?? 'dev');
    nextRestoreTabs.delete(agentId);
    this.state = {
      ...this.state,
      agentReviewPhase: nextReview,
      agentActiveTab: nextTabs,
      agentTabRestore: nextRestoreTabs,
    };
    this.emit();
  }

  markIterationRetry(iteration: number): void {
    const nextIteration = Math.max(1, iteration);
    const nextMarkers = new Map(this.state.iterationMarkers);
    const marker = nextMarkers.get(nextIteration) ?? { retryCount: 0, outcome: null };
    nextMarkers.set(nextIteration, {
      retryCount: marker.retryCount + 1,
      outcome: marker.outcome,
    });
    this.state = { ...this.state, iterationMarkers: nextMarkers };
    this.emit();
  }

  setIterationOutcome(iteration: number, outcome: 'success' | 'failed'): void {
    const nextIteration = Math.max(1, iteration);
    const nextMarkers = new Map(this.state.iterationMarkers);
    const marker = nextMarkers.get(nextIteration) ?? { retryCount: 0, outcome: null };
    nextMarkers.set(nextIteration, {
      retryCount: marker.retryCount,
      outcome,
    });
    this.state = { ...this.state, iterationMarkers: nextMarkers };
    this.emit();
  }

  setAgentQueued(agentId: number, message: string): void {
    const nextSpawnState = new Map(this.state.agentSpawnState);
    nextSpawnState.set(agentId, { phase: 'queued', message });
    this.state = {
      ...this.state,
      agentSpawnState: nextSpawnState,
    };
    this.emit();
  }

  setAgentLaunching(agentId: number, message: string): void {
    const nextSpawnState = new Map(this.state.agentSpawnState);
    nextSpawnState.set(agentId, { phase: 'launching', message });
    this.state = {
      ...this.state,
      agentSpawnState: nextSpawnState,
    };
    this.emit();
  }

  stop(message: string, tone: Tone = 'success'): void {
    this.state = {
      ...this.state,
      running: false,
      statusMessage: message,
      statusTone: tone,
    };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
