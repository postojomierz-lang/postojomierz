# HANDOFF (4.10.2026)
- Cel: Szlakownik (tatry/) — region 3D z R2, zgłoszenia 🐞, planer (lista 🎒, plan pobytu 🗓), dane ZBGIS dla Roháčy i Krywania.
- Stan: PR 228–234 scalone. 233: plan pobytu — data „Od”, dzienna prognoza Open-Meteo (16 dni, 1500 m), przestawianie szczytów na dobre dni (dolina/odpoczynek w złe), pętle i przejścia, dojazdy 🚌 (bez godzin; e-podroznik.pl, cp.sk); README: Bielovodská ma lidar. 234: 6 tras SK (magistrala, Téryho–Priečne–Zbojnícka, Rysy SK…), start Łomnicy przy kolejce, +40 min przez granicę, trasy ≤75 min od bazy, odpoczynek wg strony granicy.
- Zgłoszenia: brak nowych po nr 63.
- Decyzje: Krywań i pętla Boczań usunięte z katalogu (graf: Krywań 21,7 h — pas bez danych; Boczań = trasa tam i z powrotem); powtórki celu → zostaje pętla/przejście; „Możliwe kolejne kroki” pisać kursywą, NIE <span> (aplikacja nie renderuje HTML).
- ZBGIS (gałąź dane-zbgis): Roháče gotowe; brak jeszcze 17 kafli Krywania kr_dmr5/kr_orto (350_1182; 352_1182…1196; 354_1182…1196 co 2). Podgórze 19,85–20,00°E zostaje na Copernicus.
- Zmienione pliki: tatry/src/planner/stay.js, tatry/planer.html, tatry/README.md, rysy/*.html.
- Następny krok: po kaflach Krywania przeliczyć Roháče+Krywań (ZBGIS_EXTRA/ZBGIS_ORTO_EXTRA, prepare_gugik, MERGE) → R2 region2/, potem Krywań wrócić do planu pobytu; ~7.10 za zgodą usunąć stary region/ z R2; test planu pobytu na telefonie; pomysł: godzina ostatniego powrotu busem przy przejściach.
- Testy: python3 -m http.server 8765 w root + Playwright --no-proxy-server (scratchpad: st.mjs, st2.mjs sztuczna prognoza, st3.mjs prawdziwa przez curl, cat.mjs katalog tras w Node na grafie).
- Komendy: cd tatry && npm run build; python3 tatry/tools/bug_reports.py --since 63; python3 tatry/tools/upload_r2.py --prefix region2/
