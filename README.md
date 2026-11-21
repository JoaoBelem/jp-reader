# JP Reader

Leitor local de japonês, servido por Node.js e aberto no navegador.

## Iniciar

No Windows, dê dois cliques em `Iniciar JP Reader.vbs`. Ele inicia o servidor em segundo plano e abre o navegador.

Também é possível iniciar manualmente: instale Node.js 22 ou mais recente, execute `npm start` na pasta do projeto e abra `http://127.0.0.1:4173`.

O servidor se limita a `127.0.0.1`, então fica acessível apenas no próprio computador.

O guia do projeto explica as funcionalidades e indica qual arquivo alterar em cada caso: [`docs/guia-do-projeto.md`](docs/guia-do-projeto.md). Há também um [mapa rápido dos módulos](docs/code-structure.md).

## Parser de japonês

O parser usa SudachiPy em modo A e depois une terminações e algumas cadeias auxiliares de verbos e adjetivos. A lista de formas que devem ser unidas fica em [`docs/parser-merge-rules.md`](docs/parser-merge-rules.md). As dependências e versões estão em `requirements.txt` e são executadas pelo Python local em `.venv`. O servidor mantém o analisador carregado enquanto o app está aberto. Após a análise, o texto tokenizado fica como a única versão guardada na pasta `library/.parsed`; o TXT original é removido. Ao editar, os espaços do texto tokenizado são preservados para você juntar ou separar palavras. Você também pode importar arquivos TXT pela biblioteca. Dicionários compatíveis com Yomitan em ZIP ficam na pasta `dict`; não precisam ser extraídos. O app cria um índice SQLite local na pasta `.cache` para acelerar as consultas. Reinicie o app após adicionar ou trocar um dicionário.

A busca de palavras usa o transformador japonês do Yomitan, copiado para `src/yomitan` (somente os módulos necessários), sob a licença GPL-3.0-or-later. A geração das formas de busca está separada em `src/yomitan-search.js`; as definições e consultas do Jitendex ficam em `src/parser.py`. A busca percorre o texto a partir da palavra selecionada, tenta trechos cada vez menores, aplica as transformações de conjugação e consulta expressões e leituras do dicionário. Os resultados mais longos e menos transformados vêm primeiro, com relevância do dicionário como desempate. São mostradas até 32 entradas, como no limite padrão do Yomitan. Como o app incorpora esse código, a distribuição do projeto segue GPL-3.0-or-later; `src/yomitan/README.md` registra a origem dos arquivos copiados.

Os níveis de familiaridade ficam em `data/word-levels.json`. O nível 0 remove a palavra desse arquivo; os níveis 1 a 5 são salvos e aplicados ao abrir um texto.

Em **Configurações**, a fonte escolhida afeta somente o texto japonês do leitor. As opções ficam descritas em `public/fonts/fonts.json`.

