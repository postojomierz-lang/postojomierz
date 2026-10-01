# Tryb zawodów górskich: plan

Cel: rywalizacja w Szlakowniku w dwóch twardo rozdzielonych światach:

- **Szlak**: prawdziwe przejście w górach, potwierdzone śladem GPS.
- **Symulacja**: wirtualne przejście w widoku 3D, na bieżni, rowerze stacjonarnym albo z klawiatury.

Wynik z jednego świata nigdy nie trafia do rankingu drugiego.

## 1. Zasada rozdzielenia

Każdy wynik ma pole `kind` z wartością `'gps'` albo `'sim'`.

- Pole jest ustawiane przez kod, który wynik utworzył: nawigacja GPS w planerze daje `gps`, widok 3D daje `sim`.
- Użytkownik nie może go zmienić.
- W bazie: tabela `results` z kolumną `kind`. Polityka wstawiania przyjmuje `gps` tylko z wypełnionym śladem i podpisaną sumą kontrolną, opis w pkt 3.
- W interfejsie: osobne zakładki rankingów **„Na szlaku”** i **„Wirtualnie”**, różne kolory (zielony szlak i fioletowa symulacja) oraz osobne odznaki.
- W profilu: dwie kolumny statystyk (km, przewyższenie, czasy), nigdy sumowane.
- Odznaki z obu światów mają różne ramki. „Rysy” zdobyte na szlaku i „Rysy” w symulacji to dwie różne odznaki.

## 2. Konkurencje

### Na szlaku (GPS)

| Konkurencja | Na czym polega | Pomiar |
|---|---|---|
| Odcinek na czas | stały odcinek, np. Morskie Oko → Czarny Staw, Kuźnice → Kasprowy | czas między punktami kontrolnymi (bramki 30 m) |
| Korona sezonu | lista szczytów do zdobycia od maja do października | wejście w promień 40 m od wierzchołka |
| Przewyższenie miesiąca | suma podejść w miesiącu | ze śladu, wygładzone jak w planerze |
| Wyzwanie grupowe | grupa razem zbiera kilometry, szczyty albo schroniska | suma członków grupy |
| Wyjście grupowe | zapis „będę” w wyjściach grupy i przejście trasy w terminie | obecność potwierdzona śladem |

### Wirtualnie (symulacja)

| Konkurencja | Na czym polega | Pomiar |
|---|---|---|
| Wyścig z duchem | pobicie własnego albo cudzego rekordu trasy | czas wirtualnego przejścia |
| Zawody o godzinie | wszyscy startują razem na zadanej trasie, np. w sobotę o 20:00 | kolejność na mecie; postacie innych widać jak w grupie |
| Liga tygodniowa | punkty za przejścia w tygodniu, awans i spadek między ligami | punkty za trasę według długości i przewyższenia |
| Bieżnia | to samo, ale prędkość i nachylenie idą z urządzenia | osobna kategoria „z urządzeniem” |

## 3. Wiarygodność wyników z GPS

Wynik `gps` przechodzi kontrolę na telefonie, a skrót trafia do bazy:

1. **Ślad:** punkty co 5–10 s, dokładność nie gorsza niż 30 m, przerwy najwyżej 3 min, chyba że w tunelu albo schronisku.
2. **Prędkość:** odcinki szybsze niż 12 km/h pod górę albo 25 km/h z góry oznaczają wynik do sprawdzenia (np. jazda autem po drodze do Morskiego Oka). Ten odcinek wypada z wyniku.
3. **Zgodność ze szlakiem:** co najmniej 85% śladu w pasie 40 m od znakowanego szlaku z grafu planera.
4. **Punkty kontrolne:** przejście przez wszystkie bramki odcinka, w kolejności.
5. **Wysokość:** przewyższenie liczone z modelu terenu wzdłuż śladu, a nie z barometru telefonu, więc nie da się go zawyżyć.
6. **Podpis:** skrót śladu (np. SHA-256 z punktów) zapisany razem z wynikiem. Ślad zostaje w telefonie, a na prośbę organizatora można go wysłać. Pełny ślad trafia do bazy tylko za zgodą (prywatność).

Wynik, który nie przejdzie kontroli, zostaje w dzienniku jako zwykłe przejście, bez rankingu.

## 4. Symulacja: urządzenia

- **Bez urządzenia:** prędkość z przycisków. Kategoria „klawiatura”, bez rankingów na czas, tylko liga punktowa.
- **Bieżnia lub rower przez Bluetooth** (standard FTMS, Web Bluetooth w Chrome na Androidzie i komputerze): aplikacja czyta prędkość i nachylenie. Na bieżniach, które to obsługują, może też ustawiać nachylenie według profilu trasy; widok 3D już liczy nachylenie bieżni (max 15%). Kategoria „z urządzeniem”.
- **Pulsometr** (Bluetooth HRM): tylko do statystyk, nie do rankingu.

## 5. Dane (Supabase)

```sql
-- schemat do wdrożenia razem z funkcją; teraz tylko projekt
create table public.results (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade default auth.uid(),
  kind       text not null check (kind in ('gps', 'sim')),
  device     text check (device in ('keys', 'treadmill', 'bike')),        -- sim only
  contest    text not null,                 -- 'segment:mo-czarny-staw', 'crown:2027', 'league:2027-w14', ...
  value      real not null,                 -- seconds, metres or points
  track_hash text,                          -- gps only: the signature of the track kept on the phone
  checks     jsonb,                         -- the results of the checks (speed, on trail, gates)
  created_at timestamptz not null default now(),
  check (kind = 'sim' or track_hash is not null)
);
```

Rankingi to widoki z podziałem na `kind`, widoczne dla osób z publicznym profilem, jak obecny ranking odkryć.

## 6. Kolejność wdrażania

1. Odcinki na czas z GPS: 5 klasycznych odcinków, bramki, kontrola śladu, ranking „Na szlaku”.
2. Wyścig z duchem między użytkownikami: rekordy tras z widoku 3D w rankingu „Wirtualnie”.
3. Wyzwania grupowe, korzystające z grup i wyjść grupowych.
4. Zawody o godzinie: wspólny start, postacie innych na trasie, meta.
5. Bieżnia przez Bluetooth (FTMS) i kategoria „z urządzeniem”.
6. Korona sezonu i ligi tygodniowe.

## 7. Bezpieczeństwo i regulamin

- Rywalizacja na szlaku nie może zachęcać do ryzyka. Na odcinkach z łańcuchami (np. Rysy, Orla Perć) nie ma rankingów na czas, tylko odznaki za przejście.
- Zimą (tryb zimowy, karta TOPR) rankingi czasowe na szlaku są wyłączone.
- Regulamin zawodów jest osobną częścią regulaminu, z zakazem wyprzedzania na łańcuchach, ostrzeżeniem o pogodzie i odesłaniem do TOPR.
- Wyniki z GPS nie mogą ujawniać, gdzie ktoś jest teraz. Publikowane są po zakończeniu przejścia, a pozycję na żywo widzi tylko grupa.
