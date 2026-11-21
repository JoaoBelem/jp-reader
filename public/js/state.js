export const state = {
  currentFile: null,
  documents: [],
  currentDocument: null,
  wordLevels: {},
  libraryTokenKeys: new Map(),
  wordsPage: 1,
  actions: {},
};

export const familiarityNames = {
  0: 'Sem nível',
  1: 'Nova',
  2: 'Reconhecida',
  3: 'Familiar',
  4: 'Quase aprendida',
  5: 'Dominada',
};
