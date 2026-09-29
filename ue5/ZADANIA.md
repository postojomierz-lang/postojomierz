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
