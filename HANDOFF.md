# HANDOFF (8.10.2026)
- Cel: Szlakownik (tatry/) — widok 3D z R2 i planer; adres: https://postojomierz-lang.github.io/postojomierz/rysy/ (otwiera planer).
- Stan: PR 264–272 scalone, nic w toku. 265 brzegi (żwir) + asfalt bez pasów; 266–267 drzewa i trawa poza asfaltem; 268 mgła powietrzna, jasne wapienie, desnow (zdjęcia sat.), kosówka zaokrąglona; 269 kolory stawów (aLake/lakeTint), nawierzchnia szlaku, chmury; 270 Patria (A-framy), Łomnica/Skalnaté, #82 lukarny w powietrzu, #83 „Pokaż trasę” → fitRoute; 272 Patria: rzędy lukarn z balkonikami (dormers w skrzydłach, rows/rowH/balcony), desnow łapie rozmyty śnieg zgrubnego zdjęcia i ma ciemniejszy cel (hale pod Łomnicą szarozielone).
- Konwencje: po polsku (też statusy); odpowiedź kończy `🔵 **Możliwe kolejne kroki:**` z krokami numerowanymi; polecenia w osobnych blokach kodu, bez HTML; po zmianie PR do main i od razu merge; przed /compact lub /clear Claude sam aktualizuje HANDOFF.md.
- Decyzje: Kasprowy (stacje, obserwatorium) już mają modele w HUTS (buildings.js); lukarny/balkony liczone od głównego skrzydła (main.fr); desnow tylko łata — porządnie wymaga letniej ortofotomapy SK (ZBGIS niedostępny z kontenera).
- Otwarte: pod Łomnicą żółtokremowe obwódki wokół kosówki (zgrubne zdjęcie); nie sprawdzono ścieżki na hali, jakości high/ultra, Štrbské/Popradské z bliska.
- Zgłoszenia: ostatnie przejrzane nr 83 (python3 tatry/tools/bug_reports.py --since 83).
- Następny krok: właściciel ocenia grafikę na telefonie; za zgodą usunąć stary region/ z R2.
- Testy: scratchpad/realizm/scripts/q*.sh (same stawiają http.server 8765, uruchamiać w tle); shot.mjs <nazwa> low '<trasa>' '[{"n":..,"camS":metry,"up":..,"at":[lat,lon,dh]}]'.
- Komendy: cd tatry && npm run build; python3 tatry/tools/bug_reports.py --since 83
