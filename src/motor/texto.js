/**
 * Medición de texto a partir de las métricas reales de las tipografías incrustadas.
 *
 * Sirve para saber qué sitio ocupa un rótulo ANTES de escribirlo: el ancho de la caja
 * del título, si una línea del pie cabe, y —en la Fase 4— si dos rótulos del mapa
 * chocan. Como las métricas salen del mismo TTF que se incrusta en el PDF, lo que se
 * mide aquí es lo que acabará componiendo el visor.
 */
import { ptAmm } from '../estilo/tokens.js';

export function crearMedidor(metricas) {
  const cache = new Map();

  const fuenteDe = (familia, variante) => {
    const clave = `${familia}:${variante}`;
    const f = metricas.fuentes[clave];
    if (!f) throw new Error(`Sin métricas para ${clave}. ¿Falta en tokens.fuentes?`);
    return f;
  };

  /** Anchura del texto en EM (independiente del cuerpo). */
  function anchoEm(texto, familia, variante) {
    const clave = `${familia}:${variante}:${texto}`;
    if (cache.has(clave)) return cache.get(clave);
    const f = fuenteDe(familia, variante);
    let suma = 0;
    for (const c of String(texto)) suma += f.anchos[c.codePointAt(0)] ?? f.porDefecto;
    cache.set(clave, suma);
    return suma;
  }

  return {
    /** Anchura en milímetros. */
    ancho(texto, { familia, variante, pt }) {
      return anchoEm(texto, familia, variante) * ptAmm(pt);
    },

    /** Altura de una línea (ascenso + descenso) en milímetros. */
    alto({ familia, variante, pt }) {
      const f = fuenteDe(familia, variante);
      return (f.ascenso - f.descenso) * ptAmm(pt);
    },

    /** Altura sólo por encima de la línea base, para alinear cajas al texto. */
    ascenso({ familia, variante, pt }) {
      return fuenteDe(familia, variante).ascenso * ptAmm(pt);
    },

    /**
     * Parte el texto en líneas que quepan en el ancho dado, sin cortar palabras.
     * Si una palabra sola no cabe, se deja desbordar: partirla haría ilegible un
     * topónimo, y es preferible una línea larga a un nombre roto.
     */
    partir(texto, estilo, anchoMm) {
      const palabras = String(texto).split(/\s+/).filter(Boolean);
      const lineas = [];
      let actual = '';
      for (const palabra of palabras) {
        const prueba = actual ? `${actual} ${palabra}` : palabra;
        if (actual && this.ancho(prueba, estilo) > anchoMm) {
          lineas.push(actual);
          actual = palabra;
        } else {
          actual = prueba;
        }
      }
      if (actual) lineas.push(actual);
      return lineas.length ? lineas : [''];
    },

    /** Recorta con puntos suspensivos si no cabe. */
    recortar(texto, estilo, anchoMm) {
      if (this.ancho(texto, estilo) <= anchoMm) return texto;
      const puntos = '…';
      let corte = String(texto);
      while (corte.length > 1 && this.ancho(corte + puntos, estilo) > anchoMm) {
        corte = corte.slice(0, -1);
      }
      return corte.trimEnd() + puntos;
    },
  };
}
