#!/bin/sh
# SessionStart (startup|resume|compact): wczytaj HANDOFF.md, jeśli istnieje. Cicho, zawsze exit 0.
f="${CLAUDE_PROJECT_DIR:-$PWD}/HANDOFF.md"
[ -f "$f" ] || exit 0
echo "HANDOFF.md z tego projektu (notatka przekazania):"
head -n 20 "$f" | cut -c1-300
exit 0
