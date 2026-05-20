import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Lee un único archivo JSON de 5etools.
 */
export async function readJson<T = unknown>(path: string): Promise<T> {
  const buf = await readFile(path, 'utf-8');
  return JSON.parse(buf) as T;
}

/**
 * Lista archivos JSON dentro de un subdir de data/ que matcheen un patrón.
 * Ej: listFiles(dataDir, 'class', /^class-.+\.json$/) → class-wizard.json, etc.
 *     skipea automáticamente fluff-*, foundry-*, índices, y UA.
 */
export async function listFiles(
  dataDir: string,
  subdir: string,
  pattern: RegExp,
): Promise<string[]> {
  const dir = join(dataDir, subdir);
  if (!existsSync(dir)) return [];
  const files = await readdir(dir);
  return files
    .filter((f) => pattern.test(f))
    .filter((f) => !f.startsWith('fluff-'))
    .filter((f) => !f.startsWith('foundry-'))
    .filter((f) => !f.startsWith('makebrew-'))
    .filter((f) => !f.includes('-ua-'))
    .map((f) => join(dir, f));
}

/**
 * Asserta que data/5etools/data/ exista y devuelve la ruta absoluta.
 */
export function assertDataDir(dataDir: string): void {
  if (!existsSync(dataDir)) {
    throw new Error(
      `5etools data dir not found at "${dataDir}". ¿Pusiste el contenido en data/5etools/data/?`,
    );
  }
  const racesPath = join(dataDir, 'races.json');
  if (!existsSync(racesPath)) {
    throw new Error(
      `data dir parece incompleto: falta "${racesPath}". Esperamos el contenido del repo de 5etools en data/5etools/.`,
    );
  }
}
