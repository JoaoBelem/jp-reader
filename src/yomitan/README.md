# Yomitan — código copiado

Estes arquivos vêm do [Yomitan](https://github.com/yomitan/yomitan), sob a licença
GPL-3.0-or-later, e existem aqui apenas para transformar formas japonesas de busca
usadas na consulta ao Jitendex. O projeto não depende da pasta `yomitan-master` nem de
nenhum código externo em tempo de execução: só destes módulos.

Arquivos copiados (nenhum foi modificado):

| Arquivo | Papel |
| --- | --- |
| `js/language/language-transformer.js` | Aplicação das transformações de conjugação. |
| `js/language/language-transforms.js` | Auxiliares de transformação usados pelo japonês. |
| `js/language/ja/japanese-transforms.js` | Regras de conjugação do japonês. |
| `js/core/log.js` | Logging usado pelo transformador. |
| `js/core/event-dispatcher.js` | Dependência de `log.js`. |
| `js/core/extension-error.js` | Dependência de `log.js`. |

A estrutura de pastas segue a do upstream (`js/language`, `js/core`) para que os imports
relativos continuem válidos e os arquivos permaneçam idênticos aos originais.

## Como atualizar

1. Baixe o código do Yomitan.
2. Copie os mesmos seis caminhos, sobrescrevendo os arquivos.
3. Rode `node -e "import('./src/yomitan-search.js').then(m => console.log(m.createYomitanSearchCandidates('食べた').length))"` para confirmar que os imports resolvem.

Se o projeto for distribuído, inclua o texto da licença GPL-3.0-or-later junto destes arquivos.
