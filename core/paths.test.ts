import { describe, expect, it } from 'bun:test';
import * as path from 'node:path';
import { homedir } from 'node:os';
import { defaultLogDir, resolveHomeDir } from './paths';

function restoreEnv(keys: string[], previousValues: Record<string, string | undefined>): void {
  for (const key of keys) {
    const value = previousValues[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe('resolveHomeDir', () => {
  it('uses HOME when present', () => {
    const previousValues = {
      HOME: process.env.HOME,
      USERPROFILE: process.env.USERPROFILE,
      HOMEDRIVE: process.env.HOMEDRIVE,
      HOMEPATH: process.env.HOMEPATH,
    };
    process.env.HOME = '/home/custom';
    process.env.USERPROFILE = '/windows/profile';
    process.env.HOMEDRIVE = 'C:';
    process.env.HOMEPATH = '\\Users\\DriveProfile';

    try {
      expect(resolveHomeDir()).toBe('/home/custom');
    } finally {
      restoreEnv(['HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH'], previousValues);
    }
  });

  if (process.platform === 'win32') {
    it('falls back to USERPROFILE when HOME is unavailable on Windows', () => {
      const previousValues = {
        HOME: process.env.HOME,
        USERPROFILE: process.env.USERPROFILE,
        HOMEDRIVE: process.env.HOMEDRIVE,
        HOMEPATH: process.env.HOMEPATH,
      };
      delete process.env.HOME;
      process.env.USERPROFILE = 'C:\\Users\\Profile';

      try {
        expect(resolveHomeDir()).toBe('C:\\Users\\Profile');
      } finally {
        restoreEnv(['HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH'], previousValues);
      }
    });

    it('falls back to HOMEDRIVE/HOMEPATH when HOME and USERPROFILE are unavailable', () => {
      const previousValues = {
        HOME: process.env.HOME,
        USERPROFILE: process.env.USERPROFILE,
        HOMEDRIVE: process.env.HOMEDRIVE,
        HOMEPATH: process.env.HOMEPATH,
      };
      delete process.env.HOME;
      delete process.env.USERPROFILE;
      process.env.HOMEDRIVE = 'C:';
      process.env.HOMEPATH = '\\Users\\DriveProfile';

      try {
        expect(resolveHomeDir()).toBe('C:\\Users\\DriveProfile');
      } finally {
        restoreEnv(['HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH'], previousValues);
      }
    });
  } else {
    it('falls back to os.homedir on non-Windows when HOME is missing', () => {
      const previousValues = {
        HOME: process.env.HOME,
      };
      delete process.env.HOME;

      try {
        expect(resolveHomeDir()).toBe(homedir());
      } finally {
        restoreEnv(['HOME'], previousValues);
      }
    });
  }
});

describe('defaultLogDir', () => {
  it('builds log directory from resolved home path', () => {
    const previousValues = {
      HOME: process.env.HOME,
      USERPROFILE: process.env.USERPROFILE,
      HOMEDRIVE: process.env.HOMEDRIVE,
      HOMEPATH: process.env.HOMEPATH,
    };
    if (process.platform === 'win32') {
      process.env.HOME = 'C:\\Users\\ResolvedHome';
    } else {
      delete process.env.HOME;
    }
    delete process.env.USERPROFILE;
    delete process.env.HOMEDRIVE;
    delete process.env.HOMEPATH;

    const logDir = defaultLogDir('/repo/path/my project');
    const resolvedHome = resolveHomeDir();
    const expectedBase = path.join(resolvedHome, '.ouroborus', 'logs', 'my_project');

    try {
      expect(logDir.startsWith(`${expectedBase}${path.sep}`)).toBeTrue();
      expect(path.basename(logDir)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/);
    } finally {
      restoreEnv(['HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH'], previousValues);
    }
  });
});
