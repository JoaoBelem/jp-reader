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

const repeatedLineBreakPattern = /[ \t]*\n(?:[ \t]*\n)+/g;

/** Keeps a single line break where the text had several, as a reader ignores blank lines. */
export function normalizeLineBreaks(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(repeatedLineBreakPattern, '\n');
}

/**
 * Picks the index of the rectangle nearest to the point, preferring the closest line.
 * Rectangles are plain {left, right, top, bottom} objects in viewport coordinates.
 */
export function closestBoxIndex(x, y, boxes, tolerance = 4) {
  let nearestLineDistance = Infinity;
  for (const box of boxes) {
    nearestLineDistance = Math.min(nearestLineDistance, Math.abs(y - (box.top + box.bottom) / 2));
  }

  let bestIndex = -1;
  let bestDistance = Infinity;
  for (let index = 0; index < boxes.length; index++) {
    const box = boxes[index];
    if (Math.abs(y - (box.top + box.bottom) / 2) > nearestLineDistance + tolerance) continue;
    const horizontal = x < box.left ? box.left - x : x > box.right ? x - box.right : 0;
    if (horizontal < bestDistance) {
      bestDistance = horizontal;
      bestIndex = index;
    }
  }
  return bestIndex;
}
