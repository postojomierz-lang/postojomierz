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
| szlak, jeziora | OpenStreetMap przez Overture Maps | wektor |
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
