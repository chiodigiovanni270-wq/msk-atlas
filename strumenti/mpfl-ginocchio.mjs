/* Continuità del retinacolo superficiale sopra l'MPFL.
   Uso: node strumenti/mpfl-ginocchio.mjs
   Richiede solo Node 22+. Eseguire dopo retinacoli-ginocchio.mjs.
   Usa le strutture correnti (non la vecchia mesh retmed); è rilanciabile.
   Conserva l'MPFL e le sue inserzioni: sostituisce esclusivamente retmed.
   La ricostruzione avviene su una copia, per non applicare eventuali
   riposizionamenti dei vasi effettuati dal generatore dei retinacoli.
   Riferimenti: Amis et al. 2003, PMID 12893142; Baldwin 2009, PMID 19729366.
*/
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { M, setMesh, repack, saveFile } from './lib-modello.mjs';

const temp = mkdtempSync(join(tmpdir(), 'mpfl-ginocchio-'));
try {
  const file = join(temp, 'ginocchio.html');
  writeFileSync(file, M.html);
  const env = { ...process.env, MODELLO: file };
  execFileSync(process.execPath, [fileURLToPath(new URL('./retinacoli-ginocchio.mjs', import.meta.url)), 'mediale', '--mpfl-profondo'], { env, stdio: 'inherit' });
  const code = `import {REAL,attrs} from ${JSON.stringify(new URL('./lib-modello.mjs', import.meta.url).href)};
    const g=REAL('retmed'),a=attrs('retmed');
    console.log(JSON.stringify({pos:Array.from(g.pos),idx:Array.from(g.idx),fdir:Array.from(a.fdir)}));`;
  const mesh = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', code], { env, maxBuffer: 16*1024*1024 }).toString());
  setMesh('retmed', { pos: Float32Array.from(mesh.pos), idx: Uint32Array.from(mesh.idx), fdir: Int8Array.from(mesh.fdir) });
  saveFile(repack());
} finally { rmSync(temp, { recursive:true, force:true }); }
