# HANDOFF (6.10.2026)
- Cel: Szlakownik (tatry/) — widok 3D z R2 i planer; jeden adres: https://postojomierz-lang.github.io/postojomierz/rysy/ (otwiera planer).
- Stan: PR 242–252 scalone, nic w toku. Wyszukiwarka z wodospadami/stawami/punktami widokowymi/źródłami, rysy/ → planer, zgł. 64–67 i 70 poprawione, Biblioteka odkryć w Dzienniku, alpha-to-coverage, TAA na high/ultra (bez drżenia, lekkie wyostrzenie), postój „Idź sam” na scenę zwierząt.
- Konwencje: po polsku; odpowiedź kończy `🔵 **Możliwe kolejne kroki:**` z krokami numerowanymi 1., 2., 3.; polecenia w osobnych blokach kodu, bez HTML; po zmianie PR do main i od razu merge; przed propozycją /compact lub /clear Claude sam aktualizuje HANDOFF.md (hook blokuje dopiero przy notatce starszej niż 2 h).
- Decyzje: mid/low bez post-processingu (MSAA + alpha-to-coverage); kierunek przesunięcia TAA potwierdzony pomiarem (drżenie 0,30→0,13); sceny zwierząt co 1–2 min, 8–10 s; Overpass działa tylko z maps.mail.ru.
- Zmienione pliki (i PR): prepare_trails.py, planner/search.js, planner/main.js, planner/library.js, planer.html, index.html (242–247); vegetation3d.js, impostor.js, main.js, taa.js (248–250); HANDOFF.md, CLAUDE.md, .claude/hooks/handoff-precompact.sh (251–252).
- Zgłoszenia: ostatnie przejrzane nr 70 (python3 tatry/tools/bug_reports.py --since 70).
- Następny krok: właściciel ocenia na ultra ostrość i spokój obrazu (siła wyostrzenia: amount 0.35 w tatry/src/taa.js); ewent. mail.ru jako pierwszy serwer Overpass; ~7.10 za zgodą usunąć stary region/ z R2.
- Testy: python3 -m http.server 8765 w root + Playwright --no-proxy-server; 3D w kontenerze bardzo wolne (q=high ~1 kl/s).
- Komendy: cd tatry && npm run build; POI_ONLY=1 python3 tatry/tools/prepare_trails.py; python3 tatry/tools/upload_r2.py --prefix region2/ [--dry-run]
