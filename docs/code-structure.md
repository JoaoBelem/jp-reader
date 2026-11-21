# Organização do código

O guia atualizado por funcionalidade está em [`guia-do-projeto.md`](guia-do-projeto.md). Este arquivo mantém um mapa rápido dos módulos principais.

## Interface (`public/`)

| Arquivo | Responsabilidade |
| --- | --- |
| `app.js` | Inicializa os módulos da interface. |
| `js/state.js` | Estado compartilhado e nomes dos níveis de familiaridade. |
| `js/settings.js` | Tema, fonte, tamanho do texto, alinhamento, navegação e menu lateral. |
| `js/library.js` | Importação TXT, lista de textos, contagens e ações da biblioteca. |
| `js/reader.js` | Tokenização, montagem do leitor, abertura e edição de textos. |
| `js/dictionary-search.js` | Janela da palavra, busca de definições, resultados, níveis e posicionamento. |
| `js/word-selection.js` | Seleção horizontal por arraste e gravação das uniões escolhidas. |
| `js/word-levels.js` | Salva níveis e atualiza as telas relacionadas. |
| `js/word-list.js` | Filtros, contagens e paginação da lista de palavras. |
| `js/helpers.js` | Conversões e funções pequenas compartilhadas. |
| `styles.css` | Estilos divididos em seções numeradas: fontes, temas, base, navegação, biblioteca, leitor, configurações e telas pequenas. |

## Servidor (`src/`)

| Arquivo | Responsabilidade |
| --- | --- |
| `server.js` | Servidor local, rotas HTTP, biblioteca e comunicação com o parser. |
| `yomitan-search.js` | Gera formas candidatas de busca usando o transformador japonês do Yomitan. |
| `parser.py` | Coordena SudachiPy, índice Jitendex e consultas ao SQLite local. |
| `postprocessing.py` | Regras aplicadas depois do Sudachi, organizadas por verbos, adjetivos, 形状詞 e uniões personalizadas. |

As uniões criadas pelo usuário são salvas em `data/word-merges.json` e aplicadas depois das regras gramaticais.

O ponto de inicialização da interface fica em `public/app.js`. Ao adicionar uma funcionalidade, coloque a lógica no módulo da área correspondente e registre sua inicialização nesse arquivo. Use `js/state.js` somente para valores realmente compartilhados entre áreas.
