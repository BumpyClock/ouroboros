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
