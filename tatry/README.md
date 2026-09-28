# Rysy 3D (prototyp)

Wirtualny spacer szlakiem **Morskie Oko → Rysy** w przeglądarce (three.js). Teren, zdjęcie
satelitarne i przebieg szlaku pochodzą z otwartych danych; to, czego w danych nie ma
(skały i trawa z bliska, drzewa, niebo, pogoda), silnik generuje sam.

Build: `npm install && npm run build` → `../rysy/index.html` (kod) oraz `../rysy/data` i `../rysy/textures`
(kopiowane z `public/`), serwowane przez GitHub Pages z `main`. `?q=low` włącza lżejszą wersję.

## Sterowanie
W/↑ i S/↓: idź szlakiem, Spacja: idź sam (jak na bieżni), Shift: szybciej, +/−: przyspieszenie
czasu, A/D/mysz: rozglądanie się, F: widok z drona, T: pora dnia, M: pogoda, H: pomoc.
Kliknięcie w profil wysokości przenosi w to miejsce szlaku.

HUD pokazuje nachylenie szlaku i to, jakie nachylenie ustawiłaby domowa bieżnia (max 15%).
Tempo marszu liczone jest wzorem Toblera.

## Dane
| Warstwa | Źródło | Rozdzielczość |
|---|---|---|
| wysokości przy szlaku | GUGiK NMT i DMR 5.0 (lidar) | 1 m, kafelki 256 m w pasie ±420 m od szlaku |
| wysokości w okolicy | GUGiK NMT; Słowacja: DMR 5.0 ÚGKK SR (lidar, `zbgis/`) | 4 m |
| panorama | Copernicus DEM GLO-30 | ~58 m |
| zdjęcie przy szlaku | ortofotomapa GUGiK (rocznik ~2012: wysokie słońce, mało cieni) | 0,5 m |
| zdjęcie w okolicy | ortofotomapa GUGiK; Słowacja: ortofotomozaika GKÚ Bratislava, NLC (2025, `zbgis_orto/`) | 2 m |
| las / kosodrzewina | ESA WorldCover 2021 | 10 m |
| szlak, jeziora, potoki, wodospady | OpenStreetMap przez Overture Maps | wektor (`tools/prepare_water.py` dla potoków) |
| tekstury z bliska | Poly Haven (CC0) | 1K |
| świerki, młode świerki, trawa, paproć | modele Poly Haven (CC0), wypieczone w Blenderze do impostorów (8 widoków, kolor + normalne) | `public/models/*.webp` |
| głazy | skany Poly Haven `rock_moss_set_01/02` (CC0), uproszczone w Blenderze do ~1500 trójkątów | `public/models/rocks.glb` |

Przygotowanie: `python3 tools/prepare.py` (panorama, las, szlak), potem `python3 tools/prepare_gugik.py`
(pobiera z geoportal.gov.pl, pamięć podręczna w `tools/.cache/`; słowacki DMR 5.0 czyta z `zbgis/*.tif`,
pobranych ręcznie z https://zbgis.skgeodesy.sk/mapka/sk/teren/export, bo serwery ÚGKK odrzucają połączenia
z chmury). Wyniki trafiają do `public/data/`. Zdroj produktov LLS: ÚGKK SR (CC BY 4.0). Ortofotomozaika SR: GKÚ Bratislava, NLC.

W silniku: siatka 1,25 m wokół kamery (przebudowywana w ruchu) na siatce 6 m, okno ostrej ortofotomapy
1×1 km wokół kamery, cienie gór liczone z modelu wysokości.

## Roślinność i kamienie (Blender)
`pip install bpy OpenImageIO "numpy<2"`, modele glTF 1K z Poly Haven, potem:
- `python3 tools/blender/bake_impostors.py <model.gltf> <out> <nazwa> <widoki> <szer> <wys>`: widoki z boku
  (Cycles: Diffuse Color, Normal, alfa);
- `python3 tools/pack_impostors.py <out> public/models spruce sapling grass fern`: atlasy WebP;
- `python3 tools/blender/decimate_rocks.py public/models/rocks.glb <rock_set>.gltf ...`.

W silniku (`src/impostor.js`, `src/groundcover.js`): impostor to jedna karta obracana do kamery,
mieszająca dwa najbliższe widoki, oświetlana normalnymi z Blendera, z cieniem i wiatrem. Trawa i paproć
rosną w promieniu ~40 m od kamery na siatce z ustalonym losowaniem (kępy nie przeskakują).

## Potoki i wodospady
`src/streams.js`: potok to wstęga ułożona w korycie (poziom wody = najniższy teren w poprzek koryta,
nigdy nie rośnie w dół potoku). Prędkość i piana rosną ze spadkiem; przy wodospadach z OSM woda jest
spieniona, a u podnóża unosi się pył wodny. Daleko od kamery teren jest rysowany siatką 6 m, która
przykrywa wąskie koryta, więc woda jest lekko przysuwana do kamery.

## Dźwięki
Nagrania z Freesound (CC0 i CC BY 4.0; autorzy i licencje w `public/sounds/credits.json`, wyświetlane
też w oknie pomocy). `python3 tools/fetch_freesound.py` pobiera je (wymaga nagłówka
`Authorization: Token <klucz>` dla freesound.org, np. wstrzykiwanego przez środowisko), a
`python3 tools/prepare_sounds.py <katalog>` tnie pętle (potok, wodospad, wiatr), pojedyncze kroki
(żwir, skała, trawa) i głosy ptaków oraz świstaka, i zapisuje spis `sounds.json`. Silnik
(`src/sound.js`, Web Audio) startuje po pierwszym klawiszu lub kliknięciu: wiatr zależny od wysokości,
lasu i pogody, przestrzenny szum najbliższych potoków i wodospadu, kroki według podłoża, ptaki według
piętra (strzyżyk i chór leśny w lesie, kopciuszek przy skałach, wieszczek na graniach), gwizdy
świstaka na halach. Klawisz N lub 🔊 wycisza.

## Zwierzęta
Modele: Quaternius „Ultimate Animated Animal Pack” (CC0). `python3 tools/blender/make_animals.py
<katalog glTF> public/models/animals` przebarwia jelenia (byk, łania) i robi sarnę (mniejsza, rudawa),
a niedźwiedzia brunatnego tworzy z wilka: siatka jest przerabiana w pozie spoczynkowej (masywny tułów
z garbem, grube łapy, szeroki łeb, krótki pysk, okrągłe uszy, bez ogona), więc animacje wilka dalej
nią poruszają. Zostają klipy Walk, Idle, Eating, Gallop, HeadLow.

`src/animals.js`: stado jeleni (byk i łanie) na halach, druga grupa łań, sarny przy skraju lasu nad
Morskim Okiem, jeden niedźwiedź w lesie i kosodrzewinie; miejsca losowane raz, zgodnie z mapą pokrycia
terenu. Zwierzęta pasą się, rozglądają i wędrują; gdy turysta podejdzie bliżej, jelenie i sarny
szczekają i uciekają galopem, a niedźwiedź pomrukuje i powoli odchodzi. Głosy: Freesound (szczekanie
jelenia CC0 Spamanator, sarny CC BY juskiddink, niedźwiedzie CC BY YleArkisto).

## Budynki
`python3 tools/prepare_buildings.py`: obrysy z OpenStreetMap (Overture) jako prostokąty z kalenicą
wzdłuż dłuższego boku i stylem: nowe i stare schronisko nad Morskim Okiem, kamienna Chata pod Rysmi,
małe drewniane budynki jako szałasy, reszta jako domy. `src/buildings.js` składa je z brył: granitowa
podmurówka, ściany z bali (lub desek, kamienia), strome dachy gontowe z okapami, kominy, okna
z podziałem na szybki i drzwi. Pod budynkami teren jest wyrównany do tarasu (`terrain.setFlats`),
a drzewa, trawa i głazy omijają budynki. Tekstury: Poly Haven `wood_plank_wall`,
`weathered_brown_planks`, `roof_slates_02`, `stone_wall` (CC0).

## Łańcuchy i klamry
`src/chains.js`: powyżej Buli pod Rysami (~2075 m), wszędzie gdzie szlak jest stromy (spadek > 40%),
biegnie łańcuch po stronie skały, zawieszony na kotwach co ~3 m i lekko zwisający między nimi
(ok. 700 m łańcuchów w 4 odcinkach). Na najbardziej stromych płytach (> 88%) są stalowe klamry
w poprzek ścieżki, co ~45 cm wysokości. Ogniwa, kotwy i klamry to instancje.

## Znaki szlaku
`src/trailmarks.js`: czerwony znak szlaku (biały–czerwony–biały) namalowany na głazach ok. 2 m od
ścieżki, co ~30 m (98 znaków), zwrócony do idącego w górę. Głaz ma jedną płaską ścianę pod znak,
reszta jest zaokrąglona i nieregularna (tekstura `mossy_rock`); znak rysowany na płótnie, z
nierównymi krawędziami i przetarciami.

## Drogowskazy PTTK
`src/signs.js`: stalowe słupki z białą tabliczką miejsca (nazwa, wysokość) i żółtymi strzałkami
z kolorem szlaku i czasem przejścia: Morskie Oko, Czarny Staw pod Rysami, Bula pod Rysami i Rysy.
Czasy liczone z profilu szlaku normami w stylu PTTK (3,5 km/h, +1 min na 10 m podejścia, na
stromej skale na 6 m, +1 min na 20 m zejścia), zaokrąglone do 5 min: bliskie, ale nie urzędowe.
Tył strzałki ma własną teksturę, więc napis czyta się z obu stron.

## Etykiety (chorągiewki)
`src/labels.js` + `tools/prepare_labels.py`: chorągiewki z nazwą i wysokością nad szczytami,
przełęczami, jeziorami, schroniskami i wodospadami (418 punktów; szczyty i przełęcze z OSM przez
Overture, polskie nazwy). Włączanie/wyłączanie: klawisz **L** albo przycisk 🏷 (zapamiętywane).
Etykiety za górami są ukryte (test widoczności po mapie wysokości), a na ekranie zostaje najwyżej
26 najważniejszych, niezachodzących na siebie.

## Wyostrzanie zboczy
W shaderze terenu (`src/materials.js`), bez nowych danych:
- normalne liczone na piksel z mapy wysokości 4 m (za łatką 1 m), więc grzbiety i żleby są
  ostrzejsze niż z siatki 6/12 m;
- proceduralne żebra i żleby biegnące po linii spadku na stromej skale (nie na trawie), trzy oktawy
  od 7 do 60 m, każda wygaszana, zanim zacznie migotać; na ścianach także łamane poziome półki;
- wyostrzenie zdjęcia (unsharp mask względem aktualnie widocznego poziomu mipmapy), także w panoramie;
- ściany nie dostają zielonych smug z zdjęcia robionego z góry i są mniej rozjaśniane;
- z bliska na ścianach druga, ~9x większa skala tekstury granitu (bloki i pęknięcia 20–40 m).

## Ścieżka
`src/trailsurface.js`: szlak podzielony na odcinki z szerokością i nawierzchnią (brzeg Morskiego
Oka 2,6 m bruk, schody na Czarny Staw, brzeg Czarnego Stawu częściowo brukowany, podejście pod Bulę
kamienna ścieżka, powyżej Buli goła skała i słabo wydeptany ślad).
- Ostra maska ścieżki w oknie 256 m wokół kamery (0,25 m na piksel zamiast 1,3 m), z nierówną,
  wydeptaną krawędzią; bruk z nieregularnych płyt granitowych w ziemi, niektórych brak.
- Na brukowanych odcinkach teren pod ścieżką jest wyrównany w poprzek (półka wcięta w zbocze),
  a na stromiznach (> 20%) stoją kamienne stopnie co ~20–28 cm wysokości.

## Roślinność i otoczenie (2)
- Kosodrzewina: kępy złożone w Blenderze z 11–15 sosenek `pine_sapling_small` odchylonych na boki
  (`tools/blender/make_dwarfpine.py`), upieczone jako impostory w 8 widokach. Pozycje z mapy pokrycia
  ESA oraz z ortofotomapy (ciemna zieleń na 1500–1950 m w pasie 400 m od szlaku), po 1–3 kępy na punkt.
- Pokrycie gruntu: drugi, rzadszy pierścień większych kęp do 70–95 m; więcej paproci i trawy w lesie;
  szczaw alpejski przy schroniskach i szałasach, żółte kwiaty na halach (`tools/blender/combine_gltf.py`
  łączy kilka modeli w jeden atlas).
- Martwe drewno: zwalone pnie i pniaki (Poly Haven, uproszczone do ~1500 trójkątów) w lesie przy szlaku
  (`src/deadwood.js`).

## Planer tras (polskie Tatry Wysokie)
`rysy/planer.html` (źródła: `planer.html`, `src/planner/`, budowany drugim przebiegiem Vite:
`vite.planer.config.js`). Mapa (Leaflet, podkład OpenTopoMap) z siecią znakowanych szlaków w ich
kolorach; klikasz start, cel i punkty pośrednie, trasa idzie tylko szlakami, wybierana jest najszybsza.
Długość, podejścia, zejścia, czas, profil pokolorowany szlakami, lista odcinków; import GPX
(dopasowany do szlaków), eksport GPX, start z lokalizacji telefonu, trasa zapisana w adresie strony.
- Dane: `tools/prepare_trails.py` → `public/data/region/trails.json`: relacje szlaków pieszych z
  OpenStreetMap (Overpass, kolor z `osmc:symbol`), punkty co ~10 m z wysokością z GUGiK NMT 1 m
  (Copernicus 30 m po słowackiej stronie), schroniska, szczyty, przełęcze, drogowskazy.
- Czas: 5 km/h po płaskim, +1 min na 10 m podejścia (na 6 m powyżej 35 %), +1 min na 25 m zejścia
  (na 10 m poniżej −30 %), wysokości wygładzone na ~60 m. Sprawdzone z tablicami PTTK (Kuźnice–Kasprowy
  3:00, Czarny Staw–Rysy 2:55 wobec 3:00, Zawrat–Pięć Stawów 1:20 wobec 1:15...); te same normy mają
  drogowskazy w 3D.
- Widok 3D jest na razie tylko dla Morskie Oko → Rysy; dowolne trasy regionu to następny etap.

## Widok 3D dowolnej trasy (region)
Planer otwiera `index.html?trasa#r=lat,lon;...`: silnik wyznacza trasę po szlakach tak jak planer
(`src/region.js`) i wczytuje tylko dane wokół niej z katalogu `region/` w katalogu głównym
repozytorium (serwowanego obok `rysy/`, nie kopiowanego do builda):
- bloki 1024 m: wysokości 4 m (`region/base/h_i_j.bin`, z maską lidaru) i ortofotomapa 2 m
  (`region/photo/o_i_j.jpg`), kafle 256 m z lidarem 1 m i zdjęciem 0,5 m w pasie 200 m od każdego
  szlaku (`region/tiles/`), pokrycie terenu, jeziora, potoki, wodospady, budynki i etykiety regionu;
- przygotowanie: te same skrypty z `AREA=region`
  (`prepare.py`, `prepare_gugik.py`, `prepare_water.py`, `prepare_buildings.py`, `prepare_labels.py`).
`src/routeinfo.js` wyprowadza z tagów OSM: szerokość i nawierzchnię ścieżki (asfalt, droga, bruk,
schody, skała), kolor znaków na kamieniach, łańcuchy na trudnych odcinkach (`sac_scale` ≥ 3, powyżej
1900 m), drogowskazy w miejscach drogowskazów z OSM, przy mijanych schroniskach i jeziorach oraz na starcie i mecie (nazwy mijanych schronisk,
przełęczy, szczytów i jezior, czasy z norm), nazwy miejsc w HUD i tytuł trasy. Bez parametru `trasa`
aplikacja działa jak dotąd (Morskie Oko → Rysy z `public/data`).

## Chmury
Warstwa cumulusów na ~3,4 km (`CLOUDS` w `src/materials.js`), dryfująca z wiatrem ~8 m/s. Ta sama
gęstość rysuje chmury w shaderze nieba (ciemniejsza podstawa, jaśniejszy brzeg pod słońce) i rzuca ich
cienie na teren, drzewa, kosówkę i budynki, więc cienie są dokładnie pod chmurami. Zachmurzenie zależy
od pogody: słonecznie 45 %, mgiełka 20 %, pochmurno 88 %, mgła 95 %.

## Dziennik (rekordy, duch, szczyty)
`src/journal.js`, zapisywany w pamięci przeglądarki (`localStorage`, klucz `rysy-journal`):
- przejście trasy do mety w widoku 3D trafia do dziennika (data, długość, podejścia, czas);
- rekord trasy liczy się tylko bez przyspieszenia (×1) i bez skoków po profilu; `Home` zaczyna od nowa;
- duch: półprzezroczysta sylwetka idąca najlepszym przejściem trasy (zapis pozycji co 5 s),
  niebieska kropka na profilu, w HUD „duch N m przed/za Tobą”;
- szczyty zdobyte po drodze (z nazwami z OSM), komunikaty na ekranie;
- w planerze: „☆ Dodaj do ulubionych”, lista ulubionych z rekordami, ostatnie przejścia (kliknięcie
  otwiera trasę), zdobyte szczyty, statystyki łączne.

## Słowackie Tatry Wysokie w regionie
Region planera i widoku 3D obejmuje polskie i słowackie Tatry Wysokie (19,85–20,31°E, 49,08–49,29°N):
Štrbské Pleso, Popradské pleso, Rysy od południa, Téryho i Zbojnícka chata, Łomnica. Słowacki lidar
DMR 5.0 i ortofotomapa (ÚGKK SR / GKÚ Bratislava) leżą surowe na gałęzi `dane-zbgis`; przetwarzanie:
`ZBGIS_EXTRA=<katalog DMR> ZBGIS_ORTO_EXTRA=<katalog orto> tools/run_region.sh` (region liczony w 12
kawałkach, `CHUNK=i,j`, na koniec `MERGE=1`). Bez lidaru (Bielovodská dolina, podgórze) – Copernicus 30 m.
