import type { AgentReviewPhase, LiveRunAgentTab, LiveRunState } from './live-run-state';
import {
  type IterationSummary,
  LIVE_SPINNER_FRAMES,
  type LiveRunAgentSelector,
  type LiveRunHeaderState,
  type LiveRunIterationTimeline,
  LiveRunStateStore,
  type LoopPhase,
  labelTone,
  type RunContext,
} from './live-run-state';
import { formatShort, wrapText } from './text';
import type { BeadIssue, BeadsSnapshot, PreviewEntry, Tone, UsageSummary } from './types';

const SPINNER_FRAMES = LIVE_SPINNER_FRAMES;

export { labelTone };

export const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
  white: '\x1b[97m',
};

function stylingEnabled(): boolean {
  return Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
}

export function colorize(text: string, ...codes: string[]): string {
  if (!stylingEnabled() || codes.length === 0) {
    return text;
  }
  return `${codes.join('')}${text}${ANSI.reset}`;
}

export function toneColor(tone: Tone): string {
  switch (tone) {
    case 'info':
      return ANSI.cyan;
    case 'success':
      return ANSI.green;
    case 'warn':
      return ANSI.yellow;
    case 'error':
      return ANSI.red;
    case 'muted':
      return ANSI.gray;
    default:
      return ANSI.white;
  }
}

export function badge(text: string, tone: Tone): string {
  return colorize(`[${text}]`, ANSI.bold, toneColor(tone));
}

export function terminalWidth(): number {
  const width = process.stdout.columns ?? 100;
  return Math.max(70, Math.min(width, 140));
}

function hr(char = '-'): string {
  return char.repeat(Math.min(terminalWidth(), 100));
}

export function printSection(title: string): void {
  console.log(colorize(hr('='), ANSI.gray));
  console.log(`${badge('LOOP', 'info')} ${colorize(title, ANSI.bold, ANSI.white)}`);
  console.log(colorize(hr('-'), ANSI.gray));
}

export function formatTokens(value: number): string {
  return Math.max(0, Math.round(value)).toLocaleString('en-US');
}

function buildIterationSummaryLines(
  state: LiveRunState,
  timeline: LiveRunIterationTimeline,
): string[] {
  const summary = state.lastIterationSummary;
  const lines: string[] = [];
  const compact = terminalWidth() < 120;
  const retryText = `${compact ? 'R' : 'Retry '}${timeline.totalRetries}`;
  const failedText = `${compact ? 'F' : 'Failed '}${timeline.totalFailed}`;
  lines.push(
    `${badge('ITER', 'info')} ${colorize(`${timeline.currentIteration}/${timeline.maxIterations}`, ANSI.bold)} ${badge(retryText, 'warn')} ${badge(failedText, 'error')}`,
  );
  if (!summary) {
    lines.push(`${badge('LAST', 'muted')} no result yet`);
    return lines;
  }
  const usage = summary.usage;
  if (usage) {
    lines.push(
      `${badge('TOKENS', 'muted')} in:${formatTokens(usage.inputTokens)} cache:${formatTokens(
        usage.cachedInputTokens,
      )} out:${formatTokens(usage.outputTokens)}`,
    );
  } else {
    lines.push(`${badge('TOKENS', 'muted')} no usage summary`);
  }

  if (summary.pickedBeadsByAgent.size > 0) {
    for (const agentId of Array.from(summary.pickedBeadsByAgent.keys()).sort(
      (left, right) => left - right,
    )) {
      const picked = summary.pickedBeadsByAgent.get(agentId);
      if (!picked) {
        continue;
      }
      lines.push(
        `${badge(`A${agentId}`, 'info')} ${formatShort(`${picked.id}: ${picked.title}`, Math.max(40, terminalWidth() - 20))}`,
      );
    }
  } else {
    lines.push(`${badge('A', 'muted')} no picked beads`);
  }

  if (summary.notice) {
    lines.push(`${badge('NOTE', summary.noticeTone)} ${summary.notice}`);
  }
  if (state.retrySeconds !== null) {
    lines.push(`${badge('RETRY', 'warn')} next retry in ${state.retrySeconds}s`);
  }
  if (state.pauseMs !== null) {
    lines.push(`${badge('PAUSE', 'muted')} waiting ${state.pauseMs}ms`);
  }
  return lines;
}

function buildRunContextLines(state: LiveRunState, commandWidth: number): string[] {
  const runContext = state.runContext;
  if (!runContext) {
    return [
      `${badge('RUNCTX', 'muted')} no run context`,
      `${badge('RUNCTX', 'muted')} no log paths`,
    ];
  }
  const startedAt = new Date(runContext.startedAt).toLocaleTimeString();
  const contextLine = [
    badge('RUNCTX', 'info'),
    `${badge('START', 'muted')} ${startedAt}`,
    badge('RUN', 'muted'),
    formatShort(runContext.command, Math.max(20, commandWidth)),
    '|',
    `${badge('BATCH', 'muted')} ${formatShort(runContext.batch, 80)}`,
  ].join(' ');

  const logLines = [...runContext.agentLogPaths.entries()]
    .sort(([left], [right]) => left - right)
    .map(
      ([agentId, logPath]) =>
        `${badge(`A${agentId}LOG`, 'muted')} ${formatShort(logPath, Math.max(36, commandWidth))}`,
    );
  if (logLines.length === 0) {
    logLines.push(`${badge('LOGS', 'muted')} unavailable`);
  }
  return [contextLine, ...logLines];
}

export function progressBar(current: number, total: number): string {
  const width = 22;
  const safeTotal = Math.max(total, 1);
  const ratio = Math.max(0, Math.min(1, current / safeTotal));
  const filled = Math.round(width * ratio);
  return `[${'#'.repeat(filled)}${'-'.repeat(width - filled)}] ${Math.round(ratio * 100)}%`;
}

export function createSpinner(label: string): { stop: (message: string, tone?: Tone) => void } {
  if (!process.stdout.isTTY) {
    console.log(`${badge('RUN', 'info')} ${label}`);
    return {
      stop: (message: string, tone = 'success') => {
        console.log(`${badge('DONE', tone)} ${message}`);
      },
    };
  }

  const start = Date.now();
  let frame = 0;
  const timer = setInterval(() => {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const cursor = SPINNER_FRAMES[frame % SPINNER_FRAMES.length];
    frame += 1;
    const line = `${cursor} ${label} ${elapsed}s`;
    process.stdout.write(`\r${colorize(line, ANSI.cyan)}`);
  }, 100);

  return {
    stop: (message: string, tone = 'success') => {
      clearInterval(timer);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      process.stdout.write('\r\x1b[2K');
      console.log(`${badge('DONE', tone)} ${message} ${colorize(`(${elapsed}s)`, ANSI.dim)}`);
    },
  };
}

export class LiveRunRenderer {
  private readonly enabled: boolean;
  private readonly agentIds: number[];
  private timer: NodeJS.Timeout | null = null;
  private renderedLineCount = 0;
  private readonly stateStore: LiveRunStateStore;

  constructor(iteration: number, maxIterations: number, agentIds: number[], previewLines: number) {
    this.enabled = Boolean(process.stdout.isTTY);
    this.agentIds = [...agentIds].sort((left, right) => left - right);
    this.stateStore = new LiveRunStateStore(iteration, maxIterations, this.agentIds, previewLines);
    if (!this.enabled) {
      return;
    }
    this.render();
    this.timer = setInterval(() => {
      this.stateStore.tickFrame();
      this.render();
    }, 100);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  isRunning(): boolean {
    return this.stateStore.isRunning();
  }

  setIteration(iteration: number): void {
    this.stateStore.setIteration(iteration);
    if (!this.enabled || !this.stateStore.isRunning()) {
      return;
    }
    this.render();
  }

  update(agentId: number, entry: PreviewEntry): void {
    if (!this.enabled || !this.stateStore.isRunning()) {
      return;
    }
    this.stateStore.update(agentId, entry);
    this.render();
  }

  setBeadsSnapshot(snapshot: BeadsSnapshot | null): void {
    this.stateStore.setBeadsSnapshot(snapshot);
    if (!this.enabled || !this.stateStore.isRunning()) {
      return;
    }
    this.render();
  }

  setAgentPickedBead(agentId: number, issue: BeadIssue): void {
    this.stateStore.setAgentPickedBead(agentId, issue);
    if (!this.enabled || !this.stateStore.isRunning()) {
      return;
    }
    this.render();
  }

  setAgentLogPath(agentId: number, path: string): void {
    this.stateStore.setAgentLogPath(agentId, path);
    if (!this.enabled || !this.stateStore.isRunning()) {
      return;
    }
    this.render();
  }

  setRunContext(context: RunContext): void {
    this.stateStore.setRunContext(context);
    if (!this.enabled || !this.stateStore.isRunning()) {
      return;
    }
    this.render();
  }

  setIterationSummary(summary: IterationSummary): void {
    this.stateStore.setIterationSummary(summary);
    if (!this.enabled || !this.stateStore.isRunning()) {
      return;
    }
    this.render();
  }

  setLoopNotice(message: string, tone: Tone): void {
    this.stateStore.setLoopNotice(message, tone);
    if (!this.enabled || !this.stateStore.isRunning()) {
      return;
    }
    this.render();
  }

  setPauseState(milliseconds: number | null): void {
    this.stateStore.setPauseState(milliseconds);
    if (!this.enabled || !this.stateStore.isRunning()) {
      return;
    }
    this.render();
  }

  setRetryState(seconds: number | null): void {
    this.stateStore.setRetryState(seconds);
    if (!this.enabled || !this.stateStore.isRunning()) {
      return;
    }
    this.render();
  }

  markIterationRetry(iteration: number): void {
    this.stateStore.markIterationRetry(iteration);
    if (!this.enabled || !this.stateStore.isRunning()) {
      return;
    }
    this.render();
  }

  setIterationOutcome(iteration: number, outcome: 'success' | 'failed'): void {
    this.stateStore.setIterationOutcome(iteration, outcome);
    if (!this.enabled || !this.stateStore.isRunning()) {
      return;
    }
    this.render();
  }

  setLoopPhase(phase: LoopPhase): void {
    this.stateStore.setLoopPhase(phase);
    if (!this.enabled || !this.stateStore.isRunning()) {
      return;
    }
    this.render();
  }

  setAgentQueued(agentId: number, message: string): void {
    this.stateStore.setAgentQueued(agentId, message);
    if (!this.enabled || !this.stateStore.isRunning()) {
      return;
    }
    this.render();
  }

  setAgentLaunching(agentId: number, message: string): void {
    this.stateStore.setAgentLaunching(agentId, message);
    if (!this.enabled || !this.stateStore.isRunning()) {
      return;
    }
    this.render();
  }

  setAgentActiveTab(agentId: number, tab: LiveRunAgentTab): void {
    this.stateStore.setAgentActiveTab(agentId, tab);
    if (!this.enabled || !this.stateStore.isRunning()) {
      return;
    }
    this.render();
  }

  setAgentReviewPhase(agentId: number, phase: AgentReviewPhase): void {
    this.stateStore.setAgentReviewPhase(agentId, phase);
    if (!this.enabled || !this.stateStore.isRunning()) {
      return;
    }
    this.render();
  }

  clearAgentReviewPhase(agentId: number): void {
    this.stateStore.clearAgentReviewPhase(agentId);
    if (!this.enabled || !this.stateStore.isRunning()) {
      return;
    }
    this.render();
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
    this.render();
  }

  private buildHeaderLine(): string {
    const state: LiveRunHeaderState = this.stateStore.getHeaderState();
    const elapsed = state.elapsedSeconds.toFixed(1);
    const frame = state.spinner;
    const tone = state.tone;
    const bodyColor = state.running ? ANSI.cyan : toneColor(tone);
    const parts = [
      frame,
      `iteration ${state.iteration}/${state.maxIterations}`,
      state.statusMessage,
      `${elapsed}s`,
    ]
      .filter(Boolean)
      .join(' ');
    return `${badge('LIVE', tone)} ${colorize(parts, bodyColor)}`;
  }

  private buildAgentLines(agentId: number, state: LiveRunState): string[] {
    const selector: LiveRunAgentSelector = this.stateStore.getAgentSelector(agentId);
    const snapshot = state.agentState.get(agentId);
    const width = terminalWidth();
    const cardWidth = Math.max(36, Math.min(width - 24, 110));
    const picked = selector.pickedBead;
    const titleColor = picked ? ANSI.green : ANSI.dim;
    const titleText = colorize(formatAgentTitle(picked, Math.max(16, cardWidth - 22)), titleColor);
    const reviewMode = selector.activeTab === 'review';
    const tabs = `${renderAgentTab('Dev', !reviewMode, ANSI.cyan)} ${renderAgentTab(
      'Review',
      reviewMode,
      ANSI.yellow,
    )}`;

    if (!snapshot) {
      const statusTone = selector.statusTone;
      const statusLabel = selector.statusLabel;
      const statusText = selector.statusText;
      return [
        colorize(buildAgentNotchLine(agentId, cardWidth), ANSI.gray),
        `${tabs} ${titleText} ${badge(statusLabel, statusTone)} ${colorize(statusText, ANSI.dim)}`,
      ];
    }

    const header = `${badge('STATE', 'info')} ${titleText} ${badge(
      selector.statusLabel,
      selector.statusTone,
    )} ${colorize(
      String(snapshot.totalEvents),
      ANSI.bold,
    )} ${colorize(selector.detailText, ANSI.dim)}`;
    const maxLength = Math.max(36, terminalWidth() - 30);
    const detailLines = snapshot.lines.map((line) => {
      const lineLabel = badge(line.label.toUpperCase(), line.tone);
      const text = colorize(formatShort(line.text, maxLength), toneColor(line.tone));
      return `  ${lineLabel} ${text}`;
    });
    return [
      colorize(buildAgentNotchLine(agentId, cardWidth), ANSI.gray),
      `${tabs} ${header}`,
      ...detailLines,
    ];
  }

  private buildBeadsLines(state: LiveRunState): string[] {
    if (!state.beadsSnapshot) {
      return [];
    }
    if (!state.beadsSnapshot.available) {
      const suffix = state.beadsSnapshot.error
        ? ` ${colorize(`(${formatShort(state.beadsSnapshot.error, 100)})`, ANSI.dim)}`
        : '';
      return [`${badge('BEADS', 'warn')} unavailable${suffix}`];
    }

    const summary = `${badge('BEADS', 'info')} remaining ${colorize(
      String(state.beadsSnapshot.remaining),
      ANSI.bold,
    )} | in_progress ${state.beadsSnapshot.inProgress} | open ${state.beadsSnapshot.open} | blocked ${
      state.beadsSnapshot.blocked
    } | closed ${state.beadsSnapshot.closed}`;
    const topRemaining = state.beadsSnapshot.remainingIssues.slice(0, 3).map((issue, index) => {
      const assignee = issue.assignee ? ` @${issue.assignee}` : '';
      return `  ${colorize(String(index + 1).padStart(2, ' '), ANSI.dim)} ${badge(
        'REM',
        'muted',
      )} ${colorize(`${issue.id} ${issue.title}${assignee}`, ANSI.white)}`;
    });
    return [summary, ...topRemaining];
  }

  private render(): void {
    if (!this.enabled) {
      return;
    }
    const state = this.stateStore.getSnapshot();
    const commandWidth = Math.max(36, terminalWidth() - 46);
    const lines = [
      this.buildHeaderLine(),
      ...buildIterationSummaryLines(state, this.stateStore.getIterationTimeline()),
      ...buildRunContextLines(state, commandWidth),
      ...this.buildBeadsLines(state),
      ...state.agentIds.flatMap((agentId) => this.buildAgentLines(agentId, state)),
      ...buildIterationStripText(this.stateStore.getIterationTimeline(), terminalWidth()),
    ];
    if (this.renderedLineCount > 0) {
      process.stdout.write(`\x1b[${this.renderedLineCount}A`);
    }
    for (const line of lines) {
      process.stdout.write(`\r\x1b[2K${line}\n`);
    }
    this.renderedLineCount = lines.length;
  }
}

function selectPreviewEntries(lines: PreviewEntry[], previewCount: number): PreviewEntry[] {
  if (lines.length <= previewCount) {
    return lines;
  }

  const picked = new Set<number>();
  const desiredOrder: PreviewEntry['kind'][] = ['assistant', 'tool', 'reasoning', 'error'];
  for (const kind of desiredOrder) {
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].kind === kind) {
        picked.add(i);
        break;
      }
    }
    if (picked.size >= previewCount) {
      break;
    }
  }

  for (let i = lines.length - 1; i >= 0 && picked.size < previewCount; i--) {
    picked.add(i);
  }

  return [...picked]
    .sort((a, b) => a - b)
    .map((index) => lines[index])
    .slice(-previewCount);
}

export function printPreview(
  lines: PreviewEntry[],
  previewCount: number,
  contextLabel?: string,
): void {
  const preview = selectPreviewEntries(lines, previewCount);
  if (preview.length === 0) {
    console.log(`${badge('PREVIEW', 'muted')} No message payloads found in this iteration.`);
    return;
  }
  const contextSuffix = contextLabel ? ` ${colorize(`(${contextLabel})`, ANSI.dim)}` : '';
  console.log(`${badge('PREVIEW', 'info')} Recent activity (${preview.length}):${contextSuffix}`);
  const width = Math.max(40, terminalWidth() - 10);
  for (let i = 0; i < preview.length; i++) {
    const entry = preview[i];
    const tone = labelTone(entry.label);
    const header = `${i + 1}. ${badge(entry.label.toUpperCase(), tone)}`;
    console.log(header);
    const wrapped = wrapText(entry.text, width);
    for (const line of wrapped) {
      console.log(`   ${colorize(line, toneColor(tone))}`);
    }
  }
}

export function printUsageSummary(usage: UsageSummary, contextLabel?: string): void {
  const contextSuffix = contextLabel ? ` ${colorize(`(${contextLabel})`, ANSI.dim)}` : '';
  console.log(
    `${badge('TOKENS', 'muted')} in ${formatTokens(usage.inputTokens)} | cached ${formatTokens(
      usage.cachedInputTokens,
    )} | out ${formatTokens(usage.outputTokens)}${contextSuffix}`,
  );
}

function buildAgentNotchLine(agentId: number, width: number): string {
  const innerWidth = Math.max(16, width - 2);
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

function formatIterationChip(
  marker: LiveRunIterationTimeline['markers'][number],
  compactLabels: boolean,
): string {
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
  if (markerBits.length === 0) {
    return compactLabels ? `[${base}]` : `${base}`;
  }
  return `[${base}-${markerBits.join('/')}]`;
}

function buildIterationStripText(timeline: LiveRunIterationTimeline, columns: number): string[] {
  if (timeline.maxIterations <= 0) {
    return [
      `${badge('ITER', 'muted')} ${badge('CURRENT', 'info')} ${String(
        timeline.currentIteration,
      )}/${timeline.maxIterations} ${badge('Retry', 'warn')}${timeline.totalRetries} ${badge(
        'Failed',
        'error',
      )}${timeline.totalFailed}`,
    ];
  }

  const markers = timeline.markers.filter((marker) => marker.iteration >= 1);
  const compactLabels = columns < 120;
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

  const chipText = visible.map((marker) => formatIterationChip(marker, compactLabels)).join(' ');
  const compactPrev = compactLabels ? `Prev:${prevCount}` : `Prev: ${prevCount}`;
  const retryLabel = compactLabels ? `R${timeline.totalRetries}` : `Retry ${timeline.totalRetries}`;
  const failedLabel = compactLabels ? `F${timeline.totalFailed}` : `Failed ${timeline.totalFailed}`;
  const base = `${compactPrev} | ${badge('CUR', 'info')} ${timeline.currentIteration}/${timeline.maxIterations} | ${retryLabel} | ${failedLabel}`;
  const chips = chipText ? ` | ${chipText}` : '';
  return [compactLabels ? `${base}${chips}` : `${base} | ${chipText}`];
}

function renderAgentTab(label: string, isActive: boolean, tone: string): string {
  const active = `[${label}]`;
  return isActive ? colorize(active, ANSI.bold, tone) : colorize(` ${label} `, ANSI.dim);
}
