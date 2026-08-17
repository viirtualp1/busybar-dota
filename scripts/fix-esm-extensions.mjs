import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const EXTENSIONS = /\.(?:js|json|mjs|cjs|node)$/;

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walk(path);
      continue;
    }
    if (!/\.(?:js|d\.ts)$/.test(name)) {
      continue;
    }

    const source = readFileSync(path, 'utf8');
    const next = source.replace(
      /(from\s+|import\s*\()(['"])(\.[^'"]+)\2/g,
      (match, prefix, quote, spec) =>
        EXTENSIONS.test(spec) ? match : `${prefix}${quote}${spec}.js${quote}`,
    );
    if (next !== source) {
      writeFileSync(path, next);
    }
  }
}

walk(dist);
