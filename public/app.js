import { closeWordPopover, initializeDictionarySearch } from './js/dictionary-search.js';
import { initializeLibrary, refreshLibrary } from './js/library.js';
import { initializeReader, openDocument } from './js/reader.js';
import { initializeSettings } from './js/settings.js';
import { initializeWordList } from './js/word-list.js';
import { initializeWordSelection } from './js/word-selection.js';

initializeSettings();
initializeWordList();
initializeWordSelection();
initializeDictionarySearch();
initializeReader();
initializeLibrary({ openDocument });

refreshLibrary().catch((error) => {
  document.querySelector('#library-status').textContent = error.message;
});
