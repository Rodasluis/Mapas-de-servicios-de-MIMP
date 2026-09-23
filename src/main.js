/**
 * Punto de entrada de la aplicación.
 *
 * En la Fase 0 la página no dibuja ningún mapa todavía: comprueba que lo que el build
 * publicó se sirve bien y enseña de qué versión del directorio proviene. Sirve de
 * prueba de vida del despliegue y evita el caso incómodo de una página que «carga»
 * pero cuyos datos dan 404.
 */
import './estilo/fuentes.css';
import { aplicarVariablesCss, rampaNaranjas } from './estilo/tokens.js';

const BASE = import.meta.env.BASE_URL;
const estado = document.getElementById('estado');
const app = document.getElementById('app');

aplicarVariablesCss();

async function traerJson(ruta) {
  const res = await fetch(`${BASE}${ruta}`);
  if (!res.ok) throw new Error(`${ruta}: HTTP ${res.status}`);
  return res.json();
}

const numero = (n) => n.toLocaleString('es-PE');

try {
  const [version, indice] = await Promise.all([
    traerJson('data/version.json'),
    traerJson('data/geo/indice.json'),
  ]);

  const niveles = Object.entries(indice.niveles)
    .map(([nombre, n]) => `${nombre} (±${n.toleranciaM} m)`)
    .join(', ');

  app.classList.remove('cargando');
  estado.outerHTML = `
    <dl class="resumen">
      <dt>Directorio</dt><dd>${version.fuente}, actualizado el ${version.generado}</dd>
      <dt>Versión</dt><dd><code>${version.datosTagCorto}</code></dd>
      <dt>Centros</dt><dd>${numero(version.totalCentros)} de ${numero(version.totalDirectorio)} registros
        (${numero(version.excluidos)} excluidos en origen)</dd>
      <dt>Tipos</dt><dd>${version.tipos.length} tipos de servicio</dd>
      <dt>Cartografía</dt><dd>${niveles}</dd>
      <dt>Rampa</dt><dd><span class="muestrario">${
        rampaNaranjas.map((c) => `<span style="background:${c}"></span>`).join('')
      }</span></dd>
    </dl>
    <p class="nota">
      Fase 0: andamiaje, datos y despliegue. La composición del mapa y la descarga del
      PDF llegan en las fases siguientes.
    </p>`;
} catch (err) {
  estado.className = 'fallo';
  estado.textContent = `No se pudieron leer los datos publicados — ${err.message}. `
    + 'Ejecuta «npm run preparar» antes de construir el sitio.';
}
