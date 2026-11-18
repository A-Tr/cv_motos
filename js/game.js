const LABELS = ["PP", "PSOE", "Vox", "Sumar"];
const PHOTO_ROOT = "game/photos/";

let questions = null;
let loading = null;
let remaining = null;
let lastByLabel = null;
let current = null;
let hits = 0;
let attempts = 0;
let streak = 0;

function validateManifest(manifest) {
  if (!manifest || manifest.version !== 1 || !Array.isArray(manifest.photos) || !manifest.photos.length) {
    throw new Error("El manifiesto de fotos está vacío o tiene un formato inválido.");
  }

  const groups = Object.fromEntries(LABELS.map((label) => [label, []]));
  const seen = new Set();
  for (const photo of manifest.photos) {
    if (!photo || !LABELS.includes(photo.label) || typeof photo.src !== "string") {
      throw new Error("El manifiesto contiene una etiqueta o ruta inválida.");
    }

    let decoded;
    try {
      decoded = decodeURIComponent(photo.src);
    } catch {
      throw new Error("El manifiesto contiene una ruta inválida.");
    }
    const parts = decoded.split("/");
    if (!decoded.startsWith(PHOTO_ROOT) || /[\\?#\u0000-\u001f\u007f]/.test(decoded) ||
        parts.some((part) => !part || part === "." || part === "..") ||
        !/\.jpe?g$/i.test(decoded) || seen.has(decoded)) {
      throw new Error("El manifiesto contiene una ruta de foto inválida o duplicada.");
    }
    seen.add(decoded);
    groups[photo.label].push({ src: photo.src, label: photo.label });
  }

  if (LABELS.some((label) => groups[label].length === 0)) {
    throw new Error("El manifiesto debe contener fotos de las cuatro categorías.");
  }
  return groups;
}

// Comparte las cargas simultáneas, pero permite reintentar después de un error.
export function loadQuestions() {
  if (questions) return Promise.resolve();
  if (!loading) {
    loading = (async () => {
      const response = await fetch("game/photos.json");
      if (!response.ok) {
        throw new Error(`No se pudo cargar el manifiesto de fotos (HTTP ${response.status}).`);
      }
      questions = validateManifest(await response.json());
    })().finally(() => {
      loading = null;
    });
  }
  return loading;
}

export function newGame() {
  if (!questions) throw new Error("Carga las preguntas antes de comenzar una partida.");
  hits = 0;
  attempts = 0;
  streak = 0;
  current = null;
  remaining = Object.fromEntries(LABELS.map((label) => [label, []]));
  lastByLabel = Object.fromEntries(LABELS.map((label) => [label, null]));
  return nextQuestion();
}

export function nextQuestion() {
  if (!remaining) throw new Error("Comienza una partida antes de pedir una pregunta.");

  const label = LABELS[Math.floor(Math.random() * LABELS.length)];
  if (remaining[label].length === 0) {
    remaining[label] = questions[label].slice();
  }
  const pool = remaining[label];
  // En el inicio de un ciclo, evita la última foto del ciclo anterior si es posible.
  const candidates = pool.length > 1
    ? pool.filter((photo) => photo.src !== lastByLabel[label])
    : pool;
  const photo = candidates[Math.floor(Math.random() * candidates.length)];
  pool.splice(pool.indexOf(photo), 1);
  lastByLabel[label] = photo.src;
  current = { ...photo, answered: false };
  return { src: photo.src };
}

export function answer(className) {
  if (!current) throw new Error("No hay una pregunta activa.");
  if (current.answered) throw new Error("Esta pregunta ya se ha respondido.");
  if (!LABELS.includes(className)) throw new Error("La respuesta no es una categoría válida.");

  current.answered = true;
  const correct = className === current.label;
  attempts += 1;
  if (correct) {
    hits += 1;
    streak += 1;
  } else {
    streak = 0;
  }
  return { correct, correctLabel: current.label, hits, attempts, streak };
}
