// Contrato DOM: nav-recognize/nav-game seleccionan recognize-view/game-view;
// preview, camera-video, image-file, start-camera, capture, stop-camera,
// reset-recognize, recognize-status y results gestionan reconocimiento;
// game-image, answers, score, game-status, new-game, next-question,
// retry-game, skip-photo y game-card gestionan la partida.
import { predictImage, startCamera, captureFrame, stopCamera } from './classifier.js';
import { loadQuestions, newGame, nextQuestion, answer } from './game.js';

const $ = id => document.getElementById(id);
const colors = { PP: '#1764bc', PSOE: '#ba2943', Vox: '#237a48', Sumar: '#8547bc' };
const video = $('camera-video');
let view = 'recognize', operation = 0, objectURL = null, gameStarted = false, questionId = 0;

function clearUpload() {
  if (objectURL) URL.revokeObjectURL(objectURL);
  objectURL = null;
  $('image-file').value = '';
}
function resetResults() {
  const p = document.createElement('p');
  p.className = 'empty';
  p.textContent = 'Los resultados aparecerán después de analizar una imagen.';
  $('results').replaceChildren(p);
}
function cameraControls(active) {
  $('start-camera').hidden = active;
  $('capture').hidden = !active;
  $('stop-camera').hidden = !active;
  $('start-camera').disabled = false;
  $('capture').disabled = false;
}
function clearRecognition() {
  operation++;
  stopCamera();
  clearUpload();
  video.hidden = true;
  $('preview').replaceChildren(Object.assign(document.createElement('span'), { textContent: 'La imagen aparecerá aquí' }));
  cameraControls(false);
  resetResults();
  $('recognize-status').textContent = '';
}
function setView(next) {
  if (view === next) return;
  if (view === 'recognize') clearRecognition();
  view = next;
  $('recognize-view').hidden = next !== 'recognize';
  $('game-view').hidden = next !== 'game';
  for (const name of ['recognize', 'game']) {
    const button = $(`nav-${name}`);
    if (name === next) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  if (next === 'game' && !gameStarted) startGame();
}
$('nav-recognize').addEventListener('click', () => setView('recognize'));
$('nav-game').addEventListener('click', () => setView('game'));
$('reset-recognize').addEventListener('click', clearRecognition);
window.addEventListener('pagehide', clearRecognition);

function renderResults(predictions) {
  $('results').replaceChildren();
  for (const { className, probability } of predictions) {
    const percent = Math.max(0, Math.min(100, probability * 100));
    const row = document.createElement('div'); row.className = 'result';
    row.style.setProperty('--bar-color', colors[className] || '#606b7e');
    const heading = document.createElement('div'); heading.className = 'result-heading';
    const name = document.createElement('span'); name.textContent = className;
    const value = document.createElement('span'); value.textContent = `${percent.toFixed(1)} %`;
    heading.append(name, value);
    const bar = document.createElement('div'); bar.className = 'bar';
    bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-label', className);
    bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', '100'); bar.setAttribute('aria-valuenow', percent.toFixed(1));
    const fill = document.createElement('div'); fill.className = 'bar-fill'; fill.style.width = `${percent}%`;
    bar.append(fill); row.append(heading, bar); $('results').append(row);
  }
}
async function classify(element, token) {
  $('recognize-status').textContent = 'Cargando el modelo y analizando la imagen…';
  try {
    const predictions = await predictImage(element);
    if (token !== operation || view !== 'recognize') return;
    renderResults(predictions);
    $('recognize-status').textContent = 'Imagen analizada.';
  } catch (error) {
    if (token === operation && view === 'recognize') $('recognize-status').textContent = `No se pudo clasificar: ${error.message || error}. Comprueba la conexión y vuelve a intentarlo.`;
  }
}
$('image-file').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  operation++; const token = operation;
  stopCamera(); cameraControls(false); video.hidden = true;
  if (objectURL) URL.revokeObjectURL(objectURL);
  objectURL = null; resetResults();
  $('preview').replaceChildren();
  if (!file.type.startsWith('image/')) {
    $('recognize-status').textContent = 'Selecciona un archivo de imagen válido.';
    event.target.value = ''; return;
  }
  objectURL = URL.createObjectURL(file);
  const image = new Image(); image.alt = 'Vista previa de la imagen seleccionada';
  image.onload = () => { if (token === operation) { $('preview').replaceChildren(image); classify(image, token); } };
  image.onerror = () => { if (token === operation) $('recognize-status').textContent = 'No se pudo abrir la imagen. Selecciona otro archivo.'; };
  $('recognize-status').textContent = 'Abriendo imagen…';
  image.src = objectURL;
});
$('start-camera').addEventListener('click', async () => {
  clearRecognition(); const token = operation;
  $('start-camera').disabled = true;
  $('recognize-status').textContent = 'Solicitando acceso a la cámara…';
  try {
    await startCamera(video);
    if (token !== operation || view !== 'recognize') return;
    video.hidden = false; $('preview').replaceChildren(video);
    cameraControls(true); $('recognize-status').textContent = 'Cámara activa. Pulsa «Tomar foto» cuando quieras.';
  } catch (error) {
    if (token === operation) { cameraControls(false); $('recognize-status').textContent = `No se pudo iniciar la cámara: ${error.message || error}`; }
  }
});
$('stop-camera').addEventListener('click', clearRecognition);
$('capture').addEventListener('click', () => {
  const token = ++operation;
  try {
    const frame = captureFrame(video);
    stopCamera(); video.hidden = true; $('preview').replaceChildren(frame);
    cameraControls(false); resetResults(); classify(frame, token);
  } catch (error) { $('recognize-status').textContent = `No se pudo tomar la foto: ${error.message || error}`; }
});

const answerButtons = [...$('answers').querySelectorAll('button')];
function disableAnswers(disabled) { answerButtons.forEach(button => { button.disabled = disabled; }); }
function displayQuestion(question) {
  const id = ++questionId;
  $('game-card').classList.remove('celebrate');
  answerButtons.forEach(button => button.classList.remove('correct', 'wrong'));
  disableAnswers(true);
  $('next-question').hidden = true; $('retry-game').hidden = true; $('skip-photo').hidden = true;
  $('game-status').textContent = 'Cargando foto…';
  const image = $('game-image'); image.hidden = true;
  image.onload = () => { if (id === questionId) { image.hidden = false; disableAnswers(false); $('game-status').textContent = 'Elige una respuesta.'; } };
  image.onerror = () => { if (id === questionId) { image.hidden = true; disableAnswers(true); $('game-status').textContent = 'No se pudo cargar esta foto. Puedes saltarla sin responder.'; $('skip-photo').hidden = false; } };
  image.src = question.src;
}
async function startGame() {
  const id = ++questionId;
  gameStarted = false; disableAnswers(true);
  $('game-image').hidden = true; $('next-question').hidden = true; $('skip-photo').hidden = true; $('retry-game').hidden = true;
  $('game-status').textContent = 'Cargando fotos…';
  try {
    await loadQuestions();
    if (id !== questionId) return;
    const question = newGame(); gameStarted = true;
    $('score').textContent = 'Aciertos: 0 / 0 · Racha: 0';
    $('score').classList.remove('streak-hot');
    displayQuestion(question);
  } catch (error) {
    if (id !== questionId) return;
    $('game-status').textContent = `No se pudieron cargar las preguntas: ${error.message || error}. Comprueba que el manifiesto y las fotos estén publicados.`;
    $('retry-game').hidden = false;
  }
}
$('new-game').addEventListener('click', startGame);
$('retry-game').addEventListener('click', startGame);
$('next-question').addEventListener('click', () => displayQuestion(nextQuestion()));
$('skip-photo').addEventListener('click', () => displayQuestion(nextQuestion()));
answerButtons.forEach(button => button.addEventListener('click', () => {
  try {
    const result = answer(button.dataset.answer);
    disableAnswers(true);
    answerButtons.find(item => item.dataset.answer === result.correctLabel).classList.add('correct');
    if (!result.correct) button.classList.add('wrong');
    $('score').textContent = `Aciertos: ${result.hits} / ${result.attempts} · Racha: ${result.streak}`;
    $('score').classList.toggle('streak-hot', result.streak >= 3);
    $('game-status').textContent = result.correct ? `¡Correcto! Racha: ${result.streak}.` : `Incorrecto. La respuesta es ${result.correctLabel}.`;
    if (result.correct) { $('game-card').classList.remove('celebrate'); void $('game-card').offsetWidth; $('game-card').classList.add('celebrate'); }
    $('next-question').hidden = false;
  } catch (error) { $('game-status').textContent = error.message || String(error); }
}));
