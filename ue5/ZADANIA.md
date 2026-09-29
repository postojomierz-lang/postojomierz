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
