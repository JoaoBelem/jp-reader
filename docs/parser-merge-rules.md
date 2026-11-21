# Regras de junção do parser

Este documento é a lista de referência para decidir quais tokens do Sudachi devem aparecer juntos no leitor. As regras gramaticais ficam em `src/postprocessing.py`, separadas do processamento principal em `src/parser.py`. As uniões criadas pelo usuário ficam como listas de partes em `data/word-merges.json`; o resultado é formado juntando as partes sem separador.

## Princípios

- Manter regras independentes para verbos, adjetivos e 形状詞; uma regra de uma classe não se aplica às outras.
- Juntar terminações que fazem parte da forma flexionada do verbo ou do adjetivo.
- Juntar uma forma auxiliar somente quando ela estiver na lista explícita da classe correspondente.
- Não juntar partículas e palavras seguintes por padrão. Só adicionar uma forma quando ela funcionar como continuação direta do verbo ou adjetivo.
- Preservar o texto visível original (`surface`) e a leitura ao juntar tokens. Manter a forma de dicionário do token principal para a busca e os níveis de familiaridade.

## Regras implementadas

| Forma | Aplicação | Exemplo esperado |
| --- | --- | --- |
| Verbo + auxiliares flexionados reconhecidos pelo Sudachi | Somente verbos | 食べています, 読まなかった |
| `て` / `で` + verbo auxiliar da lista `VERB_TE_AUXILIARIES` | Somente verbos; a lista inclui いる, みる, いく, くる, おく, しまう, くれる, もらう e あげる | 食べている, 食べてみる, 持っていく, 読んでしまう |
| `ながら` | Anexada ao verbo imediatamente anterior | 食べながら, 歩きながら |
| `ない` e `め` | Somente adjetivos; partículas e auxiliares seguintes não são absorvidos após `め` | 高くない, 長め で |
| `ではある` / `ではない` | Somente predicados de tipo 形状詞 | 重要ではない |

O parser não junta qualquer verbo que apareça depois de `て` ou `で`: apenas formas da lista de auxiliares. Assim, sequências de ações como `食べて帰る` e partículas como `食べてから` continuam separadas.

## Próximas formas

Adicionar nesta seção as formas que forem identificadas durante a leitura. Para cada uma, registrar a forma do token no Sudachi, a classe gramatical relevante e exemplos que devem e não devem ser unidos.
