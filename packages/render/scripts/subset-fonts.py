#!/usr/bin/env python3
"""日本語フォント（Noto Sans JP）にない文字を補うフォントを作る（ADR-0013）。

Noto Sans KR からハングルだけ、Noto Sans SC から Noto Sans JP にない漢字・記号だけを取り出し、
packages/render/fonts/ に置く。あわせて、簡体字の補助フォントが持つ文字の一覧を
src/extra-font-coverage.ts に書き出す（描画の前に、どのフォントが要るかを判定するため）。

フォントを更新するときだけ手で実行する。生成物はリポジトリにコミットする。

    pip install fonttools
    python3 packages/render/scripts/subset-fonts.py

元のフォントは npm の @expo-google-fonts/noto-sans-{jp,kr,sc}（SIL Open Font License 1.1）。
"""

import base64
import os
import subprocess
import tarfile
import tempfile
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

VERSION = "0.4.4"
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "fonts"
COVERAGE = ROOT / "src" / "extra-font-coverage.ts"

# 簡体字の補助で見る範囲（CJK の記号・統合漢字・全角形）。U+3000〜U+FFFF のビット列で持つ
SC_START, SC_END = 0x3000, 0xFFFF
SC_RANGES = [(0x3000, 0x303F), (0x4E00, 0x9FFF), (0xFF00, 0xFFEF)]
HANGUL_RANGES = [(0x1100, 0x11FF), (0x3130, 0x318F), (0xA960, 0xA97F), (0xAC00, 0xD7FF)]


def fetch(pkg: str, tmp: Path) -> Path:
    subprocess.run(
        ["npm", "pack", "-q", f"@expo-google-fonts/{pkg}@{VERSION}"],
        cwd=tmp, check=True, stdout=subprocess.DEVNULL,
    )
    dest = tmp / pkg
    with tarfile.open(tmp / f"expo-google-fonts-{pkg}-{VERSION}.tgz") as t:
        t.extractall(dest, filter="data")
    return dest / "package"


def in_ranges(c: int, ranges) -> bool:
    return any(a <= c <= b for a, b in ranges)


def make(src: Path, dest: Path, keep: list[int]) -> set[int]:
    font = TTFont(src)
    have = set(font.getBestCmap())
    chars = sorted(c for c in keep if c in have)
    opts = subset.Options()
    opts.layout_features = ["*"]
    opts.notdef_outline = True
    s = subset.Subsetter(opts)
    s.populate(unicodes=chars)
    s.subset(font)
    font.save(dest)
    print(f"{dest.name}: {len(chars)} 文字, {os.path.getsize(dest)} bytes")
    return set(chars)


def main() -> None:
    OUT.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as t:
        tmp = Path(t)
        jp = fetch("noto-sans-jp", tmp)
        kr = fetch("noto-sans-kr", tmp)
        sc = fetch("noto-sans-sc", tmp)
        jp_chars = set(TTFont(jp / "400Regular/NotoSansJP_400Regular.ttf").getBestCmap())

        hangul = [c for c in range(0x1100, 0xD800) if in_ranges(c, HANGUL_RANGES)]
        sc_keep = [c for c in range(SC_START, SC_END + 1)
                   if in_ranges(c, SC_RANGES) and c not in jp_chars]

        for weight, tag in (("400Regular", "400"), ("700Bold", "700")):
            make(kr / weight / f"NotoSansKR_{weight}.ttf", OUT / f"NotoSansKR-Hangul-{tag}.ttf", hangul)
            sc_have = make(sc / weight / f"NotoSansSC_{weight}.ttf",
                           OUT / f"NotoSansSC-Supplement-{tag}.ttf", sc_keep)

        (OUT / "OFL.txt").write_bytes((kr / "LICENSE_FONT").read_bytes())

    bits = bytearray((SC_END - SC_START + 1 + 7) // 8)
    for c in sc_have:
        i = c - SC_START
        bits[i >> 3] |= 1 << (i & 7)
    COVERAGE.write_text(
        "// scripts/subset-fonts.py が生成する。手で編集しない\n"
        "/** 簡体字の補助フォントが持つ文字（U+3000 からのビット列、base64） */\n"
        f"export const SC_SUPPLEMENT_START = 0x{SC_START:X};\n"
        f'export const SC_SUPPLEMENT_BITS = "{base64.b64encode(bytes(bits)).decode()}";\n',
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
