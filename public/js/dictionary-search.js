import { toHiragana } from './helpers.js';
import { familiarityNames, state } from './state.js';
import { saveWordLevel } from './word-levels.js';

const readerContent = document.querySelector('#reader-content');
let activePopover = null;

function updateLevelToggle(toggle, level) {
  const label = toggle.querySelector('.level-toggle-label');
  label.textContent = `${level} · ${familiarityNames[level]}`;
  for (let current = 0; current <= 5; current++) toggle.classList.toggle(`level-${current}`, current === level);
  toggle.setAttribute('aria-label', `Nível de familiaridade: ${familiarityNames[level]}`);
}

function createLevelMenu(wordKey) {
  const control = document.createElement('span');
  control.className = 'level-control';

  const toggle = document.createElement('button');
  toggle.className = 'level-dropdown-toggle';
  toggle.type = 'button';
  toggle.dataset.levelToggle = '';
  toggle.setAttribute('aria-haspopup', 'menu');
  toggle.setAttribute('aria-expanded', 'false');

  const label = document.createElement('span');
  label.className = 'level-toggle-label';
  toggle.append(label);

  const menu = document.createElement('span');
  menu.className = 'level-dropdown';
  menu.setAttribute('role', 'menu');
  menu.hidden = true;
  for (let level = 1; level <= 5; level++) {
    const option = document.createElement('button');
    option.className = `level-choice level-choice-${level}`;
    option.type = 'button';
    option.dataset.wordLevel = String(level);
    option.setAttribute('role', 'menuitemradio');
    option.setAttribute('aria-checked', String(level === Number(state.wordLevels[wordKey] ?? 0)));

    const number = document.createElement('span');
    number.className = 'level-choice-number';
    number.textContent = String(level);
    const name = document.createElement('span');
    name.className = 'level-choice-name';
    name.textContent = familiarityNames[level];
    option.append(number, name);
    menu.append(option);
  }

  const clearLevel = document.createElement('button');
  clearLevel.className = 'level-choice level-choice-clear';
  clearLevel.type = 'button';
  clearLevel.dataset.wordLevel = '0';
  clearLevel.setAttribute('role', 'menuitem');
  clearLevel.textContent = 'Remover nível';
  menu.append(clearLevel);
  control.append(toggle);
  updateLevelToggle(toggle, Number(state.wordLevels[wordKey] ?? 0));
  return { control, toggle, menu };
}

function createWordToken(token) {
  const wrapper = document.createElement('span');
  wrapper.className = 'word-wrap';

  const button = document.createElement('button');
  button.className = 'reader-word';
  button.type = 'button';
  button.textContent = token.surface;
  button.dataset.token = JSON.stringify(token);
  button.dataset.wordKey = token.dictionaryForm || token.surface;
  const level = Number(state.wordLevels[button.dataset.wordKey] ?? 0);
  button.dataset.level = String(level);
  button.classList.add(`level-${level}`);
  button.setAttribute('aria-label', `${token.surface}, leitura ${token.reading}`);

  const popover = document.createElement('span');
  popover.className = 'word-popover';
  popover.setAttribute('role', 'dialog');
  popover.hidden = true;

  const scrollArea = document.createElement('span');
  scrollArea.className = 'popover-scroll-area';
  const head = document.createElement('span');
  head.className = 'popover-head';
  const wordMeta = document.createElement('span');
  wordMeta.className = 'popover-word-meta';
  const expression = document.createElement('strong');
  expression.className = 'popover-expression';
  expression.textContent = token.dictionaryForm || token.surface;
  const reading = document.createElement('span');
  reading.className = 'popover-reading';
  reading.textContent = token.lemmaReading || token.reading || '—';
  wordMeta.append(expression, reading);

  const { control, toggle, menu } = createLevelMenu(button.dataset.wordKey);
  head.append(wordMeta, control);
  const meaning = document.createElement('span');
  meaning.className = 'popover-meaning';
  meaning.textContent = 'Buscando significado…';
  scrollArea.append(head, meaning);
  popover.append(scrollArea, menu);

  scrollArea.addEventListener('scroll', () => {
    const menu = popover.querySelector('.level-dropdown');
    if (!menu.hidden) positionLevelDropdown(wrapper, toggle, menu);
  });

  wrapper.append(button, popover);
  return wrapper;
}

export function createCachedWordToken(token) {
  const cachedWord = document.createElement('span');
  cachedWord.className = 'cached-reader-word';
  cachedWord.dataset.cachedWord = JSON.stringify(token);
  cachedWord.textContent = token.surface;
  return cachedWord;
}

export function hydrateCachedWords(container) {
  for (const cachedWord of [...container.querySelectorAll('[data-cached-word]')]) {
    try {
      cachedWord.replaceWith(createWordToken(JSON.parse(cachedWord.dataset.cachedWord)));
    } catch {
      cachedWord.replaceWith(document.createTextNode(cachedWord.textContent));
    }
  }
}

export function applyWordLevels(container) {
  for (const button of container.querySelectorAll('.reader-word')) {
    const level = Number(state.wordLevels[button.dataset.wordKey] ?? 0);
    button.dataset.level = String(level);
    for (let current = 0; current <= 5; current++) button.classList.toggle(`level-${current}`, level === current);

    const wrapper = button.closest('.word-wrap');
    updateLevelToggle(wrapper.querySelector('[data-level-toggle]'), level);
    wrapper.querySelectorAll('[role="menuitemradio"]').forEach((option) => {
      option.setAttribute('aria-checked', String(Number(option.dataset.wordLevel) === level));
    });
  }
}

export function closeWordPopover() {
  if (!activePopover) return;
  activePopover.popover.hidden = true;
  activePopover.button.classList.remove('is-selected');
  activePopover = null;
}

function getNextNode(rootNode, currentNode) {
  while (currentNode && currentNode !== rootNode) {
    if (currentNode.nextSibling) return currentNode.nextSibling;
    currentNode = currentNode.parentNode;
  }
  return null;
}

function getLookupContext(button) {
  const characters = [...button.textContent];
  let currentNode = getNextNode(readerContent, button);

  while (currentNode && characters.length < 20) {
    if (currentNode.nodeType === Node.ELEMENT_NODE) {
      if (currentNode.matches('.word-popover')) {
        currentNode = getNextNode(readerContent, currentNode);
      } else if (currentNode.matches('.reader-word')) {
        characters.push(...[...currentNode.textContent].slice(0, 20 - characters.length));
        currentNode = getNextNode(readerContent, currentNode);
      } else if (currentNode.matches('.word-gap')) {
        // Space added by the reader between blocks: not a boundary of the text.
        currentNode = getNextNode(readerContent, currentNode);
      } else if (currentNode.matches('br')) {
        break;
      } else {
        currentNode = currentNode.firstChild ?? getNextNode(readerContent, currentNode);
      }
      continue;
    }

    if (currentNode.nodeType === Node.TEXT_NODE) {
      const text = currentNode.nodeValue ?? '';
      const lineBreak = text.search(/[\r\n]/u);
      const visibleText = lineBreak < 0 ? text : text.slice(0, lineBreak);
      // A space written in the text separates two words: the search stops here so a
      // compound entry never swallows the neighbour word.
      if (/\s/u.test(visibleText)) break;
      characters.push(...[...visibleText].slice(0, 20 - characters.length));
      if (lineBreak >= 0) break;
    }
    currentNode = getNextNode(readerContent, currentNode);
  }
  return characters.join('');
}

async function lookupWord(token) {
  const response = await fetch('/api/lookup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      term: token.dictionaryForm || token.surface,
      surface: token.surface,
      reading: toHiragana(token.reading || ''),
      context: getLookupContext(activePopover.button),
    }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Significado indisponível.');
  return result;
}

function renderExamples(senseItem, examples) {
  if (!examples?.length) return;
  const exampleList = document.createElement('div');
  exampleList.className = 'definition-examples';

  for (const example of examples) {
    const card = document.createElement('div');
    card.className = 'definition-example';
    const japanese = document.createElement('div');
    japanese.className = 'example-japanese';
    for (const part of example.japaneseParts ?? [{ text: example.japanese }]) {
      if (part.reading) {
        const ruby = document.createElement('ruby');
        ruby.append(document.createTextNode(part.text));
        const reading = document.createElement('rt');
        reading.textContent = part.reading;
        ruby.append(reading);
        japanese.append(ruby);
      } else {
        japanese.append(document.createTextNode(part.text));
      }
    }
    card.append(japanese);
    if (example.translation) {
      const translation = document.createElement('div');
      translation.className = 'example-translation';
      translation.textContent = example.translation;
      card.append(translation);
    }
    exampleList.append(card);
  }
  senseItem.append(exampleList);
}

function renderSense(sense) {
  const item = document.createElement('li');
  item.className = 'meaning-sense';
  if (sense.glosses?.length) {
    const glossList = document.createElement('ul');
    glossList.className = 'meaning-glosses';
    for (const gloss of sense.glosses) {
      const glossItem = document.createElement('li');
      glossItem.textContent = gloss;
      glossList.append(glossItem);
    }
    item.append(glossList);
  }
  renderExamples(item, sense.examples);
  return item;
}

function sameDictionaryEntry(first, second) {
  return Boolean(first && second && first.dictionary === second.dictionary &&
    first.expression === second.expression && first.reading === second.reading);
}

async function setPreferredEntry(word, entry) {
  const response = await fetch('/api/preferred-entries', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ word, entry }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Não foi possível salvar o resultado principal.');
  return result.entry;
}

function renderLookupResults(meaning, result, token) {
  meaning.replaceChildren();
  const entries = result.entries?.length
    ? result.entries
    : [{ expression: token.surface, senses: result.senses ?? [] }];
  if (!result.found || !entries.some((entry) => entry.senses?.length)) {
    meaning.textContent = 'Nenhum significado encontrado.';
    return;
  }

  const wordKey = token.dictionaryForm || token.surface;
  const orderedEntries = [...entries].sort((first, second) =>
    Number(sameDictionaryEntry(second, result.preferredEntry)) - Number(sameDictionaryEntry(first, result.preferredEntry)));
  for (const entry of orderedEntries) {
    const section = document.createElement('section');
    section.className = 'lookup-entry';
    const isPreferred = sameDictionaryEntry(entry, result.preferredEntry);
    section.classList.toggle('is-preferred', isPreferred);
    if (entry.dictionary && entry.expression && typeof entry.reading === 'string') {
      const preferredButton = document.createElement('button');
      preferredButton.type = 'button';
      preferredButton.className = 'preferred-entry-button';
      preferredButton.textContent = isPreferred ? 'Remover principal' : 'Tornar principal';
      preferredButton.setAttribute('aria-pressed', String(isPreferred));
      preferredButton.addEventListener('click', async (event) => {
        event.stopPropagation();
        preferredButton.disabled = true;
        try {
          const desiredEntry = isPreferred ? null : {
            dictionary: entry.dictionary,
            expression: entry.expression,
            reading: entry.reading,
          };
          result.preferredEntry = await setPreferredEntry(wordKey, desiredEntry);
          renderLookupResults(meaning, result, token);
          if (activePopover) positionWordPopover(activePopover.wrapper, activePopover.button, activePopover.popover);
        } catch (error) {
          preferredButton.disabled = false;
          preferredButton.title = error.message;
        }
      });
      section.append(preferredButton);
    }
    if (entry.expression && entry.expression !== (token.dictionaryForm || token.surface)) {
      const title = document.createElement('strong');
      title.className = 'lookup-entry-title';
      title.textContent = `${entry.expression}${entry.reading ? ` · ${toHiragana(entry.reading)}` : ''}`;
      section.append(title);
    }

    const senses = document.createElement('ol');
    senses.className = 'meaning-senses';
    for (const sense of entry.senses ?? []) senses.append(renderSense(sense));
    section.append(senses);
    meaning.append(section);
  }
}

async function openWordPopover(wrapper, button, popover, meaning, token) {
  closeWordPopover();
  button.classList.add('is-selected');
  popover.hidden = false;
  activePopover = { wrapper, button, popover };
  positionWordPopover(wrapper, button, popover);
  meaning.textContent = 'Buscando significado…';

  try {
    const result = await lookupWord(token);
    if (activePopover?.wrapper !== wrapper) return;
    if (!result.available) {
      meaning.textContent = 'Nenhum dicionário local foi carregado.';
      return;
    }
    const reading = popover.querySelector('.popover-reading');
    // Prefer the lemma reading: the dictionary reading of the first matching entry
    // can belong to another word, and the token reading is the inflected form.
    const lemmaReading = result.lemmaReading ? toHiragana(result.lemmaReading) : '';
    if (lemmaReading) reading.textContent = lemmaReading;
    else if (result.reading) reading.textContent = toHiragana(result.reading);
    renderLookupResults(meaning, result, token);
    positionWordPopover(wrapper, button, popover);
  } catch (error) {
    if (activePopover?.wrapper !== wrapper) return;
    meaning.textContent = error.message || 'Significado indisponível.';
    positionWordPopover(wrapper, button, popover);
  }
}

function positionWordPopover(wrapper, button, popover) {
  popover.classList.remove('align-start', 'align-end', 'align-above');
  const scrollArea = popover.querySelector('.popover-scroll-area');
  scrollArea.style.maxHeight = '';
  popover.style.left = '';
  popover.style.right = '';
  popover.style.transform = '';

  const wordRect = button.getBoundingClientRect();
  const spaceBelow = window.innerHeight - wordRect.bottom - 12;
  const spaceAbove = wordRect.top - 12;
  const desiredHeight = Math.min(scrollArea.scrollHeight + 2, 520, window.innerHeight * 0.7);
  const placeAbove = desiredHeight > spaceBelow && spaceAbove > spaceBelow;
  popover.classList.toggle('align-above', placeAbove);
  const availableHeight = placeAbove ? spaceAbove : spaceBelow;
  const maxPopupHeight = Math.max(60, Math.min(520, window.innerHeight * 0.7, availableHeight));
  scrollArea.style.maxHeight = `${Math.max(40, maxPopupHeight - 2)}px`;

  const wrapperRect = wrapper.getBoundingClientRect();
  const popupWidth = popover.getBoundingClientRect().width;
  const centeredLeft = wordRect.left + wordRect.width / 2 - popupWidth / 2;
  const clampedLeft = Math.max(12, Math.min(centeredLeft, window.innerWidth - popupWidth - 12));
  popover.style.left = `${clampedLeft - wrapperRect.left}px`;
  popover.style.right = 'auto';
  popover.style.transform = 'none';
}

function positionLevelDropdown(wrapper, toggle, menu) {
  const popoverRect = wrapper.querySelector('.word-popover').getBoundingClientRect();
  const toggleRect = toggle.getBoundingClientRect();
  const menuWidth = menu.getBoundingClientRect().width;
  const leftPadding = 8;
  const left = Math.max(leftPadding, Math.min(
    toggleRect.right - popoverRect.left - menuWidth,
    popoverRect.width - menuWidth - leftPadding,
  ));
  menu.style.left = `${left}px`;
  menu.style.right = 'auto';

  const spaceBelow = window.innerHeight - toggleRect.bottom - 10;
  const spaceAbove = toggleRect.top - 10;
  if (menu.scrollHeight > spaceBelow && spaceAbove > spaceBelow) {
    menu.style.top = 'auto';
    menu.style.bottom = `${popoverRect.bottom - toggleRect.top + 5}px`;
  } else {
    menu.style.bottom = 'auto';
    menu.style.top = `${toggleRect.bottom - popoverRect.top + 5}px`;
  }
}

function repositionActivePopover() {
  if (!activePopover) return;
  positionWordPopover(activePopover.wrapper, activePopover.button, activePopover.popover);
  const toggle = activePopover.wrapper.querySelector('[data-level-toggle]');
  const menu = activePopover.wrapper.querySelector('.level-dropdown');
  if (!menu.hidden) positionLevelDropdown(activePopover.wrapper, toggle, menu);
}

export function initializeDictionarySearch() {
  state.actions.closeWordPopover = closeWordPopover;
  state.actions.applyWordLevels = applyWordLevels;

  readerContent.addEventListener('click', (event) => {
    const levelToggle = event.target.closest('[data-level-toggle]');
    if (levelToggle && readerContent.contains(levelToggle)) {
      event.stopPropagation();
      const wrapper = levelToggle.closest('.word-wrap');
      const menu = wrapper.querySelector('.level-dropdown');
      const shouldOpen = menu.hidden;
      readerContent.querySelectorAll('.level-dropdown').forEach((item) => { item.hidden = true; });
      readerContent.querySelectorAll('[data-level-toggle]').forEach((item) => item.setAttribute('aria-expanded', 'false'));
      menu.hidden = !shouldOpen;
      levelToggle.setAttribute('aria-expanded', String(shouldOpen));
      if (shouldOpen) positionLevelDropdown(wrapper, levelToggle, menu);
      return;
    }

    const levelOption = event.target.closest('[data-word-level]');
    if (levelOption && readerContent.contains(levelOption)) {
      event.stopPropagation();
      const wrapper = levelOption.closest('.word-wrap');
      const wordButton = wrapper.querySelector('.reader-word');
      wrapper.querySelector('.level-dropdown').hidden = true;
      wrapper.querySelector('[data-level-toggle]').setAttribute('aria-expanded', 'false');
      void saveWordLevel(wordButton.dataset.wordKey, Number(levelOption.dataset.wordLevel)).catch((error) => {
        wrapper.querySelector('.popover-meaning').textContent = error.message;
      });
      return;
    }

    const button = event.target.closest('.reader-word');
    if (!button || !readerContent.contains(button)) return;
    const wrapper = button.closest('.word-wrap');
    openWordPopover(
      wrapper,
      button,
      wrapper.querySelector('.word-popover'),
      wrapper.querySelector('.popover-meaning'),
      JSON.parse(button.dataset.token),
    );
  });

  document.addEventListener('pointerdown', (event) => {
    if (activePopover && !activePopover.wrapper.contains(event.target)) closeWordPopover();
  });
  document.addEventListener('keydown', (event) => {
    if (!activePopover || !/^[1-5]$/.test(event.key)) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.target instanceof HTMLElement && (event.target.isContentEditable || event.target.matches('input, textarea, select'))) return;

    event.preventDefault();
    const { button, wrapper } = activePopover;
    wrapper.querySelector('.level-dropdown').hidden = true;
    wrapper.querySelector('[data-level-toggle]').setAttribute('aria-expanded', 'false');
    void saveWordLevel(button.dataset.wordKey, Number(event.key)).catch((error) => {
      const meaning = wrapper.querySelector('.popover-meaning');
      if (meaning) meaning.textContent = error.message;
    });
  });
  window.addEventListener('resize', repositionActivePopover);
  window.addEventListener('scroll', repositionActivePopover, true);
}
