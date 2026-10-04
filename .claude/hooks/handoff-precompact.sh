#!/bin/sh
# PreCompact (tylko manual): jeśli HANDOFF.md istnieje i jest starszy niż 30 min, zablokuj /compact
# z prośbą o /koncze. Brak pliku = nic nie rób. Auto-compact nie jest tu podpięty (nigdy nie blokujemy).
f="${CLAUDE_PROJECT_DIR:-$PWD}/HANDOFF.md"
[ -f "$f" ] || exit 0
if [ -n "$(find "$f" -mmin +30 2>/dev/null)" ]; then
  echo "HANDOFF.md ma ponad 30 min. Napisz „kończę” (lub /koncze), potem /compact (albo: touch HANDOFF.md, by pominąć)." >&2
  exit 2
fi
exit 0
