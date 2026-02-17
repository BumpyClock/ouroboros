import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
    writeConfig(
      path.join(tempHome, '.ouroboros', 'config.toml'),
      `
reviewerProvider = "global-rev"
reviewerModel = "global-model"
`,
    );

    writeConfig(
      path.join(projectRoot, '.ouroboros', 'config.toml'),
      `
reviewerProvider = "project-rev"
reviewerModel = "project-model"
`,
    );

    const loaded = loadOuroborosConfig(projectRoot);
    expect(loaded.runtimeConfig.reviewerProvider).toBe('project-rev');
    expect(loaded.runtimeConfig.reviewerModel).toBe('project-model');
  });

  it('merges project reviewer command over global config', async () => {
    writeConfig(
      path.join(tempHome, '.ouroboros', 'config.toml'),
      `
reviewerCommand = "/usr/bin/reviewer-global"
`,
    );

    writeConfig(
      path.join(projectRoot, '.ouroboros', 'config.toml'),
      `
reviewerCommand = "/usr/local/bin/reviewer-project"
`,
    );

    const loaded = loadOuroborosConfig(projectRoot);
    expect(loaded.runtimeConfig.reviewerCommand).toBe('/usr/local/bin/reviewer-project');
  });

  it('keeps global reviewer fields when project config does not override them', async () => {
    writeConfig(
      path.join(tempHome, '.ouroboros', 'config.toml'),
      `
reviewerProvider = "global-rev"
reviewerModel = "global-model"
`,
    );

    writeConfig(path.join(projectRoot, '.ouroboros', 'config.toml'), 'provider = "codex"');

    const loaded = loadOuroborosConfig(projectRoot);
    expect(loaded.runtimeConfig.reviewerProvider).toBe('global-rev');
    expect(loaded.runtimeConfig.reviewerModel).toBe('global-model');
  });

  it('merges theme setting with project config taking precedence', async () => {
    writeConfig(
      path.join(tempHome, '.ouroboros', 'config.toml'),
      `
theme = "matrix"
`,
    );

    writeConfig(path.join(projectRoot, '.ouroboros', 'config.toml'), 'theme = "default"');

    const loaded = loadOuroborosConfig(projectRoot);
    expect(loaded.runtimeConfig.theme).toBe('default');
  });

  it('keeps global theme when project config omits it', async () => {
    writeConfig(
      path.join(tempHome, '.ouroboros', 'config.toml'),
      `
theme = "matrix"
`,
    );

    writeConfig(path.join(projectRoot, '.ouroboros', 'config.toml'), 'provider = "codex"');

    const loaded = loadOuroborosConfig(projectRoot);
    expect(loaded.runtimeConfig.theme).toBe('matrix');
  });

  it('merges bead mode config with project overrides', async () => {
    writeConfig(
      path.join(tempHome, '.ouroboros', 'config.toml'),
      `
beadMode = "auto"
topLevelBeadId = "ouroboros-11"
`,
    );

    writeConfig(
      path.join(projectRoot, '.ouroboros', 'config.toml'),
      `
beadMode = "top-level"
topLevelBeadId = "ouroboros-11.2"
`,
    );

    const loaded = loadOuroborosConfig(projectRoot);
    expect(loaded.runtimeConfig.beadMode).toBe('top-level');
    expect(loaded.runtimeConfig.topLevelBeadId).toBe('ouroboros-11.2');
  });

  it('keeps global bead mode when project config omits it', async () => {
    writeConfig(
      path.join(tempHome, '.ouroboros', 'config.toml'),
      `
beadMode = "top-level"
topLevelBeadId = "ouroboros-9"
`,
    );

    writeConfig(path.join(projectRoot, '.ouroboros', 'config.toml'), 'provider = "codex"');

    const loaded = loadOuroborosConfig(projectRoot);
    expect(loaded.runtimeConfig.beadMode).toBe('top-level');
    expect(loaded.runtimeConfig.topLevelBeadId).toBe('ouroboros-9');
  });
});
