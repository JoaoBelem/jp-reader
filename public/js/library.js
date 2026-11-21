import { formatFileSize } from './helpers.js';
import { familiarityNames, state } from './state.js';

const fileInput = document.querySelector('#file-input');
const dropZone = document.querySelector('#drop-zone');
const selectedFile = document.querySelector('#selected-file');
const pasteText = document.querySelector('#paste-text');
const importForm = document.querySelector('#import-form');
const importModal = document.querySelector('#import-modal');
const closeImportModalButton = document.querySelector('#close-import-modal');
const fileImportPanel = document.querySelector('#file-import-panel');
const pasteImportPanel = document.querySelector('#paste-import-panel');
const importButton = document.querySelector('#import-button');
const importStatus = document.querySelector('#import-status');
const libraryStatus = document.querySelector('#library-status');
const importScreen = document.querySelector('#import-screen');
const emptyLibrary = document.querySelector('#empty-library');
const addTextButton = document.querySelector('#add-text-button');
const emptyAddTextButton = document.querySelector('#empty-add-text-button');
const cancelImportButton = document.querySelector('#cancel-import-button');
const libraryList = document.querySelector('#library-list');
const documentsList = document.querySelector('#documents-list');

function renderLibrary() {
  documentsList.replaceChildren();
  libraryList.hidden = state.documents.length === 0;
  importScreen.classList.toggle('has-documents', state.documents.length > 0);
  emptyLibrary.hidden = state.documents.length > 0;

  addTextButton.hidden = state.documents.length === 0;

  for (const record of state.documents) {
    const row = document.createElement('div');
    row.className = 'document-row';
    row.dataset.readId = record.id;
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.setAttribute('aria-label', `Abrir ${record.name}`);

    const info = document.createElement('div');
    info.className = 'document-info';
    const name = document.createElement('div');
    name.className = 'document-name';
    name.textContent = record.name;
    const count = document.createElement('div');
    count.className = 'document-count';
    count.textContent = `${record.extension.toUpperCase()} · ${formatFileSize(record.size)}`;

    const levelSummary = document.createElement('div');
    levelSummary.className = 'document-level-summary';
    levelSummary.setAttribute('aria-label', 'Palavras únicas por nível de familiaridade');
    for (let level = 0; level <= 5; level++) {
      const badge = document.createElement('span');
      badge.className = `document-level-badge level-${level}`;
      badge.dataset.summaryLevel = String(level);
      badge.title = `${level} · ${familiarityNames[level]}`;
      badge.textContent = '—';
      levelSummary.append(badge);
    }
    info.append(name, count, levelSummary);

    const unknownPercent = document.createElement('div');
    unknownPercent.className = 'document-unknown-percent';
    unknownPercent.dataset.unknownPercent = '';
    unknownPercent.textContent = '—';

    const actions = document.createElement('div');
    actions.className = 'document-actions';
    actions.append(
      createActionButton('icon-action', '✏️', record, 'editId', `Editar ${record.name}`, 'Editar texto'),
      createActionButton('icon-action delete-text-button', '×', record, 'deleteId', `Excluir ${record.name}`, 'Excluir texto'),
    );

    row.append(info, unknownPercent, actions);
    documentsList.append(row);
  }
}

function createActionButton(className, label, record, dataKey, ariaLabel = label, title = '') {
  const button = document.createElement('button');
  button.className = className;
  button.type = 'button';
  button.textContent = label;
  button.dataset[dataKey] = record.id;
  button.setAttribute('aria-label', ariaLabel);
  if (title) button.title = title;
  return button;
}

export async function refreshLibrary({ summaries = true } = {}) {
  const response = await fetch('/api/texts', { cache: 'no-store' });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Não foi possível carregar a biblioteca.');

  state.documents = result.texts;
  renderLibrary();
  if (summaries) void loadLibraryLevelSummaries();
}

async function loadLibraryLevelSummaries() {
  try {
    const [levelsResponse, ...textResponses] = await Promise.all([
      fetch('/api/word-levels', { cache: 'no-store' }),
      ...state.documents.map((record) => fetch(`/api/texts/${record.id}?summary=1`, { cache: 'no-store' })),
    ]);
    const [levelsResult, ...textResults] = await Promise.all([
      levelsResponse.json(),
      ...textResponses.map((response) => response.json()),
    ]);
    if (!levelsResponse.ok) return;

    state.wordLevels = levelsResult.words;
    for (let index = 0; index < state.documents.length; index++) {
      const processedContent = textResults[index]?.processedContent;
      if (typeof processedContent?.html === 'string') {
        cacheLibraryWordKeys(state.documents[index].id, processedContent.html);
      } else {
        updateDocumentLevelSummary(state.documents[index].id);
      }
    }
  } catch {
    // Keep the library usable when a text cannot be parsed for its summary.
  }
}

export function updateDocumentLevelSummary(documentId) {
  const row = [...documentsList.children].find((item) => item.dataset.readId === documentId);
  if (!row) return;

  const totals = [0, 0, 0, 0, 0, 0];
  if (!state.libraryTokenKeys.has(documentId)) {
    row.querySelectorAll('[data-summary-level]').forEach((badge) => { badge.textContent = '—'; });
    row.querySelector('[data-unknown-percent]').textContent = '—';
    return;
  }

  const keys = state.libraryTokenKeys.get(documentId) ?? [];
  for (const key of keys) {
    const level = Number(state.wordLevels[key] ?? 0);
    if (level >= 0 && level <= 5) totals[level]++;
  }

  row.querySelectorAll('[data-summary-level]').forEach((badge) => {
    const level = Number(badge.dataset.summaryLevel);
    badge.textContent = String(totals[level]);
    badge.title = `${level} · ${familiarityNames[level]}: ${totals[level]} ${totals[level] === 1 ? 'palavra' : 'palavras'}`;
  });

  const percentage = keys.length ? Math.round((totals[0] / keys.length) * 100) : 0;
  const percentLabel = row.querySelector('[data-unknown-percent]');
  percentLabel.textContent = `${percentage}% desconhecidas`;
  percentLabel.title = `${totals[0]} de ${keys.length} palavras únicas ainda sem nível`;
}

export function cacheLibraryWordKeys(documentId, processedContent) {
  const parsedDocument = new DOMParser().parseFromString(processedContent, 'text/html');
  const keys = new Set();
  for (const cachedWord of parsedDocument.querySelectorAll('[data-cached-word]')) {
    try {
      const token = JSON.parse(cachedWord.dataset.cachedWord);
      keys.add(token.dictionaryForm || token.surface);
    } catch {
      // Skip invalid cached metadata and keep the remaining summary usable.
    }
  }
  state.libraryTokenKeys.set(documentId, [...keys]);
  updateDocumentLevelSummary(documentId);
}

function chooseFile(file) {
  if (!file) return;
  const extension = file.name.split('.').pop().toLowerCase();
  if (extension !== 'txt') {
    state.currentFile = null;
    selectedFile.textContent = '';
    importStatus.textContent = 'Escolha um arquivo TXT.';
    updateImportAvailability();
    return;
  }

  state.currentFile = file;
  fileInput.value = '';
  selectedFile.textContent = file.name.replace(/\.txt$/iu, '');
  importStatus.textContent = '';
  updateImportAvailability();
}

function selectedImportMode() {
  return document.querySelector('input[name="import-mode"]:checked')?.value ?? 'file';
}

function updateImportAvailability() {
  importButton.disabled = selectedImportMode() === 'file'
    ? !state.currentFile
    : !pasteText.value.trim();
}

function setImportMode(mode) {
  const useFile = mode === 'file';
  fileImportPanel.hidden = !useFile;
  pasteImportPanel.hidden = useFile;
  state.currentFile = null;
  fileInput.value = '';
  selectedFile.textContent = '';
  if (useFile) pasteText.value = '';
  importStatus.textContent = '';
  updateImportAvailability();
}

function openImportModal() {
  state.currentFile = null;
  fileInput.value = '';
  pasteText.value = '';
  selectedFile.textContent = '';
  importStatus.textContent = '';
  document.querySelector('input[name="import-mode"][value="file"]').checked = true;
  setImportMode('file');
  importModal.hidden = false;
  importModal.querySelector('input[name="import-mode"]:checked').focus();
}

function closeImportModal() {
  if (importButton.dataset.busy === 'true') return;
  importModal.hidden = true;
  state.currentFile = null;
  fileInput.value = '';
  pasteText.value = '';
  selectedFile.textContent = '';
  importStatus.textContent = '';
  updateImportAvailability();
}

function setImportBusy(isBusy) {
  importButton.dataset.busy = String(isBusy);
  importButton.disabled = isBusy || (selectedImportMode() === 'file' ? !state.currentFile : !pasteText.value.trim());
  cancelImportButton.disabled = isBusy;
  closeImportModalButton.disabled = isBusy;
  importModal.querySelectorAll('input[name="import-mode"]').forEach((option) => { option.disabled = isBusy; });
  pasteText.disabled = isBusy;
}

async function deleteDocument(record) {
  if (!window.confirm(`Excluir "${record.name}" da biblioteca?`)) return;
  const response = await fetch(`/api/texts/${record.id}`, { method: 'DELETE' });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Não foi possível excluir o texto.');

  state.documents = state.documents.filter((item) => item.id !== record.id);
  state.libraryTokenKeys.delete(record.id);
  renderLibrary();
}

export function initializeLibrary({ openDocument }) {
  state.actions.refreshLibrary = refreshLibrary;
  state.actions.updateDocumentLevelSummary = updateDocumentLevelSummary;

  addTextButton.addEventListener('click', openImportModal);
  emptyAddTextButton.addEventListener('click', openImportModal);
  cancelImportButton.addEventListener('click', closeImportModal);
  closeImportModalButton.addEventListener('click', closeImportModal);
  importModal.addEventListener('click', (event) => {
    if (event.target === importModal) closeImportModal();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !importModal.hidden) closeImportModal();
  });
  importModal.querySelectorAll('input[name="import-mode"]').forEach((option) => {
    option.addEventListener('change', () => setImportMode(option.value));
  });
  pasteText.addEventListener('input', updateImportAvailability);

  fileInput.addEventListener('change', () => chooseFile(fileInput.files[0]));
  for (const eventName of ['dragenter', 'dragover']) {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.add('is-dragging');
    });
  }
  for (const eventName of ['dragleave', 'drop']) {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.remove('is-dragging');
    });
  }
  dropZone.addEventListener('drop', (event) => chooseFile(event.dataTransfer.files[0]));

  importForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const file = selectedImportMode() === 'file' ? state.currentFile : null;
    setImportBusy(true);
    importStatus.textContent = 'Salvando e analisando texto…';
    try {
      const content = file ? await file.text() : pasteText.value;
      if (!content.trim()) throw new Error('Adicione um arquivo ou cole um texto antes de importar.');
      const name = file?.name ?? 'Texto colado.txt';
      const response = await fetch('/api/texts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, content }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível salvar o texto.');

      state.currentFile = null;
      selectedFile.textContent = '';
      importStatus.textContent = '';
      importModal.hidden = true;
      pasteText.value = '';
      setImportBusy(false);
      await refreshLibrary({ summaries: false });
      await openDocument(result.text);
    } catch (error) {
      importStatus.textContent = error.message || 'Não foi possível importar o texto.';
      setImportBusy(false);
    }
  });

  documentsList.addEventListener('click', (event) => {
    const editButton = event.target.closest('[data-edit-id]');
    const deleteButton = event.target.closest('[data-delete-id]');
    const row = event.target.closest('.document-row[data-read-id]');
    const documentId = editButton?.dataset.editId ?? deleteButton?.dataset.deleteId ?? row?.dataset.readId;
    if (!documentId) return;

    const record = state.documents.find((item) => item.id === documentId);
    if (!record) return;
    if (editButton) void openDocument(record, true);
    else if (deleteButton) void deleteDocument(record).catch((error) => { libraryStatus.textContent = error.message; });
    else void openDocument(record);
  });

  documentsList.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const row = event.target.closest('.document-row[data-read-id]');
    if (!row || event.target !== row) return;
    event.preventDefault();
    const record = state.documents.find((item) => item.id === row.dataset.readId);
    if (record) void openDocument(record);
  });
}
