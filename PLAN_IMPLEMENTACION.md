# Plan de implementación: reconocimiento y juego

## Punto de partida y decisiones

- La aplicación es estática: `index.html` carga TensorFlow.js y Teachable Machine desde jsDelivr y usa `my_model/`. Se puede servir con `python3 -m http.server 8000`; no hay backend ni sistema de construcción.
- `my_model/metadata.json` define exactamente `PP`, `PSOE`, `Vox` y `Sumar`. El juego debe usar esas cuatro respuestas, con esta capitalización en la interfaz.
- `scrapping/fotos_congreso/` contiene retratos en nueve carpetas. Para el juego se admitirán únicamente `PP`, `PSOE`, `VOX` y `SUMAR` (54, 49, 12 y 13 JPG respectivamente en el estado inspeccionado; 128 en total). No equiparar automáticamente otras formaciones o coaliciones a estas etiquetas.
- La procedencia exacta de las imágenes usadas al entrenar el modelo no está registrada. Antes de llamar a los retratos «fotos de entrenamiento» en la interfaz o documentación, verificarlo con quien entrenó el modelo; mientras tanto, llamarlos «fotos del conjunto descargado». Esto no bloquea el juego.
- Hay cambios locales previos en `README.md` e `index.html` y `scrapping/` aún no está versionado. Preservarlos. El despliegue deberá incluir las fotos admitidas o una copia optimizada de ellas; un manifiesto sin imágenes publicadas dejaría el juego vacío.

## Contratos comunes antes de trabajar en paralelo

1. Mantener una sola página con dos vistas seleccionables: **Reconocer** y **Jugar**. La vista inicial será Reconocer. Cambiar de vista no recarga la página y detiene la cámara al salir de Reconocer.
2. Usar módulos ES locales para la lógica; mantener las dos bibliotecas externas ya presentes y evitar nuevas dependencias de ejecución. Propuesta de archivos: `js/classifier.js`, `js/game.js`, `js/app.js`, `css/styles.css`, `game/photos.json` y `scripts/generate_game_manifest.py`.
3. Definir en `js/classifier.js` una API `loadModel()`, `predictImage(imageElementOrCanvas)`, `startCamera(videoElement)`, `captureFrame(videoElement)` y `stopCamera()`. `loadModel()` reutiliza una única promesa/modelo. La clasificación devuelve el arreglo original `{className, probability}`. `startCamera()` prepara y reproduce el vídeo; `captureFrame()` devuelve un canvas con la imagen fija. La cámara se solicita solo tras pulsar el botón y se libera al cambiar de vista, repetir o cerrar la página. Si se decide usar directamente `tmImage.Webcam`, adaptar los nombres internos sin cambiar esta API. `js/app.js` es dueño de las URL de objeto creadas para archivos subidos y las revoca.
4. Definir en `js/game.js` una API `loadQuestions()`, `newGame()`, `nextQuestion()` y `answer(className)`. `newGame()` reinicia marcador y devuelve una primera pregunta `{src}`; `nextQuestion()` devuelve `{src}` sin cambiar el marcador; `answer()` acepta una sola respuesta por pregunta y devuelve `{correct, correctLabel, hits, attempts, streak}`. Una llamada repetida a `answer()` debe rechazarse sin alterar cifras. El juego compara con la etiqueta del manifiesto, **no** con la predicción del modelo.
5. Formato de `game/photos.json`: `{ "version": 1, "photos": [{ "src": "scrapping/fotos_congreso/PP/archivo.jpg", "label": "PP" }] }`. `src` es una ruta relativa a la raíz de la web, codificada como JSON UTF-8, nunca un nombre mostrado como respuesta. El generador ordena rutas para obtener una salida reproducible y valida que cada archivo existe.
6. `js/app.js` es el único dueño de eventos del DOM, cambios de vista y mensajes de estado. Los módulos de clasificación y juego no modifican directamente el DOM. Antes de empezar, acordar los identificadores de los contenedores y controles en un pequeño comentario al inicio de `js/app.js` o en este plan.

## Trabajo en paralelo

| Tarea | Responsable sugerido | Archivos propios | Entrega y comprobación |
| --- | --- | --- | --- |
| A. Datos del juego | Agente A | `scripts/generate_game_manifest.py`, `game/photos.json` | Recorrer solo las cuatro carpetas permitidas, incluir JPG válidos, generar el JSON reproducible y comprobar que cada etiqueta tiene fotos. No incluir CSV/JSON de scraping como fuente de respuestas en el navegador. Documentar cómo regenerarlo si cambian las fotos. |
| B. Motor de reconocimiento | Agente B | `js/classifier.js` | Extraer la carga del modelo y la predicción de `index.html`; clasificar tanto un elemento de imagen subida como un canvas de cámara. Controlar errores de carga, permiso denegado y dispositivos ausentes; liberar pistas de vídeo. No editar HTML/CSS. |
| C. Motor del juego | Agente C | `js/game.js` | Leer el manifiesto, validar etiquetas y rutas, elegir primero una categoría con igual probabilidad y después una foto aleatoria de esa categoría; evitar repetir una foto hasta agotar su categoría y evitar repetición inmediata entre ciclos. Calcular aciertos, intentos y racha; bloquear doble respuesta. No editar HTML/CSS. |
| D. Diseño e integración | Agente D | `index.html`, `css/styles.css`, `js/app.js`, `README.md` | Crear navegación de dos vistas, flujo de subida/cámara, resultados, juego y estados; conectar las APIs A–C. Implementar diseño mobile first y documentación. Este agente integra después de recibir A–C; no debe reescribir sus archivos. |

Las tareas A, B y C pueden arrancar a la vez tras fijar los contratos. D puede diseñar la estructura y estilos en paralelo, pero conectará y probará la lógica cuando A–C estén listas. Si solo hay un agente, seguir A → B → C → D.

## Detalle de implementación

### A. Preparar las preguntas

1. Leer las carpetas `PP`, `PSOE`, `VOX` y `SUMAR`; mapear las dos últimas a las etiquetas `Vox` y `Sumar`. No inferir la respuesta a partir de los nombres de archivo en el navegador: el manifiesto aporta `label`.
2. Excluir entradas que no sean imágenes JPG legibles y comprobar que todas las rutas del manifiesto están dentro de `scrapping/fotos_congreso/`. Informar del número de fotos por etiqueta al generar el archivo.
3. Publicar las imágenes elegidas con la web. Para una primera versión, usar los JPG existentes y cargar solo la foto de la pregunta actual; no precargar las 128 fotos. Si el tamaño real en móvil resulta excesivo, generar versiones reducidas en una tarea posterior y actualizar `src`.

### B. Completar el reconocimiento

1. Añadir un `<input type="file" accept="image/*">` visible y utilizable sin cámara. Al seleccionar un archivo, comprobar que es una imagen, mostrar una vista previa, cargar el modelo una vez y clasificarla. Revocar la URL de objeto de la selección anterior al reemplazarla o cerrar la vista.
2. Mantener el flujo de cámara: activar, ver la imagen en directo, capturar un fotograma fijo y clasificarlo. Dar opciones claras para repetir y detener la cámara. Usar `playsinline` en vídeo móvil; invertir solo la vista de la cámara frontal si procede, manteniendo la captura con orientación coherente.
3. Conservar las cuatro barras de probabilidad del modelo. Mostrar estados de carga y errores en texto (`role="status"`/`aria-live`), no solo mediante color. Una operación fallida debe permitir reintento sin recargar.
4. La cámara requiere `localhost` o HTTPS y permiso del navegador; la subida debe funcionar aunque el permiso de cámara se deniegue. No solicitar acceso a la cámara al entrar en la página.

### C. Construir la partida

1. Una pregunta muestra una sola foto y cuatro botones de respuesta. Ocultar el nombre del archivo y cualquier texto alternativo que revele la etiqueta antes de responder; usar un alt neutro como «Retrato para adivinar».
2. Tras pulsar una opción, desactivar las cuatro hasta «Siguiente foto», marcar la correcta, indicar si se acertó con texto y actualizar aciertos/intentos/racha. En fallo, reiniciar la racha a cero. Una nueva partida reinicia todas las cifras y el orden de fotos.
3. Celebrar los aciertos con una animación breve, discreta y contenida en la tarjeta (por ejemplo, destello o partículas CSS) y un mensaje de racha. Respetar `prefers-reduced-motion: reduce`; no usar animaciones que impidan pulsar «Siguiente foto».
4. Si el manifiesto no carga, está vacío o una foto falla, mostrar una explicación y permitir reintentar o saltar la imagen sin contabilizar una respuesta. Evitar que el mismo usuario obtenga puntos con varios clics sobre la misma pregunta.

### D. Diseño mobile first e integración

1. Diseñar primero para 320–390 px: cabecera compacta, selector de vista claro, contenido en una columna, controles de ancho cómodo y tarjeta de foto sin desbordamiento. A partir de aproximadamente 700 px, ampliar la disposición según el espacio; comprobar también 768 y 1280 px.
2. Mantener botones con área táctil mínima de 44 × 44 px, foco visible, contraste legible y navegación por teclado. Marcar la vista activa con `aria-current` o patrón de pestañas completo; no mezclar atributos de ambos patrones.
3. En Reconocer, mostrar los dos métodos de entrada sin que uno dependa del otro. Al cambiar de vista o repetir, limpiar recursos y estados transitorios; evitar que una predicción tardía sobrescriba la pantalla del juego.
4. Explicar en `README.md` cómo iniciar el servidor, cómo regenerar el manifiesto, qué carpetas participan, cómo probar cámara en móvil mediante HTTPS y que TensorFlow.js/Teachable Machine necesitan conexión para su primera descarga.

## Verificación final y criterios de aceptación

- Ejecutar el generador dos veces y confirmar que `game/photos.json` no cambia; validar las cuatro etiquetas y que cada `src` responde con una imagen desde el servidor local.
- Abrir la página a 320, 390, 768 y 1280 px. No debe haber desplazamiento horizontal; navegación, foto y controles deben ser legibles y utilizables con toque y teclado.
- Subir una imagen válida: se ve una vista previa y cuatro probabilidades. Probar un archivo inválido y una segunda imagen: error claro o sustitución correcta, sin resultados anteriores engañosos.
- Activar cámara en `localhost`/HTTPS, capturar, repetir, denegar permiso y cambiar de vista mientras está activa. Verificar que la pista de vídeo se detiene y que la subida sigue funcionando.
- Completar varias preguntas: una respuesta correcta incrementa aciertos y racha, una incorrecta reinicia la racha, un doble clic cuenta una sola vez, «Siguiente foto» cambia la imagen y «Nueva partida» reinicia el marcador. Probar con movimiento reducido.
- Recargar con la red de CDN bloqueada: el juego debe seguir funcionando, mientras Reconocer muestra un error claro de carga del modelo. Probar un manifiesto ausente o imagen rota: mensaje y recuperación sin pantalla bloqueada.
- Revisar que ningún archivo anterior del usuario se sobrescribió por accidente y que las fotos referenciadas se incluyen realmente en el paquete que se publique.

## Orden de entrega

1. Fijar contratos e identificadores de interfaz.
2. Integrar A, B y C con D; resolver diferencias de API.
3. Pasar la lista de verificación en navegador y corregir fallos observados.
4. Actualizar la documentación final y preparar los archivos estáticos para publicación.
