PDF de prueba que genera `npm run muestras`, y la hoja de íconos (iconos.pdf).
No se versionan: son salida reproducible del motor. `npm run qa` los compara con
las referencias aprobadas en tests/referencias/.

`territorios.csv` es la revisión de los nombres territorio por territorio: una fila
por cada departamento, provincia o distrito de cada lámina, con si se puso su nombre,
cuánto sale de su unidad, a qué distancia queda de sus íconos y cómo se dispusieron
éstos. Se abre con cualquier hoja de cálculo.

`censo/` guarda los censos de `npm run censo`: una línea por territorio y configuración,
para comparar el motor de rótulos antes y después de un cambio.
