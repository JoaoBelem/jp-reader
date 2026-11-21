# Guia do JP Reader

## O que é o app

O JP Reader é um leitor local de japonês. O Node.js inicia um servidor que aceita conexões apenas do próprio computador; a interface abre no navegador. O leitor importa arquivos TXT ou texto colado, analisa o japonês com SudachiPy, separa palavras clicáveis, consulta um dicionário Jitendex local e registra a familiaridade de cada palavra.

O app guarda os textos tokenizados depois da primeira análise. Ao abrir um texto já analisado, carrega essa versão salva sem executar o Sudachi de novo. Os arquivos do usuário ficam em `library/` e `data/`; os arquivos de programa ficam principalmente em `public/` e `src/`.

## Caminho do texto

1. A biblioteca recebe um TXT ou o texto colado.
2. O leitor envia o texto ao servidor, que pede ao processo Python para analisar com Sudachi no modo A.
3. `src/postprocessing.py` aplica as regras gramaticais e as uniões personalizadas de `data/word-merges.json`.
4. O leitor monta a versão tokenizada, guarda-a em `library/.parsed/` e descarta o TXT original.
5. Ao reabrir, o leitor usa a versão salva. A edição manual altera essa versão tokenizada.

## Onde mudar cada funcionalidade

### Interface e inicialização

| Se quiser mudar... | Arquivo principal | Responsabilidade |
| --- | --- | --- |
| A estrutura das páginas e os elementos da interface | `public/index.html` | Biblioteca, leitor, lista de palavras, configurações e janela de importação. |
| Quais módulos iniciam e em que ordem | `public/app.js` | Inicializa os módulos do navegador e carrega a biblioteca. |
| Valores compartilhados entre telas | `public/js/state.js` | Documento atual, níveis, biblioteca e ações compartilhadas. |
| Estilos, cores, espaçamento e responsividade | `public/styles.css` | CSS organizado em seções; as cores dos temas ficam nas variáveis CSS no início do arquivo. |

### Biblioteca e textos

| Se quiser mudar... | Arquivo principal | Responsabilidade |
| --- | --- | --- |
| Importar TXT ou colar texto; modal de importação | `public/js/library.js` | Escolha do tipo de entrada, envio, mensagens e abertura do leitor. |
| Lista de textos, contagens por nível, editar e excluir | `public/js/library.js` | Monta os cartões da biblioteca e atualiza seus resumos. |
| Como o texto é tokenizado, exibido ou editado | `public/js/reader.js` | Chama a análise, monta as palavras, abre documentos e salva edições. |
| Regras de pontuação e pequenos auxiliares do leitor | `public/js/helpers.js` | Funções compartilhadas de conversão e formatação. |
| Rotas de importação, leitura, edição e exclusão | `src/server.js` | API local e gravação da biblioteca. |

### Palavras, dicionário e familiaridade

| Se quiser mudar... | Arquivo principal | Responsabilidade |
| --- | --- | --- |
| Janela que abre ao clicar numa palavra | `public/js/dictionary-search.js` | Cabeçalho, definições, exemplos, preferência de resultado e menu de nível. |
| Formas candidatas enviadas ao Jitendex | `src/yomitan-search.js` | Transformações japonesas e ordem de busca reutilizadas do Yomitan. |
| Leitura dos dicionários e consulta às definições | `src/parser.py` | Índice SQLite local, busca de expressões e leituras e resposta da API. |
| Marcar uma sequência de palavras para unir | `public/js/word-selection.js` | Seleção horizontal com contorno e envio da regra personalizada. |
| Regras gramaticais e união de tokens após Sudachi | `src/postprocessing.py` | Regras separadas para verbos, adjetivos, 形状詞 e uniões personalizadas. |
| Níveis salvos | `data/word-levels.json` | Forma do Sudachi associada ao nível de familiaridade 1–5. Nível 0 não é armazenado. |
| Resultado do Jitendex escolhido como principal | `data/preferred-dictionary-entries.json` | Associação entre a forma do Sudachi e uma entrada específica do dicionário. |
| Uniões personalizadas | `data/word-merges.json` | Lista de listas de tokens adjacentes; cada lista interna vira uma forma pela concatenação. |
| Salvar e carregar níveis ou preferências | `src/server.js` | Endpoints e gravação dos arquivos em `data/`. |

### Configurações e páginas auxiliares

| Se quiser mudar... | Arquivo principal | Responsabilidade |
| --- | --- | --- |
| Tema, fonte, tamanho e largura do leitor, justificação e navegação | `public/js/settings.js` | Aplica configurações e salva as escolhas no armazenamento local do navegador. |
| Fontes disponíveis | `public/fonts/fonts.json` | Nomes, identificadores e arquivos locais de fonte. |
| Aparência da lista paginada de palavras | `public/js/word-list.js` | Filtro por nível, contagem, carregamento e paginação. |
| Formato de resposta e rotas da API | `src/server.js` | Servidor Node.js local; também comunica com o processo Python. |

## Arquivos e pastas importantes

| Caminho | Conteúdo |
| --- | --- |
| `Iniciar JP Reader.vbs` | Abre o servidor em segundo plano e inicia o navegador no endereço local. |
| `package.json` | Nome e comando de inicialização do servidor Node.js. |
| `requirements.txt` | Dependências Python, incluindo SudachiPy e o dicionário Sudachi Core. |
| `README.md` | Resumo e instruções para iniciar o app. |
| `docs/parser-merge-rules.md` | Lista legível das regras gramaticais e exemplos esperados. |
| `docs/code-structure.md` | Mapa curto dos módulos; este guia contém o detalhamento por funcionalidade. |
| `public/fonts/*.ttf` | Arquivos de fonte japonesa usados pelas opções locais do leitor. |
| `dict/` | Dicionários compatíveis com Yomitan, como o Jitendex em ZIP. |
| `yomitan-master/` | Código do Yomitan reutilizado para transformar formas japonesas de busca; preserve também a licença GPL-3.0-or-later. |
| `library/.parsed/` | Versões tokenizadas salvas dos textos importados. |
| `.cache/` | Índice local SQLite usado para acelerar as consultas ao dicionário. |
| `.venv/` | Ambiente Python local com as dependências instaladas. |

## Servidor local

`src/server.js` inicia o serviço em `127.0.0.1:4173`. A interface conversa com ele por rotas como `/api/texts`, `/api/tokenize`, `/api/lookup`, `/api/word-levels`, `/api/preferred-entries` e `/api/word-merges`. O servidor inicia `src/parser.py` como processo Python e mantém o Sudachi e o índice do dicionário carregados enquanto o app está aberto.

## Regra prática para alterações

Comece pelo arquivo da funcionalidade na tabela acima. A estrutura visual fica em `public/index.html`, o comportamento da interface fica em `public/js/`, o processamento do idioma fica em `src/` e os dados pessoais ficam em `data/`. Evite editar `.cache/`, `.venv/` e `library/.parsed/` manualmente: são pastas geradas ou atualizadas pelo app.
