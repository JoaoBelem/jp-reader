import { familiarityNames, state } from './state.js';

const wordsLevelFilter = document.querySelector('#words-level-filter');
const wordsOverview = document.querySelector('#words-overview');
const wordsStatus = document.querySelector('#words-status');
const wordsList = document.querySelector('#words-list');
const wordsPagination = document.querySelector('#words-pagination');
const wordsPageLabel = document.querySelector('#words-page-label');
const wordsPrevious = document.querySelector('#words-previous');
const wordsNext = document.querySelector('#words-next');

function renderWordsOverview(counts) {
  wordsOverview.replaceChildren();
  for (let level = 1; level <= 5; level++) {
    const badge = document.createElement('span');
    badge.className = `words-count-badge level-${level}`;
    badge.title = `${familiarityNames[level]}: ${counts[level] ?? 0}`;

    const levelName = document.createElement('span');
    levelName.textContent = `${level} · ${familiarityNames[level]}`;
    const total = document.createElement('strong');
    total.textContent = String(counts[level] ?? 0);

    badge.append(levelName, total);
    wordsOverview.append(badge);
  }
}

export async function loadWordsPage() {
  wordsStatus.textContent = 'Carregando…';
  wordsList.replaceChildren();
  wordsPagination.hidden = true;

  const level = wordsLevelFilter.value;
  try {
    const response = await fetch(`/api/word-levels/list?level=${encodeURIComponent(level)}&page=${state.wordsPage}`, { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Não foi possível carregar as palavras.');

    renderWordsOverview(result.counts);
    for (const entry of result.entries) {
      const row = document.createElement('div');
      row.className = 'word-list-row';

      const word = document.createElement('span');
      word.className = 'word-list-expression';
      word.lang = 'ja';
      word.textContent = entry.word;

      const levelBadge = document.createElement('span');
      levelBadge.className = `word-list-level level-${entry.level}`;
      levelBadge.textContent = `${entry.level} · ${familiarityNames[entry.level]}`;
      row.append(word, levelBadge);
      wordsList.append(row);
    }

    state.wordsPage = result.page;
    wordsStatus.textContent = result.total
      ? `${result.total} ${result.total === 1 ? 'palavra' : 'palavras'}`
      : 'Nenhuma palavra neste nível.';
    wordsPagination.hidden = result.pageCount <= 1;
    wordsPageLabel.textContent = `${result.page} / ${result.pageCount}`;
    wordsPrevious.disabled = result.page <= 1;
    wordsNext.disabled = result.page >= result.pageCount;
  } catch (error) {
    wordsStatus.textContent = error.message;
  }
}

export function initializeWordList() {
  state.actions.loadWordsPage = loadWordsPage;
  wordsLevelFilter.addEventListener('change', () => {
    state.wordsPage = 1;
    void loadWordsPage();
  });
  wordsPrevious.addEventListener('click', () => {
    if (state.wordsPage <= 1) return;
    state.wordsPage--;
    void loadWordsPage();
  });
  wordsNext.addEventListener('click', () => {
    state.wordsPage++;
    void loadWordsPage();
  });
}
