# Rysy 3D w Unreal Engine 5

Ten folder buduje w Unreal Engine 5 poziom ze szlakiem Morskie Oko → Czarny Staw → Bula pod Rysami → Rysy.
Korzysta z tych samych danych co wersja przeglądarkowa: lidar 1 m (GUGiK, ÚGKK SR), ortofotomapa i mapa pokrycia terenu.

| Co | Gdzie |
|---|---|
| gotowe dane dla Unreala (commitowane, ~145 MB) | `ue5/export/` |
| skrypt uruchamiany w edytorze Unreala | `ue5/unreal/build_scene.py` |
| skrypt, który przygotował dane (nie musisz go uruchamiać) | `ue5/tools/export_ue5.py` |

> **Uczciwie:** skrypt `build_scene.py` napisałem na podstawie dokumentacji Python API Unreala (UE 5.4+),
> ale **nie uruchamiałem go w prawdziwym Unrealu** (na tej maszynie nie ma karty graficznej ani edytora).
> Sprawdziłem go tylko na atrapie modułu `unreal`, więc wyłapuje to błędy w samym Pythonie, ale nie
> pomyłki w API. Jeśli coś się wysypie, skopiuj czerwone linie z okna **Output Log**
> (Window → Output Log) i odeślij mi je, poprawię. Dane w `export/` są sprawdzone (wysokości, zdjęcie,
> szlak, jeziora i rośliny do siebie pasują).

---

## 1. Instalacja (jednorazowo)

1. Pobierz i zainstaluj **Epic Games Launcher**: https://store.epicgames.com/download
   Zaloguj się (albo załóż darmowe konto Epic).
2. W Launcherze: **Unreal Engine** (menu po lewej) → zakładka **Library** → przy „Engine Versions” kliknij
   **+** i wybierz wersję **5.5** albo nowszą → **Install**. Zajmie to ok. 60 GB i trochę czasu.
3. **Visual Studio 2022 Community teraz NIE jest potrzebne.** Będzie potrzebne dopiero później, gdy
   dojdzie kod C++ (np. podłączenie bieżni przez Bluetooth).

## 2. Nowy projekt

1. W Launcherze kliknij żółty przycisk **Launch** (uruchom Unreal Engine 5.5).
2. **Games → Blank**, po prawej: **Blueprint** (nie C++), Target Platform: Desktop,
   Quality Preset: Maximum, **Starter Content** może być wyłączony.
   (Możesz też wybrać **Third Person** zamiast Blank: wtedy od razu chodzisz ludzikiem po szlaku.
   W Blank latasz kamerą.)
3. Nadaj nazwę, np. `Rysy`, i kliknij **Create**.

## 3. Włącz wtyczki

1. W edytorze: **Edit → Plugins**.
2. Wyszukaj **Python Editor Script Plugin**, zaznacz go.
   (Przy okazji możesz też zaznaczyć **Editor Scripting Utilities**, jeśli jest na liście.)
3. Opcjonalnie wyszukaj **Fab** i zaznacz go (do pobierania darmowych modeli i tekstur, patrz punkt 7).
4. Kliknij **Restart Now**.

## 4. Pobierz pliki repozytorium

Wybierz jedną z dwóch dróg:

- **GitHub Desktop** (wygodniej przy kolejnych aktualizacjach): https://desktop.github.com/
  → File → Clone repository → `postojomierz-lang/postojomierz`.
- Albo na stronie repozytorium na GitHubie: zielony przycisk **Code → Download ZIP**, potem rozpakuj.

**Niczego nie musisz kopiować.** Skrypt sam znajdzie dane w `ue5/export`, obok siebie.
Jeśli jednak przeniesiesz folder `export` gdzie indziej, wpisz jego ścieżkę w `EXPORT_DIR` na górze
`build_scene.py` (otwórz go Notatnikiem). **Nie wrzucaj go do folderu `Content` projektu**, bo Unreal
zacznie wtedy sam importować wszystkie pliki.

## 5. Pierwsze uruchomienie skryptu

1. W edytorze: **Tools → Execute Python Script…** i wskaż plik
   `…\postojomierz\ue5\unreal\build_scene.py`.
2. Poczekaj kilka minut (import zdjęcia 8192 px i budowa materiału). Na koniec pojawią się dwa okienka.
   Pierwsze mówi, że **krajobrazu jeszcze nie ma** i podaje liczby do punktu 6. Drugie mówi „Rysy: gotowe”.
3. Skrypt utworzył poziom **/Game/Rysy/Maps/Rysy**, a w nim niebo, słońce, jeziora, budynki, szlak,
   drogowskazy, drzewa, kosodrzewinę, głazy i punkt startu. Wszystko to na razie wisi w powietrzu,
   bo nie ma jeszcze terenu.

## 6. Import terenu (ręcznie, jednorazowo)

Python w Unrealu nie potrafi porządnie utworzyć krajobrazu z pliku, więc ten jeden krok wykonujesz ręcznie:

1. Przełącz tryb na **Landscape**: rozwijane menu trybów na górze po lewej (domyślnie „Selection”)
   → **Landscape**, albo **Shift+2**.
2. Zakładka **Manage** → **New** → zaznacz **Import from File**.
3. **Heightmap File**: kliknij `…` i wskaż `ue5\export\heightmap.png`.
4. **Material**: wybierz `MI_RysyLandscape` (folder Rysy/Materials). Jeśli pominiesz ten krok, skrypt i tak
   przypisze materiał w punkcie 7.
5. Wpisz dokładnie te liczby:

   | Pole | Wartość |
   |---|---|
   | Section Size | **63x63 Quads** |
   | Sections Per Component | **2x2 Sections** |
   | Number of Components | **32 × 32** |
   | Overall Resolution | **4033 × 4033** (wyjdzie samo) |
   | Location | X **0**, Y **0**, Z **184000** |
   | Rotation | 0, 0, 0 |
   | Scale | X **130**, Y **130**, Z **285.2** |

   (Liczby są też w `export/landscape.json`: `scale` i `location_ui_centre_cm`.)
   Pozostałe opcje zostaw domyślne. Nie zaznaczaj „Flip Y axis”, jeśli taka opcja się pokaże.
6. Kliknij **Import**. Po chwili pojawi się teren 5,24 × 5,24 km.
7. Wróć do trybu **Selection** (Shift+1) i **uruchom `build_scene.py` jeszcze raz**. Za drugim razem skrypt
   sprawdza położenie terenu (w razie czego sam je poprawia na dokładne), przypisuje materiał ze zdjęciem
   i buduje resztę od nowa. Skrypt możesz uruchamiać dowolnie wiele razy: najpierw kasuje to, co postawił
   poprzednio (aktorów oznaczonych tagiem `RysyAuto`). Teren i Twoje ustawienia materiału zostają.

**Sprawdzenie:** Morskie Oko ma lustro wody na wysokości ok. 1395 m, a w Unrealu to Z ≈ 139 500.
Wierzchołek Rysów to ok. Z = 249 000 i leży w X ≈ 88 000, Y ≈ 127 000.

## 7. Co zobaczysz

- Teren z lidaru 1 m wzdłuż szlaku i 4 m dalej, pokryty ortofotomapą (0,64 m na piksel). Z bliska zdjęcie
  przechodzi w kafelkowane tekstury skał, piargu, trawy, ściółki i ścieżki (darmowe tekstury Poly Haven, CC0).
- Szlak jako **spline** `Rysy_Szlak` (widać go po zaznaczeniu) oraz czerwone słupki co 250 m. Ścieżka jest
  też jaśniejszym pasem w materiale terenu.
- **Świerki** jako zielone stożki, **kosodrzewina** jako spłaszczone zielone kule, **głazy** jako szare
  bryły. To zastępcze kształty, dopóki nie podasz prawdziwych modeli (punkt 8).
  Razem ok. 38 tys. świerków, 49 tys. kęp kosodrzewiny i 11 tys. głazów.
- Woda na 14 stawach (z Morskim Okiem i Czarnym Stawem), proste bryły schronisk i szałasów z dachami,
  4 drogowskazy (Morskie Oko, Czarny Staw pod Rysami, Bula pod Rysami, Rysy) z dużymi napisami nad nimi,
  widocznymi tylko w edytorze.
- Niebo: SkyAtmosphere, słońce (DirectionalLight), SkyLight, chmury (VolumetricCloud) i mgła
  (ExponentialHeightFog). Wszystko jest w folderze **Rysy/Niebo** w panelu Outliner.
- **PlayerStart** przy schronisku nad Morskim Okiem. Kliknij ▶ **Play**.
- Wszystkie obiekty są w folderach **Rysy/…** w Outlinerze.

Uwaga: poziom nie używa World Partition. Przy 5 km terenu to niepotrzebne.
Pierwsze otwarcie może długo kompilować shadery (pasek w prawym dolnym rogu). To normalne.

## 8. Prawdziwe modele i tekstury z Fab (Megascans)

1. Otwórz https://www.fab.com albo panel Fab w edytorze (**Window → Fab**, jeśli włączyłeś wtyczkę).
   Filtruj po **Free**. Część zasobów Megascans na Fab jest płatna, więc sprawdzaj cenę i licencję.
2. Przydatne hasła:
   - drzewa: *Norway Spruce*, *European Spruce*, *Spruce*;
   - kosodrzewina: *Mountain Pine*, *Mugo Pine*, *Pine Shrub*, a w ostateczności *Juniper* lub *Shrub*;
   - głazy: *Granite Boulder*, *Rock*, *Alpine Rock*, *Scree*;
   - tekstury (Surfaces): *Granite Rock / Rock Cliff* (Rock), *Scree / Gravel* (Scree), *Alpine Grass /
     Meadow* (Grass), *Forest Floor / Spruce Needles* (Forest), *Mossy Ground* (DwarfPine),
     *Rocky Path / Dirt Trail* (Path).
3. Kliknij **Add to My Library**, a potem w edytorze **Add to Project** (albo przeciągnij z panelu Fab).
   Zasoby trafią do `Content/Fab/...`.
4. **Modele:** w Content Browserze kliknij model (Static Mesh) prawym przyciskiem → **Copy Reference**.
   Otwórz `build_scene.py` w Notatniku i wklej ścieżkę w cudzysłowie do odpowiedniej listy na górze, np.:
   ```python
   SPRUCE_MESHES = ["/Game/Fab/Megascans/3D/Norway_Spruce/SM_Norway_Spruce_01.SM_Norway_Spruce_01"]
   ```
   Możesz podać kilka modeli, oddzielonych przecinkami. Skrypt losuje model dla każdego drzewa i skaluje go
   do wysokości z danych (świerki 4–30 m, kosodrzewina 1–3 m, głazy 0,3–3 m).
   Potem uruchom skrypt jeszcze raz.
5. **Tekstury terenu:** otwórz `MI_RysyLandscape` (Rysy/Materials), rozwiń parametry i przeciągnij
   tekstury: `Rock_Albedo` / `Rock_Normal`, `Scree_…`, `Grass_…`, `Forest_…`, `DwarfPine_…`, `Path_…`.
   Albo wpisz ich ścieżki w `LAYER_TEXTURES` w skrypcie. Inne przydatne parametry:
   - `<Warstwa>_TileMeters`: co ile metrów powtarza się tekstura;
   - `<Warstwa>_Tint`: zabarwienie;
   - `OrthoNear`: ile zdjęcia widać tuż przy kamerze (0 = same tekstury, 1 = samo zdjęcie);
   - `OrthoFadeDistance_cm`: na jakiej odległości zdjęcie przejmuje całość;
   - `SnowAmount`: śnieg na płaskich miejscach powyżej ~2000 m (0 = lato);
   - `Brightness`.

   Instancji materiału skrypt nigdy nie nadpisuje, więc Twoje zmiany zostają.
6. Jeśli edytor zwalnia, ustaw `FOLIAGE_FRACTION = 0.5` na górze skryptu.

## 9. Co mi odesłać

Proszę o zrzuty ekranu (klawisz **F9** w podglądzie zapisuje zrzut w `Saved/Screenshots`, albo zwykły
Win+Shift+S):

1. widok z góry na cały teren (nad Morskim Okiem, żeby było widać szlak i jeziora);
2. widok z brzegu Morskiego Oka w stronę Rysów (po naciśnięciu Play);
3. z bliska ścieżka i głazy koło Czarnego Stawu;
4. widok ze szczytu Rysów;
5. okno **Output Log** po uruchomieniu skryptu (szczególnie żółte i czerwone linie ze słowem `[Rysy]`);
6. jeśli coś wygląda źle (przesunięte zdjęcie względem terenu, drzewa w powietrzu), to zrzut tego miejsca.

## Szczegóły techniczne

- **Układ współrzędnych:** UE X = wschód, UE Y = południe (północ to −Y), UE Z = prawdziwa wysokość
  n.p.m. Wszystko w centymetrach. Środek (0, 0) to środek obszaru lon 20,040–20,112, lat 49,168–49,214
  (ten sam co `local()` w `tatry/tools/prepare.py`).
- **Teren:** 4033 × 4033 próbek co 1,3 m (5241,6 m), 16-bit PNG.
  Wysokość = 1840 m + (wartość − 32768) / 128 × 285,2 / 100 m. Zakres to 1129–2556 m, dokładność ok. 1 cm.
  Narożnik aktora Landscape leży w (−262080, −262080, 184000) cm.
  Pod budynkami teren jest wypoziomowany, a dna stawów obniżone pod lustro wody.
- **Tekstury:** `ortho.jpg` ma 8192 px. `masks_a/b/c.png` mają 2048 px i zawierają wagi warstw, którymi
  materiał miesza tekstury: a = skała, piarg, trawa; b = ściółka leśna, kosodrzewina, ścieżka;
  c = śnieg, staw. Materiał odczytuje je przez LandscapeLayerCoords (Mapping Scale 4032).
  Jeśli zdjęcie wyglądałoby na przesunięte lub rozciągnięte względem terenu, to pierwsze podejrzane
  miejsce to węzły LandscapeLayerCoords w `M_RysyLandscape`.
- **Mapy wag** `weights/w_*.png` (4033 px, 8 bit) pozwalają opcjonalnie malować warstwy krajobrazu
  (Landscape → Paint → Import). Obecny materiał ich nie potrzebuje, bo korzysta z masek.
  w_rock…w_path sumują się do 255.
- **Rośliny i głazy:** pliki CSV zawierają x, y, z (cm), yaw (stopnie), wysokość lub rozmiar (m), a głazy
  dodatkowo normalną terenu. Rozmieszczenie jest takie jak w wersji przeglądarkowej
  (`tatry/src/main.js`): świerki z mapy pokrycia poniżej 1560 m, kosodrzewina z mapy pokrycia i z ciemnej
  zieleni na zdjęciu (1500–1950 m), głazy do 220 m od szlaku.
- Skrypt tworzy aktory z komponentem **Hierarchical Instanced Static Mesh**. Jeśli dodanie komponentu
  z Pythona by nie zadziałało, próbuje wstawić instancje do systemu Foliage.
- Dane pochodzą z: Copernicus DEM, Sentinel-2, ESA WorldCover, OpenStreetMap / Overture, GUGiK
  (NMT 1 m, ortofotomapa), ÚGKK SR (DMR 5.0, CC BY 4.0), GKÚ Bratislava. Tekstury: Poly Haven (CC0).

Nowe dane z repozytorium: `python3 ue5/tools/export_ue5.py` (potrzebne numpy, scipy, Pillow, shapely).

---

## Praca z Unreal MCP (zalecane)

UE 5.8 ma wbudowaną wtyczkę **Unreal MCP**: Claude uruchomiony na tym samym komputerze steruje edytorem
bez klikania po ekranie.

1. *Edit → Plugins*: włącz **Unreal MCP** i **All Toolsets**, zrestartuj edytor.
2. *Edit → Editor Preferences → General → Model Context Protocol*: **Auto Start Server** (port 8000).
3. Konsola edytora (`~`): `ModelContextProtocol.GenerateClientConfig ClaudeCode`, co utworzy `.mcp.json` w folderze projektu.
4. Claude Code lokalnie w folderze projektu (`Documents\Unreal Projects\Rysy`), zatwierdź serwer MCP.

Serwer słucha tylko na `127.0.0.1` i nie ma logowania, nie wystawiaj go do sieci.
Zadania dla operatora są w [`ZADANIA.md`](ZADANIA.md), wyniki trafiają do `feedback/`.
