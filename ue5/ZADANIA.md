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
