/**
 * Sustituto de html2canvas y dompurify.
 *
 * jsPDF los carga para su método html(), que convierte HTML en imagen antes de
 * incrustarlo. Un mapa de este proyecto no puede llevar imágenes: se imprime hasta en
 * A0 y una captura se vería. Como nunca se llama a doc.html(), estos módulos serían
 * código muerto en el paquete; sustituirlos además convierte un uso accidental en un
 * error inmediato y no en un PDF con una imagen dentro.
 */
const error = () => {
  throw new Error(
    'Este proyecto genera PDF vectoriales: html2canvas y dompurify están desactivados '
    + 'a propósito. Si hace falta dibujar algo nuevo, componlo como SVG en src/motor/.',
  );
};

export default error;
export const sanitize = error;
