# UNC Terminal: odbiór i pomiary obciążenia

Pomiar z 28.09.2026, po etapach 1–4 planu rozbudowy terminala (strumień na żywo, szybszy order flow, pełny order flow,
niezależne panele). Wszystkie liczby pochodzą z powtarzalnego zestawu testów opisanego niżej. To pomiary na jednym
komputerze, a nie gwarancja dla innego sprzętu.

## Jak mierzono

| | |
|---|---|
| Komputer | Mac14,13 (Mac Studio), Apple M2 Max, 32 GB RAM, macOS 27.2 |
| Przeglądarka | Chrome 153, tryb bez okna, renderowanie programowe, DPR 2, okno 1600 × 950 |
| Aplikacja | UNC’sWay (WKWebView / WebKit 605.1.15), okno 1600 × 950 na monitorze zewnętrznym (DPR 1, ok. 72 klatki/s) |
| Dane | Sztuczny strumień Hyperliquid wstrzyknięty zamiast WebSocketu: transakcje, świece, arkusz (20 poziomów) i kontekst rynku. Ceny startowe i historia świec (REST) są prawdziwe. |
| Układ | UNC, 4 wykresy: BTC 1m (footprint, delta/CVD, volume profile widocznego zakresu, trade bubbles, VWAP, heatmapa arkusza), BTC 1m (footprint, delta, RSI), ETH 5m (footprint, trade bubbles, MACD), BTC 15m (profile sesji, TPO, Bollinger). Lista rynków, arkusz i taśma są otwarte. |

Mierzone wartości:
- **klatki**: odstępy między `requestAnimationFrame`; p50, p95, p99, maksimum i liczba klatek dłuższych niż 50 ms;
- **długie zadania**: `PerformanceObserver('longtask')`, tylko Chrome, bo WebKit tego nie udostępnia;
- **wiadomość → klatka**: od dostarczenia paczki transakcji do najbliższej klatki, z obsługą wiadomości włącznie;
- **klik → obraz**: od kliknięcia do drugiej klatki po nim (reakcja interfejsu);
- **pamięć**: sterta JS, węzły DOM i liczba słuchaczy zdarzeń po wymuszonym odśmiecaniu, na początku i na końcu scenariusza (Chrome);
- **CPU**: udział czasu, w którym główny wątek był zajęty (Chrome).

## Wyniki: Chrome (po poprawkach z tego etapu)

| Scenariusz | Klatki/s | p95 klatki | > 50 ms | Długie zadania | Wiadomość → klatka p95 | Klik → obraz p95 | Główny wątek |
|---|---|---|---|---|---|---|---|
| Bazowy: 4 wykresy, 1000 transakcji/s, 60 s | 60 | 16,7 ms | 0 | 0 | 16,6 ms | 33,5 ms | 11,4 % |
| Przewijanie i przybliżanie 2 wykresów co klatkę, 1000/s, 20 s | 60 | 16,8 ms | 0 | 0 | 15,7 ms | — | 19,2 % |
| Burst: 5000 transakcji/s przez 10 s | 60 | 16,8 ms | 0 | 0 | 16,4 ms | 33,4 ms | 11,8 %¹ |
| 100 zmian rynku na głównym wykresie | 60 | 16,7 ms | 0 | 0 | 17,2 ms | — | 15,4 % |
| 20 cykli: 1 ↔ 4 wykresy i BBB ↔ UNC | 60 | 16,8 ms | 0 | 0 | 16,5 ms | 35,1 ms | 14,7 % |
| 5 zerwań połączenia, duplikaty, powtórki | 60 | 16,8 ms | 0 | 0 | 17,2 ms | — | 2,9 % |

¹ Średnio w całym scenariuszu (10 s przy 1000/s, 10 s przy 5000/s, 10 s przy 1000/s).

**Zmiana rynku 100 razy:** mediana 58 ms do nowego wykresu, p95 768 ms, maksimum 875 ms. Czas p95 to pobranie historii świec z Hyperliquid, gdy nie ma jej w pamięci podręcznej serwera. Wszystkie zmiany się udały.

**Pamięć i sprzątanie (Chrome, po odśmiecaniu):**

| Scenariusz | Sterta JS | Węzły DOM | Słuchacze zdarzeń | Subskrypcje strumienia | Połączenia |
|---|---|---|---|---|---|
| 100 zmian rynku | 9,9 → 11,4 MB | 7848 → 7849 | 739 → 739 | 7 → 7 | 1 |
| 20 cykli paneli | 8,8 → 12,3 MB | 7847 → 7842 | 739 → 739 | 7 → 7 | 1 |
| Bazowy, 60 s | 11,6 → 26,2 MB² | 7854 → 7873 | 739 → 739 | — | 1 |

² Wzrost to bufory transakcji order flow, które się zapełniają: każdy wykres trzyma do 55 tys. transakcji. Czy pamięć
się stabilizuje, pokazuje sesja 60-minutowa niżej.

**Spójność danych przy zrywaniu połączenia:** 5 zerwań, po każdym ponowne połączenie, co 40. paczka zdublowana, a po
każdej nowej subskrypcji powtórka 100 ostatnich transakcji. Wynik: 8242 dostarczonych, 8242 zapisanych, **0 policzonych
podwójnie, 0 zgubionych**. Komunikat „przerwa w połączeniu” pojawił się przy wszystkich 5 zerwaniach.

## Wyniki: aplikacja na Maca (WebKit)

| Scenariusz | Klatki/s | p95 klatki | > 50 ms | Wiadomość → klatka p95 | Klik → obraz p95 |
|---|---|---|---|---|---|
| Bazowy | 71,6 | 23 ms | 0 | 13 ms | 43 ms |
| Przewijanie i przybliżanie | 71,6 | 29 ms | 0 | 17 ms | — |
| Burst 5000/s | 71,8 | 17 ms | 0 | 13 ms | 41 ms |
| 100 zmian rynku | 69,6 | 23 ms | 0 | 15 ms | — |
| 20 cykli paneli | 68,5 | 27 ms | 21 | 17 ms | 76 ms |
| Zerwania połączenia | 72 | 16 ms | 0 | 14 ms | — |

W aplikacji ekran odświeża się ok. 72 razy na sekundę, więc klatka trwa ok. 14 ms, a p95 23–29 ms oznacza pojedyncze
pominięte klatki. W 20 cyklach paneli (80 zmian układu) 21 klatek trwało ponad 50 ms, najdłuższa 70 ms, czyli mniej
więcej jedna na zmianę układu. Każda zmiana przebudowuje siatkę i wszystkie wykresy naraz zmieniają rozmiar swoich
płócien, co w WebKit kosztuje jedną dłuższą klatkę. Wynik powtórzył się w trzech przebiegach; przeniesienie przeliczania
order flow do osobnych zadań go nie zmieniło, więc to koszt zmiany rozmiaru płócien, a nie obliczeń. Zerwania połączenia: 8020 dostarczonych, 8020 zapisanych, 0 podwójnie, 0 zgubionych. 100 zmian
rynku: mediana 56 ms, p95 319 ms, a subskrypcji i połączeń nie przybyło. Pamięci WebKit nie da się zmierzyć z wnętrza
strony, więc wycieki sprawdzono w Chrome na tym samym kodzie.

## Cele z planu

| Cel | Wynik |
|---|---|
| Przewijanie i przybliżanie ok. 60 FPS, p95 klatki ≤ 20 ms | Chrome: 60 FPS, p95 16,8 ms ✔. WebKit: 71,6 FPS, p95 29 ms, czyli pojedyncze pominięte klatki przy 72 Hz. |
| Reakcja na kliknięcie p95 < 100 ms | Chrome 33–35 ms ✔, WebKit 41–76 ms ✔ |
| Dane → ekran p95 < 100 ms | 13–17 ms ✔ |
| Brak powtarzalnych zadań > 50 ms | Chrome: 0 długich zadań ✔. WebKit: 0 w stałym strumieniu ✔; przy zmianie układu jedna klatka 50–70 ms na zmianę (zmiana rozmiaru płócien). |
| Brak wycieków po 100 zmianach rynku i 20 cyklach paneli | Węzły DOM, słuchacze i subskrypcje bez zmian ✔ |
| Pamięć stabilna w długiej sesji | 32–34 MB od 8. do 60. minuty ✔ |
| 0 podwójnie naliczonych transakcji | ✔ (Chrome i WebKit) |

## Co poprawiono w trakcie odbioru

- **Formatowanie liczb:** taśma, arkusz, footprint i panele tworzyły nowy formater liczb przy każdym wywołaniu.
  Przy przewijaniu z 1000 transakcji/s zajmowało to ok. 19 % czasu procesora. Formatery są teraz tworzone raz.
  Obciążenie głównego wątku spadło:
  - scenariusz bazowy: z 27,8 % do 11,4 %;
  - przewijanie: z 50,7 % do 19,2 %;
  - 20 cykli paneli: z 43,8 % do 14,7 %.

  W aplikacji przewijanie wzrosło z 51,6 do 71,6 FPS.
- **Taśma** odświeża się najwyżej ok. 8 razy na sekundę zamiast przy każdej paczce transakcji.
- **Taśma i kolumna HANDEL** liczyły transakcje powtórzone po ponownym połączeniu drugi raz. Teraz każdy identyfikator
  transakcji liczy się raz; order flow robił to już wcześniej.
- **Order flow po powrocie wykresu na ekran** przelicza się w osobnym zadaniu, więc kilka wykresów wracających naraz nie
  składa się w jedną długą klatkę.
- **Sam pomiar:** pierwsza sesja 60-minutowa pokazała rosnącą stertę (14 → 73 MB). Przyczyną był skrypt pomiarowy, który
  pamiętał każdą dostarczoną transakcję (ok. 1 mln wpisów na godzinę). Teraz robi to tylko w teście zerwań połączenia,
  a sesję zmierzono ponownie.

## Sesja 60-minutowa

Układ bazowy (4 wykresy, order flow wszędzie) przy 300 transakcjach/s przez 60 minut, w Chrome. Stertę mierzono co
minutę po odśmiecaniu.

| | Wynik |
|---|---|
| Sterta JS | rośnie przez ok. 8 minut (13,8 → 32 MB), aż zapełnią się bufory transakcji order flow; potem przez 52 minuty stoi na 32–34 MB ✔ |
| Węzły DOM / słuchacze zdarzeń | 7816–9042 węzłów (bez trendu) / stale 739 ✔ |
| p95 klatki | 16,7–16,8 ms w każdej minucie ✔ |
| Długie zadania | 0 ✔ |
| Klatki > 50 ms | 23 w ciągu godziny (ok. 216 tys. klatek) |
| Klatki/s | 60 w pierwszych 25 minutach, potem 58,4–59,3 |
| Błędy strony | 0 |
| Główny wątek | 24,1 % |

Pamięć jest stabilna. Lekki spadek średniej liczby klatek w drugiej połowie (ok. 1 klatka/s mniej, przy niezmienionym p95)
to dłuższe listy świec i więcej rysowanych poziomów footprintu. Warto to obserwować przy wielogodzinnych sesjach, ale
nie wymaga to teraz zmian.

## Ograniczenia pomiaru

- Chrome działał bez okna, z renderowaniem programowym. Na ekranie z GPU klatki mogą być krótsze, ale nie dłuższe z powodu JS.
- Strumień jest sztuczny: 1000–5000 transakcji/s to test wytrzymałości, a nie typowy ruch Hyperliquid. Historia świec
  i czasy ładowania rynku są prawdziwe, więc zależą od sieci.
- „Wiadomość → klatka” obejmuje obsługę wiadomości i czekanie na najbliższą klatkę, ale nie samo rysowanie na GPU.
- W WebKit nie ma API długich zadań ani pomiaru sterty, więc te liczby są tylko dla Chrome.

## Jak powtórzyć

```bash
pnpm build
node scripts/bench-terminal.mjs --scenarios baseline,pan,burst,switch100,panels20,reconnect --out /tmp/bench.json
node scripts/bench-terminal.mjs --scenarios session --minutes 60 --out /tmp/bench-session.json
node scripts/bench-terminal.mjs --scenarios pan --profile --out /tmp/bench     # profil CPU: /tmp/bench.pan.cpuprofile

python3 scripts/build-macos.py
dist/UNCsWay.app/Contents/MacOS/UNCsWay --bench-terminal "$PWD/scripts/bench/terminal-bench.js" baseline
```

Sterownik uruchamia własny serwer z jednorazowym hasłem i nic nie wysyła na zewnątrz poza pobraniem historii świec z
Hyperliquid. Skrypt `scripts/bench/terminal-bench.js` nie jest częścią strony: wstrzykuje go tylko sterownik albo
aplikacja w trybie pomiaru.
