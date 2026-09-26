# Rysy 3D (prototyp)

Wirtualny spacer szlakiem **Morskie Oko → Rysy** w przeglądarce (three.js). Teren, zdjęcie
satelitarne i przebieg szlaku pochodzą z otwartych danych; to, czego w danych nie ma
(skały i trawa z bliska, drzewa, niebo, pogoda), silnik generuje sam.

Build: `npm install && npm run build` → jeden plik `../rysy/index.html` (z danymi, ok. 3,4 MB),
serwowany przez GitHub Pages z `main`. `?q=low` włącza lżejszą wersję dla słabszych urządzeń.

## Sterowanie
W/↑ i S/↓: idź szlakiem, Spacja: idź sam (jak na bieżni), Shift: szybciej, +/−: przyspieszenie
czasu, A/D/mysz: rozglądanie się, F: widok z drona, T: pora dnia, M: pogoda, H: pomoc.
Kliknięcie w profil wysokości przenosi w to miejsce szlaku.

HUD pokazuje nachylenie szlaku i to, jakie nachylenie ustawiłaby domowa bieżnia (max 15%).
Tempo marszu liczone jest wzorem Toblera.

## Dane (`tools/prepare.py` → `src/data/`)
| Warstwa | Źródło | Rozdzielczość |
|---|---|---|
| wysokości | Copernicus DEM GLO-30 | 30 m (panorama: ~58 m) |
| zdjęcie | Sentinel-2 L2A, 2 lipca 2025 | 10 m |
| las / kosodrzewina | ESA WorldCover 2021 | 10 m |
| szlak, jeziora | OpenStreetMap przez Overture Maps | wektor |

Wszystko jest czytane bezpośrednio z publicznych zasobów na AWS. Szlak to najkrótsza ścieżka
w sieci ścieżek OSM od schroniska do szczytu.

Kolejny krok jakościowy: LiDAR GUGiK (1 m) i ortofotomapa (25 cm). Z tego środowiska serwery
GUGiK nie były dostępne, ale `prepare.py` da się łatwo przestawić na te pliki.
