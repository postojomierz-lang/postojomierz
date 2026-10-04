---
description: Kończę pracę - zapisz HANDOFF.md (maks. 15 linii), zacommituj i podaj linię /compact
disable-model-invocation: true
allowed-tools: Write, Bash(git add HANDOFF.md), Bash(git commit:*), Bash(git push:*)
---

Nadpisz plik `HANDOFF.md` w katalogu głównym bieżącego projektu, korzystając WYŁĄCZNIE z tego,
co już jest w kontekście rozmowy. Nie czytaj żadnych nowych plików i nie uruchamiaj innych komend
niż git poniżej.

Format: maks. 15 linii, po polsku, zwięźle:
- Cel:
- Stan:
- Decyzje:
- Zmienione pliki (i PR):
- Następny krok:
- Komendy do uruchomienia:

Potem zacommituj tylko ten plik i wypchnij na bieżącą gałąź (sesje w chmurze są ulotne,
niezacommitowany HANDOFF.md zginąłby z kontenerem):
`git add HANDOFF.md && git commit -m "Aktualizacja HANDOFF.md" && git push -u origin HEAD`

Po zapisie wypisz tylko jedno zdanie potwierdzenia, a na końcu dokładnie tę linię do wklejenia:

/compact zachowaj: cel projektu, konwencje, decyzje, zmienione pliki, następny krok z HANDOFF.md
