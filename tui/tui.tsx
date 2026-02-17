import { Box, render, Text } from 'ink';
import React, { useSyncExternalStore } from 'react';
import {
  type AgentReviewPhase,
  type IterationSummary,
  type LiveRunAgentSelector,
  type LiveRunHeaderState,
  type LiveRunState,
  LiveRunStateStore,
  type LoopPhase,
  type RunContext,
} from '../core/live-run-state';
import { badge } from '../core/terminal-ui';
import { formatShort } from '../core/text';
import type { BeadIssue, BeadsSnapshot, PreviewEntry, Tone, UsageSummary } from '../core/types';
import { buildPreviewRowKey } from './preview-row-key';

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

function renderHeader(state: LiveRunHeaderState): React.JSX.Element {
  const tone = state.tone;
  const body = ` ${state.spinner} iteration ${state.iteration}/${state.maxIterations} ${state.statusMessage} ${state.elapsedSeconds.toFixed(1)}s`;
  const barWidth = Math.max(16, Math.min(28, (process.stdout.columns ?? 120) - 68));
  const filled = Math.round(barWidth * state.ratio);
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
        <StatusText tone="neutral" text={` ${state.percent}%`} />
      </Text>
    </Box>
  );
}

function renderUsageSummaryLine(usage: UsageSummary): React.JSX.Element {
  return (
    <Text>
      {renderStatusBadge('TOKENS', 'muted')}{' '}
      <StatusText tone="neutral" text={`in ${usage.inputTokens.toLocaleString('en-US')}`} />
      {' | '}
      <StatusText
        tone="neutral"
        text={`cached ${usage.cachedInputTokens.toLocaleString('en-US')}`}
      />
      {' | '}
      <StatusText tone="neutral" text={`out ${usage.outputTokens.toLocaleString('en-US')}`} />
    </Text>
  );
}

function renderIterationSummary(state: LiveRunState): React.JSX.Element[] {
  const summary = state.lastIterationSummary;
  const rows: React.JSX.Element[] = [
    <Text key="summary-title">
      {renderStatusBadge('ITER SUM', 'info')}{' '}
      <StatusText tone="neutral" text="last iteration result" />
    </Text>,
  ];

  if (!summary) {
    rows.push(
      <Text key="summary-pending">
        <StatusText tone="muted" text="pending" />
      </Text>,
    );
    return rows;
  }

  if (summary.usage) {
    rows.push(
      <React.Fragment key="summary-tokens">{renderUsageSummaryLine(summary.usage)}</React.Fragment>,
    );
  } else {
    rows.push(
      <Text key="summary-no-usage">
        {renderStatusBadge('TOKENS', 'muted')} <StatusText tone="muted" text="no usage summary" />
      </Text>,
    );
  }

  if (summary.pickedBeadsByAgent.size === 0) {
    rows.push(
      <Text key="summary-no-pick">
        {renderStatusBadge('A', 'muted')} <StatusText tone="muted" text="no picked beads" />
      </Text>,
    );
  } else {
    for (const agentId of Array.from(summary.pickedBeadsByAgent.keys()).sort(
      (left, right) => left - right,
    )) {
      const picked = summary.pickedBeadsByAgent.get(agentId);
      if (!picked) {
        continue;
      }
      rows.push(
        <Text key={`summary-pick-${agentId}`}>
          {renderStatusBadge(`A${agentId}`, 'info')}{' '}
          <StatusText tone="neutral" text={`${picked.id}: ${picked.title}`} />
        </Text>,
      );
    }
  }

  if (summary.notice) {
    rows.push(
      <Text key="summary-notice">
        {renderStatusBadge('NOTE', summary.noticeTone)}{' '}
        <StatusText tone={summary.noticeTone} text={summary.notice} />
      </Text>,
    );
  }
  if (state.retrySeconds !== null) {
    rows.push(
      <Text key="summary-retry">
        {renderStatusBadge('RETRY', 'warn')}{' '}
        <StatusText tone="warn" text={`next retry in ${state.retrySeconds}s`} />
      </Text>,
    );
  }
  if (state.pauseMs !== null) {
    rows.push(
      <Text key="summary-pause">
        {renderStatusBadge('PAUSE', 'muted')}{' '}
        <StatusText tone="muted" text={`waiting ${state.pauseMs}ms`} />
      </Text>,
    );
  }
  return rows;
}

function renderRunContext(state: LiveRunState): React.JSX.Element[] {
  const context = state.runContext;
  if (!context) {
    return [
      <Text key="runctx-pending">
        {renderStatusBadge('RUNCTX', 'muted')} <StatusText tone="muted" text="no run context" />
      </Text>,
      <Text key="runctx-pending2">
        {renderStatusBadge('RUNCTX', 'muted')} <StatusText tone="muted" text="no log paths" />
      </Text>,
    ];
  }
  const startAt = new Date(context.startedAt).toLocaleTimeString();
  const rows: React.JSX.Element[] = [
    <Text key="runctx-main">
      {renderStatusBadge('RUNCTX', 'info')} {renderStatusBadge('START', 'muted')}{' '}
      <StatusText tone="neutral" text={`${startAt} |`} /> {renderStatusBadge('RUN', 'muted')}{' '}
      <StatusText tone="neutral" text={context.command} /> {renderStatusBadge('BATCH', 'muted')}{' '}
      <StatusText tone="neutral" text={context.batch} />
    </Text>,
  ];
  for (const [agentId, logPath] of [...context.agentLogPaths.entries()].sort(
    ([left], [right]) => left - right,
  )) {
    rows.push(
      <Text key={`runctx-log-${agentId}`}>
        {renderStatusBadge(`A${agentId}LOG`, 'muted')} <StatusText tone="muted" text={logPath} />
      </Text>,
    );
  }
  return rows;
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

function renderAgentCard(
  state: LiveRunState,
  selector: LiveRunAgentSelector,
  agentId: number,
): React.JSX.Element {
  const snapshot = state.agentState.get(agentId);
  const picked = selector.pickedBead;
  const columns = process.stdout.columns ?? 120;
  const lineMax = Math.max(28, columns - 52);
  const titleMax = Math.max(24, columns - 60);
  const tone: Tone = snapshot ? 'neutral' : 'muted';
  const ageSeconds = snapshot ? selector.ageSeconds : 0;
  const pickedTitle = picked ? `${picked.id} ${picked.title}` : 'no bead picked';
  const pickedTitleTone: Tone = picked ? 'success' : 'muted';

  const previewLines = snapshot
    ? (() => {
        return snapshot.lines.slice(-state.previewLines).map((entry) => ({
          label: entry.label.toUpperCase(),
          tone: entry.tone,
          text: formatShort(entry.text, lineMax),
        }));
      })()
    : [];

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
          {renderStatusBadge(selector.statusLabel, selector.statusTone)}{' '}
          <StatusText tone={selector.statusTone} dim text={` ${selector.statusText}`} />
        </Text>
      ) : (
        <Text>
          {renderStatusBadge(`A${agentId}`, 'muted')}{' '}
          <StatusText
            tone={pickedTitleTone}
            dim={!picked}
            text={` ${formatShort(pickedTitle, titleMax)}`}
          />{' '}
          {renderStatusBadge(selector.statusLabel, selector.statusTone)}{' '}
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
  const headerState = renderer.getHeaderState();
  return (
    <Box flexDirection="column">
      {renderHeader(headerState)}
      <Box marginTop={1} flexDirection="column">
        {renderIterationSummary(state).map((line) => line)}
      </Box>
      <Box marginTop={1} flexDirection="column">
        {renderRunContext(state).map((line) => line)}
      </Box>
      {renderBeads(state)}
      {state.agentIds.map((agentId) => (
        <React.Fragment key={agentId}>
          {renderAgentCard(state, renderer.getAgentSelector(agentId), agentId)}
        </React.Fragment>
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
  getHeaderState = (): LiveRunHeaderState => this.stateStore.getHeaderState();
  getAgentSelector = (agentId: number): LiveRunAgentSelector =>
    this.stateStore.getAgentSelector(agentId);

  isEnabled(): boolean {
    return this.enabled;
  }

  setIteration(iteration: number): void {
    this.stateStore.setIteration(iteration);
    this.state = this.stateStore.getSnapshot();
    this.emit();
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

  setAgentLogPath(agentId: number, path: string): void {
    this.stateStore.setAgentLogPath(agentId, path);
    this.state = this.stateStore.getSnapshot();
    this.emit();
  }

  setRunContext(context: RunContext): void {
    this.stateStore.setRunContext(context);
    this.state = this.stateStore.getSnapshot();
    this.emit();
  }

  setIterationSummary(summary: IterationSummary): void {
    this.stateStore.setIterationSummary(summary);
    this.state = this.stateStore.getSnapshot();
    this.emit();
  }

  setLoopNotice(message: string, tone: Tone): void {
    this.stateStore.setLoopNotice(message, tone);
    this.state = this.stateStore.getSnapshot();
    this.emit();
  }

  setPauseState(milliseconds: number | null): void {
    this.stateStore.setPauseState(milliseconds);
    this.state = this.stateStore.getSnapshot();
    this.emit();
  }

  setRetryState(seconds: number | null): void {
    this.stateStore.setRetryState(seconds);
    this.state = this.stateStore.getSnapshot();
    this.emit();
  }

  setLoopPhase(phase: LoopPhase): void {
    this.stateStore.setLoopPhase(phase);
    this.state = this.stateStore.getSnapshot();
    this.emit();
  }

  setAgentReviewPhase(agentId: number, phase: AgentReviewPhase): void {
    this.stateStore.setAgentReviewPhase(agentId, phase);
    this.state = this.stateStore.getSnapshot();
    this.emit();
  }

  clearAgentReviewPhase(agentId: number): void {
    this.stateStore.clearAgentReviewPhase(agentId);
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
    if (message) {
      console.log(`${badge('DONE', tone)} ${message}`);
    }
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
