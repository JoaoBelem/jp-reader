export const numberOnlyPattern = /^[\p{N}〇零一二三四五六七八九十百千万億兆]+$/u;

export function isNumberOnly(value) {
  return numberOnlyPattern.test(value.trim());
}

export function toHiragana(text) {
  return [...text].map((character) => {
    const code = character.codePointAt(0);
    return code >= 0x30a1 && code <= 0x30f6 ? String.fromCodePoint(code - 0x60) : character;
  }).join('');
}

export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
