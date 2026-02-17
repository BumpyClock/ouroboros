import type { LiveRunState } from './live-run-state';
import {
  type IterationSummary,
  LIVE_SPINNER_FRAMES,
  type LiveRunAgentSelector,
  type LiveRunHeaderState,
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

function buildIterationSummaryLines(state: LiveRunState): string[] {
  const summary = state.lastIterationSummary;
  const lines: string[] = [];
  lines.push(`${badge('ITER SUM', 'info')} last iteration result`);
  if (!summary) {
    lines.push(`${badge('TOKENS', 'muted')} pending`);
    return lines;
  }
  const usage = summary.usage;
  if (usage) {
    lines.push(
      `${badge('TOKENS', 'muted')} in ${formatTokens(usage.inputTokens)} | cached ${formatTokens(
        usage.cachedInputTokens,
      )} | out ${formatTokens(usage.outputTokens)}`,
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
    const prefix = badge(`A${agentId}`, 'muted');
    const picked = selector.pickedBead;
    const titleColor = picked ? ANSI.green : ANSI.dim;
    const title = picked ? `${picked.id} ${picked.title}` : 'no bead picked';
    const titleText = colorize(formatShort(title, Math.max(24, terminalWidth() - 54)), titleColor);

    if (!snapshot) {
      const statusTone = selector.statusTone;
      const statusLabel = selector.statusLabel;
      const statusText = selector.statusText;
      const detailText = selector.detailText;
      const emptyLines = Array.from({ length: state.previewLines }, (_, rowIndex) => {
        if (rowIndex === 0) {
          return `  ${badge('STATE', statusTone)} ${colorize(formatShort(detailText, Math.max(36, terminalWidth() - 40)), ANSI.dim)}`;
        }
        return `  ${badge('EMPTY', 'muted')} ${colorize('no event yet', ANSI.dim)}`;
      });
      return [
        `${prefix} ${titleText} ${badge(statusLabel, statusTone)} ${colorize(statusText, ANSI.dim)}`,
        ...emptyLines,
      ];
    }

    const header = `${prefix} ${titleText} ${badge(selector.statusLabel, selector.statusTone)} ${colorize(
      String(snapshot.totalEvents),
      ANSI.bold,
    )} ${colorize(selector.detailText, ANSI.dim)}`;
    const maxLength = Math.max(36, terminalWidth() - 30);
    const detailLines = snapshot.lines.map((line) => {
      const lineLabel = badge(line.label.toUpperCase(), line.tone);
      const text = colorize(formatShort(line.text, maxLength), toneColor(line.tone));
      return `  ${lineLabel} ${text}`;
    });
    while (detailLines.length < state.previewLines) {
      detailLines.unshift(`  ${badge('EMPTY', 'muted')} ${colorize('no event yet', ANSI.dim)}`);
    }
    return [header, ...detailLines];
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
      ...buildIterationSummaryLines(state),
      ...buildRunContextLines(state, commandWidth),
      ...this.buildBeadsLines(state),
      ...state.agentIds.flatMap((agentId) => this.buildAgentLines(agentId, state)),
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
