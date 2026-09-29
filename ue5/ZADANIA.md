# Zadania dla operatora Unreala (lokalny Claude z Unreal MCP)

Kanał pracy: autor skryptów (Claude w chmurze) zapisuje tu zadania i wysyła zmiany do repozytorium
`postojomierz-lang/postojomierz`. Operator na komputerze z Unrealem wykonuje je w edytorze (najlepiej przez
**Unreal MCP**, bez klikania po ekranie), a wyniki zapisuje w `ue5/feedback/` i wysyła (commit + push na `main`).

Zasady:
- Zawsze najpierw pobierz zmiany (GitHub Desktop: *Fetch origin → Pull*, albo `git pull`).
- Projekt Unreala jest poza repozytorium: `Documents\Unreal Projects\Rysy` (poziom `/Game/Rysy/Maps/Rysy`).
- Nie commituj projektu Unreala ani plików tymczasowych. Commituj tylko `ue5/feedback/…` i, jeśli trzeba,
  poprawki w `ue5/unreal/build_scene.py` (opisz je w `log.txt`: co i dlaczego).
- Wyniki każdej rundy: folder `ue5/feedback/runda_NN/` (zrzuty `NN_opis.jpg` do ~0,6 MB, `log.txt`).

---

## Runda 8 (po rundzie 7: `feedback/runda_07/log.txt`, zrzuty)

Etap 2 planu: wygląd z bliska. Siatka dalekiego terenu nadal `v6` (bez importu). **Heightmapa i maski krajobrazu bez
zmian** (nie trzeba ich wczytywać).

Diagnoza koloru pasa near z rundy 7: zieleń jest prawdziwa (na północ od krawędzi gęsty las świerkowy doliny
Roztoki/Rybiego Potoku; stare zdjęcie panoramy pokazuje to samo, G/R ~1,7). Różnica na ekranie bierze się stąd, że
krajobraz jest pokryty modelami świerków i kosodrzewiny (oliwkowe), a pas near był samym zdjęciem.

Co się zmieniło w repozytorium:
- **Rośliny w pasie near**: `export/foliage_spruce_band.csv` (44 tys. świerków) i `foliage_dwarfpine_band.csv`
  (38 tys. kęp), te same reguły co w krajobrazie, z mapy pokrycia regionu; wysokości z powierzchni pasa.
  Skrypt stawia je jako osobne aktory `Rysy_spruce_band_*`, `Rysy_dwarfpine_band_*` (przełącznik `BAND_FOLIAGE`).
- **Tekstury warstw** (Poly Haven 2k, CC0; w `export/textures/`): Rock `rock_04`, Scree `rock_ground_02`
  (granitowy żwir), Grass `leafy_grass` (prawdziwa trawa zamiast zabarwionej ściółki), Forest `forest_leaves_04`
  (igliwie), DwarfPine `forest_ground_04`, Path `rocky_trail`; łagodniejsze tinty (koniec neonowej zieleni).
  Skrypt zaimportuje je pod nowymi nazwami (`T_leafy_grass_D` …); stare `T_rocky_terrain_02_*`,
  `T_forrest_ground_01_*` można potem usunąć.
- **`PHOTO_SATURATION`** (góra skryptu, domyślnie 1,0): nasycenie ortofoto w krajobrazie i dalekim terenie
  (parametr `PhotoSaturation` w materiałach).

Zadania:
1. `git pull`. (Heightmapy nie wczytuj; `REIMPORT_TEXTURES` nie jest potrzebne.)
2. `build_scene.py`. Do `log.txt`: linie `[Rysy]` materiałów, liczby instancji `spruce_band` / `dwarfpine_band`,
   ostrzeżenia (szczególnie `Material: nie polaczono …` przy węźle Desaturation: jeśli jest, podaj nazwy wejść węzła).
3. **Wydajność** najpierw (Morskie Oko, szczyt, jak w rundzie 7) **z roślinami w pasie**; jeśli GPU wzrośnie o więcej niż
   ~2 ms, zmierz też z ukrytymi aktorami `*_band_*` i podaj obie wartości.
4. **Krawędź N** (15), **NE** (09), **z ziemi** (17, 17b) i **z pasa** (18): czy granica krajobraz/pas przestała być
   widoczna; czy rośliny w pasie stoją na ziemi (nie wiszą, nie toną).
5. **Tekstury z bliska**: 3 zrzuty z wysokości oczu (1,7 m) na szlaku: łąka przy Morskim Oku, piarg/skała pod Rysami,
   las świerkowy przy Morskim Oku (19, 20, 21). Oceń każdą warstwę: skala (czy kafel się nie powtarza nachalnie),
   kolor względem ortofoto dalej, ostrość.
6. **Nasycenie**: ze szczytu (11) i z krawędzi N (15) porównaj `PhotoSaturation` 1,0 / 0,85 / 0,7 (w materiale
   krajobrazu i obu dalekiego terenu ta sama wartość); wpisz wybraną do `log.txt`.
7. Zrzuty jak w rundzie 7 + 19–21, 1920×1080. `ue5/feedback/runda_08/`, commit „UE5 feedback: runda 08”, push,
   wiadomość do sesji B „runda 08 gotowa”.

Nie rób jeszcze: postaci Third Person. Nic nie kupuj.

---

## Runda 7 (po rundzie 6: `feedback/runda_06/log.txt`, zrzuty)

Początek etapu 2 planu (wygląd z bliska). **Siatka dalekiego terenu zamrożona**: nadal `SM_RysyFar_v6`,
`T_RysyFar_v6`, `T_RysyNear_v6` (bez ponownego importu).

Co się zmieniło w repozytorium:
- **Materiały od zera** (`fresh_material`): po `delete_all_material_expressions` skrypt listuje resztę węzłów
  i kasuje je po jednym (`delete_material_expression`). Jeśli czegoś nie da się wylistować albo zostaną węzły,
  w logu jest ostrzeżenie `[Rysy] M_…: …`. Kontrola tekstur przez `get_material_used_textures`.
- **Pas near jak krajobraz**: nowe maski warstw dla pasa (`far_near_masks_a/b.png` → `T_RysyNearMask_A/B`),
  liczone tymi samymi regułami co maski krajobrazu (zdjęcie, mapa pokrycia regionu, wysokość, nachylenie).
  `M_RysyNear` miesza przy kamerze te same tekstury warstw co krajobraz, dalej zdjęcie (ta sama odległość
  przejścia).
- **Pasy N i S krajobrazu**: mapa pokrycia z `tatry/` tam nie sięgała, więc cały pas był piargiem (oliwkowo-żółty
  przy krawędzi). Teraz używa mapy pokrycia regionu: las i kosodrzewina jak dalej od krawędzi.
  `export/masks_*.png` i `weights/` się zmieniły.
- **Brzegi**: przecięcie poziomu wody 1 m od brzegu. W danych krawędź kwadratów wody nad gruntem niższym od lustra:
  Morskie Oko 0,1 % (maks. 9 cm), Czarny Staw 0,1 % (maks. 5 cm). `export/heightmap.png` zmieniona
  (**liczby importu bez zmian**). Uwaga: na krawędzi W, na dnie dwóch jezior przeciętych granicą, 5 z 16 128 próbek
  granicy różni się od zamrożonej siatki v6 (do 1,6 m, pod wodą).

Zadania:
1. `git pull`.
2. Nowa mapa wysokości do istniejącego krajobrazu; `REIMPORT_TEXTURES = True` na ten przebieg (bez commitowania).
3. Uruchom `build_scene.py`. Do `log.txt` wszystkie linie `[Rysy] M_…` (materiały, czyszczenie węzłów) i ostrzeżenia.
   Sprawdź w każdym materiale Rysy (`M_RysyLandscape`, `M_RysyFar`, `M_RysyNear`, `M_RysySimple`, `M_RysyWater`), czy
   nie ma zduplikowanych parametrów/osieroconych węzłów, i `get_material_used_textures` dla `M_RysyFar` i `M_RysyNear`.
   Nie naprawiaj ręcznie przed zapisaniem tego stanu w logu (potem możesz).
4. **Krawędź N** (15), **narożnik NE** (09) i **z poziomu gruntu przy krawędzi** (17b z rundy 6): czy pas near ma teraz
   ten sam kolor i charakter co krajobraz tuż obok (także z bliska, ~50–150 m); czy pasy N/S krajobrazu nie są już
   żółtawe.
5. **Brzegi** 03, 05, 06, 07.
6. **Zrzuty** jak w rundzie 6 (01–11b, 15, 16, 17, 17b), 1920×1080. **Wydajność** jak w rundzie 6 (pas near ma teraz
   droższy materiał: podaj GPU ms).
7. `ue5/feedback/runda_07/`, commit „UE5 feedback: runda 07”, push, wiadomość do sesji B „runda 07 gotowa”.

Nie rób jeszcze: postaci Third Person, zmian w liczbie drzew. Tekstur warstw z Fab jeszcze nie podmieniaj
(to następna runda: najpierw sprawdzimy, jak wyglądają obecne na obu materiałach).

---

## Runda 6 (po rundzie 5: `feedback/runda_05/log.txt`, zrzuty 01–16c)

Ostatnia runda „sceny” (etap 1 planu): po niej siatka dalekiego terenu zostaje zamrożona, a następne rundy
zajmą się wyglądem z bliska (tekstury warstw), potem chodzeniem.

Co się zmieniło w repozytorium:
- **M_RysyFar bez zdjęcia** (błąd z rundy 5): skrypt kasował starą teksturę po zbudowaniu materiału, UE zerował
  wtedy jego odwołania. Teraz kolejność: import tekstur → sprzątanie starych wersji → budowa materiałów, a po
  budowie kontrola `get_used_textures` (w logu `[Rysy] M_RysyFar: tekstura T_RysyFar_v6`; jeśli materiał nie używa
  zdjęcia, skrypt buduje go od nowa i ostrzega).
- `export/far_terrain.obj` → **`SM_RysyFar_v6`**, tekstury **`T_RysyFar_v6`**, **`T_RysyNear_v6`** (treść jak v5):
  zamiast pionowego fartucha pod krawędzią jest **zakładka** 4 m w głąb pod krajobrazem, 0,5 m niżej (ciemna
  poszarpana linia na krawędzi N, 15, to był fartuch widoczny tam, gdzie dalekie LOD krajobrazu odsuwają krawędź).
- **Kolor pasa near vs krajobraz**: tekstury po obu stronach granicy mają ten sam kolor (różnica 1–5/255), więc
  różnicę robił materiał: krajobraz nawet z daleka miał normalne z kafelkowanych tekstur warstw. Teraz te normalne
  wygaszają się razem z przejściem na ortofoto (z daleka tylko geometria, jak w dalekim terenie), a `M_RysyFar` /
  `M_RysyNear` mają te same Roughness 0,9 / Specular 0,3 co krajobraz.
- **Brzegi**: przecięcie poziomu wody 1,5 m od brzegu zamiast 3 m. W danych krawędź kwadratów wody nad gruntem
  niższym od lustra: Morskie Oko 22 % → 0,6 %, Czarny Staw 22 % → 1,2 % obwodu (ząbki na 03).
  `export/heightmap.png` i maski się zmieniły (**liczby importu bez zmian**).

Zadania:
1. `git pull`.
2. Nowa mapa wysokości do istniejącego krajobrazu (jak w rundzie 5); `REIMPORT_TEXTURES = True` na ten jeden
   przebieg (bez commitowania).
3. `build_scene.py`. Do `log.txt` linie `[Rysy] …` dalekiego terenu i materiałów (`M_RysyFar: tekstura …`,
   `M_RysyNear: tekstura …`, sloty, osie, kolizja, usunięte zasoby) i ostrzeżenia. Sprawdź `get_used_textures`
   obu materiałów sam. Po skrypcie ma zostać tylko `SM_RysyFar_v6`, `T_RysyFar_v6`, `T_RysyNear_v6`. Zapisz poziom.
4. **Krawędź N** (kamera 15) i **narożnik NE** (09): czy zniknęła ciemna linia; czy kolor/jasność pasa near zgadza
   się teraz z krajobrazem; czy zakładka gdzieś wystaje nad krajobraz (jasne łaty tuż przy krawędzi).
5. **Z bliska przy krawędzi** (jak 16, ale krawędź N): czy krajobraz z bliska nadal ma szczegół z tekstur warstw
   (wygaszanie normalnych nie może go psuć w odległości do ~100 m).
6. **Brzegi** 03 i 05 (ząbki), 06, 07.
7. **Zrzuty** 01–11b, 15, 16 jak w rundzie 5, 1920×1080. **Wydajność** jak w rundzie 5.
8. `ue5/feedback/runda_06/`, commit „UE5 feedback: runda 06”, push, wiadomość do sesji B „runda 06 gotowa”.

Nie rób jeszcze: postaci Third Person, podmiany tekstur terenu, zmian w liczbie drzew.

---

## Runda 5 (po rundzie 4: `feedback/runda_04/log.txt`, zrzuty 01–14b)

Co się zmieniło w repozytorium:
- **Przyczyna złego szwu na N i S**: dane bazowe 4 m kończą się ~80 m przed krawędziami N i S kwadratu, więc sam
  krajobraz w tych pasach był z DEM 55 m, a ortofoto ze starego zdjęcia 17 m/px (jasny, rozmyty pas na 08).
  Teraz tło krajobrazu to **DEM 4 m regionu** (`region/base`) i **ortofoto regionu 2 m** (z przejściem 25 m).
  `export/heightmap.png` i `export/ortho.jpg` się zmieniły (**liczby importu bez zmian**).
- `export/far_terrain.obj`, zasób **`SM_RysyFar_v5`** (1,0 mln trójkątów, Nanite): **dwa materiały**:
  - `near`: pas 800 m wokół krajobrazu, siatka 10 m na DEM 4 m regionu, własna tekstura
    `far_near.jpg` → **`T_RysyNear_v5`** (4096 px, ~1,9 m/px, ortofoto regionu), materiał `M_RysyNear`;
  - `far`: reszta (siatka 60 m, też na DEM 4 m tam, gdzie region sięga) + pierścień, tekstura **`T_RysyFar_v5`**,
    materiał `M_RysyFar`;
  - kołnierz nadal ma wierzchołek w każdej próbce krawędzi krajobrazu (w danych ±1,6 cm), a DEM 4 m zgadza się z
    krawędzią krajobrazu (95 % punktów w ±1 cm), więc nie ma już płachty z załamaniem.
- Brzegi: podniesienie gruntu przecina poziom wody stromo (~0,3 m na metr), żeby linia wody szła po obrysie jeziora,
  a nie po trójkątach 1,3 m (drobne ząbki na 03 i 05).
- `build_scene.py`: mgła **D** (0,0012 / 0,1 / 0,7 / 5 km / (0,45; 0,55; 0,70)); sloty `near`/`far` rozpoznawane
  po nazwie (w logu `[Rysy] Daleki teren: sloty …`); stare tekstury kasowane bez fałszywego alarmu (odwołania z
  przebudowanych `M_RysyFar`/`M_RysyNear` pomijane); `generate_overlap_events` przez właściwość.

Zadania:
1. `git pull`.
2. Wczytaj nową mapę wysokości do istniejącego krajobrazu (jak w rundzie 4). Ortofoto i maski krajobrazu też się
   zmieniły (`T_RysyOrtho`, `T_RysyMask_*`): na ten jeden przebieg ustaw w `build_scene.py`
   `REIMPORT_TEXTURES = True` (bez commitowania tej zmiany), żeby skrypt zaimportował je od nowa.
3. Uruchom `build_scene.py`. Do `log.txt`: linie `[Rysy] Daleki teren: …` (sloty, osie/znaki/skala, kolizja,
   usunięte zasoby) i ostrzeżenia `[Rysy]`. Po skrypcie w `/Game/Rysy/FarTerrain/` ma być tylko `SM_RysyFar_v5`,
   a w `/Game/Rysy/Textures/` z dalekiego terenu tylko `T_RysyFar_v5` i `T_RysyNear_v5`. Zapisz poziom.
4. **Szew** (08, 09 + pomiar jak w rundzie 4; dodatkowo krawędź N: kamera jak 08, ale (60000, −230000), yaw −90):
   czy zniknęła gładka płachta i załamanie; czy tekstura pasa `near` łączy się z ortofoto krajobrazu bez wyraźnej
   zmiany ostrości/koloru; czy widać przejście `near` → `far` (~800 m od krawędzi).
5. **Pas N i S krajobrazu** z bliska (kamera 3 m nad gruntem ~40 m od krawędzi S, patrząc wzdłuż niej):
   czy grunt i tekstura wyglądają jak reszta krajobrazu.
6. **Horyzont**: zrzuty 11/11b z mgłą D ze skryptu; czy dobrana mgła działa bez ręcznych zmian.
7. **Brzegi** 03, 05 (czy drobne ząbki zniknęły), 06, 07.
8. **Zrzuty** 01–11b jak w rundzie 4 + nowe z punktów 4 i 5 (15_szew_krawedz_N, 16_pas_S_z_bliska), 1920×1080.
9. **Wydajność** jak w rundzie 4 + trójkąty `SM_RysyFar_v5`, Nanite, liczba slotów.
10. `ue5/feedback/runda_05/`, commit „UE5 feedback: runda 05”, push, wiadomość do sesji B „runda 05 gotowa”.

Nie rób jeszcze: postaci Third Person, podmiany tekstur terenu, zmian w liczbie drzew.

---

## Runda 4 (po rundzie 3: `feedback/runda_03/log.txt`, zrzuty 01–12)

Co się zmieniło w repozytorium:
- `export/far_terrain.obj`, zasób **`SM_RysyFar_v4`** (618 tys. trójkątów zamiast 904 tys.):
  - **szew**: zamiast gęstych linii w poprzek granicy jest osobny pas (kołnierz) od krawędzi dziury w siatce 60 m
    do granicy krajobrazu, z wierzchołkiem w **każdej próbce krawędzi krajobrazu (co 1,3 m)** i wysokością z
    heightmapy (różnica ≤ 1 cm w danych). Pod granicą fartuch 15 m w dół (na wypadek szczelin od LOD krajobrazu).
    Wnętrze pod krajobrazem jest teraz puste (bez zatopionej siatki);
  - **pierścień horyzontu**: 6 pierścieni do 110–150 km, 450 m n.p.m. minus krzywizna Ziemi (daleka krawędź leży
    na prawdziwym horyzoncie, ok. −2,9 km w narożnikach). Kolor jednolity: brzeg tekstury (ostatnie ~1,7 km)
    przechodzi w jeden nizinny kolor, więc nie ma już smug.
- `export/far_terrain.jpg`, zasób **`T_RysyFar_v4`**: jak w v3 plus wygaszenie brzegu do koloru nizin.
- `export/heightmap.png`: na płaskich brzegach niższych od jeziora podniesienie gruntu wygasa łagodnie do 16 m od
  brzegu (w rundzie 3 było ostre cięcie na 6 m: drobne progi na 03 i 05). **Liczby importu bez zmian.**
- `build_scene.py`:
  - **mgła** jako stałe na górze skryptu: `FOG_DENSITY = 0.0025`, `FOG_HEIGHT_FALLOFF = 0.2`,
    `FOG_MAX_OPACITY = 0.8`, `FOG_START_DISTANCE_M = 3000`, `FOG_COLOR = (0.32, 0.40, 0.52)` (Fog Inscattering Color);
  - slot materiału siatki zawsze na `M_RysyFar`; stare zasoby (`far`, `TEX_far_terrain*`, starsze `SM_RysyFar*` i
    `T_RysyFar*`) kasowane po nazwie, jeśli nic poza poziomem ich nie używa (w logu `[Rysy] Daleki teren: usuniety …`
    albo `zostawiam … (uzywa go …)`);
  - kolizja dalekiego terenu: profil `NoCollision` + `NO_COLLISION`, w logu linia `[Rysy] Daleki teren: kolizja …`.

Zadania:
1. `git pull`.
2. Wczytaj nową mapę wysokości do istniejącego krajobrazu (jak w rundzie 3), kontrola kilku punktów przy brzegach.
3. Uruchom `build_scene.py`. Do `log.txt`: linie `[Rysy] Daleki teren: …` (osie/znaki/skala, kolizja, usunięte
   zasoby) i wszystkie ostrzeżenia `[Rysy]`. Sprawdź, co zostało w `/Game/Rysy/FarTerrain/` i `/Game/Rysy/Textures/`
   (powinno być tylko `SM_RysyFar_v4` i `T_RysyFar_v4` z dalekiego terenu); resztę `SM_RysyFar_v3` / `T_RysyFar_v3`
   usuń ręcznie, jeśli skrypt ją zostawił. Zapisz poziom.
4. **Kolizja**: po zapisaniu poziomu i ponownym otwarciu sprawdź kolizję komponentu `Rysy_DalekiTeren`
   (ma być NoCollision). Jeśli nadal jest QUERY_AND_PHYSICS, sprawdź, czy da się to zmienić na zasobie siatki
   (Collision Complexity / usunięcie kolizji w edytorze siatki) i opisz, co zadziałało.
5. **Szew**: kamery 08 i 09 + pomiar far − krajobraz wzdłuż krawędzi jak w rundzie 3 (oczekiwane ≈ 0 m). Czy z
   daleka (01, 04) widać szczeliny na granicy albo fartuch?
6. **Horyzont i mgła** (ze szczytu, kamera 11, pitch 0 i −10): zrób zrzuty z mgłą ze skryptu oraz dwoma wariantami
   ustawionymi ręcznie w aktorze „Mgla”:
   - A (skrypt): density 0,0025, falloff 0,2, max opacity 0,8, start 3 km, kolor (0,32; 0,40; 0,52);
   - B: density 0,0015, falloff 0,2, max opacity 0,7, start 5 km, kolor (0,45; 0,55; 0,70);
   - C: bez mgły (aktor ukryty, zostaje tylko perspektywa powietrzna atmosfery).
   Wybierz najlepszy (naturalne zamglenie gór w oddali, bez granatowego pasa, pierścień nie rzuca się w oczy) i
   **wpisz wybrane liczby do log.txt**; jeśli żaden nie pasuje, dobierz własne. Opisz też sam pierścień: kolor,
   czy widać jego krawędź, czy styk z dalekim terenem (pas wygaszonej tekstury ~17 km od środka) jest widoczny.
7. **Brzegi**: 03 i 05 z tych samych kamer (czy zniknęły drobne progi), 06 i 07 dla porównania.
8. **Zrzuty** 01–12 z tych samych kamer co w rundzie 3 (11: mgła A, 12: wybrany wariant), 1920×1080.
9. **Wydajność** jak w rundzie 3 (Morskie Oko, szczyt) + trójkąty `SM_RysyFar_v4` i Nanite.
10. Zapisz w `ue5/feedback/runda_04/`, commit „UE5 feedback: runda 04”, push, wiadomość do sesji B „runda 04 gotowa”.

Nie rób jeszcze: postaci Third Person, podmiany tekstur terenu, zmian w liczbie drzew.

---

## Runda 3 (po rundzie 2: `feedback/runda_02/log.txt`, zrzuty 01–10)

Co się zmieniło w repozytorium:
- `export/heightmap.png`: brzegi jezior to teraz gładka rampa (na wygładzonej odległości od brzegu, bez schodków
  rastra 1,3 m): teren schodzi pod lustro do ~3 m od brzegu, dalej wychodzi nad nie. Kwadraty wody (`lakes.json`)
  sięgają 3,2–5 m za brzeg, więc ich ząbkowana krawędź chowa się pod ziemią także na płaskich brzegach (05, 03).
  **Liczby importu bez zmian.**
- `export/far_terrain.obj` (nowa siatka, zasób **`SM_RysyFar_v3`**):
  - pas ±240 m wokół granicy krajobrazu z liniami siatki co 6 m i płynnym przejściem od wysokości krawędzi lidaru
    do DEM 55 m (koniec z progami −18/+11 m na szwie, zrzuty 08/09);
  - **pierścień horyzontu**: od obrysu siatki do 110–150 km na wysokości 450 m (kolor z krawędzi zdjęcia), ma
    zasłonić granatowy pas pod niebem (04, 10, 01). Pierścień jest celowo niesymetryczny (150/120 km w ±X,
    140/110 km w ±Y), żeby skrypt rozpoznał osie i znaki; `landscape.json` → `far_terrain.bounds_cm` liczone
    razem z nim.
- `export/far_terrain.jpg` (zasób **`T_RysyFar_v3`**): 8192 px zamiast 2048 (~4,3 m/px). Tam, gdzie sięga
  ortofoto regionu 2 m (to samo źródło co krajobraz), jest ono; dalej stare zdjęcie, z łagodnym przejściem.
  Ciemny prostokąt przy krawędzi S powinien zniknąć.
- `build_scene.py`:
  - `EXPOSURE_BIAS = -0.5` (Twoja wartość z rundy 2),
  - daleki teren importowany pod nazwami z `landscape.json` (`SM_RysyFar_v3`, `T_RysyFar_v3`), więc nowy eksport
    wchodzi bez ręcznego kasowania; po imporcie OBJ skrypt przestawia slot siatki na `M_RysyFar` i usuwa zbędny
    materiał „far” + `TEX_far_terrain`.

Zadania:
1. **Pobierz zmiany** (`git pull`).
2. **Wczytaj nową mapę wysokości do istniejącego krajobrazu** tak jak w rundzie 2 (render target +
   `landscape_import_heightmap_from_render_target`), sprawdź kilka punktów przy brzegach jezior.
3. **Usuń stare zasoby dalekiego terenu** (nieużywane po tej rundzie): `/Game/Rysy/FarTerrain/SM_RysyFar`,
   `/Game/Rysy/FarTerrain/far`, `/Game/Rysy/FarTerrain/TEX_far_terrain`, `/Game/Rysy/Textures/T_RysyFar`.
   Najpierw uruchom skrypt (punkt 4), potem kasuj, żeby aktor nie został bez siatki. Zanotuj, czy coś jeszcze się
   do nich odwołuje.
4. **Uruchom `ue5/unreal/build_scene.py`**. Wklej do `log.txt` linię `[Rysy] Daleki teren: osie …, znaki …, skala …`
   (oczekiwane jak w rundzie 2: osie `[0, 1, 2]`, znaki `[1, -1, 1]`, skala 1/1) oraz wszystkie ostrzeżenia `[Rysy]`.
   Sprawdź, czy w `/Game/Rysy/FarTerrain/` jest tylko `SM_RysyFar_v3` (bez nowego „far” i `TEX_far_terrain…`).
5. **Sprawdź i opisz**:
   - szew na granicy 5,2 km z tych samych kamer co 08 i 09: czy zniknęły progi/fałdy i czy różnica ostrości oraz koloru
     tekstury jest mniejsza; jeśli możesz, powtórz pomiar far − krajobraz wzdłuż krawędzi jak w rundzie 2;
   - horyzont (04, 10, 01): czy granatowy pas zniknął; czy pierścień wygląda naturalnie (za płasko, za jasno,
     widoczna krawędź?);
   - brzegi (03, 05, 06, 07): czy zniknęły ząbki kwadratów wody na płaskich brzegach; czy teren nie wystaje nad wodę
     w dziwnych miejscach;
   - ekspozycję przy −0,5 (czy skrypt ją teraz ustawia sam).
6. **Zrzuty** z tych samych kamer co w rundzie 2 (01–10, współrzędne w `feedback/runda_02/log.txt`), 1920×1080.
7. **Wydajność**: jak w rundzie 2 (Play w nowym oknie, `StartFPSChart/StopFPSChart`) przy Morskim Oku i na szczycie;
   podaj też liczbę trójkątów `SM_RysyFar_v3` i czy ma Nanite.
8. Zapisz wszystko w `ue5/feedback/runda_03/`, commit „UE5 feedback: runda 03”, push, potem wiadomość do sesji B
   „runda 03 gotowa”.

Nie rób jeszcze: postaci Third Person, podmiany tekstur terenu, zmian w liczbie drzew.

---

## Runda 2 (po rundzie 1: zrzuty 01–04 i `feedback/log.txt`)

Co się zmieniło w repozytorium:
- `export/heightmap.png`: brzegi jezior rysuje teraz teren (pas 1 m tuż pod wodą, dalej grunt podniesiony
  nad lustro), więc schodkowa krawędź kwadratów wody chowa się pod ziemią. **Liczby importu bez zmian.**
- `export/far_terrain.obj` + `far_terrain.jpg`: teren 35 × 29 km wokół krajobrazu (DEM 55 m ze zdjęciem),
  koniec z pustym niebieskim horyzontem. Skrypt importuje go i sam dopasowuje osie.
- `build_scene.py`:
  - aktor `Rysy_PostProcess` z ekspozycją automatyczną przesuniętą o `EXPOSURE_BIAS = -1.0` (góra skryptu),
  - grunt atmosfery szarozielony zamiast niebieskiego,
  - usunięte wielkie latające etykiety nad drogowskazami (to one wisiały w powietrzu na zrzucie 02),
  - drogowskazy 4 m od ścieżki, PlayerStart 15 m dalej na szlaku (poprzednio stał pod tablicą),
  - poprawione ostrzeżenie `get_object is deprecated`.

Zadania:
1. **Pobierz zmiany** z repozytorium.
2. **Wczytaj nową mapę wysokości do istniejącego krajobrazu** (bez tworzenia nowego):
   tryb Landscape → *Manage* → *Import* → Heightmap File: `ue5\export\heightmap.png` → import do istniejącego
   krajobrazu (te same wymiary 4033 × 4033). Jeśli się nie da, usuń stary krajobraz i zaimportuj od nowa z liczbami z
   README (Location 0/0/184000, Scale 130/130/285.2, 63×63 quads, 2×2 sections, 32×32 components).
3. **Uruchom `ue5/unreal/build_scene.py`** (raz wystarczy, krajobraz już jest). Sprawdź w Output Log linię
   `[Rysy] Daleki teren: osie …, znaki …, skala …` i wklej ją do `log.txt`.
4. **Sprawdź i opisz**:
   - czy daleki teren łączy się z krajobrazem bez szczelin i uskoków (widok ze szczytu Rysów, patrz 04);
     jeśli jest przesunięty, obrócony albo lustrzany, opisz w którą stronę;
   - ekspozycję w trybie Play: dobierz `Exposure Compensation` w `Rysy_PostProcess` tak, żeby trawa przy
     kamerze nie była biała, a niebo nie ciemne; **zapisz wartość, którą wybrałeś**;
   - brzegi Morskiego Oka i Czarnego Stawu z bliska (czy zniknęły schodki);
   - czy nic nie wisi w powietrzu w widoku z PlayerStart;
   - ostrzeżenie `M_RysyLandscape: Requesting an invalid TextureIndex (8 / 6)`: czy nadal jest; jeśli tak,
     spróbuj ustalić, który węzeł materiału je powoduje (przez MCP możesz przejrzeć graf `M_RysyLandscape`).
5. **Zrzuty** z tych samych kamer co w rundzie 1 (współrzędne w `feedback/log.txt`) plus jeden z nowego
   PlayerStart w kierunku jeziora. Rozdzielczość 1920×1080.
6. **Wydajność**: `stat fps` i `stat unit` w trybie Play **na pełnym ekranie** (Alt+Enter albo *New Editor Window*),
   przy Morskim Oku i na szczycie.
7. Zapisz wszystko w `ue5/feedback/runda_02/`, commit „UE5 feedback: runda 02”, push.

Nie rób jeszcze: postaci Third Person, podmiany tekstur terenu, zmian w liczbie drzew.
