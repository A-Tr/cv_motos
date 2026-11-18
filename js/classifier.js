let modelPromise;
let librariesPromise;
let cameraGeneration = 0;
let activeCamera = null;

function loadScript(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.onload = resolve;
    script.onerror = () => { script.remove(); reject(new Error('No se pudieron descargar las bibliotecas de reconocimiento. Comprueba la conexión a Internet.')); };
    document.head.append(script);
  });
}

function loadLibraries() {
  if (!librariesPromise) {
    librariesPromise = (async () => {
      if (!globalThis.tf) await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@1.7.4/dist/tf.min.js');
      if (!globalThis.tmImage) await loadScript('https://cdn.jsdelivr.net/npm/@teachablemachine/image@0.8.4/dist/teachablemachine-image.min.js');
    })().catch(error => { librariesPromise = null; throw error; });
  }
  return librariesPromise;
}

function cameraCancelled() {
  return new DOMException('La solicitud de cámara se canceló.', 'AbortError');
}

function releaseCamera(camera) {
  if (!camera) return;
  camera.stream.getTracks().forEach((track) => track.stop());
  if (camera.video.srcObject === camera.stream) {
    camera.video.srcObject = null;
  }
}

export function loadModel() {
  if (!modelPromise) {
    modelPromise = loadLibraries().then(() => {
      if (!globalThis.tmImage?.load) {
        throw new Error('No se pudo cargar la biblioteca de Teachable Machine. Comprueba la conexión a Internet.');
      }
      const modelURL = new URL('./my_model/model.json', document.baseURI).href;
      const metadataURL = new URL('./my_model/metadata.json', document.baseURI).href;
      return globalThis.tmImage.load(modelURL, metadataURL);
    }).catch((error) => {
      modelPromise = null;
      throw error;
    });
  }
  return modelPromise;
}

export async function predictImage(imageElementOrCanvas) {
  const model = await loadModel();
  return model.predict(imageElementOrCanvas);
}

export async function startCamera(videoElement) {
  stopCamera();
  const generation = cameraGeneration;

  if (!globalThis.isSecureContext) {
    throw new Error('La cámara necesita HTTPS o una dirección local.');
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Este navegador no ofrece acceso a la cámara.');
  }

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
  } catch (error) {
    if (generation !== cameraGeneration) throw cameraCancelled();
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      throw new Error('Se ha denegado el permiso de acceso a la cámara.');
    }
    if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') {
      throw new Error('No se encontró una cámara disponible.');
    }
    throw new Error(`No se pudo acceder a la cámara: ${error.message || error}`);
  }

  const camera = { stream, video: videoElement };
  if (generation !== cameraGeneration) {
    releaseCamera(camera);
    throw cameraCancelled();
  }

  activeCamera = camera;
  try {
    videoElement.setAttribute('playsinline', '');
    videoElement.srcObject = stream;
    await videoElement.play();
    if (generation !== cameraGeneration) throw cameraCancelled();
  } catch (error) {
    releaseCamera(camera);
    if (activeCamera === camera) activeCamera = null;
    if (generation !== cameraGeneration) throw cameraCancelled();
    throw new Error(`No se pudo reproducir la cámara: ${error.message || error}`);
  }
}

export function captureFrame(videoElement) {
  if (!activeCamera || activeCamera.video !== videoElement ||
      videoElement.srcObject !== activeCamera.stream ||
      !videoElement.videoWidth || !videoElement.videoHeight) {
    throw new Error('La cámara aún no tiene una imagen disponible.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = videoElement.videoWidth;
  canvas.height = videoElement.videoHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No se pudo capturar la imagen de la cámara.');
  context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function stopCamera() {
  cameraGeneration += 1;
  const camera = activeCamera;
  activeCamera = null;
  releaseCamera(camera);
}
