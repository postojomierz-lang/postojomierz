# HANDOFF (5.10.2026)
- Cel: Szlakownik (tatry/) — region 3D z R2, zgłoszenia 🐞, planer (lista 🎒, plan pobytu), dane ZBGIS dla Roháčy i Krywania.
- Stan: PR 228–232 scalone. 228: zgłoszenia 50–63 (błędy + minimapa, karta szczytu z czasem/kcal, lornetka ze szczegółami). 229: pomysły w docs (mapa 3D w planerze odłożona). 230: lista 🎒 co zabrać (planner/packlist.js). 231: łańcuchy i T4–T6 z OSM (tools/prepare_hard.py → public/data/region/hard.json). 232: łańcuchy OSM w 3D (chains.js `osm`) i ⛓ na mapie planera; zakładka 🗓 Pobyt (planner/stay.js, 27 tras).
- Zgłoszenia przejrzane do nr 63. Reguły 🎒: łańcuchy ≥20 m, teren alpejski ≥100 m (boczne ścieżki nie liczą się).
- ZBGIS (gałąź dane-zbgis): Roháče gotowe (69 roh_dmr5, 78 roh_orto). Bielovodská JEST pokryta (sk_dmr5 r1c10, r2c10, r2c11, r3c9). Dziura: pas Krywania ~20,00–20,04°E — agent Cowork ma pobrać 17 kafli kr_dmr5/kr_orto: 350_1182; 352_1182…1196; 354_1182…1196 (co 2). Podgórze 19,85–20,00°E bez DMR5 w ZBGIS (Copernicus).
- Decyzje: przeliczamy Roháče+Krywań razem po kaflach Krywania; Overpass: kumi.systems działa najlepiej; OSM nie ma łańcuchów na polskim szlaku na Rysy.
- Braki planu pobytu: prognoza w planie, trasy okrężne/przejścia, rozkłady dojazdów.
- Następny krok: po kaflach Krywania przetworzyć (ZBGIS_EXTRA/ZBGIS_ORTO_EXTRA, prepare_gugik, MERGE) i wysłać do R2 region2/; poprawić README (zdanie o Bielovodskiej); ~7.10 za zgodą usunąć stary region/ z R2; test na telefonie.
- Testy: python3 -m http.server 8765 w root + Playwright (scratchpad: pk.mjs planer/🎒, st.mjs pobyt, c3.mjs łańcuchy 3D; R2 przez page.route + curl, --no-proxy-server).
- Komendy: cd tatry && npm run build; python3 tatry/tools/bug_reports.py --since 63; python3 tatry/tools/prepare_hard.py; python3 tatry/tools/upload_r2.py --prefix region2/
