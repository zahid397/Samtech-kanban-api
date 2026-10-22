import { test as base, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// These isolated browser scenarios share one localhost IP. Respect the real
// five-per-minute auth limits rather than weakening production security guards.
export const test = base.extend<{ authBudget: void }>({
  authBudget: [
    async ({}, use, info) => {
      const file = path.resolve('test-results', '.auth-request-budget.json');
      const weight = info.file.endsWith('theme.spec.ts') ? 2 : 1; // theme also logs in after logout
      let entries: { at: number; weight: number }[] = [];
      for (;;) {
        try {
          entries = JSON.parse(await readFile(file, 'utf8'));
        } catch {
          entries = [];
        }
        const now = Date.now();
        entries = entries.filter((e) => now - e.at < 75_000);
        if (entries.reduce((sum, e) => sum + e.weight, 0) + weight <= 5) break;
        await new Promise((resolve) =>
          setTimeout(resolve, Math.max(100, 75_100 - (now - entries[0].at))),
        );
      }
      entries.push({ at: Date.now(), weight });
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify(entries));
      await use();
    },
    { auto: true },
  ],
});
export { expect };
