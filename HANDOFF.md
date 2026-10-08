# HANDOFF (8.10.2026, wieczór)
- Cel: Szlakownik (tatry/) — widok 3D z R2 i planer; adres: https://postojomierz-lang.github.io/postojomierz/rysy/ (otwiera planer).
- Stan: PR 264–278 scalone, nic w toku. Ostatnio: 270–274 Patria (dwie ciemne piramidy z rzędami lukarn i balkonów; dormers w skrzydłach, rows/rowH/balcony), Łomnica/Skalnaté, #82 lukarny w powietrzu; 272 desnow (rozmyty śnieg, ciemniejszy cel); 275–276 hotele w wyszukiwarce (planner/hotels.js) i ikona 🏨 w 3D; 277 plan pobytu: przyjazd/wyjazd bez trasy, „Ułóż inaczej”, opis zasad; 278 postać 3D w edytorze (rysy/figura.js, osobny build vite.figure.config.js, ładowany leniwie), lepszy zarost, 🚩 zgłaszanie zdjęć w grupie (do bug_reports), bez zdjęć w publicznym rankingu.
- Konwencje: po polsku (też statusy); odpowiedź kończy `🔵 **Możliwe kolejne kroki:**` z krokami numerowanymi; polecenia w osobnych blokach kodu, bez HTML; po zmianie PR do main i od razu merge; przed /compact lub /clear Claude sam aktualizuje HANDOFF.md.
- Decyzje: figura.js poza service workerem (offline: rysunek SVG); zgłoszone zdjęcie ukryte lokalnie (localStorage szlakownik-hidden-photos), serwer nadal je wysyła; desnow to łata — porządnie wymaga letniej ortofotomapy SK.
- Otwarte: pod Łomnicą żółte obwódki wokół kosówki; śledzenie pozycji w tle wymaga aplikacji natywnej (#85, odpowiedziane); nie sprawdzono high/ultra.
- Zgłoszenia: ostatnie przejrzane nr 88 (python3 tatry/tools/bug_reports.py --since 88).
- Następny krok: właściciel sprawdza na telefonie edytor 3D, plan pobytu, hotele; za zgodą usunąć stary region/ z R2.
- Testy: scratchpad/realizm/scripts/q*.sh (same stawiają http.server 8765, w tle); shot.mjs <nazwa> low '<trasa>' '[{"n":..,"camS":metry,"up":..,"at":[lat,lon,dh]}]'; planer: scratchpad/trasy/*.mjs (serwer 8767).
- Komendy: cd tatry && npm run build; python3 tatry/tools/bug_reports.py --since 88
