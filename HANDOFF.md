# HANDOFF (6.10.2026)
- Cel: Szlakownik (tatry/) — widok 3D z R2 i planer; jeden adres: https://postojomierz-lang.github.io/postojomierz/rysy/ (otwiera planer).
- Stan: PR 242–257 scalone, nic w toku. 254/255 obejścia (płoty, ławki, tablice, wiaty, kosze, studnie, kapliczki, stogi; kamienie ≥14 m od budynków). 256 modele zwierząt ponawiane po 503. 257 zgł. 71–80: kamienie na brzegach stawów, czas dojścia szlakami w karcie szczytu (trailGraph w region.js), TAA (tłumienie rozbłysków, historia przy zmianie rozdzielczości, wyostrzenie 0.45), szybsza przebudowa siatki 1 m, potoki w korycie/pod ścieżką, limit 25 km w 3D, szczyty z OSM w 3D, asfalt (kanał B maski szlaku).
- Konwencje: po polsku; odpowiedź kończy `🔵 **Możliwe kolejne kroki:**` z krokami numerowanymi; polecenia w osobnych blokach kodu, bez HTML; po zmianie PR do main i od razu merge; przed /compact lub /clear Claude sam aktualizuje HANDOFF.md.
- Decyzje: mid/low bez post-processingu; drogowskazy PTTK już są (signs.js); asfalt dla surface asphalt/paved/concrete i dróg tertiary/unclassified/pedestrian (5 m); trasy >25 km w 3D przycinane (MAX_KM w region.js).
- Zgłoszenia: ostatnie przejrzane nr 80 (python3 tatry/tools/bug_reports.py --since 80).
- Następny krok: właściciel ocenia na ultra rozbłyski/ostrość (ff i amount w taa.js), asfalt Palenica–Morskie Oko, potoki, przycięcia przy ×30 (jeśli zostają: przebudowa siatki 1 m w kawałkach w kolejnych klatkach); ~7.10 za zgodą usunąć stary region/ z R2.
- Testy: python3 -m http.server 8765 w root (run_in_background, timeout 2 h) + Playwright --no-proxy-server, ?odkrycie=0 wyłącza animacje odkryć; skrypty w scratchpadzie: yard.mjs, card72.mjs, rep73.mjs, asf.mjs.
- Komendy: cd tatry && npm run build; python3 tatry/tools/upload_r2.py --prefix region2/ [--dry-run]
