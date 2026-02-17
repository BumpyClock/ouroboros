import { existsSync, readFileSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { isRecord } from './json';
import type { Tone } from './types';

type ToneMap = Record<Tone, string>;

export type ThemeDefinition = {
  name: string;
  source: 'builtin' | 'file';
  sourcePath?: string;
  ansi: {
    reset: string;
    bold: string;
    dim: string;
    tone: ToneMap;
    border: string;
    title: string;
    panel: string;
  };
  ink: {
    tone: ToneMap;
    border: string;
    title: string;
    panel: string;
  };
};

type ThemeFilePayload = {
  name?: string;
  ansi?: {
    reset?: string;
    bold?: string;
    dim?: string;
    border?: string;
    title?: string;
    panel?: string;
    tone?: Record<string, string>;
    tones?: Record<string, string>;
  };
  ink?: {
    border?: string;
    title?: string;
    panel?: string;
    tone?: Record<string, string>;
    tones?: Record<string, string>;
  };
};

const tones: Tone[] = ['neutral', 'info', 'success', 'warn', 'error', 'muted'];

const BASE_THEMES: Record<string, ThemeDefinition> = {
  default: {
    name: 'default',
    source: 'builtin',
    ansi: {
      reset: '\x1b[0m',
      bold: '\x1b[1m',
      dim: '\x1b[2m',
      tone: {
        neutral: '\x1b[97m',
        info: '\x1b[36m',
        success: '\x1b[32m',
        warn: '\x1b[33m',
        error: '\x1b[31m',
        muted: '\x1b[90m',
      },
      border: '\x1b[34m',
      title: '\x1b[97m',
      panel: '\x1b[90m',
    },
    ink: {
      tone: {
        neutral: 'white',
        info: 'cyan',
        success: 'green',
        warn: 'yellow',
        error: 'red',
        muted: 'gray',
      },
      border: 'cyan',
      title: 'white',
      panel: 'gray',
    },
  },
  matrix: {
    name: 'matrix',
    source: 'builtin',
    ansi: {
      reset: '\x1b[0m',
      bold: '\x1b[1m',
      dim: '\x1b[2m',
      tone: {
        neutral: '\x1b[97m',
        info: '\x1b[96m',
        success: '\x1b[92m',
        warn: '\x1b[93m',
        error: '\x1b[91m',
        muted: '\x1b[90m',
      },
      border: '\x1b[36m',
      title: '\x1b[92m',
      panel: '\x1b[37m',
    },
    ink: {
      tone: {
        neutral: 'white',
        info: 'cyan',
        success: 'green',
        warn: 'yellow',
        error: 'red',
        muted: 'gray',
      },
      border: 'cyan',
      title: 'green',
      panel: 'gray',
    },
  },
};

const DEFAULT_THEME_NAME = 'default';

function cloneTheme(theme: ThemeDefinition): ThemeDefinition {
  return {
    ...theme,
    ansi: {
      ...theme.ansi,
      tone: { ...theme.ansi.tone },
    },
    ink: {
      ...theme.ink,
      tone: { ...theme.ink.tone },
    },
  };
}

function parseToneMap(raw: unknown, section: string): Partial<Record<Tone, string>> {
  if (raw === undefined) {
    return {};
  }
  if (!isRecord(raw)) {
    throw new Error(`Invalid theme ${section}: expected an object`);
  }
  const parsed: Partial<Record<Tone, string>> = {};
  for (const tone of tones) {
    const value = raw[tone];
    if (value === undefined) {
      continue;
    }
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`Invalid theme ${section}.${tone}: expected non-empty string`);
    }
    parsed[tone] = value;
  }
  return parsed;
}

function parseAnsi(raw: unknown, base: ThemeDefinition): ThemeDefinition['ansi'] {
  if (raw === undefined) {
    return cloneTheme(base).ansi;
  }
  if (!isRecord(raw)) {
    throw new Error('Invalid theme ansi block: expected an object');
  }
  const payload = raw as ThemeFilePayload['ansi'];
  const tonesFromPayload = parseToneMap(payload.tone ?? payload.tones, 'ansi.tone');
  const ansi = cloneTheme(base).ansi;
  if (typeof payload.reset === 'string' && payload.reset.trim() !== '') {
    ansi.reset = payload.reset;
  }
  if (typeof payload.bold === 'string' && payload.bold.trim() !== '') {
    ansi.bold = payload.bold;
  }
  if (typeof payload.dim === 'string' && payload.dim.trim() !== '') {
    ansi.dim = payload.dim;
  }
  if (typeof payload.border === 'string' && payload.border.trim() !== '') {
    ansi.border = payload.border;
  }
  if (typeof payload.title === 'string' && payload.title.trim() !== '') {
    ansi.title = payload.title;
  }
  if (typeof payload.panel === 'string' && payload.panel.trim() !== '') {
    ansi.panel = payload.panel;
  }
  ansi.tone = { ...ansi.tone, ...tonesFromPayload };
  return ansi;
}

function parseInk(raw: unknown, base: ThemeDefinition): ThemeDefinition['ink'] {
  if (raw === undefined) {
    return cloneTheme(base).ink;
  }
  if (!isRecord(raw)) {
    throw new Error('Invalid theme ink block: expected an object');
  }
  const payload = raw as ThemeFilePayload['ink'];
  const tonesFromPayload = parseToneMap(payload.tone ?? payload.tones, 'ink.tone');
  const ink = cloneTheme(base).ink;
  if (typeof payload.border === 'string' && payload.border.trim() !== '') {
    ink.border = payload.border;
  }
  if (typeof payload.title === 'string' && payload.title.trim() !== '') {
    ink.title = payload.title;
  }
  if (typeof payload.panel === 'string' && payload.panel.trim() !== '') {
    ink.panel = payload.panel;
  }
  ink.tone = { ...ink.tone, ...tonesFromPayload };
  return ink;
}

function resolveCustomTheme(themePath: string): ThemeDefinition {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(themePath, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid theme file ${themePath}: ${message}`);
  }
  if (!isRecord(raw)) {
    throw new Error(`Invalid theme file ${themePath}: root must be an object`);
  }
  const payload = raw as ThemeFilePayload;
  const base = BASE_THEMES[DEFAULT_THEME_NAME];
  return {
    name:
      typeof payload.name === 'string' && payload.name.trim() !== ''
        ? payload.name.trim()
        : path.basename(themePath),
    source: 'file',
    sourcePath: themePath,
    ansi: parseAnsi(payload.ansi, base),
    ink: parseInk(payload.ink, base),
  };
}

export function listThemeNames(): string[] {
  return Object.keys(BASE_THEMES).sort();
}

export function resolveTheme(selection = DEFAULT_THEME_NAME, cwd = process.cwd()): ThemeDefinition {
  const trimmed = typeof selection === 'string' ? selection.trim() : '';
  if (!trimmed) {
    return cloneTheme(BASE_THEMES[DEFAULT_THEME_NAME]);
  }
  const builtin = BASE_THEMES[trimmed.toLowerCase()];
  if (builtin) {
    return cloneTheme(builtin);
  }

  const candidate = path.resolve(cwd, trimmed);
  if (!existsSync(candidate)) {
    throw new Error(
      `Unknown theme "${trimmed}". Expected one of ${listThemeNames().join(', ')} or a valid theme file path.`,
    );
  }

  if (!statSync(candidate).isFile()) {
    throw new Error(`Theme path is not a file: ${candidate}`);
  }
  return resolveCustomTheme(candidate);
}

export const defaultTheme = cloneTheme(BASE_THEMES[DEFAULT_THEME_NAME]);
