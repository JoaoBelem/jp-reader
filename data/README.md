# Níveis de palavras

`word-levels.json` guarda as palavras aprendidas e seu nível de familiaridade. O nível 0 não é armazenado; removê-lo da lista equivale a marcar a palavra como desconhecida.

`preferred-dictionary-entries.json` guarda, por forma do Sudachi, a entrada do Jitendex marcada como principal no leitor.

`word-merges.json` contém uma lista simples de sequências. Cada lista interna representa tokens adjacentes que serão unidos após a análise do Sudachi, e a forma final é a concatenação dos itens.
