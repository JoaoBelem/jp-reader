import { cacheLibraryWordKeys, refreshLibrary } from './library.js';
import { isNumberOnly } from './helpers.js';
import { state } from './state.js';
import { setPage } from './settings.js';
import { closeWordPopover, createCachedWordToken, hydrateCachedWords } from './dictionary-search.js';

const readerContent = document.querySelector('#reader-content');
const readerTitle = document.querySelector('#reader-title');
const readerEditor = document.querySelector('#reader-editor');
const readerTextEditor = document.querySelector('#reader-text-editor');
const readerTitleEditor = document.querySelector('#reader-title-editor');
const readerEditStatus = document.querySelector('#reader-edit-status');
const editReaderButton = document.querySelector('#edit-reader-button');
const cancelReaderEdit = document.querySelector('#cancel-reader-edit');
const saveReaderEdit = document.querySelector('#save-reader-edit');

async function tokenizeTexts(texts) {
  const response = await fetch('/api/tokenize', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ texts }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Não foi possível analisar o texto.');
  return result.results;
}

function isWhitespace(token) {
  return token.partOfSpeech === '空白';
}

function isPunctuation(token) {
  return token.partOfSpeech === '補助記号';
}

function renderTokens(tokens) {
  const fragment = document.createDocumentFragment();
  let previousType = 'start';
  let wordCount = 0;

  for (const token of tokens) {
    if (isWhitespace(token) || isPunctuation(token)) {
      fragment.append(document.createTextNode(token.surface));
      previousType = isWhitespace(token) ? 'space' : 'punctuation';
      continue;
    }

    if (previousType === 'word' || previousType === 'punctuation') {
      fragment.append(document.createTextNode(' '));
    }
    if (isNumberOnly(token.surface)) {
      fragment.append(document.createTextNode(token.surface));
    } else {
      fragment.append(createCachedWordToken(token));
      wordCount++;
    }
    previousType = 'word';
  }
  return { fragment, wordCount };
}

async function buildReader(file, providedText, target = readerContent) {
  const rawText = providedText ?? await file.text();
  target.replaceChildren();
  const [result] = await tokenizeTexts([rawText]);
  const rendered = renderTokens(result.tokens);
  target.append(rendered.fragment);

  const title = file.name;
  const processedContent = target.innerHTML;
  if (target === readerContent) {
    readerTitle.textContent = title;
    hydrateCachedWords(readerContent);
  }
  return { processedContent, wordCount: rendered.wordCount, name: title };
}

function filterNumberTokens(container) {
  for (const button of container.querySelectorAll('.reader-word')) {
    if (!isNumberOnly(button.textContent)) continue;
    button.closest('.word-wrap').replaceWith(document.createTextNode(button.textContent));
  }
}

function beginReaderEdit() {
  if (!state.currentDocument) return;
  readerEditStatus.textContent = '';
  readerContent.hidden = true;
  readerEditor.hidden = false;
  editReaderButton.hidden = true;
  readerTextEditor.hidden = false;
  readerTextEditor.value = state.currentDocument.processedContent?.html
    ? new DOMParser().parseFromString(state.currentDocument.processedContent.html, 'text/html').body.textContent
    : state.currentDocument.content ?? '';
  readerTitleEditor.value = state.currentDocument.processedContent?.title || state.currentDocument.name;
  readerTitleEditor.focus();
}

function cancelReaderEditing() {
  readerEditor.hidden = true;
  readerContent.hidden = false;
  editReaderButton.hidden = false;
  readerEditStatus.textContent = '';
}

function getEditedDocumentPayload() {
  const previousDocument = new DOMParser().parseFromString(state.currentDocument.processedContent?.html ?? '', 'text/html');
  const previousTokens = new Map();
  for (const element of previousDocument.querySelectorAll('[data-cached-word]')) {
    try {
      const token = JSON.parse(element.dataset.cachedWord);
      const matchingTokens = previousTokens.get(token.surface) ?? [];
      matchingTokens.push(token);
      previousTokens.set(token.surface, matchingTokens);
    } catch {
      // Skip malformed metadata and keep the rest of the text editable.
    }
  }

  const punctuation = new Set([...'、。，．！？!?「」『』（）()[]［］【】…‥・：；:']);
  const characters = [...readerTextEditor.value];
  const fragment = document.createDocumentFragment();
  let index = 0;
  while (index < characters.length) {
    const first = characters[index];
    const isSpace = /\s/u.test(first);
    const isPunctuation = punctuation.has(first);
    let end = index + 1;
    while (end < characters.length) {
      const next = characters[end];
      const sameGroup = isSpace
        ? /\s/u.test(next)
        : isPunctuation
          ? punctuation.has(next)
          : !/\s/u.test(next) && !punctuation.has(next);
      if (!sameGroup) break;
      end++;
    }

    const surface = characters.slice(index, end).join('');
    if (isSpace || isPunctuation) {
      fragment.append(document.createTextNode(surface));
    } else {
      const token = previousTokens.get(surface)?.shift() ?? {
        surface,
        dictionaryForm: surface,
        reading: '',
        partOfSpeech: '名詞',
      };
      fragment.append(createCachedWordToken(token));
    }
    index = end;
  }

  const container = document.createElement('div');
  container.append(fragment);
  return {
    processedContent: container.innerHTML,
    title: readerTitleEditor.value.trim().replace(/\.txt$/iu, '') || state.currentDocument.name,
  };
}

async function saveReaderEditing() {
  if (!state.currentDocument) return;
  saveReaderEdit.disabled = true;
  cancelReaderEdit.disabled = true;
  readerEditStatus.textContent = 'Salvando alterações…';

  try {
    const response = await fetch(`/api/texts/${state.currentDocument.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(getEditedDocumentPayload()),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Não foi possível salvar as alterações.');

    const updatedRecord = result.text ?? state.currentDocument;
    readerEditor.hidden = true;
    readerContent.hidden = false;
    readerEditStatus.textContent = '';
    editReaderButton.hidden = false;
    await refreshLibrary({ summaries: false });
    await loadDocument(updatedRecord);
  } catch (error) {
    readerEditStatus.textContent = error.message || 'Não foi possível salvar as alterações.';
  } finally {
    saveReaderEdit.disabled = false;
    cancelReaderEdit.disabled = false;
  }
}

export async function openDocument(record, editAfterLoad = false) {
  await loadDocument(record);
  if (editAfterLoad && state.currentDocument?.id === record.id) beginReaderEdit();
}

async function loadDocument(record) {
  closeWordPopover();
  state.currentDocument = null;
  readerEditor.hidden = true;
  readerContent.hidden = false;
  editReaderButton.hidden = true;
  readerTitle.textContent = record.name;
  readerContent.replaceChildren();
  setPage('reader');

  const progress = document.createElement('div');
  progress.className = 'reader-progress';
  progress.setAttribute('role', 'status');
  progress.setAttribute('aria-live', 'polite');
  const spinner = document.createElement('span');
  spinner.className = 'reader-progress-spinner';
  spinner.setAttribute('aria-hidden', 'true');
  const progressText = document.createElement('span');
  progressText.textContent = 'Carregando texto…';
  progress.append(spinner, progressText);
  readerContent.append(progress);

  try {
    const [textResponse, levelsResponse] = await Promise.all([
      fetch(`/api/texts/${record.id}`, { cache: 'no-store' }),
      fetch('/api/word-levels', { cache: 'no-store' }),
    ]);
    const [textResult, levelsResult] = await Promise.all([textResponse.json(), levelsResponse.json()]);
    if (!textResponse.ok) throw new Error(textResult.error || 'Não foi possível abrir o texto.');
    if (!levelsResponse.ok) throw new Error(levelsResult.error || 'Não foi possível carregar os níveis das palavras.');

    state.wordLevels = levelsResult.words;
    state.currentDocument = {
      ...record,
      name: textResult.name,
      extension: textResult.extension,
      content: textResult.content,
      processedContent: textResult.processedContent,
    };

    if (typeof textResult.processedContent?.html === 'string') {
      readerTitle.textContent = textResult.processedContent.title || textResult.name;
      readerContent.innerHTML = textResult.processedContent.html;
      hydrateCachedWords(readerContent);
      cacheLibraryWordKeys(record.id, textResult.processedContent.html);
    } else {
      progressText.textContent = 'Analisando e separando as palavras…';
      const parsed = await buildReader({ name: textResult.name }, textResult.content);
      state.currentDocument.processedContent = { html: parsed.processedContent, title: parsed.name };
      cacheLibraryWordKeys(record.id, parsed.processedContent);
      try {
        await fetch(`/api/texts/${record.id}/parsed`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ processedContent: parsed.processedContent, title: parsed.name }),
        });
      } catch {
        // The reader remains available if saving the cached version fails.
      }
    }

    filterNumberTokens(readerContent);
    editReaderButton.hidden = false;
  } catch (error) {
    readerContent.textContent = error.message || 'Não foi possível abrir o texto.';
  }
}

export function initializeReader() {
  state.actions.openDocument = openDocument;
  editReaderButton.addEventListener('click', beginReaderEdit);
  cancelReaderEdit.addEventListener('click', cancelReaderEditing);
  saveReaderEdit.addEventListener('click', () => void saveReaderEditing());
  document.querySelector('#back-to-library').addEventListener('click', () => setPage('meus-textos'));
}
