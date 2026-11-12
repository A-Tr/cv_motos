# Clasificador de motos y bicis

Sirve esta carpeta con un servidor local:

```sh
python3 -m http.server 8000
```

Abre [http://localhost:8000](http://localhost:8000) y pulsa **Activar cámara**. También puedes usar `npx http-server .` si tienes acceso a npm. La primera carga necesita Internet para descargar TensorFlow.js y Teachable Machine desde jsDelivr. Da permiso a la cámara cuando lo pida el navegador.

Si aparece «Your browser does not support WebRTC», comprueba la dirección de Chrome: usa exactamente `http://localhost:8000` o `http://127.0.0.1:8000`. La cámara no funciona desde una dirección HTTP de la red local, como `http://192.168.x.x:8000`; para abrirla desde otro dispositivo necesitas servir la página por HTTPS. Si ya usas localhost, revisa el permiso de cámara en el icono a la izquierda de la barra de direcciones.
