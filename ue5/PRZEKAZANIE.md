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

## Runda 4 (`feedback/runda_04/log.txt`)
- szew w danych dokładny (±1,2 cm), fartuch i granica niewidoczne z daleka; ale kołnierz = gładka rozmyta płachta
  z załamaniem przy siatce 60 m (DEM 55 m);
- mgła: A zalewa kotlinę, C pokazuje pierścień jako ciemnoturkusową taflę z ostrą linią; operator wybrał **D**
  (0,0012 / 0,1 / 0,7 / 5 km / (0,45; 0,55; 0,70));
- kolizja `NoCollision` działa i przetrwała zapis; `set_generate_overlap_events` nie istnieje w Pythonie 5.8;
  fałszywy alarm „zostawiam T_RysyFar_v3 (uzywa go M_RysyFar)” (rejestr zasobów z dysku);
- brzegi 03/05 bez zmian; wydajność 88,7 / 119,6 FPS.

## Runda 5
- odkrycie: `tatry/public/data` (base 4 m) kończy się na z = ±2543 m, kwadrat na ±2621 m → krajobraz w pasach N/S
  z DEM 55 m i zdjęcia 17 m/px. Teraz tło = `region/base` (DEM 4 m, 33×23 bloki po 1024 m, 257² próbek, format jak
  kafle) i `region/photo` (2 m/px), funkcje `dem()` i `region_photo()` na górze eksportera;
- daleki teren v5: pas `near` 800 m (10 m, DEM 4 m, tekstura 4096 px) + `far` 60 m + pierścień; dwa sloty
  z .mtl; OBJ 66 MB, eksport ~144 MB (repo rośnie o ~60–70 MB na każdą nową wersję siatki: nie zmieniać jej bez
  potrzeby);
- brzegi: rampa `lvl + 0.3·tanh((sd−3)/1.2) + 0.06·(sd−3)`;
- `build_scene.py`: mgła D, `photo_material()`, sloty po nazwie, sprzątanie z pominięciem `M_RysyFar`/`M_RysyNear`.
- znane: w zdjęciu regionu jest poziomy szew źródła ~60 m na północ od krajobrazu (w danych, jak w przeglądarce).

### Wyniki rundy 5 (`feedback/runda_05/log.txt`)
- szew ±1,6 cm, bez płachty i załamania na S; pas S z bliska jak reszta krajobrazu; mgła D działa ze skryptu;
- BŁĄD: M_RysyFar bez tekstury (kasowanie starej tekstury po budowie materiału nulluje odwołania);
- krawędź N: cienka ciemna linia (fartuch przy LOD krajobrazu), pas near jaśniejszy/zieleńszy (różnica materiałów,
  nie tekstur: zmierzone 1–5/255); brzegi: ząbki na 03, 2 drobne na 05; wydajność 86 / 119,5 FPS.

## Runda 6
- `build_scene.py`: import tekstur → `cleanup_far_assets()` → `photo_material(name, tex)` z kontrolą
  `get_used_textures` i jednorazową przebudową; normalne warstw krajobrazu wygaszane z odległością (alpha ortofoto);
  Roughness/Specular dalekiego terenu = krajobraz.
- eksporter: zakładka zamiast fartucha, przecięcie brzegu na 1,5 m; zasoby `_v6`.
- **Właściciel (29.09): po wiadomości od C czekać na jego instrukcje** (routine też tylko informuje).
- Plan zatwierdzony przez właściciela: 1) domknięcie sceny (runda 6, potem siatka dalekiego terenu zamrożona),
  2) wygląd z bliska (tekstury warstw z darmowych źródeł / Fab bez zakupów bez zgody), 3) chodzenie (Third Person,
  szlak, drogowskazy-modele, licznik), 4) bieżnia FTMS przez Bluetooth (C++, rozpoznanie modelu), 5) paczka + opcjonalnie
  Pixel Streaming.

### Wyniki rundy 6 (`feedback/runda_06/log.txt`)
- ciemna linia na N zniknęła (zakładka działa, nigdzie nie wystaje); normalne z odległością nie psują bliskiego planu;
- M_RysyFar nadal bez zdjęcia: `delete_all_material_expressions` w UE 5.8 zostawia węzły (stary „Photo” z None
  wygrywał); operator usunął osierocone węzły ręcznie;
- pas near nadal zieleńszy/rozmyty (krajobraz przy krawędzi oliwkowy: mieszanie z warstwami + pasy N/S bez mapy
  pokrycia = piarg); brzegi: 05 gładki, 03 kilka schodków; 87,5 / 119,4 FPS.

## Runda 7 (wysłana operatorowi, czeka na `feedback/runda_07/`)
- `fresh_material` kasuje resztki węzłów po jednym (`material_expressions()` próbuje 3 sposobów listowania),
  `used_textures()` (get_material_used_textures); `layer_blend()` i `photo_alpha()` wspólne dla krajobrazu i
  `near_material()`; maski pasa `far_near_masks_a/b.png` (funkcja `classify()` w eksporterze, `region_lc()`);
  mapa pokrycia regionu w pasach N/S krajobrazu; brzeg: przecięcie na 1 m.
- **Siatka dalekiego terenu zamrożona na v6** (OBJ w repo nie jest regenerowany: po eksporcie przywrócić
  `git checkout -- ue5/export/far_terrain.obj`, chyba że siatka ma się celowo zmienić → `_v7`).

## Pomysły na kolejne rundy
- Tekstury warstw terenu z Megascans/Fab (bliskie podłoże jest płaskie, „piaskowe”), mocniejsze przejście ortofoto
  → tekstury; postać Third Person i chodzenie szlakiem; drogowskazy jako prawdziwe modele; Pixel Streaming na telefon.
