#!/bin/sh
# PreCompact (tylko manual): jeśli HANDOFF.md istnieje i jest starszy niż 2 h, zablokuj /compact
# z prośbą o /koncze (Claude zapisuje HANDOFF sam, gdy proponuje /compact, więc to tylko zabezpieczenie). Brak pliku = nic nie rób. Auto-compact nie jest tu podpięty (nigdy nie blokujemy).
f="${CLAUDE_PROJECT_DIR:-$PWD}/HANDOFF.md"
[ -f "$f" ] || exit 0
if [ -n "$(find "$f" -mmin +120 2>/dev/null)" ]; then
  echo "HANDOFF.md ma ponad 2 h. Napisz „kończę” (lub /koncze), potem /compact (albo: touch HANDOFF.md, by pominąć)." >&2
  exit 2
fi
exit 0
