/**
 * Buscador de lugares (Fase 23): escribir «Huanta» y llegar a su mapa.
 *
 * Con los tres selectores encadenados hay que saber de antemano el departamento y la
 * provincia de un distrito, y entre 1 893 distritos eso no siempre se sabe. El buscador
 * busca en los tres niveles a la vez —y en el VRAEM—, sin tildes ni mayúsculas, y dice
 * de cada resultado a qué pertenece, porque hay veintitantos «San Juan».
 *
 * Es un combobox de la WAI-ARIA: el foco se queda en el campo y las flechas recorren
 * la lista, que el lector de pantalla anuncia por aria-activedescendant.
 */
import { NOMBRE_VRAEM } from '../motor/vraem.js';

const MAXIMO = 8;
const NIVEL = { 2: 'departamento', 4: 'provincia', 6: 'distrito' };
const ORDEN_NIVEL = { vraem: 0, departamento: 1, provincia: 2, distrito: 3 };

export const normalizar = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * El índice de lugares, a partir de la lista [ubigeo, nombre] de public/data/lugares.json.
 * @returns {Array<{id, nombre, nivel, detalle, clave, ambito}>}
 */
export function indiceDeLugares(lugares) {
  const nombre = new Map(lugares);
  const indice = lugares.map(([id, n]) => {
    const nivel = NIVEL[id.length];
    const detalle = nivel === 'departamento' ? 'Departamento'
      : nivel === 'provincia' ? `Provincia · ${nombre.get(id.slice(0, 2)) || ''}`
        : `Distrito · ${nombre.get(id.slice(0, 4)) || ''}, ${nombre.get(id.slice(0, 2)) || ''}`;
    return { id, nombre: n, nivel, detalle, clave: normalizar(n), ambito: { nivel, id } };
  });
  indice.push({
    id: 'vraem', nombre: 'VRAEM', nivel: 'vraem', detalle: NOMBRE_VRAEM,
    clave: normalizar(`vraem ${NOMBRE_VRAEM}`), ambito: { nivel: 'vraem', id: 'vraem' },
  });
  return indice;
}

/**
 * Los lugares que casan con lo escrito: primero los que EMPIEZAN así, luego los que
 * tienen una palabra que empieza así, y por último los que lo contienen; en cada grupo,
 * de lo grande a lo pequeño y por nombre. Un número busca por ubigeo.
 */
export function buscarLugares(indice, consulta, maximo = MAXIMO) {
  const q = normalizar(consulta);
  if (!q) return [];
  const puntua = (l) => {
    if (/^\d+$/.test(q)) return l.id.startsWith(q) ? 0 : -1;
    if (l.clave.startsWith(q)) return 0;
    if (l.clave.includes(` ${q}`)) return 1;
    if (l.clave.includes(q)) return 2;
    return -1;
  };
  return indice
    .map((l) => ({ l, p: puntua(l) }))
    .filter((x) => x.p >= 0)
    .sort((a, b) => a.p - b.p || ORDEN_NIVEL[a.l.nivel] - ORDEN_NIVEL[b.l.nivel]
      || a.l.nombre.localeCompare(b.l.nombre, 'es') || a.l.id.localeCompare(b.l.id))
    .slice(0, maximo)
    .map((x) => x.l);
}

/**
 * Crea el buscador. `alElegir(ambito)` recibe {nivel, id}.
 * @returns {HTMLElement}
 */
export function crearBuscador({ indice, alElegir }) {
  const contenedor = document.createElement('div');
  contenedor.className = 'buscador';
  const etiqueta = document.createElement('label');
  etiqueta.htmlFor = 'buscar-lugar';
  etiqueta.textContent = 'Buscar un lugar';
  const campo = document.createElement('input');
  Object.assign(campo, { type: 'search', id: 'buscar-lugar', autocomplete: 'off', spellcheck: false });
  campo.placeholder = 'Departamento, provincia, distrito o VRAEM';
  campo.setAttribute('role', 'combobox');
  campo.setAttribute('aria-autocomplete', 'list');
  campo.setAttribute('aria-expanded', 'false');
  campo.setAttribute('aria-controls', 'lugares-sugeridos');
  const lista = document.createElement('ul');
  lista.id = 'lugares-sugeridos';
  lista.className = 'sugerencias';
  lista.setAttribute('role', 'listbox');
  lista.setAttribute('aria-label', 'Lugares');
  lista.hidden = true;
  contenedor.append(etiqueta, campo, lista);

  let resultados = [];
  let activo = -1;

  const cerrar = () => {
    lista.hidden = true;
    campo.setAttribute('aria-expanded', 'false');
    campo.removeAttribute('aria-activedescendant');
    activo = -1;
  };
  const marcar = (i) => {
    activo = i;
    [...lista.children].forEach((li, k) => li.setAttribute('aria-selected', k === i ? 'true' : 'false'));
    if (i >= 0) {
      campo.setAttribute('aria-activedescendant', lista.children[i].id);
      lista.children[i].scrollIntoView({ block: 'nearest' });
    } else campo.removeAttribute('aria-activedescendant');
  };
  const elegir = (i) => {
    const l = resultados[i];
    if (!l) return;
    campo.value = '';
    cerrar();
    alElegir(l.ambito);
  };
  const pintar = () => {
    resultados = buscarLugares(indice, campo.value);
    lista.innerHTML = '';
    if (!campo.value.trim()) { cerrar(); return; }
    if (!resultados.length) {
      const li = document.createElement('li');
      li.className = 'sin-resultados';
      li.textContent = 'Ningún lugar con ese nombre';
      lista.appendChild(li);
    }
    resultados.forEach((l, i) => {
      const li = document.createElement('li');
      li.id = `lugar-${l.id}`;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', 'false');
      const n = document.createElement('span');
      n.className = 'nombre-lugar';
      n.textContent = l.nombre;
      const d = document.createElement('span');
      d.className = 'detalle-lugar';
      d.textContent = l.detalle;
      li.append(n, d);
      /* mousedown y no click: el click llega después del blur del campo, que cierra la
         lista, y la opción ya no estaría. */
      li.addEventListener('mousedown', (e) => { e.preventDefault(); elegir(i); });
      lista.appendChild(li);
    });
    lista.hidden = false;
    campo.setAttribute('aria-expanded', 'true');
    marcar(resultados.length ? 0 : -1);
  };

  campo.addEventListener('input', pintar);
  campo.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && resultados.length) {
      e.preventDefault();
      if (lista.hidden) pintar(); else marcar((activo + 1) % resultados.length);
    } else if (e.key === 'ArrowUp' && resultados.length) {
      e.preventDefault();
      marcar((activo - 1 + resultados.length) % resultados.length);
    } else if (e.key === 'Enter' && !lista.hidden && activo >= 0) {
      e.preventDefault();
      elegir(activo);
    } else if (e.key === 'Escape') {
      if (!lista.hidden) { e.preventDefault(); cerrar(); } else campo.value = '';
    }
  });
  campo.addEventListener('blur', cerrar);
  return contenedor;
}
