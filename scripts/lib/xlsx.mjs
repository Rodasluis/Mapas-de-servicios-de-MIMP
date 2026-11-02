/**
 * El lector de .xlsx vive en src/motor/xlsx.js desde la Fase 23: la interfaz lo usa
 * para leer los datos propios que sube quien hace el mapa. Los scripts de build lo
 * siguen importando desde aquí.
 */
export { leerHoja, leerFilas } from '../../src/motor/xlsx.js';
