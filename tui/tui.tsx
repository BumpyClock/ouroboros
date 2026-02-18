import { Box, render, Text, useInput } from 'ink';
import React, { useState, useSyncExternalStore } from 'react';
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
import { badge, toneInkColor } from '../core/terminal-ui';
import { formatShort } from '../core/text';
import type { BeadIssue, BeadsSnapshot, PreviewEntry, Tone, UsageSummary } from '../core/types';
import { buildPreviewRowKey } from './preview-row-key';

type Toast = {
  id: number;
  message: string;
  tone: Tone;
  expiresAt: number;
};

type Listener = () => void;
export type TuiView =
  | 'tasks'
  | 'iterations'
  | 'iteration-detail'
  | 'reviewer'
  | 'parallel-overview'
  | 'parallel-detail'
  | 'merge-progress'
  | 'conflict-resolution';
type TuiPane = 'agents' | 'iterations';
const VIEW_SEQUENCE: TuiView[] = [
  'tasks',
  'iterations',
  'iteration-detail',
  'reviewer',
  'parallel-overview',
  'merge-progress',
];
const DEFAULT_HELP_TEXT = [
  '? / h: help',
  'Tab: next focus (tasks view)',
  '←/→: prev/next view',
  'j/k/↑/↓: move selection in focused pane',
  'Enter: open selected iteration detail',
  '[ ]: iteration cursor',
  'w: workers view, m: merge view',
  'a: open/accept conflict resolution',
  'r/s: retry/skip conflict action',
  'Esc: close detail/overlay view',
  '1/2/3/4: direct view selection',
  'd: dashboard overlay',
];
const TOAST_TTL_MS_BY_TONE: Record<Tone, number> = {
  info: 2200,
  success: 2400,
  warn: 3000,
  error: 3500,
  muted: 1800,
  neutral: 2200,
};
const TOAST_REPEAT_GUARD_MS = 1500;
const LIVE_RENDER_TICK_MS = 1000;

export type InkInputKey = {
  tab?: boolean;
  leftArrow?: boolean;
  rightArrow?: boolean;
  upArrow?: boolean;
  downArrow?: boolean;
  return?: boolean;
  escape?: boolean;
};

export type TuiInteractionState = {
  view: TuiView;
  focusedPane: TuiPane;
  selectedAgentIndex: number;
  selectedWorkerIndex: number;
  selectedIteration: number;
  selectedConflictIndex: number;
  conflictPanelVisible: boolean;
  helpVisible: boolean;
  dashboardVisible: boolean;
  agentCount: number;
  maxIterations: number;
};

function clampIndex(value: number, min: number, max: number): number {
  if (max <= min) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

export function buildInitialTuiInteractionState(
  agentCount: number,
  maxIterations: number,
): TuiInteractionState {
  const safeAgentCount = Math.max(0, agentCount);
  const safeMaxIterations = Math.max(1, maxIterations);
  return {
    view: 'tasks',
    focusedPane: safeAgentCount > 0 ? 'agents' : 'iterations',
    selectedAgentIndex: safeAgentCount > 0 ? 0 : -1,
    selectedWorkerIndex: safeAgentCount > 0 ? 0 : 0,
    selectedIteration: safeMaxIterations > 0 ? 1 : 1,
    selectedConflictIndex: 0,
    conflictPanelVisible: false,
    helpVisible: false,
    dashboardVisible: false,
    agentCount: safeAgentCount,
    maxIterations: safeMaxIterations,
  };
}

function resolveNextView(view: TuiView, reverse = false): TuiView {
  const idx = VIEW_SEQUENCE.indexOf(view);
  if (idx === -1) {
    return VIEW_SEQUENCE[0];
  }
  const next = reverse ? idx - 1 : idx + 1;
  return VIEW_SEQUENCE[(next + VIEW_SEQUENCE.length) % VIEW_SEQUENCE.length];
}

function withAgentDelta(state: TuiInteractionState, delta: number): TuiInteractionState {
  if (state.agentCount === 0) {
    return state;
  }
  const max = Math.max(0, state.agentCount - 1);
  const nextIndex = clampIndex(state.selectedAgentIndex + delta, 0, max);
  if (nextIndex === state.selectedAgentIndex) {
    return state;
  }
  return {
    ...state,
    selectedAgentIndex: nextIndex,
  };
}

function withWorkerDelta(state: TuiInteractionState, delta: number): TuiInteractionState {
  const max = Math.max(0, state.agentCount - 1);
  const nextIndex = clampIndex(state.selectedWorkerIndex + delta, 0, max);
  if (nextIndex === state.selectedWorkerIndex) {
    return state;
  }
  return {
    ...state,
    selectedWorkerIndex: nextIndex,
  };
}

function withIterationDelta(state: TuiInteractionState, delta: number): TuiInteractionState {
  const max = Math.max(1, state.maxIterations);
  const next = clampIndex(state.selectedIteration + delta, 1, max);
  if (next === state.selectedIteration) {
    return state;
  }
  return {
    ...state,
    selectedIteration: next,
  };
}

function withConflictDelta(state: TuiInteractionState, delta: number): TuiInteractionState {
  const max = Math.max(0, state.maxIterations - 1);
  const next = clampIndex(state.selectedConflictIndex + delta, 0, max);
  if (next === state.selectedConflictIndex) {
    return state;
  }
  return {
    ...state,
    selectedConflictIndex: next,
  };
}

function syncTuiInteractionState(
  state: TuiInteractionState,
  agentCount: number,
  maxIterations: number,
): TuiInteractionState {
  const safeAgentCount = Math.max(0, agentCount);
  const safeMaxIterations = Math.max(1, maxIterations);
  const selectedAgentIndex =
    safeAgentCount > 0 ? clampIndex(state.selectedAgentIndex, 0, safeAgentCount - 1) : -1;
  const selectedWorkerIndex = clampIndex(
    state.selectedWorkerIndex,
    0,
    Math.max(0, safeAgentCount - 1),
  );
  const selectedIteration = clampIndex(state.selectedIteration, 1, safeMaxIterations);
  const selectedConflictIndex = clampIndex(
    state.selectedConflictIndex,
    0,
    Math.max(0, safeMaxIterations - 1),
  );
  const focusedPane =
    safeAgentCount === 0 && state.focusedPane === 'agents' ? 'iterations' : state.focusedPane;
  if (
    state.agentCount === safeAgentCount &&
    state.maxIterations === safeMaxIterations &&
    state.selectedAgentIndex === selectedAgentIndex &&
    state.selectedWorkerIndex === selectedWorkerIndex &&
    state.selectedIteration === selectedIteration &&
    state.selectedConflictIndex === selectedConflictIndex &&
    state.focusedPane === focusedPane
  ) {
    return state;
  }
  return {
    ...state,
    focusedPane,
    selectedAgentIndex,
    selectedWorkerIndex,
    selectedIteration,
    selectedConflictIndex,
    agentCount: safeAgentCount,
    maxIterations: safeMaxIterations,
  };
}

export function transitionTuiInteractionState(
  state: TuiInteractionState,
  input: string,
  key: InkInputKey,
): TuiInteractionState {
  const normalized = input.toLowerCase();
  if (key.escape) {
    if (state.helpVisible || state.dashboardVisible) {
      return {
        ...state,
        helpVisible: false,
        dashboardVisible: false,
      };
    }
    if (state.view === 'conflict-resolution') {
      return {
        ...state,
        view: 'merge-progress',
        conflictPanelVisible: false,
      };
    }
    if (state.view === 'parallel-detail') {
      return {
        ...state,
        view: 'parallel-overview',
      };
    }
    if (state.view === 'parallel-overview' || state.view === 'merge-progress') {
      return {
        ...state,
        view: 'tasks',
      };
    }
    if (state.view === 'iteration-detail') {
      return {
        ...state,
        view: 'iterations',
      };
    }
  }

  if (normalized === 'w') {
    return {
      ...state,
      view: state.view === 'parallel-overview' ? 'tasks' : 'parallel-overview',
      conflictPanelVisible: false,
    };
  }

  if (normalized === 'm') {
    return {
      ...state,
      view: state.view === 'merge-progress' ? 'tasks' : 'merge-progress',
      conflictPanelVisible: false,
    };
  }

  if (state.view === 'merge-progress' && normalized === 'a') {
    return {
      ...state,
      view: 'conflict-resolution',
      conflictPanelVisible: true,
      selectedConflictIndex: 0,
    };
  }

  if (state.view === 'conflict-resolution' && normalized === 'a') {
    return withConflictDelta(state, 1);
  }

  if (state.view === 'conflict-resolution' && normalized === 'r') {
    return {
      ...state,
      view: 'merge-progress',
      conflictPanelVisible: false,
    };
  }

  if (state.view === 'conflict-resolution' && normalized === 's') {
    return {
      ...state,
      view: 'tasks',
      conflictPanelVisible: false,
    };
  }

  const iterationPaneActive =
    state.view === 'iterations' ||
    state.view === 'iteration-detail' ||
    state.focusedPane === 'iterations';
  const workerPaneActive = state.view === 'parallel-overview' || state.view === 'parallel-detail';
  const conflictPaneActive = state.view === 'conflict-resolution' || state.conflictPanelVisible;
  if (normalized === '?' || normalized === 'h') {
    return {
      ...state,
      helpVisible: !state.helpVisible,
    };
  }

  if (normalized === 'd') {
    return {
      ...state,
      dashboardVisible: !state.dashboardVisible,
    };
  }

  if (key.tab) {
    if (state.view === 'tasks') {
      return {
        ...state,
        focusedPane: state.focusedPane === 'agents' ? 'iterations' : 'agents',
      };
    }
    return {
      ...state,
      view: resolveNextView(state.view, false),
    };
  }

  if (key.leftArrow) {
    if (state.view === 'tasks' && state.focusedPane === 'iterations') {
      return {
        ...state,
        focusedPane: 'agents',
      };
    }
    return { ...state, view: resolveNextView(state.view, true) };
  }

  if (key.rightArrow) {
    if (state.view === 'tasks' && state.focusedPane === 'agents') {
      return {
        ...state,
        focusedPane: 'iterations',
      };
    }
    return { ...state, view: resolveNextView(state.view, false) };
  }

  if (normalized === '1' || normalized === '2' || normalized === '3' || normalized === '4') {
    const target = Number.parseInt(normalized, 10) - 1;
    const targetView = VIEW_SEQUENCE[target];
    return {
      ...state,
      view: targetView,
      focusedPane:
        targetView === 'iterations' || targetView === 'iteration-detail' ? 'iterations' : 'agents',
    };
  }

  if (key.upArrow || normalized === 'k') {
    if (conflictPaneActive) {
      return withConflictDelta(state, -1);
    }
    if (workerPaneActive) {
      return withWorkerDelta(state, -1);
    }
    if (iterationPaneActive) {
      return withIterationDelta(state, -1);
    }
    return withAgentDelta(state, -1);
  }

  if (key.downArrow || normalized === 'j') {
    if (conflictPaneActive) {
      return withConflictDelta(state, 1);
    }
    if (workerPaneActive) {
      return withWorkerDelta(state, 1);
    }
    if (iterationPaneActive) {
      return withIterationDelta(state, 1);
    }
    return withAgentDelta(state, 1);
  }

  if (iterationPaneActive && normalized === '[') {
    return withIterationDelta(state, -1);
  }

  if (iterationPaneActive && normalized === ']') {
    return withIterationDelta(state, 1);
  }

  if (key.return && iterationPaneActive && state.view !== 'iteration-detail') {
    return {
      ...state,
      view: 'iteration-detail',
      focusedPane: 'iterations',
    };
  }

  if (key.return && state.view === 'parallel-overview') {
    return {
      ...state,
      view: 'parallel-detail',
    };
  }

  return state;
}

function toneToColor(tone: Tone): string {
  return toneInkColor(tone);
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

function _renderHeader(state: LiveRunHeaderState): React.JSX.Element {
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

export type RunContextInfoLine = {
  key: string;
  label: string;
  value: string;
  tone: Tone;
};

export function buildRunContextInfoLines(context: RunContext): RunContextInfoLine[] {
  const lines: RunContextInfoLine[] = [];
  const pushLine = (key: string, label: string, value: string | null | undefined, tone: Tone) => {
    if (value === null || value === undefined || value === '') {
      return;
    }
    lines.push({ key, label, value, tone });
  };

  pushLine('loop', 'LOOP', context.loopLabel, 'info');
  pushLine('provider', 'PROVIDER', context.provider, 'neutral');
  pushLine('project', 'PROJECT', context.project, 'neutral');
  pushLine('project-key', 'PROJECT_KEY', context.projectKey, 'neutral');
  pushLine('command', 'COMMAND', context.commandPath ?? context.command, 'neutral');
  pushLine('prompt', 'PROMPT', context.promptPath, 'neutral');
  pushLine('logs', 'LOGS', context.logDir, 'neutral');
  pushLine(
    'limit',
    'LIMIT',
    typeof context.maxIterations === 'number' ? `max iterations: ${context.maxIterations}` : null,
    'neutral',
  );
  pushLine('model', 'MODEL', context.model, 'neutral');
  pushLine(
    'effort',
    'EFFORT',
    context.reasoningEffort ? `reasoning_effort=${context.reasoningEffort}` : null,
    'neutral',
  );
  pushLine(
    'parallel',
    'PARALLEL',
    typeof context.parallelAgents === 'number' ? String(context.parallelAgents) : null,
    typeof context.parallelAgents === 'number' && context.parallelAgents > 1 ? 'warn' : 'neutral',
  );
  pushLine('yolo', 'YOLO', context.yolo ? 'enabled' : 'disabled', context.yolo ? 'warn' : 'muted');
  return lines;
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
  const columns = process.stdout.columns ?? 120;
  const rowWidth = Math.max(24, columns - 42);
  const rows: React.JSX.Element[] = [
    <Text key="runctx-main">
      {renderStatusBadge('RUNCTX', 'info')} {renderStatusBadge('START', 'muted')}{' '}
      <StatusText tone="neutral" text={`${startAt} |`} /> {renderStatusBadge('RUN', 'muted')}{' '}
      <StatusText tone="neutral" text={formatShort(context.command, rowWidth)} />{' '}
      {renderStatusBadge('BATCH', 'muted')}{' '}
      <StatusText tone="neutral" text={formatShort(context.batch, rowWidth)} />
    </Text>,
  ];
  for (const line of buildRunContextInfoLines(context)) {
    rows.push(
      <Text key={`runctx-meta-${line.key}`}>
        {renderStatusBadge(line.label, 'muted')}{' '}
        <StatusText tone={line.tone} text={formatShort(line.value, rowWidth)} />
      </Text>,
    );
  }
  for (const [agentId, logPath] of [...context.agentLogPaths.entries()].sort(
    ([left], [right]) => left - right,
  )) {
    rows.push(
      <Text key={`runctx-log-${agentId}`}>
        {renderStatusBadge(`A${agentId}LOG`, 'muted')}{' '}
        <StatusText tone="muted" text={formatShort(logPath, rowWidth)} />
      </Text>,
    );
  }
  if (context.agentLogPaths.size === 0) {
    rows.push(
      <Text key="runctx-no-logs">
        {renderStatusBadge('LOGS', 'muted')} <StatusText tone="muted" text="unavailable" />
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
      <Box marginTop={1} borderStyle="round" borderColor={toneToColor('warn')} paddingX={1}>
        <Text>
          {renderStatusBadge('BEADS', 'warn')}{' '}
          <StatusText tone="warn" text={` unavailable${suffix}`} />
        </Text>
      </Box>
    );
  }

  return (
    <Box
      marginTop={1}
      borderStyle="round"
      borderColor={toneToColor('info')}
      paddingX={1}
      flexDirection="column"
    >
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

export function buildIterationStripParts(
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
      <Box marginTop={1} borderStyle="round" borderColor={toneToColor('warn')} paddingX={1}>
        <Text>{pieces.join(' | ')}</Text>
      </Box>
    );
  }

  return (
    <Box marginTop={1} borderStyle="round" borderColor={toneToColor('warn')} paddingX={1}>
      <Text>
        {prevCount > 0 ? <StatusText tone="muted" text={`Prev: ${prevCount} `} /> : null}
        {chipsText ? <StatusText tone="neutral" text={`${chipsText} `} /> : null}
        <StatusText tone="muted" text={` ${retryText}   ${failedText}`} />
      </Text>
    </Box>
  );
}

type IterationQueueMarker = {
  iteration: number;
  retryCount: number;
  failed: boolean;
};

function buildRetryFailureQueue(timeline: LiveRunIterationTimeline): IterationQueueMarker[] {
  return timeline.markers
    .filter((marker) => marker.failed || marker.retryCount > 0)
    .map((marker) => ({
      iteration: marker.iteration,
      retryCount: marker.retryCount,
      failed: marker.failed,
    }));
}

function renderIterationHistoryList(
  timeline: LiveRunIterationTimeline,
  selectedIteration: number,
  columns: number,
  focused: boolean,
): React.JSX.Element {
  const rows: React.JSX.Element[] = [];
  const safeSelectedIteration = Math.max(
    1,
    Math.min(selectedIteration, timeline.maxIterations || 1),
  );
  if (timeline.maxIterations <= 0) {
    rows.push(
      <Text key="iter-history-empty">
        <StatusText tone="muted" text="no iteration history yet" />
      </Text>,
    );
  } else {
    const target = safeSelectedIteration;
    const rowLimit = columns >= 110 ? 12 : columns >= 80 ? 8 : 4;
    const maxRows = Math.min(rowLimit, timeline.maxIterations);
    const half = Math.floor((maxRows - 1) / 2);
    const start = Math.max(
      1,
      Math.min(target - half, Math.max(1, timeline.maxIterations - maxRows + 1)),
    );
    const end = Math.min(timeline.maxIterations, start + maxRows - 1);
    for (let iteration = start; iteration <= end; iteration += 1) {
      const marker = timeline.markers[iteration - 1];
      if (!marker) {
        continue;
      }
      const isSelected = marker.iteration === target;
      const isCurrent = marker.isCurrent;
      const chip = isCurrent ? `${formatIterationChip(marker)} *` : formatIterationChip(marker);
      const tone: Tone = marker.failed ? 'error' : marker.succeeded ? 'success' : 'muted';
      const selectedPrefix = isSelected ? renderStatusBadge(focused ? '▶' : '·', 'info') : ' ';
      rows.push(
        <Text key={`iter-${marker.iteration}`}>
          {selectedPrefix}
          <StatusText tone={tone} text={` ${chip.padEnd(8, ' ')} `} />
          <StatusText
            tone={isCurrent ? 'info' : 'neutral'}
            text={isCurrent ? 'current' : 'history'}
          />
        </Text>,
      );
    }
  }

  const queue = buildRetryFailureQueue(timeline);
  const visibleQueueLimit = columns >= 110 ? 4 : columns >= 80 ? 3 : 2;
  const visibleQueue = queue.slice(Math.max(0, queue.length - visibleQueueLimit));
  rows.push(
    <Text key="iter-queue-title">
      {renderStatusBadge('QUEUE', 'warn')}{' '}
      <StatusText tone="muted" text={`retry/failure (${visibleQueue.length}/${queue.length})`} />
    </Text>,
  );
  if (visibleQueue.length === 0) {
    rows.push(
      <Text key="iter-queue-empty">
        <StatusText tone="muted" text="queue clear" />
      </Text>,
    );
  } else {
    for (const marker of visibleQueue) {
      const isSelected = marker.iteration === safeSelectedIteration;
      const markerLabel = marker.failed ? 'FAIL' : `R${marker.retryCount}`;
      const selectedPrefix = isSelected ? renderStatusBadge('▶', 'info') : ' ';
      const markerTone: Tone = marker.failed ? 'error' : 'warn';
      rows.push(
        <Text key={`iter-queue-${marker.iteration}`}>
          {selectedPrefix}{' '}
          <StatusText tone={markerTone} text={`I${String(marker.iteration).padStart(2, '0')}`} />{' '}
          <StatusText tone="muted" text={markerLabel} />
        </Text>,
      );
    }
  }

  const focusText = focused ? '[iter list focus]' : '[iter list]';
  return (
    <Box
      marginTop={1}
      borderStyle="round"
      borderColor={toneToColor('info')}
      paddingX={1}
      flexDirection="column"
    >
      <Text>
        {renderStatusBadge('HISTORY', 'info')}{' '}
        <StatusText
          tone="muted"
          text={`${timeline.currentIteration}/${timeline.maxIterations} ${focusText}`}
        />
      </Text>
      {rows}
    </Box>
  );
}

function renderToastNotifications(toasts: Toast[]): React.JSX.Element | null {
  if (toasts.length === 0) {
    return null;
  }
  const display = toasts.slice(-3);
  return (
    <Box
      marginTop={1}
      borderStyle="round"
      borderColor={toneToColor('warn')}
      paddingX={1}
      flexDirection="column"
    >
      {display.map((toast) => (
        <Text key={toast.id}>
          {renderStatusBadge('TOAST', toast.tone)}{' '}
          <StatusText tone={toast.tone} text={toast.message} />
        </Text>
      ))}
    </Box>
  );
}

function renderDashboard(
  state: LiveRunState,
  timeline: LiveRunIterationTimeline,
  _columns: number,
): React.JSX.Element {
  const queue = buildRetryFailureQueue(timeline);
  const queueLines = queue.slice(0, 3).map((entry) => (
    <Text key={`dashboard-queue-${entry.iteration}`}>
      <StatusText tone="muted" text={`${entry.iteration}:`} />{' '}
      <StatusText
        tone={entry.failed ? 'error' : 'warn'}
        text={entry.failed ? 'failed' : `R${entry.retryCount}`}
      />
    </Text>
  ));

  return (
    <Box
      marginTop={1}
      borderStyle="round"
      borderColor={toneToColor('info')}
      paddingX={1}
      flexDirection="column"
    >
      <Text>
        {renderStatusBadge('DASH', 'info')}{' '}
        <StatusText
          tone="neutral"
          text={`run dashboard ${state.iteration}/${state.maxIterations}`}
        />{' '}
        <StatusText
          tone={state.running ? 'success' : 'muted'}
          text={state.running ? 'running' : 'stopped'}
        />
      </Text>
      <Text>
        {renderStatusBadge('QUEUE', queue.length > 0 ? 'warn' : 'muted')}{' '}
        <StatusText tone="neutral" text={`retry/failure markers: ${queue.length}`} />
      </Text>
      {queueLines.length === 0 ? (
        <Text>
          <StatusText tone="muted" text="queue empty" />
        </Text>
      ) : (
        queueLines
      )}
      {renderRunContext(state).map((line) => line)}
    </Box>
  );
}

function renderViewHelp(helpVisible: boolean): React.JSX.Element | null {
  if (!helpVisible) {
    return null;
  }
  return (
    <Box
      marginTop={1}
      borderStyle="round"
      borderColor={toneToColor('info')}
      flexDirection="column"
      paddingX={1}
    >
      {DEFAULT_HELP_TEXT.map((line) => (
        <Text key={line}>
          <StatusText tone="muted" text={line} />
        </Text>
      ))}
    </Box>
  );
}

type PaneRow = {
  key: string;
  tone: Tone;
  text: string;
};

function selectWindowRows(rows: PaneRow[], selectedIndex: number, maxRows: number): PaneRow[] {
  if (rows.length <= maxRows) {
    return rows;
  }
  const safeSelected = clampIndex(selectedIndex, 0, rows.length - 1);
  const half = Math.floor(maxRows / 2);
  const start = Math.max(0, Math.min(safeSelected - half, rows.length - maxRows));
  return rows.slice(start, start + maxRows);
}

function leftPaneTitle(view: TuiView): string {
  if (view === 'parallel-overview' || view === 'parallel-detail') {
    return 'Workers';
  }
  if (view === 'iterations' || view === 'iteration-detail') {
    return 'Iterations';
  }
  if (view === 'merge-progress') {
    return 'Merge Queue';
  }
  if (view === 'conflict-resolution') {
    return 'Conflicts';
  }
  return 'Tasks';
}

function leftPaneSelectionIndex(uiState: TuiInteractionState): number {
  if (uiState.view === 'iterations' || uiState.view === 'iteration-detail') {
    return Math.max(0, uiState.selectedIteration - 1);
  }
  if (uiState.view === 'parallel-overview' || uiState.view === 'parallel-detail') {
    return Math.max(0, uiState.selectedWorkerIndex);
  }
  if (uiState.view === 'merge-progress' || uiState.view === 'conflict-resolution') {
    return Math.max(0, uiState.selectedConflictIndex);
  }
  return Math.max(0, uiState.selectedAgentIndex);
}

function buildLeftPaneRows(
  state: LiveRunState,
  renderer: InkLiveRunRenderer,
  uiState: TuiInteractionState,
  timeline: LiveRunIterationTimeline,
  maxWidth: number,
): PaneRow[] {
  if (uiState.view === 'iterations' || uiState.view === 'iteration-detail') {
    return timeline.markers.map((marker) => {
      const icon = marker.failed ? '⊘' : marker.succeeded ? '✓' : marker.isCurrent ? '▶' : '○';
      const tone: Tone = marker.failed
        ? 'error'
        : marker.succeeded
          ? 'success'
          : marker.isCurrent
            ? 'info'
            : 'muted';
      const label = marker.failed
        ? 'failed'
        : marker.succeeded
          ? 'done'
          : marker.isCurrent
            ? 'running'
            : 'pending';
      return {
        key: `iter-row-${marker.iteration}`,
        tone,
        text: formatShort(
          `${icon} Iteration ${String(marker.iteration).padStart(2, '0')}  ${label}`,
          maxWidth,
        ),
      };
    });
  }

  if (uiState.view === 'merge-progress' || uiState.view === 'conflict-resolution') {
    const rows = timeline.markers.filter(
      (marker) =>
        marker.failed || marker.retryCount > 0 || marker.iteration <= timeline.currentIteration,
    );
    if (rows.length === 0) {
      return [{ key: 'merge-empty', tone: 'muted', text: 'no merge activity yet' }];
    }
    return rows.map((marker) => {
      const label = marker.failed
        ? 'conflicted'
        : marker.retryCount > 0
          ? `retry ${marker.retryCount}`
          : 'queued';
      return {
        key: `merge-row-${marker.iteration}`,
        tone: marker.failed ? 'warn' : marker.retryCount > 0 ? 'info' : 'muted',
        text: formatShort(
          `${marker.failed ? '⚡' : marker.retryCount > 0 ? '⟳' : '⋯'} I${String(marker.iteration).padStart(2, '0')} ${label}`,
          maxWidth,
        ),
      };
    });
  }

  if (uiState.view === 'parallel-overview' || uiState.view === 'parallel-detail') {
    if (state.agentIds.length === 0) {
      return [{ key: 'worker-empty', tone: 'muted', text: 'no workers yet' }];
    }
    return state.agentIds.map((agentId, index) => {
      const selector = renderer.getAgentSelector(agentId);
      const label = selector.pickedBead
        ? `${selector.pickedBead.id} ${selector.pickedBead.title}`
        : 'no bead picked';
      return {
        key: `worker-${agentId}`,
        tone: selector.statusTone,
        text: formatShort(`W${index + 1} ${label}`, maxWidth),
      };
    });
  }

  if (state.agentIds.length === 0) {
    return [{ key: 'task-empty', tone: 'muted', text: 'no tasks yet' }];
  }
  return state.agentIds.map((agentId) => {
    const selector = renderer.getAgentSelector(agentId);
    const taskTitle =
      selector.pickedBead === null
        ? 'no bead picked'
        : `${selector.pickedBead.id} ${selector.pickedBead.title}`;
    return {
      key: `task-agent-${agentId}`,
      tone: selector.statusTone,
      text: formatShort(`${selector.statusLabel} ${taskTitle}`, maxWidth),
    };
  });
}

function renderStatusStrip(
  headerState: LiveRunHeaderState,
  state: LiveRunState,
  uiState: TuiInteractionState,
): React.JSX.Element {
  const readiness = state.running ? 'Ready' : headerState.statusMessage;
  return (
    <Box
      borderStyle="single"
      borderColor={toneToColor('info')}
      paddingX={1}
      flexDirection="row"
      justifyContent="space-between"
    >
      <Text>
        <StatusText tone={state.running ? 'info' : headerState.tone} text={`◉ ${readiness}`} />
      </Text>
      <Text>
        <StatusText tone="info" text="ouroboros/tui" />{' '}
        <StatusText
          tone="muted"
          text={`${uiState.view} · ${headerState.iteration}/${headerState.maxIterations} · ${headerState.elapsedSeconds.toFixed(0)}s`}
        />
      </Text>
    </Box>
  );
}

function renderFooterStrip(): React.JSX.Element {
  return (
    <Box borderStyle="single" borderColor={toneToColor('muted')} paddingX={1}>
      <Text>
        <StatusText
          tone="muted"
          text="q:Quit  w:Workers  m:Merge  a/r/s:Conflict  Enter:Detail  Esc:Back  Tab:Focus  ↑↓:Navigate  ?:Help"
        />
      </Text>
    </Box>
  );
}

function renderFullScreenBody(
  state: LiveRunState,
  renderer: InkLiveRunRenderer,
  uiState: TuiInteractionState,
  timeline: LiveRunIterationTimeline,
  toasts: Toast[],
  columns: number,
  rows: number,
): React.JSX.Element {
  const leftPaneWidth = Math.max(26, Math.min(44, Math.floor(columns * 0.26)));
  const rightPaneWidth = Math.max(40, columns - leftPaneWidth - 9);
  const paneRows = buildLeftPaneRows(
    state,
    renderer,
    uiState,
    timeline,
    Math.max(18, leftPaneWidth - 7),
  );
  const visibleRows = selectWindowRows(
    paneRows,
    leftPaneSelectionIndex(uiState),
    Math.max(6, rows - 11),
  );

  const selectedIndex = leftPaneSelectionIndex(uiState);
  const body: React.JSX.Element[] = [];
  if (uiState.view === 'tasks' || uiState.view === 'reviewer') {
    const selectedAgentId =
      state.agentIds.length === 0
        ? null
        : state.agentIds[clampIndex(uiState.selectedAgentIndex, 0, state.agentIds.length - 1)];
    const selector = selectedAgentId === null ? null : renderer.getAgentSelector(selectedAgentId);
    const snapshot =
      selectedAgentId === null ? null : (state.agentState.get(selectedAgentId) ?? null);
    const title =
      selector?.pickedBead === null || selector === null
        ? 'no bead selected'
        : `${selector.pickedBead.id} ${selector.pickedBead.title}`;
    body.push(
      <Text key="detail-title">
        <StatusText
          tone="success"
          text={`▸ ${formatShort(title, Math.max(20, rightPaneWidth - 6))}`}
        />
      </Text>,
    );
    body.push(
      <Text key="detail-id">
        <StatusText tone="muted" text={`ID: ${selector?.pickedBead?.id ?? 'n/a'}`} />
      </Text>,
    );
    body.push(
      <Box
        key="detail-meta"
        marginTop={1}
        borderStyle="single"
        borderColor={toneToColor('muted')}
        flexDirection="column"
        paddingX={1}
      >
        <Text>
          <StatusText tone="muted" text="Status: " />
          <StatusText
            tone={selector?.statusTone ?? 'muted'}
            text={selector?.statusLabel ?? 'WAIT'}
          />
        </Text>
        <Text>
          <StatusText tone="muted" text="Phase: " />
          <StatusText tone="neutral" text={state.loopPhase} />
        </Text>
        <Text>
          <StatusText tone="muted" text="Iteration: " />
          <StatusText tone="neutral" text={`${state.iteration}/${state.maxIterations}`} />
        </Text>
      </Box>,
    );
    body.push(
      <Box
        key="detail-description"
        marginTop={1}
        borderStyle="single"
        borderColor={toneToColor('muted')}
        flexDirection="column"
        paddingX={1}
      >
        <Text>
          <StatusText tone="info" text="Description" />
        </Text>
        <Text>
          <StatusText
            tone="muted"
            text={formatShort(
              state.loopNotice ?? 'No loop notice yet.',
              Math.max(24, rightPaneWidth - 8),
            )}
          />
        </Text>
      </Box>,
    );
    body.push(
      <Box
        key="detail-activity"
        marginTop={1}
        borderStyle="single"
        borderColor={toneToColor('muted')}
        flexDirection="column"
        paddingX={1}
      >
        <Text>
          <StatusText tone="info" text="Activity" />
        </Text>
        {snapshot?.lines.length ? (
          snapshot.lines.map((line, index) => (
            <Text key={buildPreviewRowKey(selectedAgentId ?? 0, index)}>
              <StatusText
                tone={line.tone}
                text={formatShort(
                  `${line.label.toUpperCase()}: ${line.text}`,
                  Math.max(24, rightPaneWidth - 8),
                )}
              />
            </Text>
          ))
        ) : (
          <Text>
            <StatusText tone="muted" text="No live events yet." />
          </Text>
        )}
      </Box>,
    );
  } else if (uiState.view === 'iterations') {
    body.push(
      renderIterationHistoryList(timeline, uiState.selectedIteration, rightPaneWidth, true),
    );
  } else if (uiState.view === 'iteration-detail') {
    body.push(
      renderIterationDetail(state, renderer, uiState, timeline, rightPaneWidth) ?? (
        <Text key="iter-detail-null" />
      ),
    );
  } else if (uiState.view === 'parallel-overview') {
    body.push(renderParallelOverview(state, renderer, uiState, timeline, rightPaneWidth));
  } else if (uiState.view === 'parallel-detail') {
    body.push(renderParallelDetail(state, renderer, uiState, rightPaneWidth));
  } else if (uiState.view === 'merge-progress') {
    body.push(renderMergeProgress(timeline, uiState));
  } else if (uiState.view === 'conflict-resolution') {
    body.push(renderConflictResolutionPanel(timeline, uiState));
  }

  if (uiState.helpVisible) {
    body.push(<React.Fragment key="help-fragment">{renderViewHelp(true)}</React.Fragment>);
  }
  if (uiState.dashboardVisible) {
    body.push(
      <React.Fragment key="dash-fragment">
        {renderDashboard(state, timeline, rightPaneWidth)}
      </React.Fragment>,
    );
  }
  const toastPanel = renderToastNotifications(toasts);
  if (toastPanel !== null) {
    body.push(<React.Fragment key="toast-fragment">{toastPanel}</React.Fragment>);
  }

  return (
    <Box flexGrow={1} flexDirection="row" marginTop={1}>
      <Box
        width={leftPaneWidth}
        borderStyle="single"
        borderColor={toneToColor('muted')}
        flexDirection="column"
        paddingX={1}
      >
        <Text>
          <StatusText tone="muted" text={leftPaneTitle(uiState.view)} />
        </Text>
        {visibleRows.map((row, index) => {
          const absoluteIndex = paneRows.indexOf(row);
          const selected = absoluteIndex === selectedIndex;
          return (
            <Text key={row.key}>
              <StatusText tone={selected ? 'info' : 'muted'} text={selected ? '▶ ' : '  '} />
              <StatusText tone={selected ? 'neutral' : row.tone} text={row.text} />
              {index === visibleRows.length - 1 && paneRows.length > visibleRows.length ? (
                <StatusText tone="muted" text=" …" />
              ) : null}
            </Text>
          );
        })}
      </Box>
      <Box
        marginLeft={1}
        flexGrow={1}
        borderStyle="single"
        borderColor={toneToColor('muted')}
        flexDirection="column"
        paddingX={1}
      >
        <Text>
          <StatusText tone="muted" text={`Details [${uiState.view}] [Trace: full]`} />
        </Text>
        {body}
      </Box>
    </Box>
  );
}

function renderIterationDetail(
  liveState: LiveRunState,
  renderer: InkLiveRunRenderer,
  state: TuiInteractionState,
  timeline: LiveRunIterationTimeline,
  columns: number,
): React.JSX.Element | null {
  const marker = timeline.markers[state.selectedIteration - 1];
  const iterationText = marker
    ? `iteration ${marker.iteration} ${marker.succeeded ? 'success' : marker.failed ? 'failed' : 'pending'}`
    : `iteration ${state.selectedIteration}`;
  const retryText = marker ? `retries ${marker.retryCount}` : 'retries 0';
  const statusLine = marker
    ? `${marker.isCurrent ? 'current' : 'history'} ${marker.succeeded ? 'success' : marker.failed ? 'failed' : 'pending'}`
    : 'pending';
  const selectedAgentId =
    liveState.agentIds.length === 0
      ? null
      : liveState.agentIds[clampIndex(state.selectedAgentIndex, 0, liveState.agentIds.length - 1)];
  const selectedAgentSelector =
    selectedAgentId === null ? null : renderer.getAgentSelector(selectedAgentId);
  const selectedAgentSnapshot =
    selectedAgentId === null ? null : (liveState.agentState.get(selectedAgentId) ?? null);
  const startTime = liveState.runContext
    ? new Date(liveState.runContext.startedAt).toLocaleTimeString()
    : 'n/a';
  const loopNotice = liveState.loopNotice ?? 'none';
  const timelineRows: React.JSX.Element[] = [
    <Text key="iter-event-start">
      <StatusText tone="info" text={`▶ ${startTime}`} />{' '}
      <StatusText tone="muted" text="iteration scope started" />
    </Text>,
    <Text key="iter-event-phase">
      <StatusText tone="neutral" text={`⚙ ${liveState.loopPhase}`} />{' '}
      <StatusText tone="muted" text="loop phase" />
    </Text>,
    <Text key="iter-event-notice">
      <StatusText tone={liveState.loopNoticeTone} text={`• ${loopNotice}`} />
    </Text>,
  ];
  if (marker?.failed) {
    timelineRows.push(
      <Text key="iter-event-failed">
        <StatusText tone="error" text="✗ iteration marked failed" />
      </Text>,
    );
  } else if (marker?.succeeded) {
    timelineRows.push(
      <Text key="iter-event-ok">
        <StatusText tone="success" text="✓ iteration marked success" />
      </Text>,
    );
  } else {
    timelineRows.push(
      <Text key="iter-event-pending">
        <StatusText tone="muted" text="○ iteration pending outcome" />
      </Text>,
    );
  }
  if (marker && marker.retryCount > 0) {
    timelineRows.push(
      <Text key="iter-event-retry">
        <StatusText tone="warn" text={`↻ retry count ${marker.retryCount}`} />
      </Text>,
    );
  }

  return (
    <Box
      marginTop={1}
      borderStyle="round"
      borderColor={toneToColor('warn')}
      flexDirection="column"
      paddingX={1}
    >
      <Text>
        {renderStatusBadge('ITER-DETAIL', 'info')}{' '}
        <StatusText tone="neutral" text={iterationText} />
      </Text>
      <Text>
        <StatusText tone="muted" text={`${statusLine} · ${retryText}`} />
      </Text>
      <Text>
        {renderStatusBadge('TASK', 'muted')}{' '}
        <StatusText
          tone="neutral"
          text={`iter ${state.selectedIteration}/${timeline.maxIterations}`}
        />
      </Text>
      <Box
        marginTop={1}
        borderStyle="round"
        borderColor={toneToColor('info')}
        flexDirection="column"
        paddingX={1}
      >
        <Text>
          {renderStatusBadge('TIMELINE', 'info')} <StatusText tone="muted" text="event stream" />
        </Text>
        {timelineRows}
      </Box>
      <Box
        marginTop={1}
        borderStyle="round"
        borderColor={toneToColor('muted')}
        flexDirection="column"
        paddingX={1}
      >
        <Text>
          {renderStatusBadge('AGENT', selectedAgentSelector?.statusTone ?? 'muted')}{' '}
          <StatusText
            tone="neutral"
            text={
              selectedAgentId === null
                ? 'no agent selected'
                : `A${selectedAgentId} ${selectedAgentSelector?.statusLabel ?? 'WAIT'}`
            }
          />
        </Text>
        {selectedAgentSelector?.pickedBead ? (
          <Text>
            <StatusText
              tone="success"
              text={`${selectedAgentSelector.pickedBead.id} · ${formatShort(selectedAgentSelector.pickedBead.title, Math.max(20, columns - 36))}`}
            />
          </Text>
        ) : (
          <Text>
            <StatusText tone="muted" text="no picked bead metadata" />
          </Text>
        )}
        {selectedAgentSnapshot?.lines.length ? (
          selectedAgentSnapshot.lines.map((line, index) => (
            <Text key={buildPreviewRowKey(selectedAgentId ?? 0, index)}>
              <StatusText
                tone={line.tone}
                text={`${line.label.toUpperCase()}: ${formatShort(line.text, Math.max(20, columns - 30))}`}
              />
            </Text>
          ))
        ) : (
          <Text>
            <StatusText tone="muted" text="no agent output lines for this slot yet" />
          </Text>
        )}
      </Box>
      {renderIterationStrip(timeline, columns)}
    </Box>
  );
}

function buildMergeQueueRows(timeline: LiveRunIterationTimeline): IterationQueueMarker[] {
  return timeline.markers
    .filter(
      (marker) =>
        marker.iteration <= timeline.currentIteration || marker.retryCount > 0 || marker.failed,
    )
    .map((marker) => ({
      iteration: marker.iteration,
      retryCount: marker.retryCount,
      failed: marker.failed,
    }));
}

function renderParallelOverview(
  state: LiveRunState,
  renderer: InkLiveRunRenderer,
  uiState: TuiInteractionState,
  timeline: LiveRunIterationTimeline,
  columns: number,
): React.JSX.Element {
  const selectedWorker = clampIndex(
    uiState.selectedWorkerIndex,
    0,
    Math.max(0, state.agentIds.length - 1),
  );
  const mergeQueueRows = buildMergeQueueRows(timeline);
  return (
    <Box key="parallel-overview" marginTop={1} flexDirection="column">
      <Text>
        {renderStatusBadge('WORKERS', 'info')}{' '}
        <StatusText tone="neutral" text={`(${state.agentIds.length}) group 1/1`} />
      </Text>
      {state.agentIds.length === 0 ? (
        <Text>
          <StatusText tone="muted" text="no workers yet" />
        </Text>
      ) : (
        state.agentIds.map((agentId, index) => {
          const selector = renderer.getAgentSelector(agentId);
          const selected = index === selectedWorker;
          const indicator =
            selector.statusLabel === 'WAIT' ||
            selector.statusLabel === 'QUEUED' ||
            selector.statusLabel === 'SPAWN'
              ? '○'
              : selector.statusLabel === 'FIX'
                ? '⚠'
                : '▶';
          const taskText = selector.pickedBead
            ? `${selector.pickedBead.id} · ${formatShort(selector.pickedBead.title, Math.max(16, columns - 40))}`
            : 'no bead picked';
          return (
            <Text key={`worker-${agentId}`}>
              <StatusText tone={selected ? 'info' : 'muted'} text={selected ? '▸' : ' '} />{' '}
              <StatusText tone={selector.statusTone} text={`${indicator} W${index + 1}`} />{' '}
              <StatusText tone="muted" text={`[${state.iteration}/${state.maxIterations}]`} />{' '}
              <StatusText tone="neutral" text={taskText} />
            </Text>
          );
        })
      )}
      <Box
        marginTop={1}
        borderStyle="round"
        borderColor={toneToColor('muted')}
        flexDirection="column"
        paddingX={1}
      >
        <Text>
          <StatusText tone="muted" text="─── Merge Queue ───" />
        </Text>
        {mergeQueueRows.length === 0 ? (
          <Text>
            <StatusText tone="muted" text="queue empty" />
          </Text>
        ) : (
          mergeQueueRows.slice(-6).map((row) => (
            <Text key={`merge-queue-${row.iteration}`}>
              <StatusText tone={row.failed ? 'warn' : 'muted'} text={row.failed ? '⚡' : '⋯'} />{' '}
              <StatusText
                tone="neutral"
                text={`I${String(row.iteration).padStart(2, '0')} → main`}
              />{' '}
              <StatusText
                tone={row.failed ? 'warn' : 'muted'}
                text={
                  row.failed
                    ? 'conflicted'
                    : row.retryCount > 0
                      ? `queued R${row.retryCount}`
                      : 'queued'
                }
              />
            </Text>
          ))
        )}
      </Box>
    </Box>
  );
}

function renderParallelDetail(
  state: LiveRunState,
  renderer: InkLiveRunRenderer,
  uiState: TuiInteractionState,
  columns: number,
): React.JSX.Element {
  if (state.agentIds.length === 0) {
    return (
      <Box key="parallel-detail-empty" marginTop={1}>
        <Text>
          <StatusText tone="muted" text="no worker selected" />
        </Text>
      </Box>
    );
  }
  const workerIndex = clampIndex(uiState.selectedWorkerIndex, 0, state.agentIds.length - 1);
  const workerAgentId = state.agentIds[workerIndex];
  const selector = renderer.getAgentSelector(workerAgentId);
  const snapshot = state.agentState.get(workerAgentId);
  const title = selector.pickedBead
    ? `${selector.pickedBead.id} · ${formatShort(selector.pickedBead.title, Math.max(20, columns - 24))}`
    : 'no bead picked';
  return (
    <Box key="parallel-detail" marginTop={1} flexDirection="column">
      <Text>
        {renderStatusBadge('WORKER', 'info')}{' '}
        <StatusText tone="neutral" text={`W${workerIndex + 1} A${workerAgentId}`} />{' '}
        <StatusText tone={selector.statusTone} text={selector.statusLabel} />
      </Text>
      <Text>
        <StatusText tone="muted" text={`task ${title}`} />
      </Text>
      <Text>
        <StatusText tone="muted" text={`iteration ${state.iteration}/${state.maxIterations}`} />
      </Text>
      <Box
        marginTop={1}
        borderStyle="round"
        borderColor={toneToColor('info')}
        flexDirection="column"
        paddingX={1}
      >
        <Text>
          <StatusText tone="info" text="worker output" />
        </Text>
        {snapshot?.lines.length ? (
          snapshot.lines.map((line, index) => (
            <Text key={buildPreviewRowKey(workerAgentId, index)}>
              <StatusText
                tone={line.tone}
                text={`${line.label.toUpperCase()}: ${formatShort(line.text, Math.max(20, columns - 30))}`}
              />
            </Text>
          ))
        ) : (
          <Text>
            <StatusText tone="muted" text="no output lines yet" />
          </Text>
        )}
      </Box>
    </Box>
  );
}

function renderMergeProgress(
  timeline: LiveRunIterationTimeline,
  _uiState: TuiInteractionState,
): React.JSX.Element {
  const mergeQueueRows = buildMergeQueueRows(timeline);
  const merged = timeline.markers.filter((marker) => marker.succeeded).length;
  return (
    <Box key="merge-progress" marginTop={1} flexDirection="column">
      <Text>
        {renderStatusBadge('MERGE', 'info')}{' '}
        <StatusText tone="neutral" text={`queue (${merged}/${timeline.maxIterations} merged)`} />
      </Text>
      <Text>
        <StatusText tone="muted" text="Backup: ouroboros/session-start/current" />
      </Text>
      <Box
        marginTop={1}
        borderStyle="round"
        borderColor={toneToColor('muted')}
        flexDirection="column"
        paddingX={1}
      >
        {mergeQueueRows.length === 0 ? (
          <Text>
            <StatusText tone="muted" text="no merge activity yet" />
          </Text>
        ) : (
          mergeQueueRows.map((row) => (
            <Text key={`merge-row-${row.iteration}`}>
              <StatusText
                tone={row.failed ? 'warn' : row.retryCount > 0 ? 'info' : 'success'}
                text={row.failed ? '⚡' : row.retryCount > 0 ? '⟳' : '✓'}
              />{' '}
              <StatusText
                tone="neutral"
                text={`task-${String(row.iteration).padStart(3, '0')} → main`}
              />{' '}
              <StatusText
                tone={row.failed ? 'warn' : row.retryCount > 0 ? 'info' : 'success'}
                text={
                  row.failed
                    ? 'conflicted'
                    : row.retryCount > 0
                      ? `merging R${row.retryCount}`
                      : 'merged'
                }
              />
            </Text>
          ))
        )}
      </Box>
      <Text>
        <StatusText tone="muted" text="Press a to open conflict panel when conflicts are present" />
      </Text>
    </Box>
  );
}

function renderConflictResolutionPanel(
  timeline: LiveRunIterationTimeline,
  uiState: TuiInteractionState,
): React.JSX.Element {
  const conflicts = timeline.markers.filter((marker) => marker.failed);
  const selected = clampIndex(uiState.selectedConflictIndex, 0, Math.max(0, conflicts.length - 1));
  return (
    <Box
      key="conflict-resolution"
      marginTop={1}
      borderStyle="round"
      borderColor={toneToColor('warn')}
      flexDirection="column"
      paddingX={1}
    >
      <Text>
        {renderStatusBadge('CONFLICT', 'warn')}{' '}
        <StatusText
          tone="neutral"
          text={`resolution ${conflicts.length ? `${selected + 1}/${conflicts.length}` : '0/0'}`}
        />
      </Text>
      {conflicts.length === 0 ? (
        <Text>
          <StatusText tone="muted" text="no conflicted merges detected" />
        </Text>
      ) : (
        conflicts.map((marker, index) => (
          <Text key={`conflict-row-${marker.iteration}`}>
            <StatusText
              tone={index === selected ? 'info' : 'muted'}
              text={index === selected ? '▸' : ' '}
            />{' '}
            <StatusText
              tone="warn"
              text={`⚡ iteration-${String(marker.iteration).padStart(2, '0')}.patch`}
            />{' '}
            <StatusText tone="muted" text="unresolved" />
          </Text>
        ))
      )}
      <Text>
        <StatusText tone="muted" text="a accept · r retry AI · s skip task · Esc close" />
      </Text>
    </Box>
  );
}

function renderCurrentAgentCard(
  state: LiveRunState,
  uiState: TuiInteractionState,
  selectorForAgentId: (agentId: number) => LiveRunAgentSelector,
  selected = false,
): React.JSX.Element | null {
  if (state.agentIds.length === 0) {
    return null;
  }
  const maxIndex = Math.max(0, state.agentIds.length - 1);
  const safeIndex = clampIndex(uiState.selectedAgentIndex, 0, maxIndex);
  const agentId = state.agentIds[safeIndex];
  return renderAgentCard(state, selectorForAgentId(agentId), agentId, selected);
}

function renderAgentListPanel(
  state: LiveRunState,
  renderer: InkLiveRunRenderer,
  uiState: TuiInteractionState,
  _columns: number,
): React.JSX.Element {
  const safeAgentCount = Math.max(0, state.agentIds.length);
  const safeIndex =
    safeAgentCount > 0 ? clampIndex(uiState.selectedAgentIndex, 0, safeAgentCount - 1) : -1;
  const isFocused = uiState.focusedPane === 'agents';
  return (
    <Box flexDirection="column" marginRight={1} flexGrow={1}>
      <Text>
        {renderStatusBadge('LIVE', isFocused ? 'info' : 'muted')}{' '}
        <StatusText tone="muted" text={isFocused ? '[agent focus]' : '[agents]'} />
      </Text>
      {safeAgentCount === 0 ? (
        <Text>
          <StatusText tone="muted" text="no agents yet" />
        </Text>
      ) : (
        state.agentIds.map((agentId, index) => {
          const selector = renderer.getAgentSelector(agentId);
          const isSelected = index === safeIndex;
          return (
            <React.Fragment key={`agent-${agentId}`}>
              {renderAgentCard(state, selector, agentId, isSelected)}
            </React.Fragment>
          );
        })
      )}
    </Box>
  );
}

function renderTaskSummaryPanel(state: LiveRunState, columns: number): React.JSX.Element {
  return (
    <Box marginTop={1} flexDirection="column" width={Math.min(columns - 2, 120)}>
      <Text>
        {renderStatusBadge('TASK', 'info')}{' '}
        <StatusText tone="neutral" text={`iteration ${state.iteration}/${state.maxIterations}`} />
      </Text>
      {renderIterationSummary(state).map((line) => line)}
      {renderRunContext(state).map((line) => line)}
      {renderBeads(state)}
    </Box>
  );
}

function _renderViewContent(
  state: LiveRunState,
  renderer: InkLiveRunRenderer,
  uiState: TuiInteractionState,
  timeline: LiveRunIterationTimeline,
  columns: number,
): React.JSX.Element[] {
  const view = uiState.view;
  if (view === 'iterations') {
    const focused = uiState.focusedPane === 'iterations';
    return [
      <Box key="iter-view" marginTop={1} flexDirection="column">
        <Text>
          {renderStatusBadge('ITER', focused ? 'info' : 'muted')}{' '}
          <StatusText tone="muted" text={focused ? '[iteration focus]' : '[iterations]'} />
        </Text>
        {renderIterationSummary(state).map((line) => line)}
        {renderIterationHistoryList(timeline, uiState.selectedIteration, columns, focused)}
      </Box>,
    ];
  }

  if (view === 'iteration-detail') {
    return [
      <Box key="iter-detail" marginTop={1} flexDirection="column">
        <Text>
          {renderStatusBadge('DETAIL', 'info')} selected iteration {uiState.selectedIteration}
        </Text>
        {renderIterationDetail(state, renderer, uiState, timeline, columns)}
      </Box>,
    ];
  }

  if (view === 'parallel-overview') {
    return [renderParallelOverview(state, renderer, uiState, timeline, columns)];
  }

  if (view === 'parallel-detail') {
    return [renderParallelDetail(state, renderer, uiState, columns)];
  }

  if (view === 'merge-progress') {
    return [renderMergeProgress(timeline, uiState)];
  }

  if (view === 'conflict-resolution') {
    return [renderConflictResolutionPanel(timeline, uiState)];
  }

  if (view === 'reviewer') {
    return [
      <Box key="reviewer-shell" marginTop={1} flexDirection="column">
        <Text>{renderStatusBadge('VIEW', 'warn')} reviewer panel</Text>
        <Box marginTop={1} flexDirection="column">
          {renderRunContext(state).map((line) => line)}
          {renderCurrentAgentCard(
            state,
            uiState,
            (agentId) => renderer.getAgentSelector(agentId),
            true,
          )}
        </Box>
      </Box>,
    ];
  }

  if (columns < 100) {
    return [
      <Box key="tasks-stack" marginTop={1} flexDirection="column">
        {renderTaskSummaryPanel(state, columns)}
        {renderAgentListPanel(state, renderer, uiState, columns)}
        {renderIterationHistoryList(
          timeline,
          uiState.selectedIteration,
          columns,
          uiState.focusedPane === 'iterations',
        )}
      </Box>,
    ];
  }

  return [
    <Box key="tasks-layout" marginTop={1} flexDirection="row" width={columns - 2} gap={1}>
      <Box width={Math.max(60, Math.floor(columns * 0.64))} flexDirection="column">
        {renderTaskSummaryPanel(state, columns)}
        {renderAgentListPanel(state, renderer, uiState, columns)}
      </Box>
      <Box flexDirection="column" flexGrow={1}>
        {renderIterationHistoryList(
          timeline,
          uiState.selectedIteration,
          columns,
          uiState.focusedPane === 'iterations',
        )}
      </Box>
    </Box>,
  ];
}

export function buildAgentNotchLine(agentId: number, cardWidth: number): string {
  const width = Math.max(20, cardWidth);
  const innerWidth = Math.max(12, width - 2);
  const label = formatShort(` Agent ${agentId} `, Math.max(6, innerWidth - 3));
  const header = `─${label}`;
  const fillWidth = Math.max(0, innerWidth - header.length);
  return `╭${header}${'─'.repeat(fillWidth)}╮`;
}

export function formatAgentTitle(picked: BeadIssue | null, maxLength: number): string {
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
  selected = false,
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
  const retryAttemptText = selector.reviewPhase
    ? `pass ${selector.reviewPhase.fixAttempt} (${selector.reviewPhase.phase})`
    : `pass ${state.iteration}/${state.maxIterations}`;
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
        borderColor={selected ? toneToColor('info') : toneToColor(tone)}
        paddingX={1}
        flexDirection="column"
        width={cardWidth}
      >
        <Box>
          {renderAgentTab('Dev', !selectedReview, toneToColor('info'), toneToColor('muted'))}
          <Text> </Text>
          {renderAgentTab('Review', selectedReview, toneToColor('warn'), toneToColor('muted'))}
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
            <StatusText
              tone="muted"
              text={` · iter ${state.iteration}/${state.maxIterations} · ${retryAttemptText}`}
            />
            <StatusText tone="muted" text={` · ${ageSeconds}s ago`} />
            {selected ? ` ${renderStatusBadge('>', 'info')}` : null}
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
            <StatusText tone="muted" text={` · iter ${state.iteration}/${state.maxIterations}`} />{' '}
            <StatusText tone="muted" text={` · ${retryAttemptText}`} />{' '}
            <StatusText tone="muted" dim text={` · ${ageSeconds}s ago`} />
            {selected ? ` ${renderStatusBadge('>', 'info')}` : null}
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
  const [, setViewTick] = useState(0);
  const uiState = renderer.getUiState();
  const toasts = renderer.getToasts();
  const columns = process.stdout.columns ?? 120;
  const rows = process.stdout.rows ?? 40;
  const viewportRows = Math.max(18, rows - 1);

  useInput((input, key) => {
    const isCtrlC = (key.ctrl && input.toLowerCase() === 'c') || input === '\u0003';
    const isQuitKey = input.toLowerCase() === 'q';
    if (isCtrlC || isQuitKey) {
      renderer.requestQuit();
      return;
    }
    const next = renderer.transition(input, key);
    if (next !== null) {
      setViewTick((value) => value + 1);
      return;
    }
  });
  return (
    <Box flexDirection="column" width={columns} height={viewportRows}>
      <Box
        borderStyle="round"
        borderColor={toneToColor('info')}
        flexDirection="column"
        width={columns}
        height={viewportRows}
        paddingX={1}
      >
        {renderStatusStrip(headerState, state, uiState)}
        {renderFullScreenBody(
          state,
          renderer,
          uiState,
          renderer.getIterationTimeline(),
          toasts,
          columns,
          viewportRows,
        )}
        {renderFooterStrip()}
      </Box>
    </Box>
  );
}

export class InkLiveRunRenderer {
  private readonly enabled: boolean;
  private state: LiveRunState;
  private readonly stateStore: LiveRunStateStore;
  private uiState: TuiInteractionState;
  private timer: NodeJS.Timeout | null = null;
  private app: ReturnType<typeof render> | null = null;
  private toasts: Toast[] = [];
  private toastCounter = 1;
  private quitRequested = false;
  private readonly toastMessageCooldown = new Map<string, number>();
  private readonly listeners = new Set<Listener>();

  constructor(iteration: number, maxIterations: number, agentIds: number[], previewLines: number) {
    this.enabled = Boolean(process.stdout.isTTY);
    this.stateStore = new LiveRunStateStore(iteration, maxIterations, agentIds, previewLines);
    this.state = this.stateStore.getSnapshot();
    this.uiState = syncTuiInteractionState(
      buildInitialTuiInteractionState(agentIds.length, maxIterations),
      this.state.agentIds.length,
      this.state.maxIterations,
    );

    if (!this.enabled) {
      return;
    }

    this.app = render(<LiveView renderer={this} />, { exitOnCtrlC: false });
    this.timer = setInterval(() => {
      const changed = this.pruneExpiredToasts();
      if (this.state.running) {
        this.stateStore.tickFrame();
        this.state = this.stateStore.getSnapshot();
        this.emit();
        return;
      }
      if (changed) {
        this.emit();
      }
    }, LIVE_RENDER_TICK_MS);
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
  getUiState = (): TuiInteractionState => {
    this.uiState = syncTuiInteractionState(
      this.uiState,
      this.state.agentIds.length,
      this.state.maxIterations,
    );
    return this.uiState;
  };
  getToasts = (): Toast[] => {
    this.pruneExpiredToasts();
    return [...this.toasts];
  };

  transition(input: string, key: InkInputKey): TuiInteractionState | null {
    const base = syncTuiInteractionState(
      this.uiState,
      this.state.agentIds.length,
      this.state.maxIterations,
    );
    const next = syncTuiInteractionState(
      transitionTuiInteractionState(base, input, key),
      this.state.agentIds.length,
      this.state.maxIterations,
    );
    if (next === this.uiState) {
      return null;
    }
    this.uiState = next;
    this.emit();
    return this.uiState;
  }

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
    this.maybePushToast(message, tone);
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

  private maybePushToast(message: string, tone: Tone): void {
    const normalizedMessage = message.trim();
    if (!normalizedMessage) {
      return;
    }
    if (normalizedMessage === 'pending status') {
      return;
    }
    const now = Date.now();
    const cooldownUntil = this.toastMessageCooldown.get(normalizedMessage) ?? 0;
    if (now < cooldownUntil) {
      return;
    }
    const ttl = TOAST_TTL_MS_BY_TONE[tone];
    this.toasts.push({
      id: this.toastCounter,
      message: normalizedMessage,
      tone,
      expiresAt: now + ttl,
    });
    this.toastCounter += 1;
    this.toastMessageCooldown.set(normalizedMessage, now + TOAST_REPEAT_GUARD_MS);
    if (this.toasts.length > 6) {
      this.toasts = this.toasts.slice(-6);
    }
  }

  private pruneExpiredToasts(): boolean {
    const now = Date.now();
    const nextLength = this.toasts.filter((entry) => entry.expiresAt > now).length;
    if (nextLength === this.toasts.length) {
      return false;
    }
    this.toasts = this.toasts.filter((entry) => entry.expiresAt > now);
    return true;
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

  requestQuit(): void {
    if (this.quitRequested) {
      return;
    }
    this.quitRequested = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.app) {
      this.app.unmount();
      this.app = null;
    }
    try {
      process.kill(process.pid, 'SIGINT');
    } catch {
      process.exit(130);
    }
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
