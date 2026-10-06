# HANDOFF (6.10.2026)
- Cel: Szlakownik (tatry/) — widok 3D z R2 i planer; jeden adres: https://postojomierz-lang.github.io/postojomierz/rysy/ (otwiera planer).
- Stan: PR 242–250 scalone. 242/243 wyszukiwarka: wodospady, stawy, punkty widokowe, źródła (POI_ONLY=1 w prepare_trails.py). 244 rysy/ → planer. 245 zgł. 64–67 (lornetka bez przycinania, schroniska z daleka, zwierzęta omijają stawy). 246 kroki numerowane. 247 Biblioteka odkryć w Dzienniku (library.js). 248 alpha-to-coverage + postój „Idź sam” na scenę. 249 TAA (src/taa.js, high/ultra, ?taa=0/1). 250 zgł. 70: TAA bez drżenia + lekkie wyostrzenie.
- Konwencje: odpowiedź kończy `🔵 **Możliwe kolejne kroki:**`, kroki numerowane 1., 2., 3., polecenia w osobnych blokach kodu, bez HTML; po zmianie PR do main i od razu merge.
- Podpowiedzi sesji: właściciel pracuje w JEDNEJ sesji; po dużej fazie /koncze + /compact, nowy temat /koncze + /clear.
- Decyzje: mid/low bez post-processingu (tylko MSAA + alpha-to-coverage); TAA kierunek przesunięcia potwierdzony pomiarem (drżenie 0,30→0,13); sceny zwierząt co 1–2 min, 8–10 s; Overpass działa tylko z maps.mail.ru.
- Zgłoszenia: ostatnie przejrzane nr 70 (python3 tatry/tools/bug_reports.py --since 70).
- Następny krok: właściciel ocenia na ultra ostrość i spokój obrazu (siła wyostrzenia: amount 0.35 w taa.js); ewent. mail.ru jako pierwszy serwer Overpass; ~7.10 za zgodą usunąć stary region/ z R2.
- Testy: python3 -m http.server 8765 w root + Playwright --no-proxy-server; scratchpad: still.mjs (drżenie TAA), taa.mjs, fx.mjs, lib.mjs, sik.mjs; 3D w kontenerze bardzo wolne (q=high ~1 kl/s).
- Komendy: cd tatry && npm run build; POI_ONLY=1 python3 tatry/tools/prepare_trails.py; python3 tatry/tools/upload_r2.py --prefix region2/ [--dry-run]
