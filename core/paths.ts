import { homedir } from 'node:os';
import * as path from 'node:path';

const LOG_DIR_STEM = '.ouroborus';

export function resolveHomeDir(): string {
  const explicitHome = process.env.HOME;
  if (explicitHome) {
    return explicitHome;
  }

  if (process.platform === 'win32') {
    const userProfileHome = process.env.USERPROFILE;
    if (userProfileHome) {
      return userProfileHome;
    }

    const homedrive = process.env.HOMEDRIVE;
    const homepath = process.env.HOMEPATH;
    if (homedrive && homepath) {
      return path.join(homedrive, homepath);
    }
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
