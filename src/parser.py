import json
import re
import sqlite3
import sys
import zipfile
from pathlib import Path

from sudachipy import Dictionary, SplitMode
from postprocessing import apply_custom_merges, merge_inflections


tokenizer = Dictionary().tokenizer()
project_root = Path(__file__).resolve().parent.parent
dictionary_folder = project_root / "dict"
cache_folder = project_root / ".cache"
database_path = cache_folder / "dictionary.sqlite3"
dictionary_database = None
dictionary_titles = []
INDEX_VERSION = "2"


def structured_text(value) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return " ".join(filter(None, (structured_text(item) for item in value)))
    if not isinstance(value, dict):
        return ""
    content = value.get("content", "")
    if value.get("tag") == "br":
        return " "
    return structured_text(content)


def walk_nodes(value):
    if isinstance(value, list):
        for item in value:
            yield from walk_nodes(item)
    elif isinstance(value, dict):
        yield value
        yield from walk_nodes(value.get("content", ""))


def nodes_with_data(value, data_name: str, data_value: str):
    return [
        node for node in walk_nodes(value)
        if isinstance(node.get("data"), dict) and node["data"].get(data_name) == data_value
    ]


def list_item_texts(value) -> list[str]:
    items = []

    def visit(node):
        if isinstance(node, list):
            for child in node:
                visit(child)
        elif isinstance(node, dict):
            if node.get("tag") == "li":
                text = structured_text(node.get("content", "")).strip()
                if text:
                    items.append(text)
                return
            visit(node.get("content", ""))

    visit(value)
    return items


def japanese_sentence_parts(value) -> list[dict]:
    if isinstance(value, str):
        return [{"text": value}] if value else []
    if isinstance(value, list):
        parts = []
        for child in value:
            for part in japanese_sentence_parts(child):
                if "reading" not in part and parts and "reading" not in parts[-1]:
                    parts[-1]["text"] += part["text"]
                else:
                    parts.append(part)
        return parts
    if not isinstance(value, dict):
        return []
    tag = value.get("tag")
    if tag in {"rt", "rp"}:
        return []
    if tag == "br":
        return [{"text": " "}]
    if tag == "ruby":
        content = value.get("content", "")
        base = []
        reading = []
        children = content if isinstance(content, list) else [content]
        for child in children:
            if isinstance(child, dict) and child.get("tag") == "rt":
                reading.extend(japanese_sentence_parts(child.get("content", "")))
            elif isinstance(child, dict) and child.get("tag") == "rp":
                continue
            else:
                base.extend(japanese_sentence_parts(child))
        text = "".join(part["text"] for part in base)
        ruby = "".join(part["text"] for part in reading)
        return [{"text": text, "reading": ruby}] if text else []
    return japanese_sentence_parts(value.get("content", ""))


def extract_examples(sense_node) -> list[dict]:
    examples = []
    for example_node in nodes_with_data(sense_node, "content", "example-sentence"):
        japanese_nodes = nodes_with_data(example_node.get("content", ""), "content", "example-sentence-a")
        translation_nodes = nodes_with_data(example_node.get("content", ""), "content", "example-sentence-b")
        japanese_parts = japanese_sentence_parts(japanese_nodes[0].get("content", "")) if japanese_nodes else []
        japanese = "".join(part["text"] for part in japanese_parts)
        translation = structured_text(translation_nodes[0].get("content", "")).strip() if translation_nodes else ""
        if japanese or translation:
            examples.append({"japanese": japanese, "japaneseParts": japanese_parts, "translation": translation})
    return examples


def parse_definition(definition) -> list[dict]:
    if isinstance(definition, str):
        text = definition.strip()
        return [{"number": None, "glosses": [text], "examples": []}] if text else []
    if not isinstance(definition, dict):
        return []
    if definition.get("type") == "text":
        return parse_definition(str(definition.get("text", "")))

    content = definition.get("content", "")
    numbered_senses = [
        node for node in walk_nodes(content)
        if isinstance(node.get("data"), dict) and node["data"].get("sense-number") is not None
    ]
    if numbered_senses:
        senses = []
        for sense_node in numbered_senses:
            glossary_nodes = nodes_with_data(sense_node.get("content", ""), "content", "glossary")
            glosses = []
            for glossary_node in glossary_nodes:
                items = list_item_texts(glossary_node.get("content", ""))
                if items:
                    glosses.extend(items)
                else:
                    text = structured_text(glossary_node.get("content", "")).strip()
                    if text:
                        glosses.append(text)
            senses.append({
                "number": str(sense_node["data"].get("sense-number")),
                "glosses": list(dict.fromkeys(glosses)),
                "examples": extract_examples(sense_node),
            })
        return [sense for sense in senses if sense["glosses"] or sense["examples"]]

    glossary_nodes = nodes_with_data(content, "content", "glossary")
    if glossary_nodes:
        glosses = []
        for glossary_node in glossary_nodes:
            items = list_item_texts(glossary_node.get("content", ""))
            glosses.extend(items or [structured_text(glossary_node.get("content", "")).strip()])
        glosses = list(dict.fromkeys(gloss for gloss in glosses if gloss))
        if glosses:
            return [{"number": None, "glosses": glosses, "examples": extract_examples(content)}]

    text = structured_text(content).strip()
    return [{"number": None, "glosses": [text], "examples": []}] if text else []


def load_dictionary_index():
    global dictionary_database, dictionary_titles
    dictionary_titles = []
    archives = sorted(dictionary_folder.glob("*.zip"))
    source_state = [
        {"name": archive.name, "size": archive.stat().st_size, "modified": archive.stat().st_mtime_ns}
        for archive in archives
    ]
    source_json = json.dumps(source_state, ensure_ascii=False, sort_keys=True)
    cache_folder.mkdir(parents=True, exist_ok=True)

    database = sqlite3.connect(database_path)
    database.execute("CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    previous_state = database.execute("SELECT value FROM metadata WHERE key='sources'").fetchone()
    previous_version = database.execute("SELECT value FROM metadata WHERE key='index-version'").fetchone()
    existing_count = database.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='entries'").fetchone()
    if previous_state and previous_state[0] == source_json and previous_version and previous_version[0] == INDEX_VERSION and existing_count:
        dictionary_titles = json.loads(database.execute("SELECT value FROM metadata WHERE key='titles'").fetchone()[0])
        dictionary_database = database
        return

    database.execute("DROP TABLE IF EXISTS entries")
    database.execute("CREATE TABLE entries (expression TEXT NOT NULL, reading TEXT NOT NULL, dictionary TEXT NOT NULL, senses TEXT NOT NULL, score REAL NOT NULL)")
    for archive_path in archives:
        try:
            with zipfile.ZipFile(archive_path) as archive:
                members = archive.namelist()
                if "index.json" not in members:
                    continue
                index = json.loads(archive.read("index.json"))
                title = str(index.get("title") or archive_path.stem)
                dictionary_titles.append(title)
                bank_names = sorted(
                    (name for name in members if re.fullmatch(r"term_bank_\d+\.json", name)),
                    key=lambda name: int(re.search(r"(\d+)", name).group(1)),
                )
                for bank_name in bank_names:
                    rows = json.loads(archive.read(bank_name))
                    indexed_rows = []
                    for row in rows:
                        if not isinstance(row, list) or len(row) < 6 or not isinstance(row[0], str):
                            continue
                        senses = []
                        for definition in row[5]:
                            senses.extend(parse_definition(definition))
                        if senses:
                            indexed_rows.append((row[0], row[1] or "", title, json.dumps(senses, ensure_ascii=False), float(row[4] or 0)))
                    database.executemany("INSERT INTO entries VALUES (?, ?, ?, ?, ?)", indexed_rows)
        except (OSError, ValueError, KeyError, zipfile.BadZipFile, json.JSONDecodeError) as error:
            print(f"Ignorando dicionário {archive_path.name}: {error}", file=sys.stderr, flush=True)

    database.execute("CREATE INDEX IF NOT EXISTS entries_expression_idx ON entries(expression)")
    database.execute("CREATE INDEX IF NOT EXISTS entries_reading_idx ON entries(reading)")
    database.execute("INSERT OR REPLACE INTO metadata(key, value) VALUES('sources', ?)", (source_json,))
    database.execute("INSERT OR REPLACE INTO metadata(key, value) VALUES('index-version', ?)", (INDEX_VERSION,))
    database.execute("INSERT OR REPLACE INTO metadata(key, value) VALUES('titles', ?)", (json.dumps(dictionary_titles, ensure_ascii=False),))
    database.commit()
    dictionary_database = database


def lookup_word(term: str, surface: str, reading: str = "", candidates: list[dict] | None = None, preferred_entry: dict | None = None) -> dict:
    if dictionary_database is None or not dictionary_titles:
        return {"available": False, "found": False, "reading": None, "entries": [], "senses": [], "dictionaries": []}
    rows = []
    seen_rows = set()
    if isinstance(preferred_entry, dict) and all(isinstance(preferred_entry.get(key), str) for key in ("dictionary", "expression", "reading")):
        preferred_rows = dictionary_database.execute(
            "SELECT expression, reading, dictionary, senses, score FROM entries WHERE dictionary=? AND expression=? AND reading=? LIMIT 1",
            (preferred_entry["dictionary"], preferred_entry["expression"], preferred_entry["reading"]),
        ).fetchall()
        for row in preferred_rows:
            key = (row[0], row[1], row[2], row[3])
            seen_rows.add(key)
            rows.append((*row, len(surface), 1000, "preferred"))
    for candidate in candidates or []:
        if len(rows) >= 32:
            break
        if not isinstance(candidate, dict) or not isinstance(candidate.get("text"), str):
            continue
        query = candidate["text"]
        source_length = int(candidate.get("sourceLength", 0))
        transform_length = int(candidate.get("transformLength", 0))
        for column, match_source in (("expression", "term"), ("reading", "reading")):
            matches = dictionary_database.execute(
                f"SELECT expression, reading, dictionary, senses, score FROM entries WHERE {column}=? ORDER BY score DESC LIMIT 32",
                (query,),
            ).fetchall()
            for row in matches:
                key = (row[0], row[1], row[2], row[3])
                if key in seen_rows:
                    continue
                seen_rows.add(key)
                rows.append((*row, source_length, transform_length, match_source))
                if len(rows) >= 32:
                    break
            if len(rows) >= 32:
                break

    # Keep a direct reading fallback for tokens that have no following scan text.
    if reading and len(rows) < 32:
        remaining_results = 32 - len(rows)
        for row in dictionary_database.execute(
            "SELECT expression, reading, dictionary, senses, score FROM entries WHERE reading=? ORDER BY score DESC LIMIT ?",
            (reading, remaining_results),
        ).fetchall():
            key = (row[0], row[1], row[2], row[3])
            if key not in seen_rows:
                seen_rows.add(key)
                rows.append((*row, len(surface), 100, "reading"))

    entries = []
    selected_reading = None
    selected_dictionaries = []
    for expression, entry_reading, title, senses_json, _score, source_length, _transform_length, match_source in rows:
        if selected_reading is None and entry_reading:
            selected_reading = entry_reading
        if title not in selected_dictionaries:
            selected_dictionaries.append(title)
        senses = json.loads(senses_json)
        if senses:
            entries.append({
                "expression": expression,
                "reading": entry_reading,
                "dictionary": title,
                "senses": senses[:10],
                "sourceLength": source_length,
                "matchSource": match_source,
            })
    senses = [sense for entry in entries for sense in entry["senses"]]
    return {
        "available": True,
        "found": bool(entries),
        "reading": selected_reading,
        "entries": entries,
        "senses": senses[:10],
        "dictionaries": selected_dictionaries,
    }


def to_hiragana(text: str) -> str:
    return "".join(chr(ord(char) - 0x60) if "ァ" <= char <= "ヶ" else char for char in text)


def tokenize_text(text: str, custom_merges: list[dict] | None = None) -> dict:
    morphemes = tokenizer.tokenize(text, SplitMode.A)
    tokens = []
    for morpheme in morphemes:
        reading = morpheme.reading_form()
        tokens.append(
            {
                "surface": morpheme.surface(),
                "dictionaryForm": morpheme.dictionary_form(),
                "reading": to_hiragana(reading),
                "partOfSpeech": morpheme.part_of_speech()[0],
            }
        )
    return {"tokens": apply_custom_merges(merge_inflections(tokens), custom_merges)}


def main() -> None:
    try:
        load_dictionary_index()
    except Exception as error:
        print(f"Falha ao indexar os dicionários: {error}", file=sys.stderr, flush=True)
    print(json.dumps({"ready": True, "dictionaries": dictionary_titles}), flush=True)
    for line in sys.stdin:
        request_id = None
        try:
            request = json.loads(line)
            request_id = request.get("id")
            if request.get("action") == "lookup":
                response = {
                    "id": request_id,
                    "result": lookup_word(
                        request["term"],
                        request["surface"],
                        request.get("reading", ""),
                        request.get("candidates", []),
                        request.get("preferredEntry"),
                    ),
                }
            else:
                results = [tokenize_text(text, request.get("wordMerges", [])) for text in request["texts"]]
                response = {"id": request_id, "results": results}
        except Exception as error:
            response = {"id": request_id, "error": str(error)}
        print(json.dumps(response, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
