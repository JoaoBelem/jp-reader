import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createServer } from 'node:http';
import { lstat, mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createYomitanSearchCandidates } from './yomitan-search.js';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const publicRoot = resolve(projectRoot, 'public');
const libraryRoot = resolve(projectRoot, 'library');
const parsedLibraryRoot = resolve(libraryRoot, '.parsed');
const dataRoot = resolve(projectRoot, 'data');
const wordLevelsPath = resolve(dataRoot, 'word-levels.json');
const preferredEntriesPath = resolve(dataRoot, 'preferred-dictionary-entries.json');
const wordMergesPath = resolve(dataRoot, 'word-merges.json');
const parsedCacheVersion = 2;
const parserPath = resolve(projectRoot, 'src', 'parser.py');
const pythonPath = resolve(projectRoot, '.venv', 'Scripts', 'python.exe');
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
};

const pendingParserRequests = new Map();
let nextParserRequestId = 1;
let dictionaryTitles = [];
let wordLevelWriteQueue = Promise.resolve();
let preferredEntryWriteQueue = Promise.resolve();
let wordMergeWriteQueue = Promise.resolve();
let resolveParserReady;
let rejectParserReady;
const parserReady = new Promise((resolveReady, rejectReady) => {
  resolveParserReady = resolveReady;
  rejectParserReady = rejectReady;
});
parserReady.catch(() => {});

const parserWorker = spawn(pythonPath, [parserPath], {
  cwd: projectRoot,
  windowsHide: true,
  stdio: ['pipe', 'pipe', 'pipe'],
});

createInterface({ input: parserWorker.stdout }).on('line', (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    console.error('SudachiPy retornou uma resposta inválida.');
    return;
  }

  if (message.ready) {
    dictionaryTitles = message.dictionaries ?? [];
    resolveParserReady();
    console.log(`SudachiPy pronto; ${dictionaryTitles.length} dicionário(s) local(is) carregado(s).`);
    return;
  }

  const pending = pendingParserRequests.get(message.id);
  if (!pending) return;
  pendingParserRequests.delete(message.id);
  if (message.error) pending.reject(new Error(message.error));
  else pending.resolve(message);
});

parserWorker.stderr.on('data', (chunk) => console.error(`SudachiPy: ${chunk.toString().trim()}`));
parserWorker.on('error', (error) => {
  rejectParserReady(error);
  for (const pending of pendingParserRequests.values()) pending.reject(error);
  pendingParserRequests.clear();
});
parserWorker.on('exit', (code) => {
  const error = new Error(`O processo do SudachiPy foi encerrado (${code ?? 'sem código'}).`);
  rejectParserReady(error);
  for (const pending of pendingParserRequests.values()) pending.reject(error);
  pendingParserRequests.clear();
});

async function parserRequest(payload) {
  await parserReady;
  const id = nextParserRequestId++;
  return new Promise((resolveResult, rejectResult) => {
    pendingParserRequests.set(id, { resolve: resolveResult, reject: rejectResult });
    parserWorker.stdin.write(`${JSON.stringify({ id, ...payload })}\n`, (error) => {
      if (!error) return;
      pendingParserRequests.delete(id);
      rejectResult(error);
    });
  });
}

async function readJsonBody(request, maxBytes = 20 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('O texto é grande demais para importar.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sendJson(response, status, value) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(value));
}

function displayNameFor(filename) {
  const sourceName = filename.replace(/^[0-9a-f-]{36}--/i, '');
  return basename(sourceName, extname(sourceName));
}

function displayTitle(title, filename) {
  return typeof title === 'string' && title.trim()
    ? title.trim().replace(/\.txt$/i, '')
    : displayNameFor(filename);
}

async function listLibraryTexts() {
  const filenames = await readdir(libraryRoot);
  const supportedExtensions = new Set(['.txt']);
  const records = new Map();
  const parsedFilenames = await readdir(parsedLibraryRoot).catch(() => []);
  for (const cacheFilename of parsedFilenames) {
    if (!cacheFilename.endsWith('.json')) continue;
    const filename = cacheFilename.slice(0, -'.json'.length);
    if (!supportedExtensions.has(extname(filename).toLowerCase())) continue;
    try {
      const cachePath = join(parsedLibraryRoot, cacheFilename);
      const [info, cache] = await Promise.all([
        lstat(cachePath),
        readFile(cachePath, 'utf8').then((text) => JSON.parse(text)),
      ]);
      if (!info.isFile() || cache.version !== parsedCacheVersion || typeof cache.html !== 'string') continue;
      const id = Buffer.from(filename, 'utf8').toString('base64url');
      records.set(id, {
        id,
        name: displayTitle(cache.title, filename),
        extension: 'txt',
        size: Buffer.byteLength(cache.html, 'utf8'),
        modified: info.mtimeMs,
      });
    } catch {
      // Ignore incomplete cache files and leave the original TXT eligible for migration.
    }
  }

  const entries = await Promise.all(filenames.map(async (filename) => {
    if (!supportedExtensions.has(extname(filename).toLowerCase())) return null;
    let info;
    try {
      info = await lstat(join(libraryRoot, filename));
    } catch {
      return null;
    }
    if (!info.isFile()) return null;
    const id = Buffer.from(filename, 'utf8').toString('base64url');
    if (records.has(id)) return records.get(id);
    return {
      id,
      name: displayNameFor(filename),
      extension: extname(filename).slice(1).toLowerCase(),
      size: info.size,
      modified: info.mtimeMs,
    };
  }));
  for (const entry of entries.filter(Boolean)) records.set(entry.id, entry);
  return [...records.values()].sort((a, b) => b.modified - a.modified);
}

function parsedCachePath(filename) {
  return join(parsedLibraryRoot, `${filename}.json`);
}

async function readParsedContent(filename) {
  try {
    const cache = JSON.parse(await readFile(parsedCachePath(filename), 'utf8'));
    if (cache.version !== parsedCacheVersion) return null;
    if (typeof cache.html !== 'string') return null;
    return { html: cache.html, title: typeof cache.title === 'string' ? cache.title : '' };
  } catch {
    return null;
  }
}

async function writeParsedContent(filename, html, title = '') {
  const path = parsedCachePath(filename);
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  const cache = {
    version: parsedCacheVersion,
    html,
    title,
  };
  await writeFile(temporaryPath, JSON.stringify(cache), 'utf8');
  await rename(temporaryPath, path);
  await unlink(join(libraryRoot, filename)).catch(() => {});
}

async function readWordLevels() {
  const data = JSON.parse(await readFile(wordLevelsPath, 'utf8'));
  if (!data.words || typeof data.words !== 'object' || Array.isArray(data.words)) {
    throw new Error('O arquivo word-levels.json está inválido.');
  }
  return data;
}

function saveWordLevel(word, level) {
  const saveTask = wordLevelWriteQueue.then(async () => {
    const data = await readWordLevels();
    if (level === 0) delete data.words[word];
    else data.words[word] = level;
    const temporaryPath = `${wordLevelsPath}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    await rename(temporaryPath, wordLevelsPath);
    return data;
  });
  wordLevelWriteQueue = saveTask.catch(() => {});
  return saveTask;
}

async function readPreferredEntries() {
  const data = JSON.parse(await readFile(preferredEntriesPath, 'utf8'));
  if (!data.words || typeof data.words !== 'object' || Array.isArray(data.words)) {
    throw new Error('O arquivo de resultados principais está inválido.');
  }
  return data;
}

function savePreferredEntry(word, entry) {
  const saveTask = preferredEntryWriteQueue.then(async () => {
    const data = await readPreferredEntries();
    if (entry === null) delete data.words[word];
    else data.words[word] = entry;
    const temporaryPath = `${preferredEntriesPath}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    await rename(temporaryPath, preferredEntriesPath);
    return entry;
  });
  preferredEntryWriteQueue = saveTask.catch(() => {});
  return saveTask;
}

async function readWordMerges() {
  const data = JSON.parse(await readFile(wordMergesPath, 'utf8'));
  const rules = Array.isArray(data)
    ? data
    : Array.isArray(data.rules)
      ? data.rules.map((rule) => Array.isArray(rule) ? rule : rule?.parts)
      : null;
  if (!rules || rules.some((rule) => !Array.isArray(rule) || rule.length < 2 || rule.some((part) => typeof part !== 'string' || !part))) {
    throw new Error('O arquivo de uniões está inválido.');
  }
  return rules;
}

async function writeWordMerges(rules) {
  const temporaryPath = `${wordMergesPath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(rules, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, wordMergesPath);
}

function saveWordMerge(parts) {
  const saveTask = wordMergeWriteQueue.then(async () => {
    const rules = await readWordMerges();
    const existing = rules.find((rule) => JSON.stringify(rule) === JSON.stringify(parts));
    if (existing) return { rule: existing, rules, created: false };
    rules.push(parts);
    await writeWordMerges(rules);
    return { rule: parts, rules, created: true };
  });
  wordMergeWriteQueue = saveTask.catch(() => {});
  return saveTask;
}

function filenameFromLibraryId(id) {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
  const filename = Buffer.from(id, 'base64url').toString('utf8');
  if (Buffer.from(filename, 'utf8').toString('base64url') !== id) return null;
  if (basename(filename) !== filename || filename.includes('..')) return null;
  if (extname(filename).toLowerCase() !== '.txt') return null;
  return filename;
}

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? '/', 'http://localhost');

  if (request.method === 'GET' && requestUrl.pathname === '/api/texts') {
    try {
      sendJson(response, 200, { texts: await listLibraryTexts() });
    } catch (error) {
      sendJson(response, 500, { error: error.message });
    }
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/word-levels/list') {
    try {
      const data = await readWordLevels();
      const levelParam = requestUrl.searchParams.get('level') ?? 'all';
      const pageParam = Number.parseInt(requestUrl.searchParams.get('page') ?? '1', 10);
      if (levelParam !== 'all' && !/^[1-5]$/.test(levelParam)) {
        sendJson(response, 400, { error: 'Nível inválido.' });
        return;
      }
      const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;
      const pageSize = 50;
      const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      const words = Object.entries(data.words);
      for (const [, level] of words) if (Number.isInteger(level) && level >= 1 && level <= 5) counts[level]++;
      const filtered = words
        .filter(([, level]) => Number.isInteger(level) && level >= 1 && level <= 5 && (levelParam === 'all' || level === Number(levelParam)))
        .sort(([wordA], [wordB]) => wordA.localeCompare(wordB, 'ja'));
      const total = filtered.length;
      const pageCount = Math.max(1, Math.ceil(total / pageSize));
      const safePage = Math.min(page, pageCount);
      const entries = filtered.slice((safePage - 1) * pageSize, safePage * pageSize).map(([word, level]) => ({ word, level }));
      sendJson(response, 200, { entries, counts, total, page: safePage, pageSize, pageCount });
    } catch (error) {
      sendJson(response, 500, { error: error.message });
    }
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/word-levels') {
    try {
      sendJson(response, 200, await readWordLevels());
    } catch (error) {
      sendJson(response, 500, { error: error.message });
    }
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/word-levels') {
    try {
      const body = await readJsonBody(request, 64 * 1024);
      if (typeof body.word !== 'string' || !body.word.trim() || body.word.length > 128 || !Number.isInteger(body.level) || body.level < 0 || body.level > 5) {
        sendJson(response, 400, { error: 'Palavra ou nível inválido.' });
        return;
      }
      const data = await saveWordLevel(body.word, body.level);
      sendJson(response, 200, data);
    } catch (error) {
      sendJson(response, 500, { error: error.message });
    }
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/preferred-entries') {
    try {
      const body = await readJsonBody(request, 16 * 1024);
      const entry = body.entry;
      if (typeof body.word !== 'string' || !body.word.trim() || body.word.length > 128 ||
          (entry !== null && (!entry || typeof entry !== 'object' ||
            ['dictionary', 'expression'].some((key) => typeof entry[key] !== 'string' || !entry[key] || entry[key].length > 512) ||
            typeof entry.reading !== 'string' || entry.reading.length > 512))) {
        sendJson(response, 400, { error: 'Palavra ou resultado inválido.' });
        return;
      }
      const saved = await savePreferredEntry(body.word, entry);
      sendJson(response, 200, { word: body.word, entry: saved });
    } catch (error) {
      sendJson(response, 500, { error: error.message });
    }
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname.startsWith('/api/texts/')) {
    const id = requestUrl.pathname.slice('/api/texts/'.length);
    const filename = filenameFromLibraryId(id);
    if (!filename) {
      sendJson(response, 400, { error: 'Arquivo inválido.' });
      return;
    }
    try {
      const filePath = resolve(libraryRoot, filename);
      const processedContent = await readParsedContent(filename);
      const info = await lstat(filePath).catch(() => null);
      if ((!info || !info.isFile()) && !processedContent) {
        sendJson(response, 404, { error: 'Texto não encontrado.' });
        return;
      }
      const summaryOnly = requestUrl.searchParams.get('summary') === '1';
      const content = summaryOnly || processedContent ? null : await readFile(filePath, 'utf8');
      sendJson(response, 200, {
        name: displayTitle(processedContent?.title, filename),
        extension: extname(filename).slice(1).toLowerCase(),
        content,
        processedContent,
      });
    } catch {
      sendJson(response, 404, { error: 'Texto não encontrado.' });
    }
    return;
  }

  if ((request.method === 'PUT' || request.method === 'DELETE') && requestUrl.pathname.startsWith('/api/texts/')) {
    const id = requestUrl.pathname.slice('/api/texts/'.length);
    const filename = filenameFromLibraryId(id);
    if (!filename) {
      sendJson(response, 400, { error: 'Arquivo inválido.' });
      return;
    }
    try {
      const filePath = join(libraryRoot, filename);
      const sourceInfo = await lstat(filePath).catch(() => null);
      const parsedContent = await readParsedContent(filename);
      if ((!sourceInfo || !sourceInfo.isFile()) && !parsedContent) {
        sendJson(response, 404, { error: 'Texto não encontrado.' });
        return;
      }
      if (request.method === 'DELETE') {
        await unlink(filePath).catch(() => {});
        await unlink(parsedCachePath(filename)).catch(() => {});
        sendJson(response, 200, { deleted: true });
        return;
      }

      const body = await readJsonBody(request);
      if (typeof body.processedContent !== 'string' || (body.title !== undefined && typeof body.title !== 'string')) {
        sendJson(response, 400, { error: 'Conteúdo do texto inválido.' });
        return;
      }
      await writeParsedContent(filename, body.processedContent, body.title ?? displayNameFor(filename));
      const updated = (await listLibraryTexts()).find((text) => text.id === id);
      sendJson(response, 200, { text: updated });
    } catch (error) {
      sendJson(response, 500, { error: error.message });
    }
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname.startsWith('/api/texts/') && requestUrl.pathname.endsWith('/parsed')) {
    const id = requestUrl.pathname.slice('/api/texts/'.length, -'/parsed'.length);
    const filename = filenameFromLibraryId(id);
    if (!filename) {
      sendJson(response, 400, { error: 'Arquivo inválido.' });
      return;
    }
    try {
      const body = await readJsonBody(request, 100 * 1024 * 1024);
      if (typeof body.processedContent !== 'string' || (body.title !== undefined && typeof body.title !== 'string')) {
        sendJson(response, 400, { error: 'Versão analisada inválida.' });
        return;
      }
      await writeParsedContent(filename, body.processedContent, body.title ?? '');
      sendJson(response, 200, { saved: true });
    } catch (error) {
      sendJson(response, 500, { error: error.message });
    }
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/texts') {
    try {
      const body = await readJsonBody(request);
      if (typeof body.name !== 'string' || typeof body.content !== 'string') {
        sendJson(response, 400, { error: 'Arquivo inválido.' });
        return;
      }
      const sourceName = basename(body.name.replaceAll('\\', '/'));
      const extension = extname(sourceName).toLowerCase();
      if (extension !== '.txt') {
        sendJson(response, 400, { error: 'Importe um arquivo TXT.' });
        return;
      }
      const sourceBase = basename(sourceName, extname(sourceName))
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
        .replace(/[. ]+$/g, '')
        .slice(0, 120) || 'texto';
      const filename = `${randomUUID()}--${sourceBase}${extension}`;
      const destination = join(libraryRoot, filename);
      await writeFile(destination, body.content, { encoding: 'utf8', flag: 'wx' });
      const texts = await listLibraryTexts();
      const saved = texts.find((text) => text.id === Buffer.from(filename, 'utf8').toString('base64url'));
      sendJson(response, 201, { text: saved });
    } catch (error) {
      sendJson(response, 500, { error: error.message });
    }
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/word-merges') {
    try {
      sendJson(response, 200, { rules: await readWordMerges() });
    } catch (error) {
      sendJson(response, 500, { error: error.message });
    }
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/word-merges') {
    try {
      const body = await readJsonBody(request, 16 * 1024);
      const parts = body.parts;
      if (!Array.isArray(parts) || parts.length < 2 || parts.length > 32 ||
          parts.some((part) => typeof part !== 'string' || !part.trim() || part.length > 128 || /\s/u.test(part))) {
        sendJson(response, 400, { error: 'Selecione ao menos duas palavras adjacentes.' });
        return;
      }
      const saved = await saveWordMerge(parts);
      sendJson(response, saved.created ? 201 : 200, saved);
    } catch (error) {
      sendJson(response, 500, { error: error.message });
    }
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/tokenize') {
    try {
      const body = await readJsonBody(request);
      if (!Array.isArray(body.texts) || body.texts.some((text) => typeof text !== 'string')) {
        sendJson(response, 400, { error: 'Formato de texto inválido.' });
        return;
      }
      const wordMerges = await readWordMerges();
      const result = await parserRequest({ texts: body.texts, wordMerges });
      sendJson(response, 200, { results: result.results });
    } catch (error) {
      sendJson(response, 500, { error: error.message });
    }
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/lookup') {
    try {
      const body = await readJsonBody(request, 32 * 1024);
      if (typeof body.term !== 'string' || typeof body.surface !== 'string') {
        sendJson(response, 400, { error: 'Palavra inválida.' });
        return;
      }
      const reading = typeof body.reading === 'string' ? body.reading : '';
      const context = typeof body.context === 'string' ? body.context : body.surface;
      const candidates = createYomitanSearchCandidates(context, [body.surface, body.term, reading]);
      const preferredData = await readPreferredEntries();
      const preferredEntry = preferredData.words[body.term] ?? null;
      const result = await parserRequest({ action: 'lookup', term: body.term, surface: body.surface, reading, candidates, preferredEntry });
      sendJson(response, 200, { ...result.result, preferredEntry });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  if (requestUrl.pathname === '/api/health') {
    sendJson(response, 200, { status: 'ok', app: 'jp-reader', dictionaries: dictionaryTitles });
    return;
  }

  if (request.method !== 'GET') {
    response.writeHead(405).end('Método não permitido');
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(requestUrl.pathname);
  } catch {
    response.writeHead(400).end('Caminho inválido');
    return;
  }

  const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
  const filePath = resolve(publicRoot, relativePath);
  if (filePath !== publicRoot && !filePath.startsWith(`${publicRoot}${sep}`)) {
    response.writeHead(403).end('Acesso negado');
    return;
  }

  try {
    const file = await readFile(filePath);
    const extension = extname(filePath).toLowerCase();
    response.writeHead(200, {
      'content-type': contentTypes[extension] ?? 'application/octet-stream',
      'x-content-type-options': 'nosniff',
      'cache-control': extension === '.ttf' ? 'public, max-age=86400' : 'no-store',
    });
    response.end(file);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Página não encontrada');
  }
});

const port = Number(process.env.PORT ?? 4173);
await mkdir(libraryRoot, { recursive: true });
await mkdir(parsedLibraryRoot, { recursive: true });
await mkdir(dataRoot, { recursive: true });
try {
  await readFile(wordLevelsPath, 'utf8');
} catch {
  await writeFile(wordLevelsPath, '{\n  "version": 1,\n  "words": {}\n}\n', { encoding: 'utf8', flag: 'wx' });
}
try {
  await readFile(preferredEntriesPath, 'utf8');
} catch {
  await writeFile(preferredEntriesPath, '{\n  "version": 1,\n  "words": {}\n}\n', { encoding: 'utf8', flag: 'wx' });
}
try {
  const storedMerges = JSON.parse(await readFile(wordMergesPath, 'utf8'));
  if (!Array.isArray(storedMerges)) await writeWordMerges(await readWordMerges());
} catch {
  await writeFile(wordMergesPath, '[]\n', { encoding: 'utf8', flag: 'wx' });
}
server.listen(port, '127.0.0.1', () => {
  console.log(`JP Reader disponível em http://127.0.0.1:${port}`);
  console.log('Este servidor aceita conexões apenas deste computador.');
});

function stopParser() {
  parserWorker.kill();
}
process.on('SIGINT', () => { server.close(); stopParser(); });
process.on('SIGTERM', () => { server.close(); stopParser(); });
