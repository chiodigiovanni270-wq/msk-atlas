// Uso: node strumenti/crociati-ginocchio.mjs; Python 3 con numpy e scipy.
// Riparte sempre dalla revisione dell'anteprima, modificando solo lca/lcp.
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { realDaRevisione, setMesh, repack, saveFile } from './lib-modello.mjs';
const base = '640009ddced342454a48cb846c2a515316743a0f';
const dir = mkdtempSync(join(tmpdir(), 'crociati-'));
try {
 const source = {};
 for (const name of ['lca', 'lcp']) {
  const mesh = realDaRevisione(base, name, 'modelli/ginocchio-3d.html');
  source[name] = { pos: Array.from(mesh.pos) };
 }
 writeFileSync(join(dir, 'prima.json'), JSON.stringify(source));
 execFileSync('python3', [fileURLToPath(new URL('./crociati-ginocchio.py', import.meta.url)), join(dir, 'prima.json'), join(dir, 'dopo.json')], { stdio: 'inherit' });
 const output = JSON.parse(readFileSync(join(dir, 'dopo.json'), 'utf8'));
 for (const name of ['lca', 'lcp']) {
  const m = output[name];
  setMesh(name, { pos: Float32Array.from(m.pos), idx: Uint16Array.from(m.idx), fdir: Int8Array.from(m.fdir) });
 }
 saveFile(repack());
} finally { rmSync(dir, { recursive: true, force: true }); }
