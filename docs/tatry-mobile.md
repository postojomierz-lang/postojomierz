# Tatry Mobile (Szlakownik): notatka przekazania

Stan na 3.10.2026. Dla nowej sesji Claude: przeczytaj całość, zanim zaczniesz.

## 0. Notatka z ostatniej sesji (4.10.2026) i zadania bieżące

- Zrobione: PR 204–215 (przypomnienie o wyjściu, źródła/ławki, znaki na drzewach, krzyż na Giewoncie, 📷 zdjęcie i panorama, ściany bez smug, wychodnie na przełęczach, wapień/granit w `tatry/src/geology.js`).
- Decyzja: dane terenu (`region/`, ~550 MB) przenosimy do **Cloudflare R2**; GitHub Pages ma limit 1 GB, a repo ma już ~1,09 GB plików. Aplikacja zostaje na Pages, `ue5/` zostaje w repo (później osobne repo z Git LFS).
- R2: bucket `szlakownik-dane` (Eastern Europe), publiczny adres `https://pub-5185677c9bfa4bd98f6768e62de07255.r2.dev`, Account ID `a12ee6da38d7f98dfd7914e814534e84`.
- Właściciel utworzył Account API token (Object Read & Write, tylko ten bucket) i wpisał zmienne środowiska: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_PUBLIC_URL`. Wartości nigdy nie wypisuj ani nie wklejaj; sprawdzaj tylko, czy są ustawione.
- CORS bucketu (ustawiony i sprawdzony 4.10): GET/HEAD z `https://postojomierz-lang.github.io`, `http://localhost:5173`, `http://localhost:8765`; ExposeHeaders `ETag`, `Content-Length`.
- Zadania 1 i 2 zrobione (4.10): `region/` jest w R2 pod kluczem `region/` (18 220 plików, 551 MB); `REGION_BASE` w `tatry/src/region.js` = `https://pub-…r2.dev/region/` (budowanie z `VITE_REGION_BASE=../region/` czyta lokalną kopię). `sw.js` nie dotyka danych 3D, więc bez zmian.
- Wysyłka: `python3 tatry/tools/upload_r2.py` (tylko zmienione pliki po MD5/ETag; `--dry-run`, `--delete`). Cache-Control: `meta.json` 5 min, reszta 1 dzień. Bez boto3 (podpis SigV4 w skrypcie, potrzebne tylko `requests`).
- Test 3D w tym środowisku: Chromium nie przechodzi przez proxy do r2.dev; w Playwright przekieruj zapytania `r2.dev` przez `page.route` + `curl` (prawdziwe nagłówki CORS z R2).

Zadania bieżące (po kolei):
1. ~~Sprawdzić, czy 5 zmiennych R2 jest widocznych, i wysłać jeden plik testowy do bucketu (S3 API, endpoint `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`), odczytać go przez `R2_PUBLIC_URL` (też z nagłówkiem Origin, żeby sprawdzić CORS).~~ Zrobione.
2. ~~Napisać `tatry/tools/upload_r2.py`: wysyła `region/` (tylko zmienione pliki, poprawne Content-Type, Cache-Control), potem przełączyć `REGION_BASE` w `tatry/src/region.js` (i miejsca używające `../region/`, w tym `sw.js`/offline) na adres R2; test 3D i planera.~~ Zrobione (test: Kuźnice → Kasprowy z R2, 453 pliki bez błędów; planer OK).
3. Usunąć `region/` z publikowanej strony (najlepiej automat GitHub Actions publikujący tylko `rysy/`, `plastic-front/` i pliki z katalogu głównego; właściciel przełącza Settings → Pages → Source na „GitHub Actions”).
4. Rozszerzenie regionu na zachód (Chochołowska, Wołowiec, Kominiarski; do ~19,68°E) — dane od razu do R2. Roháče w pełnej jakości po wgraniu kafli ZBGIS na gałąź `dane-zbgis` (19,68–19,86°E, 49,16–49,23°N).
5. Przed produkcją: własna domena w R2 (np. `dane.szlakownik.pl`), bo r2.dev ma limit zapytań i nie cache'uje.

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
- **Na końcu odpowiedzi proponuj kolejne kroki „na szaro”**, czyli w cytacie (`> **Możliwe kolejne kroki:** …`).
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
  Ostatnie przejrzane zgłoszenie: **nr 49** (A55, Kuźnice → Giewont, 3–4.10). Błędy z 24–48 poprawione w PR 208; pomysły (26, 29, 30, 32, 34, 37–43, 46, 49) czekają na decyzję właściciela.
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
