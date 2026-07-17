/**
 * Module honesty gate: every named export under renderCoordinator must have a
 * non-test production importer outside its defining file.
 *
 * Re-exports alone do NOT count unless the re-exporting module itself has a
 * non-test production importer (prevents dead `export *` barrels from
 * laundering unused symbols). Shell re-exports of createRenderCoordinatorImpl
 * count because ChartGPU imports the shell.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RC_ROOT = resolve(HERE, '..');
const SRC_ROOT = resolve(RC_ROOT, '../..');

function walkTs(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue;
      out.push(...walkTs(p));
    } else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) {
      out.push(p);
    }
  }
  return out;
}

function parseBraceExport(body: string): string[] {
  const names: string[] = [];
  for (const part of body.split(',')) {
    let p = part.trim();
    if (!p) continue;
    p = p.replace(/^type\s+/, '');
    const m = p.match(/^(\w+)(?:\s+as\s+(\w+))?/);
    if (m) names.push(m[2] ?? m[1]!);
  }
  return names;
}

function parseBraceImport(body: string): string[] {
  const names: string[] = [];
  for (const part of body.split(',')) {
    let p = part.trim();
    if (!p) continue;
    p = p.replace(/^type\s+/, '');
    const m = p.match(/^(\w+)(?:\s+as\s+(\w+))?/);
    if (m) names.push(m[1]!);
  }
  return names;
}

function resolveRel(fromFile: string, rel: string): string | null {
  if (!rel.startsWith('.')) return null;
  const base = resolve(dirname(fromFile), rel);
  const cands = [`${base}.ts`, base.endsWith('.ts') ? base : `${base}.ts`, join(base, 'index.ts')];
  for (const c of cands) {
    try {
      if (statSync(c).isFile()) return resolve(c);
    } catch {
      /* continue */
    }
  }
  return null;
}

type ExportEntry = { name: string; file: string };
type Reexport = { name: string | '*'; from: string };

function collectExports(files: string[]): ExportEntry[] {
  const out: ExportEntry[] = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/^export\s+(type\s+)?\{([^}]+)\}(?:\s+from\s+['"]([^'"]+)['"])?/gm)) {
      for (const name of parseBraceExport(m[2]!)) {
        out.push({ name, file: resolve(file) });
      }
    }
    for (const m of text.matchAll(/^export\s+(?:async\s+)?(?:function|const|class|type|interface|enum)\s+(\w+)/gm)) {
      out.push({ name: m[1]!, file: resolve(file) });
    }
  }
  return out;
}

function collectReexports(files: string[]): Map<string, Reexport[]> {
  const map = new Map<string, Reexport[]>();
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const key = resolve(file);
    const list: Reexport[] = [];
    for (const m of text.matchAll(/^export\s+(type\s+)?\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/gm)) {
      for (const name of parseBraceExport(m[2]!)) {
        list.push({ name, from: m[3]! });
      }
    }
    for (const m of text.matchAll(/^export\s+\*\s+from\s+['"]([^'"]+)['"]/gm)) {
      list.push({ name: '*', from: m[1]! });
    }
    if (list.length) map.set(key, list);
  }
  return map;
}

function moduleReexports(
  modulePath: string,
  name: string,
  origin: string,
  reexports: Map<string, Reexport[]>,
  depth = 0
): boolean {
  if (depth > 4) return false;
  for (const item of reexports.get(modulePath) ?? []) {
    const src = resolveRel(modulePath, item.from);
    if (!src) continue;
    if ((item.name === name || item.name === '*') && src === origin) return true;
    if ((item.name === name || item.name === '*') && moduleReexports(src, name, origin, reexports, depth + 1)) {
      return true;
    }
  }
  return false;
}

/** True if any production file imports something from this module path. */
function moduleHasProductionImporter(modulePath: string, allProdSrc: string[], shellPath: string): boolean {
  if (modulePath === shellPath) return true;
  const stem = modulePath.replace(/\.ts$/, '');
  for (const file of allProdSrc) {
    if (resolve(file) === modulePath) continue;
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      const resolved = resolveRel(file, m[1]!);
      if (resolved === modulePath || (resolved && resolved.replace(/\.ts$/, '') === stem)) {
        return true;
      }
    }
  }
  return false;
}

describe('renderCoordinator module honesty', () => {
  it('every named export has a non-test importer outside its defining file', () => {
    const rcFiles = walkTs(RC_ROOT);
    const shell = resolve(RC_ROOT, '../createRenderCoordinator.ts');
    const allProdSrc = walkTs(SRC_ROOT);

    const exports = collectExports(rcFiles);
    const reexportFiles = [...rcFiles, shell].filter((f) => {
      try {
        return statSync(f).isFile();
      } catch {
        return false;
      }
    });
    const reexports = collectReexports(reexportFiles);

    const importUse = new Map<string, Array<{ file: string; from: string }>>();
    for (const file of allProdSrc) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/import\s+(type\s+)?\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/gs)) {
        for (const name of parseBraceImport(m[2]!)) {
          const list = importUse.get(name) ?? [];
          list.push({ file: resolve(file), from: m[3]! });
          importUse.set(name, list);
        }
      }
    }

    const dead: string[] = [];
    const seen = new Set<string>();

    for (const { name, file } of exports) {
      const key = `${name}@@${file}`;
      if (seen.has(key)) continue;
      seen.add(key);

      let hasConsumer = false;

      // Named re-export or export * only counts if re-exporting module is itself live.
      for (const [rf, items] of reexports) {
        if (rf === file) continue;
        for (const item of items) {
          if (item.name !== name && item.name !== '*') continue;
          const src = resolveRel(rf, item.from);
          if (src !== file) continue;
          if (moduleHasProductionImporter(rf, allProdSrc, shell)) {
            hasConsumer = true;
            break;
          }
        }
        if (hasConsumer) break;
      }

      if (!hasConsumer) {
        for (const imp of importUse.get(name) ?? []) {
          if (imp.file === file) continue;
          const resolved = resolveRel(imp.file, imp.from);
          if (!resolved) continue;
          if (resolved === file) {
            hasConsumer = true;
            break;
          }
          // Import from a barrel that re-exports us only if that barrel is live.
          if (
            moduleReexports(resolved, name, file, reexports) &&
            moduleHasProductionImporter(resolved, allProdSrc, shell)
          ) {
            hasConsumer = true;
            break;
          }
        }
      }

      if (!hasConsumer) {
        dead.push(`${name}  (${relative(SRC_ROOT, file)})`);
      }
    }

    if (dead.length > 0) {
      expect.fail(
        `Dead modular exports (no non-test importer outside defining file):\n  - ${dead.join('\n  - ')}\n` +
          `Un-export, delete, or wire each symbol into production. Re-export-only barrels do not count.`
      );
    }

    expect(exports.length).toBeGreaterThan(50);
  });
});
