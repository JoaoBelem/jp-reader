"""Second-stage token merging rules applied after Sudachi tokenization.

Verb, adjective, adjectival-noun, and user-created rules stay separate here so
their behavior is easy to inspect and adjust without changing parser.py.
"""

VERB_TE_AUXILIARIES = {
    "いる", "いく", "行く", "くる", "来る", "みる", "見る", "おく", "置く",
    "しまう", "仕舞う", "くれる", "呉れる", "もらう", "貰う", "あげる", "上げる",
    "くださる", "下さる",
}
VERB_SUFFIXES_TO_MERGE = {"ながら"}


def apply_custom_merges(tokens: list[dict], rules: list[list[str]] | None = None) -> list[dict]:
    valid_rules = sorted(
        (
            rule for rule in (rules or [])
            if isinstance(rule, list)
            and len(rule) >= 2
            and all(isinstance(part, str) and part for part in rule)
        ),
        key=lambda rule: len(rule["parts"]),
        reverse=True,
    )
    current_tokens = tokens
    for _ in range(len(tokens)):
        merged_tokens = []
        index = 0
        changed = False
        while index < len(current_tokens):
            matched_rule = None
            for parts in valid_rules:
                if index + len(parts) > len(current_tokens):
                    continue
                if [token["surface"] for token in current_tokens[index:index + len(parts)]] == parts:
                    matched_rule = rule
                    break
            if matched_rule is None:
                merged_tokens.append(current_tokens[index])
                index += 1
                continue

            parts = matched_rule
            group = current_tokens[index:index + len(parts)]
            merged_token = merge_group(group)
            merged_token["dictionaryForm"] = "".join(parts)
            merged_tokens.append(merged_token)
            index += len(parts)
            changed = True
        current_tokens = merged_tokens
        if not changed:
            break
    return current_tokens


def is_aspectual_auxiliary(token: dict) -> bool:
    return token["partOfSpeech"] == "動詞" and token["dictionaryForm"] in VERB_TE_AUXILIARIES


def merge_group(group: list[dict]) -> dict:
    return {
        "surface": "".join(token["surface"] for token in group),
        "dictionaryForm": group[0]["dictionaryForm"],
        "reading": "".join(token["reading"] for token in group),
        "partOfSpeech": group[0]["partOfSpeech"],
    }


def consume_auxiliary_tokens(tokens: list[dict], cursor: int, group: list[dict]) -> int:
    while cursor < len(tokens) and tokens[cursor]["partOfSpeech"] == "助動詞":
        group.append(tokens[cursor])
        cursor += 1
    return cursor


def merge_verb_group(tokens: list[dict], index: int) -> tuple[list[dict], int]:
    group = [tokens[index]]
    cursor = consume_auxiliary_tokens(tokens, index + 1, group)

    # Join て/で only with listed auxiliary verbs, not ordinary actions or particles.
    while (
        cursor + 1 < len(tokens)
        and tokens[cursor]["surface"] in {"て", "で"}
        and is_aspectual_auxiliary(tokens[cursor + 1])
    ):
        group.extend((tokens[cursor], tokens[cursor + 1]))
        cursor = consume_auxiliary_tokens(tokens, cursor + 2, group)

    if cursor < len(tokens) and tokens[cursor]["surface"] in VERB_SUFFIXES_TO_MERGE:
        group.append(tokens[cursor])
        cursor += 1
    return group, cursor


def merge_adjective_group(tokens: list[dict], index: int) -> tuple[list[dict], int]:
    group = [tokens[index]]
    cursor = index + 1
    joined_me_suffix = False
    if cursor < len(tokens):
        following = tokens[cursor]
        if following["partOfSpeech"] == "形容詞" and following["dictionaryForm"] == "ない":
            group.append(following)
            cursor += 1
        elif following["partOfSpeech"] == "接尾辞" and following["surface"] == "め":
            group.append(following)
            cursor += 1
            joined_me_suffix = True

    if not joined_me_suffix:
        cursor = consume_auxiliary_tokens(tokens, cursor, group)
    return group, cursor


def merge_adjectival_noun_group(tokens: list[dict], index: int) -> tuple[list[dict], int]:
    group = [tokens[index]]
    cursor = index + 1
    if cursor + 2 < len(tokens):
        copula, topic, predicate = tokens[cursor:cursor + 3]
        if (
            copula["surface"] == "で"
            and copula["dictionaryForm"] == "だ"
            and topic["surface"] == "は"
            and predicate["dictionaryForm"] in {"ある", "ない"}
        ):
            group.extend((copula, topic, predicate))
            cursor += 3
    cursor = consume_auxiliary_tokens(tokens, cursor, group)
    return group, cursor


def merge_inflections(tokens: list[dict]) -> list[dict]:
    """Apply grammatical merges by part of speech, before user rules."""
    merged = []
    index = 0
    merge_rules = {
        "動詞": merge_verb_group,
        "形容詞": merge_adjective_group,
        "形状詞": merge_adjectival_noun_group,
    }

    while index < len(tokens):
        base = tokens[index]
        merge_rule = merge_rules.get(base["partOfSpeech"])
        if merge_rule is None:
            merged.append(base)
            index += 1
            continue

        group, cursor = merge_rule(tokens, index)
        if len(group) == 1:
            merged.append(base)
            index += 1
            continue

        merged_token = merge_group(group)
        if len(group) == 2 and group[1]["partOfSpeech"] == "接尾辞" and group[1]["surface"] == "め":
            merged_token["dictionaryForm"] = "".join(token["surface"] for token in group)
        merged.append(merged_token)
        index = cursor

    return merged
