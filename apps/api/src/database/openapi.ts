import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { crearApp } from '../app.js';
import { generarDocumento } from '../core/http/openapi.js';

// Misma raíz que `.env` (repo); ver docs/api/README.md.
const ARCHIVO = new URL('../../../../docs/api/openapi.json', import.meta.url);

// Construye la app (sin conectar a la BD) para registrar las rutas y escribe el documento
// determinista: 2 espacios y salto final.
export async function escribirOpenApi(): Promise<string> {
  crearApp({ comprobarBd: async () => false });
  const ruta = fileURLToPath(ARCHIVO);
  mkdirSync(fileURLToPath(new URL('./', ARCHIVO)), { recursive: true });
  writeFileSync(ruta, `${JSON.stringify(generarDocumento(), null, 2)}\n`);
  return ruta;
}
