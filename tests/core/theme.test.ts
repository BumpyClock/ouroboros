import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { defaultTheme, listThemeNames, resolveTheme } from '../../core/theme';

let workspace = '';

function writeThemeFile(fileName: string, payload: string): string {
  mkdirSync(workspace, { recursive: true });
  const filePath = path.join(workspace, fileName);
  writeFileSync(filePath, `${payload}\n`, 'utf8');
  return filePath;
}

describe('theme resolution', () => {
  beforeEach(() => {
    workspace = mkdtempSync(path.join(tmpdir(), 'ouroboros-theme-'));
  });

  afterEach(() => {
    if (workspace) {
      rmSync(workspace, { recursive: true, force: true });
    }
    workspace = '';
  });

  it('lists builtin theme names', () => {
    expect(listThemeNames()).toEqual(expect.arrayContaining(['default', 'matrix']));
  });

  it('resolves builtin themes case-insensitively', () => {
    const theme = resolveTheme('MaTrIx');
    expect(theme.name).toBe('matrix');
    expect(theme.source).toBe('builtin');
  });

  it('loads custom theme JSON files with cwd-relative lookup', () => {
    writeThemeFile(
      'theme.json',
      JSON.stringify({
        name: 'custom-theme',
        ansi: {
          tone: {
            info: '\u001b[94m',
            warn: '\u001b[93m',
          },
        },
      }),
    );

    const theme = resolveTheme('theme.json', workspace);
    expect(theme.source).toBe('file');
    expect(theme.sourcePath).toBe(path.join(workspace, 'theme.json'));
    expect(theme.name).toBe('custom-theme');
    expect(theme.ansi.tone.info).toBe('\u001b[94m');
    expect(theme.ansi.tone.warn).toBe('\u001b[93m');
    expect(theme.ansi.tone.error).toBe(defaultTheme.ansi.tone.error);
  });

  it('throws for unknown theme names', () => {
    expect(() => resolveTheme('nope')).toThrow(/Unknown theme "nope"/);
  });

  it('throws when custom theme path is not a file', () => {
    const dirPath = path.join(workspace, 'not-a-file');
    mkdirSync(dirPath, { recursive: true });
    expect(() => resolveTheme(dirPath)).toThrow(/Theme path is not a file/);
  });

  it('throws for custom theme with invalid payload', () => {
    const filePath = writeThemeFile('bad-theme.json', '{ "name": 123, "ansi": false }');
    expect(() => resolveTheme(filePath)).toThrow(
      /Invalid theme file .*root must be an object|Invalid theme ansi block: expected an object/,
    );
  });
});
