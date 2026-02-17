import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

let projectRoot = '';
let tempHome = '';
let previousHome: string | undefined;

mock.module('node:child_process', () => ({
  execSync: () => `${projectRoot}\n`,
}));

let loadOuroborosConfig: typeof import('../../core/config').loadOuroborosConfig;

beforeEach(async () => {
  tempHome = mkdtempSync(path.join(tmpdir(), 'ouroboros-home-'));
  mkdirSync(path.join(tempHome, '.ouroboros'), { recursive: true });
  projectRoot = mkdtempSync(path.join(tmpdir(), 'ouroboros-project-'));
  mkdirSync(path.join(projectRoot, '.ouroboros'), { recursive: true });
  previousHome = process.env.HOME;
  process.env.HOME = tempHome;

  ({ loadOuroborosConfig } = await import('../../core/config'));
});

afterEach(() => {
  if (previousHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = previousHome;
  }

  rmSync(tempHome, { recursive: true, force: true });
  rmSync(projectRoot, { recursive: true, force: true });
  tempHome = '';
  projectRoot = '';
});

afterAll(() => {
  mock.restore();
});

function writeConfig(filePath: string, contents: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${contents}\n`, 'utf8');
}

describe('loadOuroborosConfig reviewer fields', () => {
  it('merges project reviewer provider/model over global config', async () => {
    writeConfig(path.join(tempHome, '.ouroboros', 'config.toml'), `
reviewerProvider = "global-rev"
reviewerModel = "global-model"
`);

    writeConfig(path.join(projectRoot, '.ouroboros', 'config.toml'), `
reviewerProvider = "project-rev"
reviewerModel = "project-model"
`);

    const loaded = loadOuroborosConfig(projectRoot);
    expect(loaded.runtimeConfig.reviewerProvider).toBe('project-rev');
    expect(loaded.runtimeConfig.reviewerModel).toBe('project-model');
  });

  it('keeps global reviewer fields when project config does not override them', async () => {
    writeConfig(path.join(tempHome, '.ouroboros', 'config.toml'), `
reviewerProvider = "global-rev"
reviewerModel = "global-model"
`);

    writeConfig(path.join(projectRoot, '.ouroboros', 'config.toml'), 'provider = "codex"');

    const loaded = loadOuroborosConfig(projectRoot);
    expect(loaded.runtimeConfig.reviewerProvider).toBe('global-rev');
    expect(loaded.runtimeConfig.reviewerModel).toBe('global-model');
  });
});
