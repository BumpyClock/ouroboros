import * as path from 'node:path';
import type { ProviderAdapter } from '../providers/types';
import type { CliOptions, RunDefinition } from './types';
import { buildRunFileBase } from './state';

export function resolveRunLogDirectory(cwd: string, logDir: string): string {
  return path.resolve(cwd, logDir);
}

export function buildRuns(
  iteration: number,
  parallelAgents: number,
  logDir: string,
  provider: ProviderAdapter,
  options: CliOptions,
  prompt: string,
): RunDefinition[] {
  return Array.from({ length: parallelAgents }, (_, index) => {
    const agentId = index + 1;
    const runBase = `${buildRunFileBase(iteration)}-agent-${String(agentId).padStart(2, '0')}`;
    const jsonlLogPath = path.join(logDir, `${runBase}.jsonl`);
    const lastMessagePath = path.join(logDir, `${runBase}.last-message.txt`);
    const args = provider.buildExecArgs(prompt, lastMessagePath, options);
    return { agentId, jsonlLogPath, lastMessagePath, args };
  });
}

export function summarizeArgsForLog(args: string[]): string {
  return args
    .map((arg) => {
      if (arg.length > 120) {
        return `<arg:${arg.length} chars>`;
      }
      return arg;
    })
    .join(' ');
}
