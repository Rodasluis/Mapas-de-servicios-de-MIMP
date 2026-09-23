/**
 * Utilidades compartidas por los scripts de build.
 *
 * Todos los scripts se apoyan en una caché en disco (.cache/) para no volver a
 * pedir a la red lo que ya se descargó: la cartografía del INEI pesa decenas de
 * megabytes y el build se repite muchas veces durante el desarrollo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CACHE = path.join(RAIZ, '.cache');
export const PUBLICO = path.join(RAIZ, 'public');

/** Lee package.json, que es donde viven las versiones ancladas de los orígenes. */
export function paquete() {
  return JSON.parse(fs.readFileSync(path.join(RAIZ, 'package.json'), 'utf8'));
}

/** Detiene el build con un mensaje legible en vez de un volcado de pila. */
export function abortar(mensaje, detalle) {
  console.error(`\n✗ ${mensaje}`);
  if (detalle) console.error(`  ${String(detalle).split('\n').join('\n  ')}`);
  console.error('');
  process.exit(1);
}

export const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
export const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
/** Elige la unidad según el tamaño, para que los informes se lean de un vistazo. */
export const peso = (n) => (n >= 1048576 ? mb(n) : kb(n));

export function asegurarCarpeta(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Descarga una URL a un archivo de la caché. Si ya está, no la vuelve a pedir.
 * @param {string} url
 * @param {string} destino ruta absoluta dentro de .cache
 * @param {{etiqueta?: string, forzar?: boolean}} opciones
 * @returns {Promise<Buffer>}
 */
export async function descargar(url, destino, { etiqueta, forzar = false } = {}) {
  const nombre = etiqueta || path.basename(destino);
  if (!forzar && fs.existsSync(destino) && fs.statSync(destino).size > 0) {
    console.log(`  · ${nombre} ya en caché (${peso(fs.statSync(destino).size)})`);
    return fs.readFileSync(destino);
  }
  process.stdout.write(`  ↓ ${nombre} … `);
  let res;
  try {
    res = await fetch(url, { redirect: 'follow' });
  } catch (err) {
    console.log('ERROR');
    abortar(`No se pudo contactar con el origen de ${nombre}.`, `${url}\n${err.message}`);
  }
  if (!res.ok) {
    console.log('ERROR');
    abortar(
      `No se pudo descargar ${nombre}: HTTP ${res.status} ${res.statusText}.`,
      `${url}\n\nSi el origen cambió de versión, revisa DATOS_TAG / GEO_TAG en package.json.`,
    );
  }
  const buf = Buffer.from(await res.arrayBuffer());
  asegurarCarpeta(path.dirname(destino));
  fs.writeFileSync(destino, buf);
  console.log(peso(buf.length));
  return buf;
}

/** Copia un archivo creando la carpeta de destino si hace falta. */
export function copiar(origen, destino) {
  asegurarCarpeta(path.dirname(destino));
  fs.copyFileSync(origen, destino);
  return fs.statSync(destino).size;
}

/** Escribe JSON compacto y devuelve el tamaño resultante. */
export function escribirJson(archivo, datos) {
  asegurarCarpeta(path.dirname(archivo));
  fs.writeFileSync(archivo, JSON.stringify(datos));
  return fs.statSync(archivo).size;
}

/** Encabezado de sección para los informes de consola. */
export function titulo(texto) {
  console.log(`\n${texto}`);
  console.log('─'.repeat(Math.max(texto.length, 40)));
}
