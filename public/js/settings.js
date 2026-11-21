import { state } from './state.js';

const root = document.documentElement;
const themeButtons = document.querySelectorAll('[data-set-theme]');
const themeMeta = document.querySelector('meta[name="theme-color"]');
const readerFontSelect = document.querySelector('#reader-font');
const readerTextSize = document.querySelector('#reader-text-size');
const readerSizeValue = document.querySelector('#reader-size-value');
const readerJustify = document.querySelector('#reader-justify');
const readerWidth = document.querySelector('#reader-width');
const readerWidthValue = document.querySelector('#reader-width-value');
const sidebarToggle = document.querySelector('#sidebar-toggle');
const navItems = document.querySelectorAll('[data-page]');
const readerContent = document.querySelector('#reader-content');

function setTheme(theme) {
  root.dataset.theme = theme;
  themeButtons.forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.setTheme === theme));
  });
  themeMeta.content = theme === 'dark' ? '#111210' : '#fffefa';
  localStorage.setItem('jp-reader-theme', theme);
}

async function loadReaderFonts() {
  try {
    const response = await fetch('/fonts/fonts.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Configuração de fontes indisponível.');
    const config = await response.json();
    if (!Array.isArray(config.fonts) || config.fonts.length === 0) throw new Error('Lista de fontes inválida.');

    readerFontSelect.replaceChildren();
    for (const font of config.fonts) {
      const option = document.createElement('option');
      option.value = font.id;
      option.textContent = font.namePt || font.name || font.id;
      readerFontSelect.append(option);
    }

    const savedFont = localStorage.getItem('jp-reader-font');
    const defaultFont = config.fonts.some((font) => font.id === savedFont) ? savedFont : config.default;
    setReaderFont(defaultFont);
  } catch {
    setReaderFont(localStorage.getItem('jp-reader-font') || 'system');
  }
}

function setReaderFont(fontId) {
  const optionExists = [...readerFontSelect.options].some((option) => option.value === fontId);
  const selectedFont = optionExists ? fontId : 'system';
  root.dataset.readerFont = selectedFont;
  readerFontSelect.value = selectedFont;
  localStorage.setItem('jp-reader-font', selectedFont);
}

function setReaderTextSize(value) {
  const size = Math.min(36, Math.max(18, Number(value) || 24));
  root.style.setProperty('--reader-text-size', `${size}px`);
  readerTextSize.value = String(size);
  readerSizeValue.value = `${size} px`;
  readerSizeValue.textContent = `${size} px`;
  localStorage.setItem('jp-reader-text-size', String(size));
}

function setReaderWidth(value) {
  const width = Math.min(80, Math.max(60, Number(value) || 70));
  root.style.setProperty('--reader-content-width', `${width}vw`);
  readerWidth.value = String(width);
  readerWidthValue.value = `${width}%`;
  readerWidthValue.textContent = `${width}%`;
  localStorage.setItem('jp-reader-width', String(width));
}

function setReaderJustified(enabled) {
  readerContent.classList.toggle('is-justified', enabled);
  readerJustify.checked = enabled;
  localStorage.setItem('jp-reader-justify', String(enabled));
}

function setSidebarExpanded(expanded) {
  root.dataset.sidebar = expanded ? 'expanded' : 'collapsed';
  const label = expanded ? 'Recolher menu' : 'Expandir menu';
  sidebarToggle.setAttribute('aria-label', label);
  sidebarToggle.setAttribute('title', label);
  sidebarToggle.setAttribute('aria-expanded', String(expanded));
}

export function setPage(pageName) {
  if (pageName !== 'reader') state.actions.closeWordPopover?.();

  document.querySelectorAll('.page-section').forEach((section) => {
    const isCurrent = section.id === `page-${pageName}`;
    section.classList.toggle('is-visible', isCurrent);
    section.hidden = !isCurrent;
  });

  const selectedNavPage = pageName === 'reader' ? 'meus-textos' : pageName;
  navItems.forEach((item) => {
    const isCurrent = item.dataset.page === selectedNavPage;
    item.classList.toggle('is-active', isCurrent);
    if (isCurrent) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
}

export function initializeSettings() {
  setTheme(localStorage.getItem('jp-reader-theme') === 'light' ? 'light' : 'dark');
  themeButtons.forEach((button) => button.addEventListener('click', () => setTheme(button.dataset.setTheme)));

  readerFontSelect.addEventListener('change', () => setReaderFont(readerFontSelect.value));
  void loadReaderFonts();

  setReaderTextSize(localStorage.getItem('jp-reader-text-size') || 24);
  readerTextSize.addEventListener('input', () => setReaderTextSize(readerTextSize.value));

  setReaderWidth(localStorage.getItem('jp-reader-width') || 70);
  readerWidth.addEventListener('input', () => setReaderWidth(readerWidth.value));

  setReaderJustified(localStorage.getItem('jp-reader-justify') === 'true');
  readerJustify.addEventListener('change', () => setReaderJustified(readerJustify.checked));

  const savedSidebar = localStorage.getItem('jp-reader-sidebar');
  setSidebarExpanded(savedSidebar !== 'collapsed');
  sidebarToggle.addEventListener('click', () => {
    const expanded = root.dataset.sidebar === 'collapsed';
    setSidebarExpanded(expanded);
    localStorage.setItem('jp-reader-sidebar', root.dataset.sidebar);
  });

  navItems.forEach((item) => item.addEventListener('click', () => {
    setPage(item.dataset.page);
    if (item.dataset.page === 'palavras') void state.actions.loadWordsPage?.();
  }));
}
