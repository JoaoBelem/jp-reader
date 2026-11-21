import { LanguageTransformer } from '../yomitan-master/ext/js/language/language-transformer.js';
import { japaneseTransforms } from '../yomitan-master/ext/js/language/ja/japanese-transforms.js';

const transformer = new LanguageTransformer();
transformer.addDescriptor(japaneseTransforms);

const MAX_SCAN_LENGTH = 20;
const MAX_SEARCH_CANDIDATES = 2400;

/** Builds the ordered Japanese forms searched by Yomitan from a text cursor. */
export function createYomitanSearchCandidates(input, fallbackValues = []) {
  let remaining = [...String(input ?? '')].slice(0, MAX_SCAN_LENGTH);
  const candidates = [];
  const seen = new Set();

  while (remaining.length > 0 && candidates.length < MAX_SEARCH_CANDIDATES) {
    const sourceText = remaining.join('');
    const normalizedText = sourceText.normalize('NFKC');
    const variants = new Set([
      sourceText,
      normalizedText,
      toHiragana(sourceText),
      toKatakana(sourceText),
    ]);

    for (const variant of variants) {
      for (const transformed of transformer.transform(variant)) {
        if (!transformed.text || seen.has(transformed.text)) continue;
        seen.add(transformed.text);
        candidates.push({
          text: transformed.text,
          sourceLength: remaining.length,
          transformLength: transformed.trace.length,
        });
        if (candidates.length >= MAX_SEARCH_CANDIDATES) break;
      }
      if (candidates.length >= MAX_SEARCH_CANDIDATES) break;
    }
    remaining.pop();
  }

  const fallbackLength = [...String(input ?? '')].length;
  for (const value of fallbackValues) {
    const text = String(value ?? '');
    if (!text || seen.has(text)) continue;
    seen.add(text);
    candidates.push({ text, sourceLength: fallbackLength, transformLength: 100 });
  }
  return candidates;
}

function toHiragana(text) {
  return [...text].map((character) => {
    const code = character.codePointAt(0);
    return code >= 0x30a1 && code <= 0x30f6 ? String.fromCodePoint(code - 0x60) : character;
  }).join('');
}

function toKatakana(text) {
  return [...text].map((character) => {
    const code = character.codePointAt(0);
    return code >= 0x3041 && code <= 0x3096 ? String.fromCodePoint(code + 0x60) : character;
  }).join('');
}
