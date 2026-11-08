# Buceonet Tester

Primera versión web del tester de controles Buceonet.

## Archivos
- `index.html`: estructura de la página.
- `style.css`: diseño adaptable a celular y computadora.
- `script.js`: detección Gamepad API, botones, ejes, gatillos, prueba de centrado e informe TXT.

## Publicación en Cloudflare Pages
1. Subí estos tres archivos a la raíz de un repositorio de GitHub.
2. En Cloudflare Pages, elegí crear un proyecto conectado a Git.
3. Seleccioná el repositorio.
4. Framework preset: `None`.
5. Build command: dejar vacío.
6. Build output directory: `/` (o la raíz del proyecto, según la pantalla de configuración).
7. Publicá el sitio.

## Prueba
Abrí la página publicada en HTTPS con Chrome o Edge actualizado. Conectá el control por USB o Bluetooth y presioná un botón para que el navegador lo detecte.

Nota: la detección depende del navegador, sistema operativo, conexión y mapeo del mando. El resultado de centrado es orientativo; no es un diagnóstico electrónico definitivo.
