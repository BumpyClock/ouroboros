import { homedir } from 'node:os';
import * as path from 'node:path';

const LOG_DIR_STEM = '.ouroborus';

export function resolveHomeDir(): string {
  if (process.platform === 'win32') {
    return process.env.HOME || homedir();
  }
  return homedir();
}

export function sanitizeProjectName(projectRoot: string): string {
  const base = path.basename(projectRoot);
  return base.replace(/[^a-zA-Z0-9._-]/g, '_') || 'project';
}

export function defaultLogDir(projectRoot: string): string {
  const projectName = sanitizeProjectName(projectRoot);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(resolveHomeDir(), LOG_DIR_STEM, 'logs', projectName, timestamp);
}

