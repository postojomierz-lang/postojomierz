# Tatry Mobile (Szlakownik): notatka przekazania

Stan na 3.10.2026. Dla nowej sesji Claude: przeczytaj całość, zanim zaczniesz.

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
- Do testów: `window.__rysy` (stan 3D) i `window.__planner` (mapa, `path`, `stops`).
- Shadery: każdy fragment używający wspólnych uniformów (`wetK`, `winterK`, …) musi je zadeklarować. Brak deklaracji już raz ukrył skały i łańcuchy, więc sprawdzaj konsolę.

## 4. Supabase

- Projekt aplikacji: **`tatry`**, id `ijpyszrtwqhazmwrdccw` (to ten z `SUPABASE_URL`). Na koncie są też projekty `postojomierz` i `anything-can-fight`; nie ruszaj ich.
- Schemat w `supabase/schema.sql`. Można go uruchamiać ponownie, bo jest napisany idempotentnie.
- Tabele: `profiles` (z `look` jsonb), `walks`, `peaks`, `groups`, `group_members`, `group_routes`, `messages`, `live_positions`, `discoveries`, `bug_reports`.
- **Zgłoszenia 🐞:** tabela `bug_reports`, którą anon może wstawiać i czytać przez 60 dni. Odczyt:
  `tools/bug_reports.py` albo REST z kluczem anon (zrzut ekranu w `screenshot` jako data URL, kontekst w `context`).
  Ostatnie obsłużone zgłoszenie: **nr 18**.
- **MCP Supabase:** odczyty działają. **Zapisy i DDL zawieszały się na 60 s** (prawdopodobnie czekały na
  zatwierdzenie). Właściciel ustawił w https://claude.ai/customize/connectors wszystkie narzędzia na „Always allow”.
  Nowa sesja powinna to już widzieć. Najpierw sprawdź testem:
  `create table if not exists public._ddl_probe(id int); drop table public._ddl_probe;`
- **Do wdrożenia w bazie** (jest w `schema.sql`, ale NIE ma w bazie):
  1. sekcja „group trips”: `group_routes.place`, polityka `routes_edit`, tabela `route_rsvp`, funkcja `route_group` i polityki `rsvp_*`;
  2. sekcja „who may call the functions”: `revoke execute` na `join_group`, `delete_my_account`, `on_user_created`, `on_group_created`.
  
  Po wdrożeniu uruchom `get_advisors` (security).
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
- **Wyjścia grupowe** w planerze: termin, miejsce zbiórki, Będę / Może / Nie. Kod jest gotowy, ale baza wymaga wdrożenia (pkt 4).
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

- Wyjścia grupowe i zapisy nie działają, dopóki baza nie ma zmian z pkt 4.
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

1. Sprawdzić zapisy przez MCP Supabase. Jeśli działają: wdrożyć pkt 4, uruchomić doradcę i sprawdzić wyjścia grupowe.
2. Runda testów na Samsungach (~30 min): A55, jeśli dostępny, inaczej S25 Ultra. Lornetka, przelot, burza, postać, wyszukiwarka i przeciąganie palcem, grupa demo (`?grupa=demo`).
3. Przypomnienie o wyjściu grupowym dzień wcześniej (funkcja Supabase albo Vercel i powiadomienie push).
4. Zawody, etap 1: odcinki na czas z GPS (według `docs/zawody.md`).
5. Więcej scen ze zwierzętami (kozice na grani, pluszcz w potoku, świstaki mocujące się) i więcej dodatków w sklepiku.
6. Później: domena szlakownik.pl, wydanie w Google Play (wtedy płatności w sklepiku), ewentualna zgoda TOPR na dane.
