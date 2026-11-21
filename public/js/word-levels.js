import { state } from './state.js';

const readerContent = document.querySelector('#reader-content');

export async function saveWordLevel(word, level) {
  const response = await fetch('/api/word-levels', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ word, level }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Não foi possível salvar o nível.');

  state.wordLevels = result.words;
  state.actions.applyWordLevels?.(readerContent);
  state.documents.forEach((record) => state.actions.updateDocumentLevelSummary?.(record.id));
  if (!document.querySelector('#page-palavras').hidden) void state.actions.loadWordsPage?.();
}
