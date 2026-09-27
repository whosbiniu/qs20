import Foundation

// Curated approximate reference points from public/monitor-geo.js, not live signals.
enum MonitorReference {
  static let json = ##"""
    [
      {
        "id": "reference-conflicts-0",
        "title": "Wojna Rosja–Ukraina · Wojna na pełną skalę, linia frontu na wschodzie i południu Ukrainy.",
        "category": "Konflikty · referencyjne",
        "latitude": 49,
        "longitude": 37.5,
        "magnitude": 0
      },
      {
        "id": "reference-conflicts-1",
        "title": "Konflikt w Strefie Gazy · Wojna Izrael–Hamas i kryzys humanitarny.",
        "category": "Konflikty · referencyjne",
        "latitude": 31.4,
        "longitude": 34.4,
        "magnitude": 0
      },
      {
        "id": "reference-conflicts-2",
        "title": "Wojna domowa w Sudanie · Armia przeciwko Siłom Szybkiego Wsparcia.",
        "category": "Konflikty · referencyjne",
        "latitude": 15.6,
        "longitude": 32.5,
        "magnitude": 0
      },
      {
        "id": "reference-conflicts-3",
        "title": "Wojna domowa w Mjanmie · Junta przeciwko siłom oporu i armiom etnicznym.",
        "category": "Konflikty · referencyjne",
        "latitude": 21,
        "longitude": 96,
        "magnitude": 0
      },
      {
        "id": "reference-conflicts-4",
        "title": "Rebelia w Sahelu · Rebelia dżihadystów w Mali, Burkina Faso i Nigrze.",
        "category": "Konflikty · referencyjne",
        "latitude": 14.5,
        "longitude": -1.5,
        "magnitude": 0
      },
      {
        "id": "reference-conflicts-5",
        "title": "Wschodnia DR Konga · M23 i inne grupy zbrojne w prowincjach Kiwu.",
        "category": "Konflikty · referencyjne",
        "latitude": -1.5,
        "longitude": 28.8,
        "magnitude": 0
      },
      {
        "id": "reference-conflicts-6",
        "title": "Somalia · Rebelia Al-Szabab.",
        "category": "Konflikty · referencyjne",
        "latitude": 5,
        "longitude": 46,
        "magnitude": 0
      },
      {
        "id": "reference-conflicts-7",
        "title": "Jemen · Konflikt z Huti i ataki na Morzu Czerwonym.",
        "category": "Konflikty · referencyjne",
        "latitude": 15.5,
        "longitude": 44.5,
        "magnitude": 0
      },
      {
        "id": "reference-conflicts-8",
        "title": "Syria · Niestabilność po upadku Asada i przemoc na tle religijnym.",
        "category": "Konflikty · referencyjne",
        "latitude": 35,
        "longitude": 38.5,
        "magnitude": 0
      },
      {
        "id": "reference-conflicts-9",
        "title": "Haiti · Przemoc gangów i rozpad państwa.",
        "category": "Konflikty · referencyjne",
        "latitude": 18.6,
        "longitude": -72.3,
        "magnitude": 0
      },
      {
        "id": "reference-conflicts-10",
        "title": "Etiopia – Amhara · Rebelia Fano.",
        "category": "Konflikty · referencyjne",
        "latitude": 11.5,
        "longitude": 38,
        "magnitude": 0
      },
      {
        "id": "reference-conflicts-11",
        "title": "Północna Nigeria · Boko Haram, ISWAP i bandytyzm.",
        "category": "Konflikty · referencyjne",
        "latitude": 12,
        "longitude": 8,
        "magnitude": 0
      },
      {
        "id": "reference-conflicts-12",
        "title": "Sudan Południowy · Przemoc polityczna i etniczna.",
        "category": "Konflikty · referencyjne",
        "latitude": 10.5,
        "longitude": 30,
        "magnitude": 0
      },
      {
        "id": "reference-conflicts-13",
        "title": "Pogranicze Afganistanu i Pakistanu · Działania TTP i starcia graniczne.",
        "category": "Konflikty · referencyjne",
        "latitude": 34,
        "longitude": 70,
        "magnitude": 0
      },
      {
        "id": "reference-conflicts-14",
        "title": "Libia · Podzielony rząd i milicje.",
        "category": "Konflikty · referencyjne",
        "latitude": 33,
        "longitude": 13,
        "magnitude": 0
      },
      {
        "id": "reference-bases-0",
        "title": "Baza Ramstein (USA) · Dowództwo sił powietrznych USA w Europie.",
        "category": "Bazy · referencyjne",
        "latitude": 49.44,
        "longitude": 7.6,
        "magnitude": 0
      },
      {
        "id": "reference-bases-1",
        "title": "Baza Al Udeid (USA) · Wysunięte dowództwo CENTCOM, Katar.",
        "category": "Bazy · referencyjne",
        "latitude": 25.12,
        "longitude": 51.31,
        "magnitude": 0
      },
      {
        "id": "reference-bases-2",
        "title": "Yokosuka (US Navy) · Baza 7. Floty, Japonia.",
        "category": "Bazy · referencyjne",
        "latitude": 35.28,
        "longitude": 139.67,
        "magnitude": 0
      },
      {
        "id": "reference-bases-3",
        "title": "Baza Andersen (USA) · Guam, baza bombowców na Pacyfiku.",
        "category": "Bazy · referencyjne",
        "latitude": 13.58,
        "longitude": 144.93,
        "magnitude": 0
      },
      {
        "id": "reference-bases-4",
        "title": "Diego Garcia (USA/UK) · Baza na Oceanie Indyjskim.",
        "category": "Bazy · referencyjne",
        "latitude": -7.32,
        "longitude": 72.41,
        "magnitude": 0
      },
      {
        "id": "reference-bases-5",
        "title": "Incirlik (USA/Turcja) · Wykorzystywana przez USA i NATO, Turcja.",
        "category": "Bazy · referencyjne",
        "latitude": 36.9,
        "longitude": 30.8,
        "magnitude": 0
      },
      {
        "id": "reference-bases-6",
        "title": "Baza Rota (USA) · Niszczyciele US Navy, Hiszpania.",
        "category": "Bazy · referencyjne",
        "latitude": 36.94,
        "longitude": -6.35,
        "magnitude": 0
      },
      {
        "id": "reference-bases-7",
        "title": "Redzikowo (USA/NATO) · Tarcza antyrakietowa Aegis Ashore, Polska.",
        "category": "Bazy · referencyjne",
        "latitude": 54.47,
        "longitude": 17.03,
        "magnitude": 0
      },
      {
        "id": "reference-bases-8",
        "title": "Zatoka Suda (USA/NATO) · Kreta, Grecja.",
        "category": "Bazy · referencyjne",
        "latitude": 36.6,
        "longitude": 4.5,
        "magnitude": 0
      },
      {
        "id": "reference-bases-9",
        "title": "Camp Lemonnier (USA) · Dżibuti, Róg Afryki.",
        "category": "Bazy · referencyjne",
        "latitude": 11.55,
        "longitude": 43.15,
        "magnitude": 0
      },
      {
        "id": "reference-bases-10",
        "title": "Baza wsparcia ChALW w Dżibuti · Pierwsza zagraniczna baza Chin.",
        "category": "Bazy · referencyjne",
        "latitude": 11.59,
        "longitude": 43.14,
        "magnitude": 0
      },
      {
        "id": "reference-bases-11",
        "title": "Camp Humphreys (USA) · Dowództwo sił USA w Korei.",
        "category": "Bazy · referencyjne",
        "latitude": 35.14,
        "longitude": 126.8,
        "magnitude": 0
      },
      {
        "id": "reference-bases-12",
        "title": "Baza Kadena (USA) · Okinawa, Japonia.",
        "category": "Bazy · referencyjne",
        "latitude": 26.2,
        "longitude": 127.7,
        "magnitude": 0
      },
      {
        "id": "reference-bases-13",
        "title": "Robertson Barracks / Darwin · Rotacja marines USA, Australia.",
        "category": "Bazy · referencyjne",
        "latitude": -12,
        "longitude": 130.9,
        "magnitude": 0
      },
      {
        "id": "reference-bases-14",
        "title": "Akrotiri (Wielka Brytania) · Baza RAF, Cypr.",
        "category": "Bazy · referencyjne",
        "latitude": 34.9,
        "longitude": 33.6,
        "magnitude": 0
      },
      {
        "id": "reference-bases-15",
        "title": "Hmejmim (Rosja) · Rosyjska baza lotnicza, Syria.",
        "category": "Bazy · referencyjne",
        "latitude": 35.4,
        "longitude": 35.95,
        "magnitude": 0
      },
      {
        "id": "reference-bases-16",
        "title": "Sewastopol (Rosja) · Flota Czarnomorska.",
        "category": "Bazy · referencyjne",
        "latitude": 44.6,
        "longitude": 33.5,
        "magnitude": 0
      },
      {
        "id": "reference-bases-17",
        "title": "Siewieromorsk (Rosja) · Dowództwo Floty Północnej.",
        "category": "Bazy · referencyjne",
        "latitude": 69,
        "longitude": 33.1,
        "magnitude": 0
      },
      {
        "id": "reference-bases-18",
        "title": "Baza Yulin (Chiny) · Baza okrętów podwodnych, Hainan.",
        "category": "Bazy · referencyjne",
        "latitude": 18.2,
        "longitude": 109.5,
        "magnitude": 0
      },
      {
        "id": "reference-bases-19",
        "title": "Fiery Cross Reef (Chiny) · Sztuczna wyspa-baza, Spratly.",
        "category": "Bazy · referencyjne",
        "latitude": 9.9,
        "longitude": 114.3,
        "magnitude": 0
      },
      {
        "id": "reference-bases-20",
        "title": "Gibraltar (Wielka Brytania) · Obiekty marynarki i lotnictwa.",
        "category": "Bazy · referencyjne",
        "latitude": 36.15,
        "longitude": -5.35,
        "magnitude": 0
      },
      {
        "id": "reference-bases-21",
        "title": "Mount Pleasant (Wielka Brytania) · Wyspy Falklandzkie.",
        "category": "Bazy · referencyjne",
        "latitude": -51.82,
        "longitude": -58.45,
        "magnitude": 0
      },
      {
        "id": "reference-bases-22",
        "title": "Baza Pituffik (USA) · Grenlandia, wczesne ostrzeganie.",
        "category": "Bazy · referencyjne",
        "latitude": 76.53,
        "longitude": -68.7,
        "magnitude": 0
      },
      {
        "id": "reference-hotspots-0",
        "title": "Cieśnina Tajwańska · Aktywność armii ChRL wokół Tajwanu.",
        "category": "Punkty zapalne · referencyjne",
        "latitude": 24,
        "longitude": 121,
        "magnitude": 0
      },
      {
        "id": "reference-hotspots-1",
        "title": "Morze Południowochińskie · Spory terytorialne o Spratly i Paracele.",
        "category": "Punkty zapalne · referencyjne",
        "latitude": 12,
        "longitude": 114,
        "magnitude": 0
      },
      {
        "id": "reference-hotspots-2",
        "title": "Półwysep Koreański · Strefa zdemilitaryzowana i testy rakietowe Korei Północnej.",
        "category": "Punkty zapalne · referencyjne",
        "latitude": 38,
        "longitude": 127,
        "magnitude": 0
      },
      {
        "id": "reference-hotspots-3",
        "title": "Kaszmir · Linia kontroli między Indiami a Pakistanem.",
        "category": "Punkty zapalne · referencyjne",
        "latitude": 34,
        "longitude": 76,
        "magnitude": 0
      },
      {
        "id": "reference-hotspots-4",
        "title": "Kaliningrad / Przesmyk suwalski · Granica NATO–Rosja nad Bałtykiem.",
        "category": "Punkty zapalne · referencyjne",
        "latitude": 54.7,
        "longitude": 20.5,
        "magnitude": 0
      },
      {
        "id": "reference-hotspots-5",
        "title": "Zatoka Perska · Napięcia Iran–USA–państwa Zatoki.",
        "category": "Punkty zapalne · referencyjne",
        "latitude": 26.5,
        "longitude": 56.3,
        "magnitude": 0
      },
      {
        "id": "reference-hotspots-6",
        "title": "Granica Izrael–Liban · Front z Hezbollahem.",
        "category": "Punkty zapalne · referencyjne",
        "latitude": 33.5,
        "longitude": 35.5,
        "magnitude": 0
      },
      {
        "id": "reference-hotspots-7",
        "title": "Południowy Kaukaz · Napięcia Armenia–Azerbejdżan.",
        "category": "Punkty zapalne · referencyjne",
        "latitude": 40.2,
        "longitude": 45,
        "magnitude": 0
      },
      {
        "id": "reference-hotspots-8",
        "title": "Arktyka / Morze Barentsa · Militaryzacja Dalekiej Północy.",
        "category": "Punkty zapalne · referencyjne",
        "latitude": 70,
        "longitude": 30,
        "magnitude": 0
      },
      {
        "id": "reference-hotspots-9",
        "title": "Himalaje · Napięcia graniczne Indie–Chiny.",
        "category": "Punkty zapalne · referencyjne",
        "latitude": 27,
        "longitude": 88.5,
        "magnitude": 0
      },
      {
        "id": "reference-hotspots-10",
        "title": "Wenezuela–Gujana / Karaiby · Spór terytorialny i obecność marynarki USA.",
        "category": "Punkty zapalne · referencyjne",
        "latitude": -0.3,
        "longitude": 21,
        "magnitude": 0
      },
      {
        "id": "reference-nuclear-0",
        "title": "Elektrownia jądrowa Zaporoże · Największa elektrownia jądrowa w Europie, pod okupacją.",
        "category": "Obiekty jądrowe · referencyjne",
        "latitude": 47.51,
        "longitude": 34.59,
        "magnitude": 0
      },
      {
        "id": "reference-nuclear-1",
        "title": "Czarnobyl · Strefa wykluczenia i sarkofag.",
        "category": "Obiekty jądrowe · referencyjne",
        "latitude": 51.39,
        "longitude": 30.1,
        "magnitude": 0
      },
      {
        "id": "reference-nuclear-2",
        "title": "Elektrownia jądrowa Kursk · Rosja, blisko granicy z Ukrainą.",
        "category": "Obiekty jądrowe · referencyjne",
        "latitude": 51.68,
        "longitude": 35.6,
        "magnitude": 0
      },
      {
        "id": "reference-nuclear-3",
        "title": "Fukushima Daiichi · Likwidacja po awarii w 2011 r.",
        "category": "Obiekty jądrowe · referencyjne",
        "latitude": 37.42,
        "longitude": 141.03,
        "magnitude": 0
      },
      {
        "id": "reference-nuclear-4",
        "title": "Natanz · Irański ośrodek wzbogacania uranu.",
        "category": "Obiekty jądrowe · referencyjne",
        "latitude": 33.72,
        "longitude": 51.73,
        "magnitude": 0
      },
      {
        "id": "reference-nuclear-5",
        "title": "Fordo · Podziemna instalacja wzbogacania w Iranie.",
        "category": "Obiekty jądrowe · referencyjne",
        "latitude": 34.88,
        "longitude": 50.99,
        "magnitude": 0
      },
      {
        "id": "reference-nuclear-6",
        "title": "Elektrownia jądrowa Buszehr · Irański reaktor energetyczny.",
        "category": "Obiekty jądrowe · referencyjne",
        "latitude": 28.83,
        "longitude": 50.89,
        "magnitude": 0
      },
      {
        "id": "reference-nuclear-7",
        "title": "Dimona · Izraelskie centrum badań jądrowych.",
        "category": "Obiekty jądrowe · referencyjne",
        "latitude": 31,
        "longitude": 35.14,
        "magnitude": 0
      },
      {
        "id": "reference-nuclear-8",
        "title": "Jongbjon · Północnokoreański kompleks jądrowy.",
        "category": "Obiekty jądrowe · referencyjne",
        "latitude": 39.8,
        "longitude": 125.75,
        "magnitude": 0
      },
      {
        "id": "reference-nuclear-9",
        "title": "Punggye-ri · Północnokoreańskie poligon jądrowy.",
        "category": "Obiekty jądrowe · referencyjne",
        "latitude": 41.28,
        "longitude": 129.08,
        "magnitude": 0
      },
      {
        "id": "reference-nuclear-10",
        "title": "Semipałatyńsk · Dawny sowiecki poligon jądrowy.",
        "category": "Obiekty jądrowe · referencyjne",
        "latitude": 49.95,
        "longitude": 78.43,
        "magnitude": 0
      },
      {
        "id": "reference-nuclear-11",
        "title": "Nowa Ziemia · Rosyjski poligon jądrowy.",
        "category": "Obiekty jądrowe · referencyjne",
        "latitude": 75,
        "longitude": 56,
        "magnitude": 0
      },
      {
        "id": "reference-nuclear-12",
        "title": "Elektrownia jądrowa Akkuyu · Turcja, w budowie.",
        "category": "Obiekty jądrowe · referencyjne",
        "latitude": 39.23,
        "longitude": 42,
        "magnitude": 0
      },
      {
        "id": "reference-nuclear-13",
        "title": "Elektrownia jądrowa Barakah · ZEA, pierwsza elektrownia jądrowa w świecie arabskim.",
        "category": "Obiekty jądrowe · referencyjne",
        "latitude": 23.96,
        "longitude": 52.26,
        "magnitude": 0
      },
      {
        "id": "reference-nuclear-14",
        "title": "Elektrownia jądrowa Kudankulam · Indie, reaktory rosyjskiej konstrukcji.",
        "category": "Obiekty jądrowe · referencyjne",
        "latitude": 8.17,
        "longitude": 77.71,
        "magnitude": 0
      },
      {
        "id": "reference-nuclear-15",
        "title": "Hinkley Point · Wielka Brytania, nowe bloki w budowie.",
        "category": "Obiekty jądrowe · referencyjne",
        "latitude": 51.21,
        "longitude": -3.13,
        "magnitude": 0
      },
      {
        "id": "reference-nuclear-16",
        "title": "Flamanville · Francja, reaktor EPR.",
        "category": "Obiekty jądrowe · referencyjne",
        "latitude": 49.53,
        "longitude": -1.88,
        "magnitude": 0
      },
      {
        "id": "reference-nuclear-17",
        "title": "Chalk River · Kanadyjskie laboratoria jądrowe.",
        "category": "Obiekty jądrowe · referencyjne",
        "latitude": 45.3,
        "longitude": -75,
        "magnitude": 0
      },
      {
        "id": "reference-nuclear-18",
        "title": "Los Alamos · Amerykańskie laboratorium broni jądrowej.",
        "category": "Obiekty jądrowe · referencyjne",
        "latitude": 35.87,
        "longitude": -106.3,
        "magnitude": 0
      },
      {
        "id": "reference-nuclear-19",
        "title": "Kahuta · Pakistański ośrodek wzbogacania uranu.",
        "category": "Obiekty jądrowe · referencyjne",
        "latitude": 34,
        "longitude": 72.9,
        "magnitude": 0
      },
      {
        "id": "reference-nuclear-20",
        "title": "Sellafield · Zakład przerobu paliwa w Wielkiej Brytanii.",
        "category": "Obiekty jądrowe · referencyjne",
        "latitude": 54.05,
        "longitude": -3.5,
        "magnitude": 0
      },
      {
        "id": "reference-sanctions-0",
        "title": "Rosja · Szerokie sankcje USA, UE i Wielkiej Brytanii.",
        "category": "Sankcje · referencyjne",
        "latitude": 61.5,
        "longitude": 99,
        "magnitude": 0
      },
      {
        "id": "reference-sanctions-1",
        "title": "Iran · Sankcje USA, UE i ONZ.",
        "category": "Sankcje · referencyjne",
        "latitude": 32.4,
        "longitude": 53.7,
        "magnitude": 0
      },
      {
        "id": "reference-sanctions-2",
        "title": "Korea Północna · Sankcje Rady Bezpieczeństwa ONZ.",
        "category": "Sankcje · referencyjne",
        "latitude": 40.3,
        "longitude": 127.5,
        "magnitude": 0
      },
      {
        "id": "reference-sanctions-3",
        "title": "Syria · Sankcje, częściowo znoszone.",
        "category": "Sankcje · referencyjne",
        "latitude": 35,
        "longitude": 38,
        "magnitude": 0
      },
      {
        "id": "reference-sanctions-4",
        "title": "Kuba · Embargo USA.",
        "category": "Sankcje · referencyjne",
        "latitude": 21.5,
        "longitude": -79,
        "magnitude": 0
      },
      {
        "id": "reference-sanctions-5",
        "title": "Wenezuela · Sankcje USA na ropę i urzędników.",
        "category": "Sankcje · referencyjne",
        "latitude": 7,
        "longitude": -66,
        "magnitude": 0
      },
      {
        "id": "reference-sanctions-6",
        "title": "Białoruś · Sankcje UE i USA.",
        "category": "Sankcje · referencyjne",
        "latitude": 53.7,
        "longitude": 27.9,
        "magnitude": 0
      },
      {
        "id": "reference-sanctions-7",
        "title": "Mjanma · Sankcje celowane wobec junty.",
        "category": "Sankcje · referencyjne",
        "latitude": 19.8,
        "longitude": 96,
        "magnitude": 0
      },
      {
        "id": "reference-sanctions-8",
        "title": "Afganistan · Sankcje wobec talibów.",
        "category": "Sankcje · referencyjne",
        "latitude": 33.9,
        "longitude": 66,
        "magnitude": 0
      },
      {
        "id": "reference-economic-0",
        "title": "NYSE / Fed w Nowym Jorku · Największa giełda świata i Fed NY.",
        "category": "Gospodarka · referencyjne",
        "latitude": 40.71,
        "longitude": -74.01,
        "magnitude": 0
      },
      {
        "id": "reference-economic-1",
        "title": "Rezerwa Federalna (Waszyngton) · Zarząd amerykańskiego banku centralnego.",
        "category": "Gospodarka · referencyjne",
        "latitude": 38.89,
        "longitude": -77.04,
        "magnitude": 0
      },
      {
        "id": "reference-economic-2",
        "title": "EBC / Deutsche Börse · Frankfurt.",
        "category": "Gospodarka · referencyjne",
        "latitude": 50.11,
        "longitude": 8.68,
        "magnitude": 0
      },
      {
        "id": "reference-economic-3",
        "title": "Bank Anglii / LSE · Londyn.",
        "category": "Gospodarka · referencyjne",
        "latitude": 51.51,
        "longitude": -0.09,
        "magnitude": 0
      },
      {
        "id": "reference-economic-4",
        "title": "Bank Japonii / TSE · Tokio.",
        "category": "Gospodarka · referencyjne",
        "latitude": 35.68,
        "longitude": 139.77,
        "magnitude": 0
      },
      {
        "id": "reference-economic-5",
        "title": "PBoC (Pekin) · Chiński bank centralny.",
        "category": "Gospodarka · referencyjne",
        "latitude": 39.91,
        "longitude": 116.4,
        "magnitude": 0
      },
      {
        "id": "reference-economic-6",
        "title": "Giełda w Szanghaju · Główna giełda Chin.",
        "category": "Gospodarka · referencyjne",
        "latitude": 31.23,
        "longitude": 121.47,
        "magnitude": 0
      },
      {
        "id": "reference-economic-7",
        "title": "Giełda w Hongkongu · HKEX.",
        "category": "Gospodarka · referencyjne",
        "latitude": 22.28,
        "longitude": 114.16,
        "magnitude": 0
      },
      {
        "id": "reference-economic-8",
        "title": "RBI / BSE Bombaj · Indie.",
        "category": "Gospodarka · referencyjne",
        "latitude": 19.07,
        "longitude": 72.87,
        "magnitude": 0
      },
      {
        "id": "reference-economic-9",
        "title": "Szwajcarski Bank Narodowy · Zurych.",
        "category": "Gospodarka · referencyjne",
        "latitude": 47.37,
        "longitude": 8.54,
        "magnitude": 0
      },
      {
        "id": "reference-economic-10",
        "title": "NBP / GPW Warszawa · Polska.",
        "category": "Gospodarka · referencyjne",
        "latitude": 52.23,
        "longitude": 21.01,
        "magnitude": 0
      },
      {
        "id": "reference-economic-11",
        "title": "Tadawul / Rijad · Saudyjska giełda i polityka naftowa.",
        "category": "Gospodarka · referencyjne",
        "latitude": 24.71,
        "longitude": 46.68,
        "magnitude": 0
      },
      {
        "id": "reference-economic-12",
        "title": "B3 São Paulo · Brazylia.",
        "category": "Gospodarka · referencyjne",
        "latitude": -23.55,
        "longitude": -46.63,
        "magnitude": 0
      },
      {
        "id": "reference-economic-13",
        "title": "CME Group Chicago · Centrum kontraktów terminowych.",
        "category": "Gospodarka · referencyjne",
        "latitude": 41.88,
        "longitude": -87.63,
        "magnitude": 0
      },
      {
        "id": "reference-economic-14",
        "title": "MAS / SGX Singapur · Singapur.",
        "category": "Gospodarka · referencyjne",
        "latitude": 1.28,
        "longitude": 103.85,
        "magnitude": 0
      },
      {
        "id": "reference-economic-15",
        "title": "Euronext Paryż · Paryż.",
        "category": "Gospodarka · referencyjne",
        "latitude": 48.86,
        "longitude": 2.34,
        "magnitude": 0
      },
      {
        "id": "reference-waterways-0",
        "title": "Cieśnina Ormuz · Około jednej piątej światowego handlu ropą.",
        "category": "Cieśniny · referencyjne",
        "latitude": 26.6,
        "longitude": 56.4,
        "magnitude": 0
      },
      {
        "id": "reference-waterways-1",
        "title": "Cieśnina Malakka · Główny szlak żeglugowy Azja–Europa.",
        "category": "Cieśniny · referencyjne",
        "latitude": 2.5,
        "longitude": 101.5,
        "magnitude": 0
      },
      {
        "id": "reference-waterways-2",
        "title": "Kanał Sueski · Łączy Morze Śródziemne z Morzem Czerwonym.",
        "category": "Cieśniny · referencyjne",
        "latitude": 30.5,
        "longitude": 32.35,
        "magnitude": 0
      },
      {
        "id": "reference-waterways-3",
        "title": "Bab al-Mandab · Brama Morza Czerwonego, ataki Huti.",
        "category": "Cieśniny · referencyjne",
        "latitude": 12.6,
        "longitude": 43.3,
        "magnitude": 0
      },
      {
        "id": "reference-waterways-4",
        "title": "Bosfor · Dostęp do Morza Czarnego.",
        "category": "Cieśniny · referencyjne",
        "latitude": 41.1,
        "longitude": 29.05,
        "magnitude": 0
      },
      {
        "id": "reference-waterways-5",
        "title": "Kanał Panamski · Połączenie Atlantyku z Pacyfikiem.",
        "category": "Cieśniny · referencyjne",
        "latitude": 9.1,
        "longitude": -79.7,
        "magnitude": 0
      },
      {
        "id": "reference-waterways-6",
        "title": "Cieśnina Gibraltarska · Brama Morza Śródziemnego i Atlantyku.",
        "category": "Cieśniny · referencyjne",
        "latitude": 35.95,
        "longitude": -5.6,
        "magnitude": 0
      },
      {
        "id": "reference-waterways-7",
        "title": "Cieśniny duńskie · Dostęp do Morza Bałtyckiego.",
        "category": "Cieśniny · referencyjne",
        "latitude": 55.7,
        "longitude": 12.7,
        "magnitude": 0
      },
      {
        "id": "reference-waterways-8",
        "title": "Cieśnina Tajwańska · Kluczowy szlak dla półprzewodników i kontenerów.",
        "category": "Cieśniny · referencyjne",
        "latitude": 24.5,
        "longitude": 119.5,
        "magnitude": 0
      },
      {
        "id": "reference-waterways-9",
        "title": "Przylądek Dobrej Nadziei · Alternatywa dla Kanału Sueskiego.",
        "category": "Cieśniny · referencyjne",
        "latitude": -34.4,
        "longitude": 18.5,
        "magnitude": 0
      },
      {
        "id": "reference-waterways-10",
        "title": "Cieśnina Lombok · Głębokowodna alternatywa dla Malakki.",
        "category": "Cieśniny · referencyjne",
        "latitude": -8.75,
        "longitude": 115.7,
        "magnitude": 0
      },
      {
        "id": "reference-waterways-11",
        "title": "Cieśnina Singapurska · Najruchliwszy port bunkrowania.",
        "category": "Cieśniny · referencyjne",
        "latitude": 1.2,
        "longitude": 104,
        "magnitude": 0
      }
    ]
    """##
  static var items: [MapItem] {
    (try? JSONDecoder().decode([MapItem].self, from: Data(json.utf8))) ?? []
  }
}
