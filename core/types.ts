export type ReasoningEffort = 'low' | 'medium' | 'high';

export type CliOptions = {
  projectRoot: string;
  projectKey: string;
  provider: string;
  reviewerProvider: string;
  iterationLimit: number;
  iterationsSet: boolean;
  previewLines: number;
  parallelAgents: number;
  pauseMs: number;
  command: string;
  model: string;
  reviewerModel: string;
  reasoningEffort: ReasoningEffort;
  yolo: boolean;
  logDir: string;
  showRaw: boolean;
  reviewEnabled: boolean;
  reviewMaxFixAttempts: number;
  developerPromptPath?: string;
  reviewerPromptPath?: string;
  initPrompts?: boolean;
  forceInitPrompts?: boolean;
};

export type IterationState = {
  current_iteration: number;
  max_iterations: number;
};

export type StreamResult = {
  status: number | null;
  stdout: string;
  stderr: string;
};

export type PreviewEntry = {
  kind: 'assistant' | 'tool' | 'reasoning' | 'error' | 'message';
  label: string;
  text: string;
};

export type UsageSummary = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
};

export type Tone = 'neutral' | 'info' | 'success' | 'warn' | 'error' | 'muted';

export type RunDefinition = {
  agentId: number;
  jsonlLogPath: string;
  lastMessagePath: string;
  args: string[];
};

export type RunResult = {
  agentId: number;
  jsonlLogPath: string;
  lastMessagePath: string;
  result: StreamResult;
};

export type BeadIssue = {
  id: string;
  title: string;
  status: string;
  priority?: number;
  assignee?: string;
};

export type BeadsSnapshot = {
  available: boolean;
  source: string;
  projectRoot: string;
  total: number;
  remaining: number;
  open: number;
  inProgress: number;
  blocked: number;
  closed: number;
  deferred: number;
  remainingIssues: BeadIssue[];
  byId: Map<string, BeadIssue>;
  error?: string;
};
