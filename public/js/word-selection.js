import { state } from './state.js';
import { createCachedWordToken, hydrateCachedWords } from './dictionary-search.js';
import { cacheLibraryWordKeys } from './library.js';

const readerContent = document.querySelector('#reader-content');
const selectionToolbar = document.querySelector('#reader-selection-toolbar');
const selectionCount = document.querySelector('#reader-selection-count');
const joinSelectedWords = document.querySelector('#join-selected-words');
const selectionOutline = document.createElement('div');
selectionOutline.className = 'reader-selection-outline';
selectionOutline.hidden = true;
document.body.append(selectionOutline);

let dragStart = null;
let isDragging = false;
let suppressNextClick = false;
let selectedWords = [];

function clearSelection() {
  selectedWords = [];
  selectionOutline.hidden = true;
  selectionToolbar.hidden = true;
}

function updateSelectionOutline() {
  if (!selectedWords.length) {
    selectionOutline.hidden = true;
    return;
  }
  const bounds = selectedWords.reduce((result, word) => {
    const rect = word.getBoundingClientRect();
    return {
      left: Math.min(result.left, rect.left),
      right: Math.max(result.right, rect.right),
      top: Math.min(result.top, rect.top),
      bottom: Math.max(result.bottom, rect.bottom),
    };
  }, { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity });
  selectionOutline.style.left = `${bounds.left - 4}px`;
  selectionOutline.style.top = `${bounds.top - 3}px`;
  selectionOutline.style.width = `${bounds.right - bounds.left + 8}px`;
  selectionOutline.style.height = `${bounds.bottom - bounds.top + 6}px`;
  selectionOutline.hidden = false;
}

function updateSelectedWords(x) {
  const left = Math.min(dragStart.x, x);
  const right = Math.max(dragStart.x, x);
  const startRect = dragStart.word.getBoundingClientRect();
  const lineCenter = (startRect.top + startRect.bottom) / 2;
  const lineTolerance = Math.max(4, startRect.height * 0.55);
  const nextSelection = [...readerContent.querySelectorAll('.reader-word')].filter((word) => {
    const rect = word.getBoundingClientRect();
    const wordLineCenter = (rect.top + rect.bottom) / 2;
    return Math.abs(wordLineCenter - lineCenter) <= lineTolerance && rect.right >= left && rect.left <= right;
  });
  selectedWords = nextSelection;
  joinSelectedWords.disabled = selectedWords.length < 2 || !selectionIsContiguous();
  joinSelectedWords.textContent = 'Unir';
  updateSelectionOutline();
}

function selectionIsContiguous() {
  const wrappers = selectedWords.map((word) => word.closest('.word-wrap'));
  if (wrappers.length < 2 || wrappers.some((wrapper) => wrapper.parentElement !== wrappers[0].parentElement)) return false;
  for (let index = 0; index < wrappers.length - 1; index++) {
    let node = wrappers[index].nextSibling;
    while (node && node !== wrappers[index + 1]) {
      if (node.nodeType !== Node.TEXT_NODE || node.textContent.trim()) return false;
      node = node.nextSibling;
    }
    if (node !== wrappers[index + 1]) return false;
  }
  return true;
}

function replaceSelectedWordsWithCombinedToken(parts) {
  const selectedTokens = selectedWords.map((word) => JSON.parse(word.dataset.token));
  const combinedSurface = parts.join('');
  const combinedToken = {
    surface: combinedSurface,
    dictionaryForm: combinedSurface,
    reading: selectedTokens.map((token) => token.reading || '').join(''),
    partOfSpeech: selectedTokens[0].partOfSpeech,
  };
  const firstWrapper = selectedWords[0].closest('.word-wrap');
  const lastWrapper = selectedWords.at(-1).closest('.word-wrap');
  const cachedToken = createCachedWordToken(combinedToken);
  const afterSelection = lastWrapper.nextSibling;
  let node = firstWrapper.nextSibling;
  while (node && node !== afterSelection) {
    const nextNode = node.nextSibling;
    node.remove();
    node = nextNode;
  }
  firstWrapper.replaceWith(cachedToken);
  hydrateCachedWords(readerContent);
  return combinedToken;
}

function createCachedDocumentHtml() {
  const copy = readerContent.cloneNode(true);
  for (const button of [...copy.querySelectorAll('.reader-word')]) {
    try {
      const token = JSON.parse(button.dataset.token);
      button.closest('.word-wrap').replaceWith(createCachedWordToken(token));
    } catch {
      button.closest('.word-wrap')?.replaceWith(document.createTextNode(button.textContent));
    }
  }
  return copy.innerHTML;
}

function showSelectionToolbar() {
  if (selectedWords.length < 2) {
    selectionToolbar.hidden = true;
    return;
  }

  selectionCount.textContent = `${selectedWords.length} palavras selecionadas`;
  selectionToolbar.hidden = false;
  const bounds = selectedWords.reduce((result, word) => {
    const rect = word.getBoundingClientRect();
    return {
      left: Math.min(result.left, rect.left),
      right: Math.max(result.right, rect.right),
      top: Math.min(result.top, rect.top),
      bottom: Math.max(result.bottom, rect.bottom),
    };
  }, { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity });
  const toolbarRect = selectionToolbar.getBoundingClientRect();
  const left = Math.max(12, Math.min(bounds.left, window.innerWidth - toolbarRect.width - 12));
  const below = bounds.bottom + 10;
  const top = below + toolbarRect.height <= window.innerHeight - 12
    ? below
    : Math.max(12, bounds.top - toolbarRect.height - 10);
  selectionToolbar.style.left = `${left}px`;
  selectionToolbar.style.top = `${top}px`;
}

export function initializeWordSelection() {
  readerContent.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const word = event.target.closest('.reader-word');
    if (!word || !readerContent.contains(word)) {
      clearSelection();
      return;
    }
    clearSelection();
    dragStart = { x: event.clientX, y: event.clientY, word };
    isDragging = false;
  });

  document.addEventListener('pointermove', (event) => {
    if (!dragStart || event.buttons !== 1) return;
    if (!isDragging && Math.hypot(event.clientX - dragStart.x, event.clientY - dragStart.y) < 5) return;
    if (!isDragging) {
      isDragging = true;
      readerContent.classList.add('is-word-dragging');
      state.actions.closeWordPopover?.();
    }
    updateSelectedWords(event.clientX);
  });

  document.addEventListener('pointerup', () => {
    if (!dragStart) return;
    if (isDragging) {
      suppressNextClick = true;
      readerContent.classList.remove('is-word-dragging');
      showSelectionToolbar();
    }
    dragStart = null;
    isDragging = false;
  });

  document.addEventListener('pointercancel', () => {
    dragStart = null;
    isDragging = false;
    readerContent.classList.remove('is-word-dragging');
    clearSelection();
  });

  document.addEventListener('click', (event) => {
    if (!suppressNextClick) return;
    suppressNextClick = false;
    if (!readerContent.contains(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  document.addEventListener('pointerdown', (event) => {
    if (selectedWords.length && !readerContent.contains(event.target) && !selectionToolbar.contains(event.target)) {
      clearSelection();
    }
  });

  window.addEventListener('resize', () => {
    if (!selectionToolbar.hidden) showSelectionToolbar();
  });

  joinSelectedWords.addEventListener('click', async () => {
    if (joinSelectedWords.disabled || !selectionIsContiguous()) return;
    const parts = selectedWords.map((word) => {
      try {
        return JSON.parse(word.dataset.token).surface;
      } catch {
        return '';
      }
    });
    if (parts.some((part) => !part)) return;

    joinSelectedWords.disabled = true;
    joinSelectedWords.textContent = 'Salvando…';
    try {
      const response = await fetch('/api/word-merges', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ parts }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível salvar a união.');

      replaceSelectedWordsWithCombinedToken(parts);
      const processedContent = createCachedDocumentHtml();
      const text = state.currentDocument;
      const cacheResponse = await fetch(`/api/texts/${text.id}/parsed`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ processedContent, title: text.name }),
      });
      const cacheResult = await cacheResponse.json();
      if (!cacheResponse.ok) throw new Error(cacheResult.error || 'A regra foi salva, mas este texto não foi atualizado.');
      text.processedContent = { html: processedContent, title: text.name };
      cacheLibraryWordKeys(text.id, processedContent);

      selectedWords = [];
      selectionOutline.hidden = true;
      selectionCount.textContent = result.created
        ? 'União aplicada e salva para próximas importações'
        : 'União aplicada; regra já estava salva';
      joinSelectedWords.textContent = 'Salvo';
      window.setTimeout(clearSelection, 2600);
    } catch (error) {
      selectionCount.textContent = error.message || 'Não foi possível salvar a união.';
      joinSelectedWords.textContent = 'Tentar novamente';
      joinSelectedWords.disabled = false;
    }
  });
}
