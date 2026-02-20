export type ReasoningEffort = 'low' | 'medium' | 'high';

export type TaskMode = 'auto' | 'top-level';
export type BeadMode = TaskMode;

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
  reviewerCommand?: string;
  reasoningEffort: ReasoningEffort;
  yolo: boolean;
  logDir: string;
  showRaw: boolean;
  reviewEnabled: boolean;
  reviewMaxFixAttempts: number;
  theme?: string;
  taskMode?: TaskMode;
  topLevelTaskId?: string;
  beadMode?: BeadMode;
  topLevelBeadId?: string;
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

export type TaskIssue = {
  id: string;
  title: string;
  status: string;
  priority?: number;
  assignee?: string;
};
export type BeadIssue = TaskIssue;

export type TasksSnapshot = {
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
  remainingIssues: TaskIssue[];
  byId: Map<string, TaskIssue>;
  error?: string;
};
export type BeadsSnapshot = TasksSnapshot;
