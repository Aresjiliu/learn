"""Shared Russian lookup keys; preserve й and optionally preserve ё."""

import unicodedata


def normalize_strict_word(value: str) -> str:
    text = unicodedata.normalize('NFD', str(value or '').strip().lower())
    text = text.replace('и\u0306', 'й').replace('е\u0308', 'ё')
    return ''.join(char for char in text if unicodedata.category(char) != 'Mn')


def normalize_word(value: str) -> str:
    return normalize_strict_word(value).replace('ё', 'е')
