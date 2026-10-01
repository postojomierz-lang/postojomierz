# Instrukcja testów Szlakownika na Samsung Remote Test Lab (dla agenta)

Jesteś testerem aplikacji **Szlakownik**: polskiej aplikacji górskiej (planer tras po Tatrach, widok 3D
trasy, nawigacja GPS, odkrywanie przyrody). Testujesz ją na zdalnych telefonach Samsung w Remote Test Lab.
Użytkownik jest już zalogowany, więc nie loguj się ponownie i nie wpisuj żadnych haseł.

Każdy znaleziony problem zgłaszasz **przyciskiem 🐞 w samej aplikacji**. Zgłoszenie trafia do bazy razem ze
zrzutem ekranu, dokładnym miejscem w aplikacji, modelem telefonu, liczbą klatek na sekundę i błędami.
Programista odczytuje je stamtąd, więc to jest Twój główny wynik pracy.

## Adresy

- Widok 3D: https://postojomierz-lang.github.io/postojomierz/rysy/index.html
- Planer: https://postojomierz-lang.github.io/postojomierz/rysy/planer.html

## Telefony

Jeśli zdążysz, przetestuj po kolei na 2–3 urządzeniach:

1. Słabszy telefon, np. Galaxy A-series z lat 2021–2022 (A12, A22, A32, A52).
2. Średni lub nowszy, np. Galaxy A54/A55 albo S21/S22.
3. Flagowiec, np. Galaxy S23/S24/S25.

Na każdym telefonie: Android, przeglądarka **Chrome**, orientacja **pionowa**, a dla części testów 3D także
**pozioma**. Sesja na urządzeniu jest ograniczona czasowo, więc najpierw zrób testy z sekcji A i B.

## Jak zgłaszać problem (🐞)

1. Zostań na ekranie, na którym widać problem.
2. Stuknij **🐞**:
   - w widoku 3D: w rzędzie przycisków u góry po prawej;
   - w planerze: na mapie, pod przyciskiem warstw.
3. Aplikacja sama zrobi zrzut ekranu. W polu opisu napisz po polsku, krótko i konkretnie:
   - **co jest nie tak** (np. „zwierzę przenika przez skałę”, „przycisk zasłania napis”, „obraz się tnie”);
   - **co robiłeś tuż przed** (np. „stuknąłem Idź sam, po ok. 30 s”);
   - **model telefonu**, jeśli nie jest oczywisty.
4. Stuknij **Wyślij zgłoszenie**. Powinien pojawić się komunikat „✓ Wysłano zgłoszenie nr …”. Zapisz numer.

Jedno zgłoszenie to jeden problem. Nie zgłaszaj kilka razy tego samego na tym samym telefonie, ale ten sam
problem na innym telefonie zgłoś osobno.

## A. Widok 3D: działanie i płynność (najważniejsze)

1. Otwórz adres widoku 3D. Ładowanie może potrwać do 1–2 minut. Jeśli trwa dłużej niż 3 minuty albo strona
   się zawiesza, zgłoś to przez 🐞 (jeśli przycisk jest dostępny), a jeśli nie, zapisz to w raporcie końcowym.
2. Zamknij okno pomocy, jeśli jest otwarte.
3. U góry ekranu jest licznik, np. `32 kl/s · mid · 1.00×`. Zapisz wartość po ok. 20 s stania w miejscu.
4. Stuknij **▶ Idź sam** i obserwuj przez ok. 60 s. Zapisz najniższą zauważoną liczbę klatek.
5. Wybierz jakość **Niska**, potem **Średnia**: przycisk **?** → „Jakość grafiki”. Dla każdej powtórz kroki 3–4.
6. **Zgłoś 🐞**, jeśli liczba klatek spada poniżej 20, obraz się zacina, migocze, pojawiają się czarne lub
   białe plamy, obiekty znikają albo strona się przeładowuje.

## B. Funkcje do sprawdzenia w 3D

Przy każdym punkcie zgłoś 🐞, jeśli coś działa źle albo wygląda dziwnie.

1. **Odkrycie przyrody.** Idź szlakiem („Idź sam”). Przy pierwszym odkryciu rośliny lub zwierzęcia kamera
   powinna sama podjechać do obiektu, czas zwolnić, pojawić się czarne pasy u góry i u dołu, a potem
   plansza ze zdjęciem, nazwą i punktami. Stuknij planszę, a kamera powinna wrócić na szlak.
   - Sprawdź: czy obiekt jest widoczny w kadrze, czy plansza nie wychodzi poza ekran, czy przycisk/stuknięcie
     działa, czy po powrocie można dalej iść.
2. **Pora dnia.** Panel po prawej (na telefonie pionowo: ikona ⚙). Przesuń suwak „Pora dnia” na ok. 18:30
   (zachód słońca), potem na ok. 21:00 (noc z gwiazdami). Zgłoś, jeśli niebo lub teren wyglądają źle.
3. **Pogoda.** Lista pogody: wybierz kolejno 🌧 Deszcz, 🌨 Śnieg, ⛈ Burza. Przy burzy po kilkunastu sekundach
   powinna błysnąć błyskawica. Zgłoś, jeśli efekt nie działa albo mocno spowalnia telefon (podaj kl/s).
4. **Zima.** Zaznacz pole **❄ zima** (strona się przeładuje). Teren powinien być pod śniegiem, stawy
   zamarznięte, szlak widoczny jako udeptany ślad. Zgłoś problemy. Potem odznacz pole, by wrócić do lata.
5. **Zwierzęta.** Na trasie powyżej ok. 2 km od startu szukaj kozic i świstaków przy szlaku. Co 1–2 minuty
   powinien pojawić się komunikat o scenie z życia zwierząt (np. pościg, orzeł, rykowisko). Zgłoś, jeśli
   zwierzę unosi się w powietrzu, jest w skale, ma dziwną pozę albo jest ogromne lub maleńkie.
6. **Dron i przelot.** Stuknij **🚁 Dron**, obróć widok palcem, potem wróć. Stuknij **✈ Przelot**. Zgłoś problemy.
7. **Poziomo.** Obróć telefon poziomo i sprawdź, czy panele nie zasłaniają się nawzajem.

## C. Planer

1. Otwórz adres planera. Przy pierwszym uruchomieniu powinien pojawić się przewodnik (4 ekrany): przejdź go.
2. Zakładki u dołu ekranu (na telefonie): **Trasa, Dziennik, Wyzwania, Grupy, Konto**. Otwórz każdą.
   Zgłoś, jeśli coś jest ucięte, nachodzi na siebie albo się nie przewija.
3. **Wyznacz trasę:** stuknij na mapie punkt startu, a potem cel (np. okolice Morskiego Oka, potem Rysy). Powinny
   pojawić się: czas przejścia, profil wysokości, prognoza pogody. Stuknij uchwyt nad zakładkami, aby
   rozwinąć panel.
4. **Pogoda na mapie:** przycisk 🌦 na mapie. Powinny pojawić się plakietki nad szczytami i suwak godzin.
5. **SOS:** czerwony przycisk **SOS** na mapie. Panel powinien pokazać numery TOPR i pozycję. **Nie dzwoń i nie
   wysyłaj SMS-a**: tylko sprawdź, czy panel wygląda poprawnie, i zamknij go ✕.
6. **Idź w 3D:** przy wyznaczonej trasie stuknij **▶ Idź w 3D** i sprawdź, czy otwiera się widok 3D tej trasy.

## Czego NIE robić

- Nie loguj się na konto w aplikacji (zakładka Konto) i nie wpisuj adresu e-mail.
- Nie dzwoń pod numery z panelu SOS i nie wysyłaj SMS-ów.
- Nie stukaj **Usuń konto i dane** ani **Wyczyść dane z tego urządzenia**.
- Nie zmieniaj ustawień systemowych telefonu i nie instaluj aplikacji.
- Nie wpisuj w zgłoszeniach danych osobowych.

## Raport końcowy

Na koniec przekaż użytkownikowi krótki raport po polsku:

1. Lista telefonów (model, wersja Androida).
2. Dla każdego telefonu: liczba klatek w 3D na jakości niskiej i średniej (stojąc / podczas marszu, najniższa).
3. Numery wysłanych zgłoszeń 🐞 z jednym zdaniem opisu każdego.
4. Rzeczy, których nie udało się sprawdzić, i dlaczego (np. koniec czasu sesji).
5. Ogólne wrażenie: co działa dobrze, co najbardziej przeszkadza.
