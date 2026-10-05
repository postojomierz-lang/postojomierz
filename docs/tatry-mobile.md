# Tatry Mobile (Szlakownik): notatka przekazania

Stan na 3.10.2026. Dla nowej sesji Claude: przeczytaj całość, zanim zaczniesz.

## 0. Notatka z ostatniej sesji (4.10.2026) i zadania bieżące

- Zrobione: PR 204–215 (przypomnienie o wyjściu, źródła/ławki, znaki na drzewach, krzyż na Giewoncie, 📷 zdjęcie i panorama, ściany bez smug, wychodnie na przełęczach, wapień/granit w `tatry/src/geology.js`).
- Decyzja: dane terenu (`region/`, ~550 MB) przenosimy do **Cloudflare R2**; GitHub Pages ma limit 1 GB, a repo ma już ~1,09 GB plików. Aplikacja zostaje na Pages, `ue5/` zostaje w repo (później osobne repo z Git LFS).
- R2: bucket `szlakownik-dane` (Eastern Europe), publiczny adres `https://pub-5185677c9bfa4bd98f6768e62de07255.r2.dev`, Account ID `a12ee6da38d7f98dfd7914e814534e84`.
- Właściciel utworzył Account API token (Object Read & Write, tylko ten bucket) i wpisał zmienne środowiska: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_PUBLIC_URL`. Wartości nigdy nie wypisuj ani nie wklejaj; sprawdzaj tylko, czy są ustawione.
- CORS bucketu (ustawiony i sprawdzony 4.10): GET/HEAD z `https://postojomierz-lang.github.io`, `http://localhost:5173`, `http://localhost:8765`; ExposeHeaders `ETag`, `Content-Length`.
- Zadania 1 i 2 zrobione (4.10): `region/` jest w R2 pod kluczem `region/` (18 220 plików, 551 MB); `REGION_BASE` w `tatry/src/region.js` = `https://pub-…r2.dev/region2/` (budowanie z `VITE_REGION_BASE=../region/` czyta lokalną kopię). `sw.js` nie dotyka danych 3D, więc bez zmian.
- Wysyłka: `python3 tatry/tools/upload_r2.py --prefix region2/` (tylko zmienione pliki po MD5/ETag; `--dry-run`, `--delete`). Cache-Control: `meta.json` 5 min, reszta 1 dzień. Bez boto3 (podpis SigV4 w skrypcie, potrzebne tylko `requests`).
- Test 3D w tym środowisku: Chromium nie przechodzi przez proxy do r2.dev; w Playwright przekieruj zapytania `r2.dev` przez `page.route` + `curl` (prawdziwe nagłówki CORS z R2).

Zadania bieżące (po kolei):
1. ~~Sprawdzić, czy 5 zmiennych R2 jest widocznych, i wysłać jeden plik testowy do bucketu (S3 API, endpoint `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`), odczytać go przez `R2_PUBLIC_URL` (też z nagłówkiem Origin, żeby sprawdzić CORS).~~ Zrobione.
2. ~~Napisać `tatry/tools/upload_r2.py`: wysyła `region/` (tylko zmienione pliki, poprawne Content-Type, Cache-Control), potem przełączyć `REGION_BASE` w `tatry/src/region.js` (i miejsca używające `../region/`, w tym `sw.js`/offline) na adres R2; test 3D i planera.~~ Zrobione (test: Kuźnice → Kasprowy z R2, 453 pliki bez błędów; planer OK).
3. ~~Usunąć `region/` z publikowanej strony.~~ Zrobione: `.github/workflows/pages.yml` (push do main / ręcznie) publikuje tylko `rysy/`, `plastic-front/`, `toy-soldiers/` i pliki z katalogu głównego (~106 MB). Źródło Pages przełączone na „GitHub Actions” (4.10); akcje na Node 24, runner `ubuntu-24.04`.
4. ~~Rozszerzenie regionu na zachód.~~ Zrobione (5.10): region zaczyna się na 19,681°E (dokładnie 12 bloków po 1024 m na zachód od dawnego 19,85°E), panorama (`outer`) od 19,55°E (Sentinel-2 34UCV + 34UDV). Stare bloki i kafle zachowały treść, dostały nowe numery (+12 bloków, +48 kafli); nowy pas policzony przez `WINDOW=bi,bj,nbi,nbj` w `prepare_gugik.py` (276 bloków, 714 kafli). Trasy: 2124 odcinki (było 1622). Dane w R2 pod **`region2/`** (stare nazwy plików dostały inną treść, a przeglądarki trzymają je dobę), `REGION_BASE` wskazuje na `region2/`; stary `region/` w buckecie do usunięcia po kilku dniach. `region/` nie jest już w gicie (`.gitignore`). Bez kafli ZBGIS w tym środowisku wysokości słowackich wierzchołków tras wzięto z siatki bazowej regionu (lidar), a Roháče i Orawa mają Copernicus. Roháče w pełnej jakości po wgraniu kafli ZBGIS na gałąź `dane-zbgis` (19,68–19,86°E, 49,16–49,23°N): wtedy `ZBGIS_EXTRA=… WINDOW=0,8,12,15` (część słowacka pasa) i `upload_r2.py --prefix region2/`.
5. Przed produkcją: własna domena w R2 (np. `dane.szlakownik.pl`), bo r2.dev ma limit zapytań i nie cache'uje. **Odłożone (4.10):** właściciel nie ma domeny; do testów r2.dev wystarcza. Zrobić przed publicznym startem / Google Play, razem z domeną aplikacji (pkt 6 planów; `szlakownik.pl` zajęta, potrzebna inna nazwa). Kroki: domena .pl u rejestratora → Cloudflare „Add a site” (Free) i jego serwery nazw → R2 `szlakownik-dane` → Settings → Custom Domains → `dane.<domena>` → sprawdzić CORS/Cache-Control → podmienić `REGION_BASE` (`tatry/src/region.js`, lub `VITE_REGION_BASE`) → test 3D → wyłączyć r2.dev. Klucze R2_* nie wystarczą do podpięcia domeny (robi to właściciel w panelu).

## 1. Co to jest

**Szlakownik** (dawniej „Tatry”/„postojomierz”) to polska aplikacja górska na telefon i komputer, w katalogu `tatry/`
(Vite + three.js, Leaflet, Supabase). Ma dwie strony, budowane do jednego pliku HTML każda:

- **Planer** (`tatry/planer.html`, buduje się do `rysy/planer.html`) zawiera:
  - planowanie tras po znakowanych szlakach Tatr: wyszukiwarka „Skąd? Dokąd?”, klikanie, przeciąganie linii trasy;
  - czas PTTK, profil, prognozę i ciemność;
  - nawigację GPS z ostrzeżeniami pogodowymi, SOS;
  - zakładki Trasa / Dziennik / Wyzwania / Grupy / Konto;
  - konto (logowanie linkiem z e-maila), grupy (czat, wyjścia grupowe, pozycje na żywo);
  - edytor wyglądu postaci i sklepik.
- **Widok 3D** (`tatry/index.html`, buduje się do `rysy/index.html`) to wirtualny spacer trasą (z planera albo
  domyślnie Morskie Oko → Rysy). Ma:
  - teren z lidaru i ortofotomapy, roślinność, skały, wodę, niebo z prawdziwym słońcem i porą dnia;
  - pogodę z prognozy, tryb zimowy z kartą TOPR;
  - zwierzęta ze scenami (lornetka podąża za akcją), ptaki, pstrągi;
  - odkrywanie przyrody: 152 gatunki, plansza w „bullet time”, punkty i monety;
  - drona, przelot, członków grupy na szlaku jako ich postacie.

Adresy (GitHub Pages z `main`):
- 3D: https://postojomierz-lang.github.io/postojomierz/rysy/index.html
- Planer: https://postojomierz-lang.github.io/postojomierz/rysy/planer.html

Szczegóły każdej funkcji są w `tatry/README.md` (sekcje po polsku). Pozostałe katalogi repo (`game/`,
`plastic-front/`, `.claude/skills/postep/`) to osobne projekty.

## 2. Preferencje właściciela (obowiązują)

- **Pisze po polsku, odpowiadaj po polsku.**
- **Workflow:**
  - po zrobieniu i sprawdzeniu zmiany: commit, push na gałąź roboczą, PR do `main` i od razu scalenie, bez pytania, a potem link do PR;
  - potem reset gałęzi: `git fetch origin main && git checkout -B <gałąź> origin/main`, push `--force-with-lease`;
  - stopka commitów i PR jak w instrukcjach sesji;
  - bez identyfikatorów modelu w commitach.
- **Na końcu odpowiedzi proponuj kolejne kroki z niebieskim znacznikiem**: nagłówek `🔵 **Możliwe kolejne kroki:**`, pod nim każdy krok w osobnej linii (lista `- …`), a polecenia do wklejenia (`/koncze`, `/compact zachowaj: …`, `/clear`) każde w osobnym bloku kodu, żeby dało się je skopiować jednym ruchem. Aplikacja nie renderuje HTML ani kolorów tekstu, więc `<span style=…>` się nie sprawdza; niebieski daje tylko emoji 🔵.
- **Podpowiadaj /compact i /clear (raz, w kolejnych krokach).** Właściciel pracuje w jednej sesji. Po zakończonej większej fazie tego samego projektu (kilka PR): `/koncze` + `/compact`. Gdy zaczyna temat niezwiązany z poprzednią pracą (inny projekt, np. `game/`) albo rozmowa utknęła w nieudanych próbach: `/koncze` + `/clear`. Po krótkiej wymianie nic nie podpowiadaj (auto-compact na 400K). Hook startowy wczytuje `HANDOFF.md` także po `/clear`.
- **Bezpieczeństwo:**
  - nigdy nie proś o wklejanie tokenów ani kluczy do czatu;
  - `SUPABASE_URL` i `SUPABASE_ANON_KEY` są w zmiennych środowiska (ustawia je właściciel), nie pytaj o nie;
  - **nigdy nie używaj ani nie dodawaj klucza service_role**;
  - hasła i klucze wpisuje tylko właściciel w swoich panelach.
- **Dane TOPR** (lawiny): regulamin TOPR zabrania publikacji w serwisach trzecich bez zgody. Tylko odnośniki, bez pobierania i bez republikowania.
- **Ilustracje AI** (darniówka, Polonozercon) zrobił właściciel w Google Flow. Mają etykietę „ilustracja AI”, prawa: „© Szlakownik”.
- **Testy na urządzeniach:** właściciel uruchamia agenta Cowork na Samsung Remote Test Lab.
  - Instrukcja: `docs/test-samsung-remote.md`; rundy planuj na ok. 30 minut.
  - Właściciel ma **Galaxy A55** (A55 bywa niedostępny w laboratorium, wtedy flagowiec S25 Ultra).
  - Zgłoszenia przychodzą przyciskiem 🐞.

## 3. Budowanie i testy lokalne

- `cd tatry && npm run build` daje `rysy/index.html` i `rysy/planer.html` (commitowane). Bez zmiennych Supabase planer buduje się bez części online (ostrzeżenie).
- Podgląd: `python3 -m http.server 8765` z katalogu głównego repo, potem `http://localhost:8765/rysy/index.html`.
- Playwright: `createRequire('/opt/node22/lib/node_modules/playwright/')`, Chromium z flagami `--use-gl=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`.
  - Swiftshader jest bardzo wolny (ok. 1 kl/s), więc dawaj długie czekanie i `timeout` przy zrzutach.
  - Zamknij pomoc: `#help-x`.
- Parametry adresu 3D:
  - `?q=low|mid|high|ultra`: jakość (ultra tylko na mocne komputery);
  - `?odkrycie=0`: bez planszy odkrycia (do testów);
  - `?lornetka=0`: sceny bez lornetki;
  - `?zima=1|0`, `?pogoda=…`, `?start=YYYY-MM-DDTHH:MM`, `?trawa=0`;
  - `?grupa=demo`: trzy zmyślone osoby z grupy na szlaku.
  - `?odmaz=0` / `?odmaz=pokaz`: bez odmazywania ścian (porównanie) / ściany objęte odmazywaniem na czerwono.
- Do testów: `window.__rysy` (stan 3D; `__rysy.pick(x, y)` mówi, jaka siatka jest pod punktem ekranu) i `window.__planner` (mapa, `path`, `stops`).
- Geologia: `tatry/src/geology.js` (granica wapień/granit, uproszczona z mapy geologicznej; na północ od niej wapień). Używa jej kolor skał w shaderze terenu (`limeAt` z `limeMap`), głazy (odcień instancji, `rockDetail`) i rośliny wapienne (`nature/spots.js`).
- Shadery: każdy fragment używający wspólnych uniformów (`wetK`, `winterK`, …) musi je zadeklarować. Brak deklaracji już raz ukrył skały i łańcuchy, więc sprawdzaj konsolę.

## 4. Supabase

- Projekt aplikacji: **`tatry`**, id `ijpyszrtwqhazmwrdccw` (to ten z `SUPABASE_URL`). Na koncie są też projekty `postojomierz` i `anything-can-fight`; nie ruszaj ich.
- Schemat w `supabase/schema.sql`. Można go uruchamiać ponownie, bo jest napisany idempotentnie.
- Tabele: `profiles` (z `look` jsonb), `walks`, `peaks`, `groups`, `group_members`, `group_routes`, `messages`, `live_positions`, `discoveries`, `bug_reports`.
- **Zgłoszenia 🐞:** tabela `bug_reports`, którą anon może wstawiać i czytać przez 60 dni. Odczyt:
  `tools/bug_reports.py` albo REST z kluczem anon (zrzut ekranu w `screenshot` jako data URL, kontekst w `context`).
  Ostatnie przejrzane zgłoszenie: **nr 69** (PR po 244: 64 lornetka nie przycina przy obracaniu i bez ostrej wysepki, 65/66 schroniska widoczne z daleka, 67 zwierzęta omijają stawy i ściany zamiast biec w miejscu; 68 migotanie na ultra i 69 biblioteka odkryć czekają). Wcześniej **nr 63** (PR 228: błędy 50–62, pomysły 56 minimapa, 61 karta szczytu z czasem/trudnością/kaloriami, 63 lornetka ze szczegółami; 57 → pomysły w p. 8). Wcześniej **nr 49** (A55, Kuźnice → Giewont, 3–4.10). Błędy z 24–48 poprawione w PR 208. Pomysły zrobione: 29 znaki na drzewach (PR 210), 26 ławki/źródła (PR 211; kolejek na Kasprowy nie ma skąd wziąć), 30 i 46 zima/pora pod ⚙️ i fakty marszu w dolnym panelu (PR 209), 32 „Dowiedz się więcej” w karcie i planszy odkrycia, 37/39/41/42 klikalne miejsca z Wikipedią (PR 212), 49 📷 zdjęcie i panorama (PR 213), 40/43 ściany i skały (PR 214–215), 38 planer: punkty pośrednie były, a na telefonie panel ma trzy wysokości (przesuwanie uchwytu, przycisk ⤢ „większa mapa”) i opis we wstępie (PR 224). 34 budynki (PR 225, potem PR po 225 „według zdjęć”: 31 schronisk, stacji i chat PL/SK opisanych ze zdjęć z Wikimedia Commons — skrzydła, lukarny, balkony, daszki, tarasy ze stołami, dach z gabletem; budynki gospodarcze do 90 m od schroniska w jego kolorach): `tatry/src/buildings.js` ma katalog `HUTS` (schroniska i chaty przy szlakach według zdjęć: drewno/kamień/tynk, kamienne przyziemie, piętra, dach i jego kolor), reszta dostaje wygląd z nazwy i wielkości (hotele, kościoły itp. tynkowane z dachem kopertowym; domy drewniane w różnych kolorach, często z naczółkiem); szerokie budynki mają niższe dachy. Poprawki konkretnego schroniska: wpis w `HUTS` (bez przeliczania danych i R2).
- **MCP Supabase:** odczyty i zapisy działają (`apply_migration`, `execute_sql`), ALE instrukcje uznane za
  niszczące (`drop …`, także `drop policy if exists`) serwer chce potwierdzić formularzem, którego sesja w chmurze
  nie pokazuje, więc wiszą 60 s i nic się nie wykonuje. Wdrażaj bez `drop` (np. samo `create policy`, gdy polityki
  jeszcze nie ma). Jeśli `drop` jest naprawdę potrzebny: właściciel wkleja SQL w Supabase → SQL Editor.
- **Wdrożone 3.10.2026:** sekcje „group trips” i „who may call the functions” ze `schema.sql` (cała baza zgodna ze
  `schema.sql`). Wyjścia grupowe sprawdzone w transakcji wycofanej na końcu: członek zapisuje „Będę/Może/Nie”,
  autor zmienia miejsce, obcy nic nie widzi. Doradca security zostawia tylko celowe: `is_member`, `shares_group`,
  `route_group`, `leaderboard` (anon/authenticated), `join_group` i `delete_my_account` (tylko zalogowani),
  „leaked password protection” (nieistotne: logowanie linkiem).
- Vercel MCP jest podłączony, ale nieużywany. Hosting to GitHub Pages. Vercel może się przydać na domenę szlakownik.pl albo funkcje serwerowe.

## 5. Stan na dziś: ostatnio zrobione (PR 176–201)

- **Poprawki z testów Samsung** (A33, A56, S25 Ultra): pomoc, klawiatura, prognoza z limitem czasu, noc z księżycem, plansza odkrycia (kadr, limit co 25 s, przyciski), układ poziomy, przelot (bez odkryć, lżejszy, Stop), schody na Rysy, kozice i świstaki, sceny tylko w zasięgu wzroku (las zasłania), burza (błyskawica przed patrzącym), numer zgłoszenia widoczny 6 s.
- **Lornetka:**
  - przy scenach ze zwierzętami podąża za akcją (`src/nature/binoculars.js`);
  - na żądanie: 🔭, klawisz B, dwa palce, kółko myszy, 2–12×.
- **Pstrągi** wyskakują na stawach (`src/nature/fish.js`).
- **Ryk jelenia** to nagranie CC0 (`public/sounds/stag_roar_0.mp3`, freesound 826420), a nie synteza. Synteza brzmiała jak „buczenie”.
- **Postać:**
  - edytor wyglądu (`src/planner/lookEditor.js`, `src/avatar/look.js`, `svg.js`, `figure3d.js`);
  - twarz jako awatar;
  - postać w 3D (dron, przelot);
  - sklepik za monety: kapelusz góralski, sweter, czekan, raki, lornetka, flaga;
  - monety to punkty z odkryć minus zakupy; ranking się nie zmienia.
- **Grupa na szlaku** (`src/mates.js`):
  - pozycje z `live_positions` co 15 s przez REST, z logowaniem planera (`tatry-auth`);
  - etykiety z twarzą, imieniem, odległością i czasem;
  - menu: widok z drona, ślad przejścia, czat.
- **Wyjścia grupowe** w planerze: termin, miejsce zbiórki, Będę / Może / Nie. Baza wdrożona; do sprawdzenia na telefonach z prawdziwymi kontami.
- **Planer:**
  - wyszukiwarka `src/planner/search.js`, przeciąganie trasy `src/planner/routedrag.js`;
  - łatanie przerw w danych szlaków: `graph.js` `heal()` oraz `corrections.js` `LINKS` (parking Palenica Białczańska; wcześniej trasa Palenica → Rysy wychodziła na 30 km).
- **Plan zawodów:** `docs/zawody.md` (GPS twardo oddzielone od symulacji).

## 6. Liczba klatek (pion, kl/s)

- Na jakości niskiej i średniej aplikacja sama ogranicza do **30 kl/s** (`FPS_CAP`).
- Telefony same wybierają jakość: A55 i słabsze niską, flagowce średnią.

| Telefon | Niska | Średnia | Wysoka | Przelot (średnia) |
|---|---|---|---|---|
| Galaxy A56 | 30 | 25–30 | – | 12–14 (przed poprawką przelotu) |
| Galaxy S25 Ultra | 30 | 30 | 15–25 (poziomo 12–13) | 27 |

- Burza na wysokiej na S25 Ultra dawała 8–17 kl/s. Deszcz na telefonach jest już lżejszy; nie zmierzone ponownie.
- A55 nie był jeszcze testowany.

## 7. Znane problemy i rzeczy niesprawdzone

- Nie sprawdzone na telefonie:
  - lornetka (gest dwóch palców);
  - przeciąganie trasy palcem;
  - edytor postaci;
  - grupa na szlaku z prawdziwymi kontami;
  - nagranie ryku na żywo.
- Na stromym odcinku schodów ok. 3,33 km jeden blok przy krawędzi trochę wystaje.
- Doradca Supabase: funkcje `security definer` dostępne przez RPC. Część zostaje celowo (`is_member`, `shares_group`, `route_group`, `leaderboard`), bo korzystają z nich polityki.
- Dane administratora w `public/prywatnosc.html` i `public/regulamin.html` to wciąż „[… do uzupełnienia]”. Uzupełnia właściciel.
- Wynik `leaderboard` widoczny tylko dla profili publicznych.

## 8. Co dalej (uzgodnione albo proponowane)

1. Sprawdzić wyjścia grupowe na dwóch prawdziwych kontach (termin, miejsce, Będę / Może / Nie).
2. Runda testów na Samsungach (~30 min): A55, jeśli dostępny, inaczej S25 Ultra. Lornetka, przelot, burza, postać, wyszukiwarka i przeciąganie palcem, grupa demo (`?grupa=demo`).
3. Przypomnienie o wyjściu: jest w aplikacji (pasek nad mapą + powiadomienie, gdy planer otwarty). Ewentualnie później e-mail (funkcja Supabase + Brevo) albo push przy zamkniętej aplikacji.
4. Zawody, etap 1: odcinki na czas z GPS (według `docs/zawody.md`).
5. Więcej scen ze zwierzętami (kozice na grani, pluszcz w potoku, świstaki mocujące się) i więcej dodatków w sklepiku.
6. Później: domena szlakownik.pl, wydanie w Google Play (wtedy płatności w sklepiku), ewentualna zgoda TOPR na dane.

### Pomysły właściciela na później (luźne, 5.10.2026)

- **Łańcuchy z OSM** — ZROBIONE: w 3D stoją tam, gdzie OSM je ma (`chains.js` opcja `osm`, np. Giewont), w planerze ⛓ i kropkowana linia od zoomu 14.
- **Przechylana mapa 3D w planerze** (zgł. 57): Leaflet nie umie 3D; wymaga przejścia planera na MapLibre GL z rzeźbą terenu (nasz DEM jako raster-dem). Duża przebudowa. Szybka namiastka: przycisk „3D” otwierający widok z drona nad trasą.
- **Co zabrać na trasę** — ZROBIONE (`tatry/src/planner/packlist.js`, karta 🎒 w planerze pod pogodą, odhaczenia w localStorage; łańcuchy i odcinki alpejskie T4–T6 z OSM: `tatry/tools/prepare_hard.py` → `public/data/region/hard.json`, 80 + 246 odcinków; uwaga: OSM nie ma łańcuchów na polskim szlaku na Rysy — kask tam z T5). Pierwotny opis: lista sprzętu do konkretnej trasy, liczona z tego, co już wiemy: długość i czas (prowiant, woda, latarka przy zapasie do zachodu < 1 h), wysokość i przewyższenie (kurtka, warstwy, czapka), łańcuchy/klamry i stopień trudności (kask, rękawiczki, buty z twardą podeszwą), pora roku i prognoza (raki, raczki, kijki, przeciwdeszczowe, krem UV), noc poza schroniskiem (namiot tylko tam, gdzie wolno — w TPN/TANAP biwak zabroniony). Lista do odhaczania, zapisywana przy wyjściu.
- **Plan pobytu w górach** — PIERWSZA WERSJA (`tatry/src/planner/stay.js`, zakładka 🗓 Pobyt: osoby z kondycją / dzieci z wiekiem, dni, nocleg, „bez łańcuchów”; katalog 27 klasycznych tras PL+SK mierzonych na grafie; limity według najsłabszego, tempo dzieci ×1,15–1,5; odpoczynek co 4. dzień; „Pokaż trasę” otwiera ją w planerze). Brakuje: prognozy w planie, tras okrężnych/przejść, dojazdów komunikacją. Pierwotny opis: użytkownik podaje skład (1 osoba, 2 dorosłe, dziecko w wieku X…), kondycję/doświadczenie, liczbę dni i bazę (np. 7 dni w Zakopanem); aplikacja układa plan dzień po dniu z tras pasujących do najsłabszego uczestnika (czas, przewyższenie, ekspozycja, łańcuchy; dla dzieci krótsze i ze schroniskiem po drodze), z dojazdem z bazy, dniem odpoczynku i rozkładem trudności (łatwe na start). Uwzględnia prognozę na najbliższe dni i zamienia dni przy złej pogodzie.

