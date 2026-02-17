import { formatShort } from './text';
import type { BeadIssue, BeadsSnapshot, PreviewEntry, Tone } from './types';

export const LIVE_SPINNER_FRAMES = ['-', '\\', '|', '/'] as const;

export type LivePreviewLine = {
  label: string;
  tone: Tone;
  text: string;
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
  beadsSnapshot: BeadsSnapshot | null;
  agentPickedBeads: Map<number, BeadIssue>;
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
  lastUpdatedAt: number;
  ageSeconds: number;
  totalEvents: number;
  phase: RenderPhase;
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
  return {
    startedAt: Date.now(),
    frameIndex: 0,
    running: true,
    statusMessage: 'starting',
    statusTone: 'info',
    iteration,
    maxIterations,
    previewLines: Math.max(1, previewLines),
    agentIds: [...agentIds].sort((left, right) => left - right),
    agentState: new Map<number, LiveAgentSnapshot>(),
    agentSpawnState: new Map<number, AgentSpawnState>(),
    beadsSnapshot: null,
    agentPickedBeads: new Map<number, BeadIssue>(),
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

    if (!snapshot) {
      if (spawn?.phase === 'launching') {
        return {
          pickedBead,
          statusLabel: 'SPAWN',
          statusTone: 'info',
          statusText: 'launch in progress',
          detailText: spawn.message,
          lastUpdatedAt: now,
          ageSeconds: 0,
          totalEvents: 0,
          phase: 'launching',
        };
      }
      if (spawn?.phase === 'queued') {
        return {
          pickedBead,
          statusLabel: 'QUEUED',
          statusTone: 'warn',
          statusText: 'awaiting launch',
          detailText: spawn.message,
          lastUpdatedAt: now,
          ageSeconds: 0,
          totalEvents: 0,
          phase: 'queued',
        };
      }
      return {
        pickedBead,
        statusLabel: 'WAIT',
        statusTone: 'muted',
        statusText: 'waiting for events',
        detailText: 'waiting for events',
        lastUpdatedAt: now,
        ageSeconds: 0,
        totalEvents: 0,
        phase: 'waiting',
      };
    }

    const ageSeconds = Math.max(0, Math.floor((now - snapshot.lastUpdatedAt) / 1000));
    return {
      pickedBead,
      statusLabel: 'EVENTS',
      statusTone: 'muted',
      statusText: `events ${snapshot.totalEvents}`,
      detailText: `updated ${ageSeconds}s ago`,
      lastUpdatedAt: snapshot.lastUpdatedAt,
      ageSeconds,
      totalEvents: snapshot.totalEvents,
      phase: 'waiting',
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
