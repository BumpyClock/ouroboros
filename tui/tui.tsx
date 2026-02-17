import { Box, render, Text } from 'ink';
import React, { useSyncExternalStore } from 'react';
import { badge, labelTone } from '../core/terminal-ui';
import { formatShort } from '../core/text';
import type { BeadIssue, BeadsSnapshot, PreviewEntry, Tone } from '../core/types';
import { buildPreviewRowKey } from './preview-row-key';

const SPINNER_FRAMES = ['-', '\\', '|', '/'];

type LivePreviewLine = {
  label: string;
  tone: Tone;
  text: string;
};

type LiveAgentSnapshot = {
  totalEvents: number;
  lastUpdatedAt: number;
  lines: LivePreviewLine[];
};

type AgentSpawnPhase = 'queued' | 'launching';

type AgentSpawnState = {
  phase: AgentSpawnPhase;
  message: string;
};

type LiveViewState = {
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

function toneToColor(tone: Tone): 'white' | 'cyan' | 'green' | 'yellow' | 'red' | 'gray' {
  switch (tone) {
    case 'info':
      return 'cyan';
    case 'success':
      return 'green';
    case 'warn':
      return 'yellow';
    case 'error':
      return 'red';
    case 'muted':
      return 'gray';
    default:
      return 'white';
  }
}

function StatusText({
  tone,
  text,
  dim = false,
}: {
  tone: Tone;
  text: string;
  dim?: boolean;
}): React.JSX.Element {
  return (
    <Text color={toneToColor(tone)} dimColor={dim}>
      {text}
    </Text>
  );
}

function renderStatusBadge(label: string, tone: Tone): React.JSX.Element {
  return <StatusText tone={tone} text={`[${label}]`} />;
}

function renderHeader(state: LiveViewState): React.JSX.Element {
  const elapsedSeconds = ((Date.now() - state.startedAt) / 1000).toFixed(1);
  const spinner = state.running ? SPINNER_FRAMES[state.frameIndex % SPINNER_FRAMES.length] : ' ';
  const tone = state.running ? 'info' : state.statusTone;
  const body = ` ${spinner} iteration ${state.iteration}/${state.maxIterations} ${state.statusMessage} ${elapsedSeconds}s`;
  const safeTotal = Math.max(1, state.maxIterations);
  const ratio = Math.max(0, Math.min(1, state.iteration / safeTotal));
  const percent = Math.round(ratio * 100);
  const barWidth = Math.max(16, Math.min(28, (process.stdout.columns ?? 120) - 68));
  const filled = Math.round(barWidth * ratio);
  const empty = Math.max(0, barWidth - filled);
  return (
    <Box borderStyle="round" borderColor={toneToColor(tone)} paddingX={1} flexDirection="column">
      <Text>
        {renderStatusBadge('LIVE', tone)} <StatusText tone={tone} text={body} />
      </Text>
      <Text>
        {renderStatusBadge('ITERATION', 'info')}{' '}
        <StatusText tone="neutral" text={`${state.iteration}/${state.maxIterations} `} />
        <StatusText tone="info" text="[" />
        <StatusText tone="success" text={'#'.repeat(filled)} />
        <StatusText tone="muted" dim text={'-'.repeat(empty)} />
        <StatusText tone="info" text="]" />
        <StatusText tone="neutral" text={` ${percent}%`} />
      </Text>
    </Box>
  );
}

function renderBeads(state: LiveViewState): React.JSX.Element | null {
  const beads = state.beadsSnapshot;
  if (!beads) {
    return null;
  }

  if (!beads.available) {
    const suffix = beads.error ? ` (${formatShort(beads.error, 80)})` : '';
    return (
      <Box marginTop={1} borderStyle="round" borderColor="yellow" paddingX={1}>
        <Text>
          {renderStatusBadge('BEADS', 'warn')}{' '}
          <StatusText tone="warn" text={` unavailable${suffix}`} />
        </Text>
      </Box>
    );
  }

  return (
    <Box marginTop={1} borderStyle="round" borderColor="blue" paddingX={1} flexDirection="column">
      <Text>
        {renderStatusBadge('BEADS', 'info')}{' '}
        <StatusText
          tone="neutral"
          text={` remaining ${beads.remaining} | in_progress ${beads.inProgress} | open ${beads.open} | blocked ${beads.blocked} | closed ${beads.closed}`}
        />
      </Text>
      {beads.remainingIssues.slice(0, 3).map((issue, index) => {
        const assignee = issue.assignee ? ` @${issue.assignee}` : '';
        return (
          <Text key={issue.id}>
            <StatusText tone="muted" dim text={` ${String(index + 1).padStart(2, ' ')}.`} />{' '}
            {renderStatusBadge('REM', 'muted')}{' '}
            <StatusText tone="neutral" text={` ${issue.id} ${issue.title}${assignee}`} />
          </Text>
        );
      })}
    </Box>
  );
}

function renderAgentCard(state: LiveViewState, agentId: number): React.JSX.Element {
  const snapshot = state.agentState.get(agentId);
  const spawnState = state.agentSpawnState.get(agentId);
  const picked = state.agentPickedBeads.get(agentId);
  const columns = process.stdout.columns ?? 120;
  const lineMax = Math.max(28, columns - 52);
  const titleMax = Math.max(24, columns - 60);
  const tone: Tone = snapshot ? 'neutral' : 'muted';
  const ageSeconds = snapshot
    ? Math.max(0, Math.floor((Date.now() - snapshot.lastUpdatedAt) / 1000))
    : 0;
  const pickedTitle = picked ? `${picked.id} ${picked.title}` : 'no bead picked';
  const pickedTitleTone: Tone = picked ? 'success' : 'muted';

  const previewLines = snapshot
    ? (() => {
        const filledLines = snapshot.lines.slice(-state.previewLines).map((entry) => ({
          label: entry.label.toUpperCase(),
          tone: entry.tone,
          text: formatShort(entry.text, lineMax),
        }));
        const emptyCount = Math.max(0, state.previewLines - filledLines.length);
        return [
          ...Array.from({ length: emptyCount }, () => ({
            label: 'EMPTY',
            tone: 'muted' as Tone,
            text: 'no event yet',
          })),
          ...filledLines,
        ];
      })()
    : (() => {
        const statusLabel =
          spawnState?.phase === 'launching'
            ? 'SPAWN'
            : spawnState?.phase === 'queued'
              ? 'QUEUE'
              : 'EMPTY';
        const statusTone: Tone =
          spawnState?.phase === 'launching'
            ? 'info'
            : spawnState?.phase === 'queued'
              ? 'warn'
              : 'muted';
        const statusText = spawnState?.message ?? 'waiting to be launched';
        return [
          {
            label: statusLabel,
            tone: statusTone,
            text: formatShort(statusText, lineMax),
          },
          ...Array.from({ length: Math.max(0, state.previewLines - 1) }, () => ({
            label: 'EMPTY',
            tone: 'muted' as Tone,
            text: 'no event yet',
          })),
        ];
      })();

  return (
    <Box
      marginTop={1}
      borderStyle="round"
      borderColor={toneToColor(tone)}
      paddingX={1}
      flexDirection="column"
    >
      {!snapshot ? (
        <Text>
          {renderStatusBadge(`A${agentId}`, 'muted')}{' '}
          <StatusText
            tone={pickedTitleTone}
            dim={!picked}
            text={` ${formatShort(pickedTitle, titleMax)}`}
          />{' '}
          {renderStatusBadge(
            spawnState?.phase === 'launching'
              ? 'SPAWN'
              : spawnState?.phase === 'queued'
                ? 'QUEUED'
                : 'WAIT',
            spawnState?.phase === 'launching'
              ? 'info'
              : spawnState?.phase === 'queued'
                ? 'warn'
                : 'muted',
          )}{' '}
          <StatusText
            tone={
              spawnState?.phase === 'launching'
                ? 'info'
                : spawnState?.phase === 'queued'
                  ? 'warn'
                  : 'muted'
            }
            dim
            text={
              spawnState?.phase === 'launching'
                ? ' launch in progress'
                : spawnState?.phase === 'queued'
                  ? ' awaiting launch'
                  : ' waiting for events'
            }
          />
        </Text>
      ) : (
        <Text>
          {renderStatusBadge(`A${agentId}`, 'muted')}{' '}
          <StatusText
            tone={pickedTitleTone}
            dim={!picked}
            text={` ${formatShort(pickedTitle, titleMax)}`}
          />{' '}
          {renderStatusBadge('EVENTS', 'muted')}{' '}
          <StatusText tone="neutral" text={` ${snapshot.totalEvents}`} />{' '}
          <StatusText tone="muted" dim text={`updated ${ageSeconds}s ago`} />
        </Text>
      )}
      {previewLines.map((line, rowIndex) => (
        <Text key={buildPreviewRowKey(agentId, rowIndex)}>
          <StatusText tone="muted" dim text="  " /> {renderStatusBadge(line.label, line.tone)}{' '}
          <StatusText tone={line.tone} text={` ${line.text}`} />
        </Text>
      ))}
    </Box>
  );
}

function LiveView({ renderer }: { renderer: InkLiveRunRenderer }): React.JSX.Element {
  const state = useSyncExternalStore(
    renderer.subscribe,
    renderer.getSnapshot,
    renderer.getSnapshot,
  );
  return (
    <Box flexDirection="column">
      {renderHeader(state)}
      {renderBeads(state)}
      {state.agentIds.map((agentId) => (
        <React.Fragment key={agentId}>{renderAgentCard(state, agentId)}</React.Fragment>
      ))}
    </Box>
  );
}

export class InkLiveRunRenderer {
  private readonly enabled: boolean;
  private state: LiveViewState;
  private timer: NodeJS.Timeout | null = null;
  private app: ReturnType<typeof render> | null = null;
  private readonly listeners = new Set<Listener>();

  constructor(iteration: number, maxIterations: number, agentIds: number[], previewLines: number) {
    this.enabled = Boolean(process.stdout.isTTY);
    this.state = {
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

    if (!this.enabled) {
      return;
    }

    this.app = render(<LiveView renderer={this} />, { exitOnCtrlC: false });
    this.timer = setInterval(() => {
      if (!this.state.running) {
        return;
      }
      this.state = {
        ...this.state,
        frameIndex: this.state.frameIndex + 1,
      };
      this.emit();
    }, 120);
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): LiveViewState => this.state;

  isEnabled(): boolean {
    return this.enabled;
  }

  update(agentId: number, entry: PreviewEntry): void {
    if (!this.enabled || !this.state.running) {
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

  stop(message: string, tone: Tone = 'success'): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    if (!this.enabled) {
      console.log(`${badge('DONE', tone)} ${message}`);
      return;
    }

    this.state = {
      ...this.state,
      running: false,
      statusMessage: message,
      statusTone: tone,
    };
    this.emit();

    if (this.app) {
      this.app.unmount();
      this.app = null;
    }
    console.log(`${badge('DONE', tone)} ${message}`);
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
