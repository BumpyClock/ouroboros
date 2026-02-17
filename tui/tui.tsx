import { Box, render, Text } from 'ink';
import React, { useSyncExternalStore } from 'react';
import {
  type AgentReviewPhase,
  type IterationSummary,
  type LiveRunAgentSelector,
  type LiveRunAgentTab,
  type LiveRunHeaderState,
  type LiveRunIterationTimeline,
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

function formatIterationChip(marker: LiveRunIterationTimeline['markers'][number]): string {
  const base = marker.isCurrent
    ? `${String(marker.iteration).padStart(2, '0')}*`
    : String(marker.iteration).padStart(2, '0');
  const markerBits: string[] = [];
  if (marker.retryCount > 0) {
    markerBits.push(`R${marker.retryCount}`);
  }
  if (marker.failed) {
    markerBits.push('F');
  }
  return markerBits.length > 0 ? `[${base}-${markerBits.join('/')}]` : `[${base}]`;
}

function buildIterationStripParts(
  timeline: LiveRunIterationTimeline,
  columns: number,
): {
  chips: string[];
  prevCount: number;
  compactLabels: boolean;
  fallbackOnly: boolean;
  retryCount: number;
  failedCount: number;
} {
  if (timeline.maxIterations <= 0) {
    return {
      chips: [],
      prevCount: 0,
      compactLabels: true,
      fallbackOnly: true,
      retryCount: timeline.totalRetries,
      failedCount: timeline.totalFailed,
    };
  }

  const markers = timeline.markers.filter((marker) => marker.iteration >= 1);
  const current = Math.min(Math.max(1, timeline.currentIteration), timeline.maxIterations);
  const visible: typeof markers = [];
  let prevCount = 0;

  if (columns >= 120) {
    const radius = 3;
    const start = Math.max(1, current - radius);
    const end = Math.min(timeline.maxIterations, current + radius);
    for (let iteration = start; iteration <= end; iteration += 1) {
      const marker = markers[iteration - 1];
      if (marker) {
        visible.push(marker);
      }
    }
    prevCount = Math.max(0, start - 1);
  } else if (columns >= 100) {
    const radius = 2;
    const start = Math.max(1, current - radius);
    const end = Math.min(timeline.maxIterations, current + radius);
    for (let iteration = start; iteration <= end; iteration += 1) {
      const marker = markers[iteration - 1];
      if (marker) {
        visible.push(marker);
      }
    }
    prevCount = Math.max(0, start - 1);
  } else if (columns >= 80) {
    const visibleCount = Math.min(3, timeline.maxIterations - current + 1);
    const end = Math.min(timeline.maxIterations, current + visibleCount - 1);
    for (let iteration = current; iteration <= end; iteration += 1) {
      const marker = markers[iteration - 1];
      if (marker) {
        visible.push(marker);
      }
    }
    prevCount = Math.max(0, current - 1);
  } else {
    prevCount = Math.max(0, current - 1);
  }

  return {
    chips: visible.map((marker) => formatIterationChip(marker)),
    prevCount,
    compactLabels: columns < 120,
    fallbackOnly: columns < 80,
    retryCount: timeline.totalRetries,
    failedCount: timeline.totalFailed,
  };
}

function renderIterationStrip(
  timeline: LiveRunIterationTimeline,
  columns: number,
): React.JSX.Element {
  const { chips, prevCount, compactLabels, fallbackOnly, retryCount, failedCount } =
    buildIterationStripParts(timeline, columns);

  const prefix = compactLabels ? 'R' : 'Retry:';
  const failedLabelPrefix = compactLabels ? 'F' : 'Failed:';
  const retryText = `${prefix}${retryCount}`;
  const failedText = `${failedLabelPrefix}${failedCount}`;
  const chipsText = chips.join(' ');

  if (fallbackOnly) {
    const pieces = [
      `Iter ${timeline.currentIteration}/${timeline.maxIterations}`,
      `Prev:${prevCount}`,
      retryText,
      failedText,
    ];
    return (
      <Box marginTop={1} borderStyle="round" borderColor="yellow" paddingX={1}>
        <Text>{pieces.join(' | ')}</Text>
      </Box>
    );
  }

  return (
    <Box marginTop={1} borderStyle="round" borderColor="yellow" paddingX={1}>
      <Text>
        {prevCount > 0 ? <StatusText tone="muted" text={`Prev: ${prevCount} `} /> : null}
        {chipsText ? <StatusText tone="neutral" text={`${chipsText} `} /> : null}
        <StatusText tone="muted" text={` ${retryText}   ${failedText}`} />
      </Text>
    </Box>
  );
}

function buildAgentNotchLine(agentId: number, cardWidth: number): string {
  const width = Math.max(20, cardWidth);
  const innerWidth = Math.max(12, width - 2);
  const label = formatShort(` Agent ${agentId} `, Math.max(6, innerWidth - 3));
  const header = `─${label}`;
  const fillWidth = Math.max(0, innerWidth - header.length);
  return `╭${header}${'─'.repeat(fillWidth)}╮`;
}

function formatAgentTitle(picked: BeadIssue | null, maxLength: number): string {
  const fallback = 'no bead picked';
  if (maxLength <= 0) {
    return '';
  }
  if (!picked) {
    return formatShort(fallback, maxLength);
  }
  const fullTitle = `${picked.id} · ${picked.title}`;
  if (fullTitle.length <= maxLength) {
    return fullTitle;
  }
  const titleBudget = maxLength - picked.id.length - 3;
  if (titleBudget > 0) {
    return `${picked.id} · ${formatShort(picked.title, titleBudget)}`;
  }

  const canKeepSeparator = maxLength >= picked.id.length + 5;
  const idBudget = canKeepSeparator ? maxLength - 5 : Math.max(1, maxLength - 3);
  const visiblePrefix = Math.max(1, Math.min(picked.id.length, idBudget));
  const truncatedId = `${picked.id.slice(0, visiblePrefix)}...`;
  return canKeepSeparator ? `${truncatedId} · ` : truncatedId;
}

function renderAgentTab(
  label: string,
  isActive: boolean,
  activeTone: Tone,
  inactiveTone: Tone,
): React.JSX.Element {
  return isActive ? (
    <Text color={activeTone}>{`[${label}]`}</Text>
  ) : (
    <Text color={inactiveTone} dimColor>
      {` ${label} `}
    </Text>
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
  const cardWidth = Math.max(48, Math.min(columns - 30, 120));
  const lineMax = Math.max(24, cardWidth - 18);
  const statusText = snapshot
    ? `${snapshot.totalEvents} ${selector.detailText}`
    : selector.statusText;
  const statusTextLength = statusText.length;
  const statusPrefix = `[${selector.statusLabel}]`;
  const cardInnerWidth = Math.max(16, cardWidth - 2);
  const titleMax = Math.max(12, cardInnerWidth - statusPrefix.length - statusTextLength - 8);
  const tone: Tone = snapshot ? 'neutral' : 'muted';
  const ageSeconds = snapshot ? selector.ageSeconds : 0;
  const pickedTitle = formatAgentTitle(picked, titleMax);
  const pickedTitleTone: Tone = picked ? 'success' : 'muted';
  const selectedReview = selector.activeTab === 'review';

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
    <Box marginTop={1} flexDirection="column">
      <Text color={toneToColor('muted')}>{buildAgentNotchLine(agentId, cardWidth)}</Text>
      <Box
        borderStyle="round"
        borderColor={toneToColor(tone)}
        paddingX={1}
        flexDirection="column"
        width={cardWidth}
      >
        <Box>
          {renderAgentTab('Dev', !selectedReview, 'cyan', 'gray')}
          <Text> </Text>
          {renderAgentTab('Review', selectedReview, 'yellow', 'gray')}
        </Box>
        {!snapshot ? (
          <Text>
            <StatusText
              tone={pickedTitleTone}
              dim={!picked}
              text={formatShort(pickedTitle, titleMax)}
            />{' '}
            {renderStatusBadge(selector.statusLabel, selector.statusTone)}{' '}
            <StatusText tone={selector.statusTone} dim text={` ${selector.statusText}`} />
          </Text>
        ) : (
          <Text>
            <StatusText
              tone={pickedTitleTone}
              dim={!picked}
              text={formatShort(pickedTitle, titleMax)}
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
      {renderIterationStrip(renderer.getIterationTimeline(), process.stdout.columns ?? 120)}
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
  getIterationTimeline = (): LiveRunIterationTimeline => this.stateStore.getIterationTimeline();

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

  markIterationRetry(iteration: number): void {
    this.stateStore.markIterationRetry(iteration);
    this.state = this.stateStore.getSnapshot();
    this.emit();
  }

  setIterationOutcome(iteration: number, outcome: 'success' | 'failed'): void {
    this.stateStore.setIterationOutcome(iteration, outcome);
    this.state = this.stateStore.getSnapshot();
    this.emit();
  }

  setLoopPhase(phase: LoopPhase): void {
    this.stateStore.setLoopPhase(phase);
    this.state = this.stateStore.getSnapshot();
    this.emit();
  }

  setAgentActiveTab(agentId: number, tab: LiveRunAgentTab): void {
    this.stateStore.setAgentActiveTab(agentId, tab);
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
