/**
 * Ubicación de un registro dentro de su distrito, con la cartografía del INEI.
 *
 * Sirve para dos cosas del directorio del MIMP:
 *  - comprobar si una coordenada cae en el distrito que dice su ubigeo, y
 *  - dar un punto cuando el registro no tiene coordenada utilizable: los Hogares de
 *    Refugio Temporal, cuya dirección es confidencial, o un Educador de Calle cuya
 *    coordenada cae en otro distrito.
 *
 * Ese punto es el polo de inaccesibilidad del distrito —el interior más alejado del
 * borde—, calculado con la misma función que usa el motor para rotular. No es el
 * centroide, que en un distrito cóncavo cae fuera, y no pretende parecerse a la
 * ubicación real: dice «en este distrito» y nada más.
 */
import fs from 'node:fs';
import path from 'node:path';
import { feature } from 'topojson-client';
import { puntoEnAnillos, poloDeInaccesibilidad } from '../../src/motor/ocupacion.js';

/** Celdas por el lado mayor del distrito: el polo sale con 1/300 de su tamaño de error. */
const CELDAS = 300;

/**
 * @param {string} carpetaGeo  public/data/geo
 * @returns {{distrito, distritoEn, contiene, distanciaKm, puntoInterior}}
 */
export function crearUbicador(carpetaGeo) {
  const carpeta = path.join(carpetaGeo, 'distritos');
  if (!fs.existsSync(carpeta)) {
    throw new Error(`Falta ${carpeta}. La cartografía se prepara antes que el directorio.`);
  }
  const departamentos = fs.readdirSync(carpeta)
    .map((a) => a.match(/^(\d{2})\.alto\.topojson$/)?.[1]).filter(Boolean).sort();
  const porDepartamento = new Map();

  /* Un departamento que no existe (un ubigeo mal escrito) devuelve un índice vacío:
     quien pregunta recibe «no hay tal distrito», no una excepción. */
  const distritosDe = (ccdd) => {
    if (!porDepartamento.has(ccdd)) {
      const indice = new Map();
      if (departamentos.includes(ccdd)) {
        const topo = JSON.parse(fs.readFileSync(path.join(carpeta, `${ccdd}.alto.topojson`), 'utf8'));
        for (const f of feature(topo, 'distritos').features) {
          const anillos = anillosDe(f.geometry);
          indice.set(f.properties.ubigeo, {
            ubigeo: f.properties.ubigeo, nombre: f.properties.nombre, anillos, caja: cajaDe(anillos),
          });
        }
      }
      porDepartamento.set(ccdd, indice);
    }
    return porDepartamento.get(ccdd);
  };

  const distrito = (ubigeo) => distritosDe(ubigeo.slice(0, 2)).get(ubigeo) || null;

  return {
    distrito,

    /**
     * El distrito en el que cae realmente un punto, buscando en todo el país. Es lo
     * que permite decir, de una coordenada que no está en su distrito, dónde está.
     */
    distritoEn(lon, lat) {
      for (const ccdd of departamentos) {
        for (const d of distritosDe(ccdd).values()) {
          const [x0, y0, x1, y1] = d.caja;
          if (lon < x0 || lon > x1 || lat < y0 || lat > y1) continue;
          if (puntoEnAnillos(lon, lat, d.anillos)) return d;
        }
      }
      return null;
    },

    contiene(ubigeo, lon, lat) {
      const d = distrito(ubigeo);
      return Boolean(d) && puntoEnAnillos(lon, lat, d.anillos);
    },

    /** Kilómetros desde el punto hasta el distrito; 0 si cae dentro. */
    distanciaKm(ubigeo, lon, lat) {
      const d = distrito(ubigeo);
      if (!d) return Infinity;
      if (puntoEnAnillos(lon, lat, d.anillos)) return 0;
      /* Plano local centrado en el punto. A las distancias que importan aquí —de metros
         a unos pocos kilómetros— el error de no usar la esfera es despreciable. */
      const kx = 111.32 * Math.cos((lat * Math.PI) / 180);
      const ky = 110.57;
      let minimo = Infinity;
      for (const anillo of d.anillos) {
        for (let i = 0; i + 1 < anillo.length; i++) {
          const ax = (anillo[i][0] - lon) * kx; const ay = (anillo[i][1] - lat) * ky;
          const bx = (anillo[i + 1][0] - lon) * kx; const by = (anillo[i + 1][1] - lat) * ky;
          const dx = bx - ax; const dy = by - ay;
          const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
          minimo = Math.min(minimo, Math.hypot(ax + t * dx, ay + t * dy));
        }
      }
      return minimo;
    },

    puntoInterior(ubigeo) {
      const d = distrito(ubigeo);
      if (!d) return null;
      /* El polo se busca en un plano local donde un grado de longitud mide lo que mide
         a esa latitud; en grados sin corregir, «el punto más alejado del borde» se
         deformaría hacia el eje norte-sur. */
      let latMin = Infinity; let latMax = -Infinity;
      for (const a of d.anillos) for (const [, la] of a) { latMin = Math.min(latMin, la); latMax = Math.max(latMax, la); }
      const k = Math.cos((((latMin + latMax) / 2) * Math.PI) / 180);
      const plano = d.anillos.map((a) => a.map(([lo, la]) => [lo * k, -la]));

      let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
      for (const a of plano) {
        for (const [x, y] of a) {
          x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
        }
      }
      const caja = { x: x0, y: y0, ancho: x1 - x0, alto: y1 - y0 };
      const polo = poloDeInaccesibilidad(plano, caja, Math.max(caja.ancho, caja.alto) / CELDAS);
      if (!polo) return null;
      /* Seis decimales: ~0,1 m. Más no aporta nada y hace el JSON inestable. */
      const redondo = (n) => Math.round(n * 1e6) / 1e6;
      return { lon: redondo(polo.x / k), lat: redondo(-polo.y) };
    },
  };
}

/** Caja [lonMin, latMin, lonMax, latMax] de unos anillos, para descartar rápido. */
function cajaDe(anillos) {
  const c = [Infinity, Infinity, -Infinity, -Infinity];
  for (const a of anillos) {
    for (const [x, y] of a) {
      if (x < c[0]) c[0] = x; if (y < c[1]) c[1] = y;
      if (x > c[2]) c[2] = x; if (y > c[3]) c[3] = y;
    }
  }
  return c;
}

/** Todos los anillos de un Polygon o MultiPolygon, para la regla par-impar. */
function anillosDe(geometria) {
  if (geometria.type === 'Polygon') return geometria.coordinates;
  if (geometria.type === 'MultiPolygon') return geometria.coordinates.flat();
  return [];
}
