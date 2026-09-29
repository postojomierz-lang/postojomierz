# Tatry online (Supabase)

Część serwerowa aplikacji: konta, profile, dziennik na wielu urządzeniach, grupy, wspólne trasy, czat grupy
i pozycje członków grupy na żywo.

## Założenie bazy (raz)

1. Supabase → **New project**, region **Frankfurt (eu-central-1)** (dane w UE, RODO).
2. **SQL Editor → New query**: wklej całą zawartość [`schema.sql`](schema.sql) → **Run**.
   Można uruchomić ponownie po zmianach (skrypt jest powtarzalny).
3. **Authentication → Providers**: na start wystarczy **Email** (logowanie linkiem z e-maila).
   **Authentication → URL Configuration**: *Site URL* = `https://postojomierz-lang.github.io/postojomierz/rysy/planer.html`.
4. **Authentication → SMTP Settings**: wbudowana poczta Supabase wysyła najwyżej **2 e-maile na godzinę
   dla całego projektu** (limit `over_email_send_rate_limit`) – do testów wystarczy, dla ludzi nie.
   Podłącz własny SMTP (np. Resend, Brevo, Postmark; darmowe progi wystarczą) i podnieś limit w
   **Authentication → Rate Limits**.
5. Opcjonalnie **Authentication → Emails**: po polsku i z kodem, np. w szablonach *Magic Link* i
   *Confirm signup*: `Zaloguj się: <a href="{{ .ConfirmationURL }}">otwórz planer</a> albo wpisz kod {{ .Token }}`.
   Kod przydaje się, gdy link otwiera się w innej przeglądarce niż aplikacja (np. planer zainstalowany na iPhonie).
6. W ustawieniach środowiska sesji Claude (nie w czacie): `SUPABASE_URL` i `SUPABASE_ANON_KEY`
   (Project Settings → API: *Project URL* i klucz *anon / publishable*). Klucza `service_role` nie dodawaj nigdzie.

## Prywatność

- Domyślnie nic nie jest publiczne. Profil widzą osoby z Twoich grup (wszyscy tylko po zaznaczeniu „publiczny”).
- Dziennik (przejścia, szczyty) widzisz tylko Ty.
- Pozycję na żywo udostępniasz świadomie, tylko wybranej grupie, i wygasa (domyślnie po 12 h).
- Reguły dostępu (Row Level Security) są w bazie, więc działają niezależnie od aplikacji.
