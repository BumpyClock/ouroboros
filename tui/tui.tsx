import { Box, render, Text } from 'ink';
import React, { useSyncExternalStore } from 'react';
import { badge } from '../core/terminal-ui';
import { formatShort } from '../core/text';
import {
  LIVE_SPINNER_FRAMES,
  type LiveRunState,
  LiveRunStateStore,
  labelTone,
} from '../core/live-run-state';
import type { BeadIssue, BeadsSnapshot, PreviewEntry, Tone } from '../core/types';
import { buildPreviewRowKey } from './preview-row-key';

const SPINNER_FRAMES = LIVE_SPINNER_FRAMES;
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

function renderHeader(state: LiveRunState): React.JSX.Element {
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

function renderBeads(state: LiveRunState): React.JSX.Element | null {
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

function renderAgentCard(state: LiveRunState, agentId: number): React.JSX.Element {
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
  private state: LiveRunState;
  private readonly stateStore: LiveRunStateStore;
  private timer: NodeJS.Timeout | null = null;
  private app: ReturnType<typeof render> | null = null;
  private readonly listeners = new Set<Listener>();

  constructor(iteration: number, maxIterations: number, agentIds: number[], previewLines: number) {
    this.enabled = Boolean(process.stdout.isTTY);
    this.stateStore = new LiveRunStateStore(iteration, maxIterations, agentIds, previewLines);
    this.state = this.stateStore.getSnapshot();

    if (!this.enabled) {
      return;
    }

    this.app = render(<LiveView renderer={this} />, { exitOnCtrlC: false });
    this.timer = setInterval(() => {
      if (!this.state.running) {
        return;
      }
      this.stateStore.tickFrame();
      this.state = this.stateStore.getSnapshot();
      this.emit();
    }, 120);
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): LiveRunState => this.state;

  isEnabled(): boolean {
    return this.enabled;
  }

  update(agentId: number, entry: PreviewEntry): void {
    if (!this.enabled || !this.state.running) {
      return;
    }
    this.stateStore.update(agentId, entry);
    this.state = this.stateStore.getSnapshot();
    this.emit();
  }

  setAgentQueued(agentId: number, message: string): void {
    this.stateStore.setAgentQueued(agentId, message);
    this.state = this.stateStore.getSnapshot();
    this.emit();
  }

  setAgentLaunching(agentId: number, message: string): void {
    this.stateStore.setAgentLaunching(agentId, message);
    this.state = this.stateStore.getSnapshot();
    this.emit();
  }

  setBeadsSnapshot(snapshot: BeadsSnapshot | null): void {
    this.stateStore.setBeadsSnapshot(snapshot);
    this.state = this.stateStore.getSnapshot();
    this.emit();
  }

  setAgentPickedBead(agentId: number, issue: BeadIssue): void {
    this.stateStore.setAgentPickedBead(agentId, issue);
    this.state = this.stateStore.getSnapshot();
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

    this.stateStore.stop(message, tone);
    this.state = this.stateStore.getSnapshot();
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
