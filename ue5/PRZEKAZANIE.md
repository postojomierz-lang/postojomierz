# Przekazanie: tor Unreal Engine 5 (sesja B)

Właściciel pisze po polsku, odpowiadaj po polsku. Zasady repozytorium: `CLAUDE.md` w katalogu głównym
(po wdrożeniu zmiany od razu pull request do `main` i merge, bez pytania; potem link do PR).

## Podział pracy (trzy sesje)
- **Sesja A** (chmura): wersja przeglądarkowa i telefon: `tatry/`, `rysy/`. Nie ruszaj tych folderów.
- **Sesja B** (chmura, TY): autor toru UE5: `ue5/` (eksporter `ue5/tools/export_ue5.py`, skrypt edytora
  `ue5/unreal/build_scene.py`, dane `ue5/export/`, zadania `ue5/ZADANIA.md`, analiza `ue5/feedback/`).
- **Sesja C** (lokalna, komputer właściciela): operator Unreala przez **Unreal MCP** (serwer `unreal-mcp`).
  Pętla co 30 min: `git pull`, wykonuje nową rundę z `ZADANIA.md`, wyniki do `ue5/feedback/runda_NN/`, push na `main`,
  potem wysyła wiadomość do sesji B „runda NN gotowa”. Sesja B nie może jej odpisać: odpowiedzią jest nowa runda
  w `ZADANIA.md` (C ją pobierze pętlą).
- Zapas: cogodzinne sprawdzanie (8–22, Europe/Warsaw) w sesji B, ustaw je sobie (`create_trigger`, samo-wiązanie).

## Stan projektu Unreala (u właściciela)
- UE **5.8.3**, Windows 11, RTX 4070 Ti SUPER 16 GB, i9-14900KF, 64 GB RAM. Projekt `Documents\Unreal Projects\Rysy`
  (Blank, Blueprint), poziom `/Game/Rysy/Maps/Rysy`. Repozytorium: `Documents\GitHub\postojomierz`.
- Krajobraz 4033×4033, Location 0/0/184000, Scale 130/130/285.2 (liczby w `ue5/export/landscape.json`).
- Modele z Fab (ścieżki wpisane w `build_scene.py`, commit operatora): świerk **Megaplants Norway Spruce**
  (eksport z Procedural Vegetation Editor jako Static Mesh + Nanite Foliage: `SM_Spruce_PVE_A..D`),
  kosodrzewina **Megaplants Baltic Pine Saplings** (`SM_PinePVE_A/B`, spłaszczone xy 1.5–2.1),
  głazy **Dolomites Free Rock Sample** + **Lone granite boulder** (`/Game/Rysy/Rocks/LoneGranite`).
  Megascans są płatne w UE (darmowe tylko w UEFN); nie kupuj nic bez zgody właściciela.
- Wydajność (runda 2): ~90 FPS przy Morskim Oku, ~120 na szczycie (2560×1380 Play), GPU 10 / 6,7 ms.

## Historia rund
- **Runda 1** (`feedback/log.txt`, agent Cowork): scena działa; problemy: pusty horyzont, latające etykiety,
  prześwietlenie, schodkowe brzegi, ostrzeżenie `TextureIndex`.
- **Runda 2** (`feedback/runda_02/log.txt`, lokalny Claude z MCP), po PR #114:
  - daleki teren (`far_terrain.obj`) dopasowany idealnie: log `osie [0, 1, 2], znaki [1, -1, 1], skala 1/1`
    (aktor roll 180, scale z −1);
  - schodki przy brzegach zniknęły, zostały drobne ząbki na płaskich brzegach (05, 03);
  - etykiety i belka zniknęły; ekspozycja: operator wybrał **−0,5** (w skrypcie nadal `EXPOSURE_BIAS = -1.0`, zmień);
  - szew na granicy 5,2 km: różnice wysokości do −18 / +11 m między węzłami co 60 m, rozmyta i inna kolorystycznie
    tekstura dalekiego terenu (17 m/px), ciemny prostokąt w teksturze przy krawędzi S;
  - poza dalekim terenem (> 15–20 km) nadal granatowy pas pod niebem (szarozielony grunt atmosfery nie pomógł);
  - `TextureIndex (8/8)` tylko podczas przebudowy materiału po `delete_all_material_expressions`, nieszkodliwe;
    uwaga: ponowny `recompile_material` w tej samej sesji raz wysypał edytor (skrypt testowy operatora);
  - import OBJ tworzy zbędny materiał „far” + `TEX_far_terrain` (można wyłączyć import materiałów);
  - MCP nie ma narzędzia „uruchom Python”: operator wpisuje `py "plik.py"` w konsoli Cmd przez SlateInspector;
    mapę wysokości do istniejącego krajobrazu wczytuje przez render target + `landscape_import_heightmap_from_render_target`.

## Runda 3 (`feedback/runda_03/log.txt`)
- projekt operatora od tej rundy: `Documents\Unreal Projects\Rysy 5.8` (kopia po rundzie 2);
- osie dalekiego terenu rozpoznane poprawnie z pierścieniem (`[0, 1, 2]`, `[1, -1, 1]`); ekspozycja −0,5 ze skryptu;
- szew prawie bez zmian (−18/+11 m): gęste linie `dense()` biegły w poprzek granicy, wzdłuż niej nadal co 60 m;
- granatowy pas to mgła (density 0,006, falloff 0,05, opacity 1, kolor z atmosfery), zasłaniała pierścień;
  pierścień bez mgły miał promieniste smugi z kolorów krawędzi;
- slot SM_RysyFar_v3 wskazywał stare „far” (import OBJ użył istniejących zasobów, `imported_object_paths` miał tylko
  siatkę); kolizja aktora QUERY_AND_PHYSICS mimo `set_collision_enabled`;
- brzegi 06/07 gładkie, na płaskich 03/05 drobne progi; wydajność 86 / 118 FPS.
- Sesja C może pisać do sesji B (wiadomość „runda 03 gotowa” doszła).

## Runda 4 (wysłana operatorowi, czeka na `feedback/runda_04/`)
- eksporter: siatka 60 m z dziurą nad krajobrazem + kołnierz z wierzchołkami w każdej próbce krawędzi (1,3 m) +
  fartuch 15 m; pierścień 6 pętli z krzywizną Ziemi; wygaszenie brzegu tekstury (400 px) do koloru nizin;
  łagodne wygaszanie podniesienia brzegów (6–16 m); zasoby `_v4`; eksport ~110 MB (OBJ 41 MB).
  Sprawdzone w danych: szew ±1 cm, spójna orientacja ścian, dopasowanie osi dla 48 konwencji.
- `build_scene.py`: stałe mgły (A: 0,0025 / 0,2 / 0,8 / 3 km / (0,32; 0,40; 0,52)), sprzątanie po nazwie,
  `NoCollision`.
- operator porównuje mgłę A/B/C i wybiera; w następnej rundzie wpisać wybrane wartości do stałych.

## Pomysły na kolejne rundy
- Tekstury warstw terenu z Megascans/Fab (bliskie podłoże jest płaskie, „piaskowe”), mocniejsze przejście ortofoto
  → tekstury; postać Third Person i chodzenie szlakiem; drogowskazy jako prawdziwe modele; Pixel Streaming na telefon.
