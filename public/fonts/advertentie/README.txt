Lettertypes voor de beelden van "Advertentie op maat" en de logo maker
(lib/advertentie/beeld.ts).

De site zelf gebruikt de woff2-bestanden een map hoger. De beelden worden op de
server gemaakt met next/og (satori), en die leest geen woff2. Daarom staan dezelfde
families van de huisstijl hier als TTF, met vaste gewichten. Ze worden alleen door
de server gelezen (fs), niet door een pagina geladen.

Ongewijzigde bestanden uit de officiele repo's van de makers, opgehaald op
19 november 2026:

- BricolageGrotesque96pt-Bold.ttf, BricolageGrotesque96pt-ExtraBold.ttf
  Bricolage Grotesque, github.com/ateliertriay/bricolage (fonts/ttf),
  commit 84745e5b96261ae5f8c6c856e262fe78d1d6efdd
  Copyright 2022 The Bricolage Grotesque Project Authors
- InstrumentSans-Regular.ttf, InstrumentSans-SemiBold.ttf
  Instrument Sans, github.com/Instrument/instrument-sans (fonts/ttf),
  commit 7fa22308a3d0c94ee2b3cd537a1196b65db34a3e
  Copyright 2022 The Instrument Sans Project Authors
- InstrumentSerif-Regular.ttf, InstrumentSerif-Italic.ttf
  Instrument Serif, github.com/Instrument/instrument-serif (fonts/ttf),
  commit 65c0ef225f386a3c7e87570a4aa9cc0262c2fd81
  Copyright 2022 The Instrument Serif Project Authors

- Anton-Regular.ttf (alleen de logo maker, sfeer "stoer"; geen deel van de huisstijl)
  Anton, github.com/google/fonts (ofl/anton),
  commit e0a8124cf36bb7c32ca68e5d46d6acdbc3df866a
  Copyright 2020 The Anton Project Authors (github.com/googlefonts/AntonFont)

- Kanit-BlackItalic.ttf (zware schuine letter voor streetwear, sport en de poster-advertentie)
  Kanit, github.com/google/fonts (ofl/kanit),
  commit 674cdcf5e290b4d29f7b017ad1643e536d1bc372
  Copyright 2020 The Kanit Project Authors (github.com/cadsondemak/kanit)
- RussoOne-Regular.ttf (brede letter voor de sfeer techno)
  Russo One, github.com/google/fonts (ofl/russoone),
  commit 8ccda7bf739842777d42661d1b384b926194e24b
  Copyright (c) 2011-2012, Jovanny Lemonad (jovanny.ru), with Reserved Font Name "Russo"
- PirataOne-Regular.ttf (gotische letter voor de sfeer gothic)
  Pirata One, github.com/google/fonts (ofl/pirataone),
  commit 90abd17b4f97671435798b6147b698aa9087612f
  Copyright (c) 2012, Rodrigo Fuenzalida, Nicolas Massi, with Reserved Font Name "Pirata"
- Marcellus-Regular.ttf (fijne schreefletter voor de sfeer luxe en de wijd gespatieerde regels)
  Marcellus, github.com/google/fonts (ofl/marcellus),
  commit 90abd17b4f97671435798b6147b698aa9087612f
  Copyright (c) 2012, Brian J. Bonislawsky DBA Astigmatic (AOETI), with Reserved Font Names "Marcellus"

De laatste vier zijn sierletters met een kleinere tekenset. Mist er een teken (een
zeldzaam accent), dan tekent de server dat ene teken met een van de eerste zeven
letters; er wordt nooit een lettertype van buiten opgehaald.

Alle elf staan onder de SIL Open Font License, versie 1.1. De volledige tekst
staat in OFL.txt in deze map (de tekst is voor alle elf gelijk, op de regel met
het auteursrecht na; die staat hierboven per lettertype).
