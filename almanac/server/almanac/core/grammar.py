"""Command grammar. Mirrors apps/web/src/grammar/parse.ts; both run packages/grammar-fixtures.

command    = hotlink | invocation | search ;
hotlink    = digit , { digit } ;
invocation = security , [ function ] | function ;
security   = token , { token } , sector ;
function   = code , { argument } ;
argument   = name , "=" , value | value ;
search     = any input that matches none of the above ;
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

SECTORS = [
    "EQUITY",
    "INDEX",
    "GOVT",
    "CORP",
    "CMDTY",
    "CURNCY",
    "CRYPTO",
    "ECON",
    "MUNI",
    "PFD",
    "MTGE",
    "MMKT",
]
SECTOR_ALIASES = {
    "EQ": "EQUITY",
    "IX": "INDEX",
    "GV": "GOVT",
    "CP": "CORP",
    "CM": "CMDTY",
    "FX": "CURNCY",
    "CR": "CRYPTO",
    "EC": "ECON",
}

_NAMED = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)=(.*)$", re.S)
_DIGITS = re.compile(r"^[0-9]+$")


@dataclass
class Aliases:
    functions: dict[str, str] = field(default_factory=dict)
    sectors: dict[str, str] = field(default_factory=dict)
    securities: dict[str, str] = field(default_factory=dict)


@dataclass
class Context:
    codes: set[str]
    aliases: Aliases = field(default_factory=Aliases)


def _tokenize(text: str) -> list[str]:
    """Split on whitespace outside quotes; uppercase outside quotes; strip the quotes."""
    tokens: list[str] = []
    cur: list[str] = []
    in_quote = False
    has_token = False
    for ch in text:
        if ch == '"':
            in_quote = not in_quote
            has_token = True
            continue
        if not in_quote and ch.isspace():
            if has_token:
                tokens.append("".join(cur))
                cur, has_token = [], False
            continue
        cur.append(ch if in_quote else ch.upper())
        has_token = True
    if has_token:
        tokens.append("".join(cur))
    return tokens


def _sector_of(token: str, ctx: Context) -> str | None:
    if token in SECTORS:
        return token
    if token in SECTOR_ALIASES:
        return SECTOR_ALIASES[token]
    user = {k.upper(): v.upper() for k, v in ctx.aliases.sectors.items()}
    return user.get(token)


def _function_of(token: str, ctx: Context) -> str | None:
    fa = {k.upper(): v.upper() for k, v in ctx.aliases.functions.items()}
    code = fa.get(token, token)
    return code if code in ctx.codes else None


def _split_args(tokens: list[str]) -> tuple[list[str], dict[str, str]]:
    positional: list[str] = []
    named: dict[str, str] = {}
    for t in tokens:
        m = _NAMED.match(t)
        if m:
            named[m.group(1).lower()] = m.group(2)
        else:
            positional.append(t)
    return positional, named


def parse(raw: str, ctx: Context) -> dict[str, Any]:
    text = " ".join(raw.split())
    if not text:
        return {"kind": "empty"}
    if _DIGITS.match(text):
        return {"kind": "hotlink", "n": int(text)}

    tokens = _tokenize(text)
    if not tokens:
        return {"kind": "empty"}

    # User security aliases expand in first position: OIL -> WTI CMDTY.
    sec_aliases = {k.upper(): v for k, v in ctx.aliases.securities.items()}
    if tokens[0] in sec_aliases:
        tokens = _tokenize(sec_aliases[tokens[0]]) + tokens[1:]

    # Only tokens before the first name=value argument can hold the security and code.
    head_end = next((i for i, t in enumerate(tokens) if _NAMED.match(t)), len(tokens))

    sector_idx = None
    for i in range(head_end - 1, 0, -1):  # needs at least one token before it
        if _sector_of(tokens[i], ctx):
            sector_idx = i
            break

    if sector_idx is not None:
        security = " ".join(tokens[:sector_idx])
        sector = _sector_of(tokens[sector_idx], ctx)
        rest = tokens[sector_idx + 1 :]
        code = None
        if rest and not _NAMED.match(rest[0]):
            fa = {k.upper(): v.upper() for k, v in ctx.aliases.functions.items()}
            code = fa.get(rest[0], rest[0])
            rest = rest[1:]
        positional, named = _split_args(rest)
        return {
            "kind": "invocation",
            "security": security,
            "sector": sector,
            "code": code,
            "positional": positional,
            "named": named,
        }

    code = _function_of(tokens[0], ctx)
    if code:
        positional, named = _split_args(tokens[1:])
        return {
            "kind": "invocation",
            "security": None,
            "sector": None,
            "code": code,
            "positional": positional,
            "named": named,
        }

    return {"kind": "search", "text": " ".join(tokens)}
