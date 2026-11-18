# Clasificador de partidos políticos

El modelo clasifica imágenes en cuatro categorías: PP, PSOE, Vox y Sumar. La aplicación estática permite analizar una imagen subida o capturada con la cámara y jugar a adivinar el partido de retratos del **conjunto descargado**. No se ha verificado que estas fotos se utilizaran para entrenar el modelo; las respuestas del juego proceden del manifiesto, no de las predicciones. La interfaz tiene estética de juego web retro y presenta los retratos a su resolución original para evitar que se vean pixelados.

## Iniciar

Sirve esta carpeta con un servidor local (no abras el HTML directamente como archivo):

```sh
python3 -m http.server 8000
```

Abre [http://localhost:8000](http://localhost:8000). En **Reconocer**, sube una imagen o pulsa **Activar cámara** y después **Tomar foto**; usa **Repetir** para empezar de nuevo. También puedes usar `npx http-server .` si tienes acceso a npm. En **Jugar**, escoge una respuesta y continúa con **Siguiente foto**; **Nueva partida** reinicia el marcador.

TensorFlow.js y Teachable Machine se descargan de jsDelivr y necesitan conexión, al menos en la primera carga. Si no están disponibles, el juego sigue funcionando, pero el reconocimiento mostrará un error. El modelo se carga una sola vez por página y la cámara solo se solicita al pulsar el botón.

La cámara requiere permiso y un contexto seguro: `localhost`, `127.0.0.1` o HTTPS. Una dirección HTTP de red local como `http://192.168.x.x:8000` no sirve para acceder a la cámara desde un móvil: publica la aplicación mediante HTTPS y abre esa dirección en el móvil. Revisa también los permisos de cámara del navegador. La subida de imágenes funciona sin permiso de cámara.

## Fotos del juego

Para regenerar el manifiesto y los retratos recortados se necesita Python 3.10 o posterior y Pillow (`python3 -m pip install Pillow`). Después ejecuta:

```sh
python3 scripts/generate_game_manifest.py
```

El script recorre exclusivamente `scrapping/fotos_congreso/PP`, `PSOE`, `VOX` y `SUMAR`, y asigna las etiquetas PP, PSOE, Vox y Sumar respectivamente. No incorpora otras formaciones. Comprueba la estructura de los JPG y decodifica sus píxeles, informa de los totales y genera `game/photos.json` de forma reproducible. Recorta cada retrato a un cuadrado desde la parte superior, sin ampliarlo ni reducirlo. Guarda los recortes con nombres seguros en `game/photos/`, ya que algunos nombres originales no son UTF-8 y no funcionan con el servidor HTTP de Python. No modifica los originales ni elimina automáticamente copias antiguas que ya no figuren en el manifiesto. Las fotos de origen rondan los 124 × 165 píxeles; recortarlas y mostrarlas a tamaño nativo evita la ampliación borrosa, pero no crea detalles que no existan en el archivo original.

Para publicar, incluye `index.html`, `css/`, `js/`, `my_model/`, `game/photos.json` y todas las imágenes referenciadas de `game/photos/`. El navegador solo carga la foto de la pregunta actual. Si cambian las fotos originales, vuelve a ejecutar el generador y publica las copias y el manifiesto actualizados.
