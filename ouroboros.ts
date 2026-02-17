import { parseArgs } from './core/cli';
import { initializeBuiltinPrompts } from './core/prompts';
import { runLoop } from './core/loop-engine';
import { getProviderAdapter } from './providers/registry';

async function main(): Promise<void> {
  const options = parseArgs();

  if (options.initPrompts) {
    const results = initializeBuiltinPrompts(process.cwd(), {
      force: options.forceInitPrompts,
    });
    const total = results.length;
    const written = results.filter((result) => result.action === 'written').length;
    const skipped = total - written;
    console.log(`Initialized ${total} built-in prompt ${total === 1 ? 'file' : 'files'}.`);
    for (const result of results) {
      if (result.action === 'written') {
        console.log(`  wrote ${result.role}: ${result.path}`);
      } else {
        console.log(`  skipped ${result.role}: ${result.path}`);
      }
    }
    if (written === 0 && skipped > 0 && !options.forceInitPrompts) {
      console.log(
        'Use --force-init-prompts to overwrite existing prompt files.',
      );
    }
    return;
  }

  const provider = getProviderAdapter(options.provider);
  await runLoop(options, provider);
}

main().catch((error) => {
  console.error('ouroboros failed:', error);
  process.exit(1);
});
