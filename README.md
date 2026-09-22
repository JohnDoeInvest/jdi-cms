# Smartare Mat — webbplats & CMS

Publik webbplats och redaktörsverktyg för Smartare Mat i Sverige AB (publ),
byggt enligt `assets/site-structure.md` (5 flöden, 35 frames).

**Stack:** Node.js med Express, direkt mot nätet — ingen nginx framför.
Tre npm-paket: `express`, `compression` (gzip och brotli) och `sharp`
(bilder). Databasen är Nodes inbyggda `node:sqlite`. `./start.sh` installerar
paketen själv första gången, exakt enligt `package-lock.json`.

---

## Kom igång

```bash
./start.sh
```

Startar servern på `:8080` och skapar databasen med grundstrukturen första
gången. Avsluta med `Ctrl+C`, eller med `./stop.sh`.

| Adress | Vad |
|---|---|
| <http://localhost:8080> | Publik webbplats |
| <http://localhost:8080/cms> | CMS |
| <http://localhost:8080/cms/login> | Inloggning (engångskod) |

`npm start` gör samma sak när paketen väl är installerade (`npm ci`).

### Krav

- **Node 22.5+** (`node:sqlite` är inbyggt därifrån). Testat på Node 26.
- **Inga bildverktyg.** `sharp` har med sig libvips i `node_modules`, både
  för macOS och Linux. Kan den inte laddas lagras uppladdningar precis som de
  kommer in, och mediabiblioteket säger till.

---

## Inloggning

Engångskodsinloggning gäller som standard: e-post **eller** mobilnummer →
sexsiffrig kod, giltig i 10 minuter, max 5 försök, och en ny kod kan begäras
en gång i minuten per adress.

**Utan Brevo-nyckel fungerar flödet ändå.** Brevet skrivs till `data/outbox/`
och koden visas i verifieringsrutan — men bara för ett anrop från samma
maskin. Annars vore den en genväg förbi hela inloggningen: skriv en admins
adress, läs koden, kliv in.

Under uppbyggnad kan inloggningen stängas av helt:

```bash
AUTH_DISABLED=1 ./start.sh
```

Då öppnas CMS:et direkt som `DEV_USER` (admin), och en gul markering
*Inloggning av* visas i topplisten så att läget aldrig är otydligt. Det gäller
**bara anrop från samma maskin** — servern lyssnar på alla gränssnitt, så
utan den spärren vore en laptop på ett delat nätverk ett öppet CMS. Övriga får
inloggningsrutan som vanligt, vilka headers de än skickar.

Nummer utan landskod tolkas som svenska: `070-123 45 67` blir `+46701234567`.

### Brevo

När API-nyckeln finns:

```bash
BREVO_API_KEY=xkeysib-... ./start.sh
```

Då går engångskoder och kontaktformulär via Brevos transaktionella API.
Utan nyckel hamnar varje meddelande i `data/outbox/` i stället. Inget i koden
behöver ändras — se `src/lib/mail.js`.

### Miljövariabler

| Variabel | Standard | Betydelse |
|---|---|---|
| `AUTH_DISABLED` | `0` | `1` öppnar CMS:et utan inloggning, endast från samma maskin |
| `DEV_USER` | `macsmoser@gmail.com` | Kontot som CMS:et öppnas som när `AUTH_DISABLED=1` |
| `BREVO_API_KEY` | *(tom)* | Skarp e-post och SMS |
| `MAIL_FROM` | `noreply@smartaremat.se` | Avsändare |
| `CONTACT_TO` | `info@smartaremat.se` | Mottagare för kontaktformuläret |
| `PORT` | `8080` | Serverns port |
| `HOST` | `0.0.0.0` | Gränssnittet den lyssnar på; `127.0.0.1` håller den lokal |
| `TRUST_PROXY` | *(av)* | Proxy framför som får tala om besökarens adress och protokoll: `loopback` för en på samma maskin, annars dess adress |
| `SITE_URL` | `http://localhost:<PORT>` | Startvärde för sidans adress; ändras sedan under Settings |
| `LOG_REQUESTS` | `0` | `1` loggar varje request |
| `WEBP_QUALITY` | `65` | Kvalitet för foton, 0–100 |
| `WEBP_METHOD` | `6` | libwebps sökdjup, 0–6 (6 = minst filer, långsammast) |
| `WEBP_SHARP_YUV` | `1` | `0` stänger av sharp_yuv |
| `FALLBACK_WIDTH` | `800` | Reservbildens bredd i pixlar |
| `FALLBACK_QUALITY` | `50` | Reservbildens JPG-kvalitet, 0–100 |

---

## Igång efter omstart

`scripts/autostart.sh` lägger upp en launchd-agent som håller servern igång,
så att den startar av sig själv och startar om om den kraschar.

```
./scripts/autostart.sh install     lägg upp agenten och starta nu
./scripts/autostart.sh status      vad som är laddat och lyssnar
./scripts/autostart.sh restart     starta om
./scripts/autostart.sh uninstall   stoppa och ta bort agenten
```

Agenten ligger i `~/Library/LaunchAgents` och körs som den inloggade
användaren — inget root krävs. **Den startar vid inloggning, inte vid boot.**
Står maskinen kvar på inloggningsskärmen efter en omstart körs alltså
ingenting. Behövs det verkligen vid boot är en LaunchDaemon i
`/Library/LaunchDaemons` vägen, men den kräver `sudo` och kör som `root`.

**PATH** är lätt att gå på: launchd ger en agent bara
`/usr/bin:/bin:/usr/sbin:/sbin`, och Homebrew ligger inte där.
Installationsskriptet skriver in katalogen där `node` faktiskt ligger.

`./start.sh` och `./stop.sh` fungerar fortfarande, och båda säger till om
agenten är laddad — annars ser det ut som att `stop.sh` inte gjorde något,
när det i själva verket är launchd som startar om inom tio sekunder.

Loggarna hamnar i `data/logs/`.

**Observera:** `AUTH_DISABLED=1` öppnar CMS:et utan inloggning bara för
anrop från maskinen själv. Kollegor som når den på port 8080 över
kontorsnätet får inloggningsrutan.

---

## CMS:et som egen produkt

Redigeraren delar ingenting med webbplatsen den redigerar. Två uppsättningar
tokens, med olika namn så de aldrig kan krocka:

| Fil | Vad den styr | Prefix |
|---|---|---|
| `www/assets/tokens.css` | Webbplatsens varumärke — färger, typskala, mått | `--brand-*`, `--ink`, `--s-*` … |
| `www/assets/cms-tokens.css` | Redigerarens gränssnitt | `--ui-*` |

Båda laddas i redigeraren, men av olika skäl: ytan renderar riktigt innehåll
genom `tokens.css` + `blocks.css` och måste därför se ut exakt som webbplatsen,
medan allt runt omkring ritas av `cms-tokens.css` + `cms.css`. Inloggningssidan
laddar bara CMS-filerna — den har ingen yta.

Det betyder att smartaremat.se och macsmoser.com kan ha helt olika utseenden
utan att en enda pixel i redigeraren flyttar sig. Ändra vad som helst i
`tokens.css`; CMS:et märker det inte.

**CMS-paletten är neutral.** Gråskala utan värme, inget varumärke. En blå
(`#3ba1f8`) markerar tillstånd — fokus, markering, det som är under pekaren —
och aldrig en handling. Knappar är svarta med vit text, eller vita med svart
ram och svart text; farliga knappar är röda. En blå kant betyder alltså alltid
"det här arbetar du med", aldrig "tryck här".

Lägger man till en CMS-regel: använd `--ui-*`. Om en token saknas, lägg den i
`cms-tokens.css` — hämta den aldrig från `tokens.css`.

---

## Innehållsmodellen

Tre nivåer:

**Objekt** är minsta byggstenen — rubrik, text, bild, knapp, länk, citat,
avdelare, mellanrum, två- och trekolumn, formulär och artikelflöde. Varje
objekt bär sitt innehåll plus marginal och utfyllnad per sida.

**Slices** är namngivna uppsättningar objekt som återanvänds. De byggs direkt
på en sida: sätt ihop ett block som du vill ha det och tryck på spara-knappen i
blockets verktygsrad. Slicen dyker upp under **Saved** och kan dras in på
vilken sida som helst. Sparar du om ett block som redan kommer från en slice
får du välja mellan att uppdatera den eller skapa en ny.

**Sidor** består av slices och/eller lösa objekt.

### Vad som sparas

Sidans innehåll ligger som JSON i `pages.content` och är rent semantiskt data —
ingen CSS, inga klassnamn, inga layoutfragment:

```json
{
  "type": "object",
  "id": "44a10288e5c6",
  "object": {
    "id": "44a10288e5c6",
    "kind": "button",
    "props": { "label": "Läs mer", "href": "/kunskap", "variant": "accent", "align": "center" },
    "style": { "margin": {}, "padding": {} }
  }
}
```

`kind` säger vad objektet är, `props` bär innehållet och de val användaren
gjort. `variant` och `align` är avsikter ("accent", "centrerat"), inte
utseende — hur det ser ut bestäms av `www/assets/blocks.css`, och byter du
formspråk följer allt innehåll med utan att röras.

`style` är den enda presentationsbiten, och den är strukturerad som tal
(`{"margin":{"top":24}}`), inte som CSS-strängar. Textobjekt sparar sanerad
semantisk HTML — `p`, `strong`, `em`, `ul`, `a` och rubriker, inget annat;
allt utanför vitlistan i `src/lib/html.js` faller bort vid inläsning.

Gamla objekttyper (`header`, `subheader`, `body`, `list`) uppgraderas
automatiskt vid inläsning, så sparat innehåll överlever modelländringar.

### Formulär

Ett formulär är en behållare med fältobjekt: textfält, e-post, meddelande,
lista och kryssruta. Mottagare, ämnesrad, knapptext och bekräftelsemeddelande
sätts i egenskapspanelen. Skickas formuläret läses definitionen från sidans
eget innehåll — fältlista, obligatoriska fält och mottagare kommer alltså från
databasen, aldrig från det webbläsaren postar. Ett färdigt formulär sparas som
en slice och återanvänds som vilket block som helst.

**Slice-biblioteket börjar tomt.** Inga slices seedas — de som fanns var
startinnehåll skrivet mot den gamla modellen, och två av dem ("Two columns",
"Three columns") existerade bara för att kolumner var objekt då. Biblioteket
fylls i stället på med slices sparade från riktiga sidor.

Menyer har utkast och publicerat läge var för sig. Ändringar sparas automatiskt
men syns inte på webbplatsen förrän **Publish** trycks.

### Inställningar

**Settings** i CMS:et samlar allt som skiljer en installation från en annan:
sidnamn, adress, språk, logotyper (mörk och ljus bakgrund plus favicon),
standardmottagare för formulär, sidfotens kontaktblock och sociala länkar.
Logotyperna laddas upp via mediabiblioteket som vilken annan fil som helst.

Ingenting i koden är hårdkodat till smartaremat.se — byt värdena i Settings så
följer webbplatsen med. Det som ligger kvar i miljövariabler är sådant som bär
hemligheter eller styr hur servern startar, och det visas skrivskyddat i
panelen till höger.

### Slice → objekt → innehåll

Hela hierarkin är tre nivåer, inte fler:

- **En sida är en stapel av slices.** Ingenting annat ligger direkt på sidan.
- **En slice äger layouten**: antal kolumner (1–4), fördelning, mellanrum och
  bredd. Den är motsvarigheten till Brevos *section*.
- **Objekt är innehållet** i en kolumn och lägger aldrig ut något själva.

Därför finns inget kolumnobjekt längre. Släpper man ett objekt på en tom sida
får det en egen slice — det finns ingen annanstans för det att bo. Bara en
slice kan sparas till biblioteket, och det som sparas är hela slicen: dess
layout lika mycket som dess innehåll.

**Slice-egenskaper** (panelen till höger): Columns (1–4), Split, Gap between
columns, Width. **Kolumnegenskaper** (välj en kolumn på ytan när slicen har
fler än en): Content alignment, Vertical placement, Padding.

Bredden är en andel av innehållskolumnen — Full, Three quarters, Half,
Reading measure — så "halva sidan" kräver varken pixlar eller en tanke på
mobilen: allt går till full bredd under 760px, och alla kolumner staplas.

Att minska antalet kolumner flyttar innehållet från de kolumner som försvinner
till den sista som blir kvar. Ett felklick ska aldrig kosta någon sitt arbete.

### Tabell

Tabelldata är inte layout: kolumner i en slice staplas på mobilen, medan en
tabells celler bara betyder något tillsammans. Därför är tabellen ett eget
objekt som behåller sin form och scrollar i sidled i stället för att staplas.

Egenskaper: **Rows** och **Columns** (siffror, 3×3 från början, max 20×8), **First
row is a header**, **Borders** (All, Rows only, Columns only, None) och **Cell
padding**. Nya rader läggs till underst, nya kolumner längst till höger.

**En cell innehåller objekt**, precis som en kolumn gör: text, bild, knapp —
det mesta. Undantagen är en tabell (att nästla ett rutnät i ett annat är hur ett
layoutverktyg blir ett kalkylark) och formulärfält, som hör till ett formulär.
En tom cell säger "Drop or type"; klickar man börjar ett textblock.

Ram och cellpadding sätts på hela tabellen: **Borders** (All, Rows only, Columns
only, None), **Style** (Solid, Dashed, Dotted), **Thickness** och **Border
colour**. Samma stilar finns på avdelarobjektet. Inget sätts per cell — det
vore att lägga en stilmall i innehållet.

Minskar man antalet rader eller kolumner ligger innehållet kvar så länge man är
kvar i redigeraren: skriver man 3 när man menade 7 kommer cellerna tillbaka.
Vid publicering sparas exakt `rows × cols` celler, så sidan aldrig bär med sig
data som ingen kan se.

### Layout: storlek och kolumnbredd

Bilder har **Display size** (Small 180px, Medium 320px, Large 520px, Full) och
kolumnblock har **Split** (två kolumner: lika, 67/33, 33/67, 75/25, 25/75; tre
kolumner: lika, bredare vänster/mitten/höger). Båda ligger i panelen till höger
under Properties.

Det som sparas är avsikten, aldrig måttet: `size: "medium"`, inte
`max-width: 320px`. Vad varje namn mäter bestäms i `www/assets/blocks.css`, så
en omdesign ändrar en fil i stället för allt innehåll. En bild blir aldrig
bredare än sin kolumn, och alla kolumnblock staplas till en kolumn under 760px
oavsett split.

Nya värden läggs till på tre ställen: listan i `src/lib/objects.js`
(`IMAGE_SIZES` / `COLUMN_RATIOS`), en klass i `blocks.css`, och alternativet i
`www/assets/cms-editor.js`. Lägg också till propen i `VISUAL_PROPS` där, annars
sparas den men redigeringsytan ritar inte om — och då slutar den visa samma sak
som webbplatsen.

### Bilder och WebP

Alla uppladdade raster­bilder konverteras till **WebP** i flera bredder redan
vid uppladdningen, och webbplatsen levererar dem med `srcset`, så varje besökare
hämtar bara de pixlar som behövs. En bild på 1080 px blir typiskt 400 w, 800 w
och 1080 w — en telefon laddar ~14 kB där originalet var 450 kB.

| Filtyp | Vad som händer |
|---|---|
| JPEG | Lossy WebP, kvalitet 65, metod 6, sharp_yuv |
| PNG, foto | Samma som JPEG |
| PNG, platt grafik | Near-lossless, så hårda kanter och text förblir skarpa |
| GIF, animerad | En animerad WebP i originalstorlek |
| WebP, AVIF | Levereras som de laddades upp, med en reservbild bredvid |
| SVG, video, PDF | Rörs inte alls |

Platt grafik känns igen på att den ligger under en byte per pixel — sådant
komprimerar PNG bra på egen hand, och det är just där lossy WebP ringar runt
kanter och text.

**En reservbild per bild.** Bredvid WebP-filerna görs en enda liten JPG —
800 px bred och hårt komprimerad (kvalitet 50, typiskt 25 kB) — för de få
som inte kan visa WebP: äldre iPads, Safari före macOS Big Sur, och
länkförhandsvisningar i chattappar och sociala medier. Sidorna ritar
`<picture>` med WebP-filerna som `<source>` och JPG:en som `<img>`, så en
modern webbläsare hämtar aldrig JPG:en. `og:image` och en uppladdad favicon
pekar direkt på reservbilden. En bild med genomskinlighet får en PNG i
stället, annars skulle en logotyp hamna på en vit ruta.

**Originalet sparas alltid** bredvid WebP-filerna. Därför går det att ändra
kvalitet eller lägga till bredder efteråt utan att ladda upp något igen:

```
node scripts/image-backfill.mjs              # konvertera det som saknas, lägg till saknade reservbilder
node scripts/image-backfill.mjs --dry-run    # visa bara vad som skulle hända
node scripts/image-backfill.mjs --all        # koda om allt, t.ex. efter kvalitetsbyte
node scripts/image-backfill.mjs --fallbacks  # gör om bara reservbilderna
```

Raden `filename` i `media` pekar på den största WebP-filen, `source_filename` på
originalet, `variants` på hela listan som JSON och `fallback_filename` på
reservbilden. Bild-id:t ändras aldrig, så sidor, artiklar och inställningar
följer med av sig själva.

Två detaljer som är lätta att missa och som hanteras:

- **EXIF-rotation.** Bär en JPEG en rotation vänds pixlarna rätt redan vid
  konverteringen, så varje fil står rätt på egen hand och ingen webbläsare
  behöver läsa taggen. Övrig metadata (bland annat GPS) tas bort.
- **Färgprofiler.** ICC-profilen följer alltid med. Utan den blir en bild i
  Adobe RGB eller Display P3 synligt flackare i webbläsaren.

Allt görs av `sharp`, med samma libwebp som `cwebp`: i full storlek blir
filerna byte för byte desamma. Nedskalningen görs med Mitchell-filtret, som
ligger närmast `cwebp`:s egen. Med sharps standardfilter (Lanczos 3) blev
fotona 8 % tyngre vid samma kvalitet; med Mitchell hamnar hela biblioteket
0,3 % under det `cwebp` gjorde.

### Språk

Redigeringsverktyget är på engelska. Webbplatsen som byggs med det är
oberoende av det och kan vara på vilket språk som helst — allt innehåll kommer
från CMS:et.

Alla ord i gränssnittet ligger i `src/i18n/en.js`, en enda ordlista med
nyckel-värde-par. `t('nav.pages')` slår upp dem. En saknad nyckel returnerar
sig själv, så ett fel syns i gränssnittet i stället för att bli tomt.

Lägg till ett språk genom att kopiera `src/i18n/en.js`, översätta högerledet,
registrera filen i `src/lib/i18n.js` och starta med `CMS_LANG=<kod>`.

**Pågående:** ordlistan är komplett men migreringen är inte klar. Navigationen,
artikelformuläret och panelen läser från den; övriga vyer har fortfarande
strängar inbakade. Nya strängar ska läggas i ordlistan direkt.

## Projektstruktur

```
├── start.sh / stop.sh        Startar och stoppar servern
├── src/
│   ├── server.js             Start: schemaläggning, seed, lyssnar
│   ├── app.js                Express: statiska filer, komprimering, routing
│   ├── config.js             Miljö och sökvägar
│   ├── models.js             Dataåtkomst för sidor, artiklar, media, menyer …
│   ├── db/                   Schema och strukturell seed
│   ├── lib/                  http, html-sanering, auth, mail, media, objekt
│   │                         imagesize.js (headerläsning), images.js (WebP, reservbilder)
│   ├── routes/               site.js, auth.js, cms.js + cms/*
│   └── views/                Serverrenderade vyer (site, cms, ikoner)
├── www/                      Webbroten: /assets, /media, /fonts
│   ├── assets/               CSS, JS, logotyp, favicon
│   └── media/                Uppladdade filer
├── data/                     SQLite-databas och utgående post
├── scripts/                  e2e-genomgång och städverktyg
└── test/                     Enhetstester (node --test)
```

Designen delas mellan webbplats och CMS genom `www/assets/tokens.css`.

---

## Frames → implementation

| Frame | Var |
|---|---|
| 2.1 Landing page, 2.2 Sub page | `src/views/layout.js` |
| 3.1–3.6 Slicebibliotek | `src/db/seed.js`, rendering i `src/views/render.js` |
| 4.1–4.3 Inloggning & engångskod | `src/routes/auth.js`, `src/lib/mail.js` |
| 4.4 Dashboard + snabbartikel | `src/routes/cms/dashboard.js` |
| 4.5 Användare | `src/routes/cms/users.js` |
| *(utöver specen)* Settings | `src/routes/cms/settings.js`, `src/lib/settings.js` |
| 4.6 Slice designer | *Ersatt* — slices byggs och sparas i sidredigeraren; `src/routes/cms/slices.js` är kvar som API |
| 4.7 Menyer | `src/routes/cms/menus.js`, `www/assets/cms-menus.js` |
| 4.8 Mediabibliotek | `src/routes/cms/media.js` |
| 4.9 Kategorier | `src/routes/cms/categories.js` |
| 4.10 Artiklar | `src/routes/cms/articles.js` |
| 4.11 Sidor, 4.12 Redigera sida | `src/routes/cms/pages.js` |
| 5.1–5.5 Bekräftelsedialoger | `www/assets/cms.js` (`confirmDelete`) |

### Redigeringsytan

**Navigationen** är en 64 px ikonrad som standard och den enda navigationsytan
i systemet — det finns ingen topplist. Håll muspekaren över raden och hela
menyn fälls ut *ovanpå* mittenkolumnen utan att flytta något. Nålen fäster den
öppen, och valet sparas i webbläsaren.

Överst ligger **View site**, som öppnar webbplatsen i en ny flik, avskild med en
linje från resten. Längst ned sitter kontot: avatar, namn och utloggning, plus
en varning när inloggningen är avstängd.

**Ytan visar innehållet som det kommer att se ut.** Rubriker är rubriker,
knappar ser ut som knappar och centrerat är centrerat — samma
`blocks.css`-regler används av både redigeraren och den publika sidan, så de
kan inte glida isär. Du redigerar direkt i innehållet; en bild byts genom att
klicka på själva bilden.

**Nästlade objekt ritas utan ram.** Ett objekt är bara sitt innehåll tills du
för muspekaren över det. Då får den *innersta* nivån en tunn streckad ram, en
liten namntagg uppe till vänster och en verktygsrad uppe till höger: dra, gå
upp en nivå, flytta upp, flytta ned, duplicera, spara som slice, ta bort.
Flyttar du pekaren utåt markeras kolumnen, sedan slicen.

**Panelen till höger har tre flikar.** *Properties* visar inställningarna för
det markerade objektet och öppnas automatiskt när du markerar något. *Saved*
listar dina slices. *Blocks* är paletten — den visar formulärfält bara när ett
formulär är markerat.

### Medvetna avsteg från specen

- **Formulärkontroller har en gemensam storlek.** Alla `input`, `select` och
  `textarea` delar höjd (40 px), typsnittsstorlek (15 px), utfyllnad och radie,
  enligt önskemål, i stället för de varierande måtten i frames.
- **Typografin följer en egen skala.** Specens `type 10`/`type 11` är för små
  för att läsa bekvämt; minsta storlek är 12 px och skalan är genomgående.
- **Ort är ett textfält, inte en lista.** Frame 4.5 anger en select, men det
  finns ingen rimlig källa att fylla den med. Land är fortfarande en select.
- **Undermenyn ligger i topplisten**, inte som en separat rad under den, så att
  navigationen håller ihop visuellt.
- **Menyindrag går även med tangentbord** (Tab / Shift+Tab i menytextfältet)
  utöver dragning i sidled.
- **Objekt kan flyttas med pilknappar och dupliceras**, inte bara dras. I djupt
  nästlad layout är det betydligt säkrare än dragning.
- **Punktlista och Underrubrik finns inte som egna objekt.** Listor skrivs i
  textobjektet med verktygsraden, och rubriknivån (H2/H3/H4) är en egenskap på
  rubrikobjektet. Två objekttyper mindre att välja mellan, samma möjligheter.
- **Kontaktformuläret i Frame 3.3 är ersatt av ett formulärverktyg.** I stället
  för ett fast formulär med tre givna fält bygger du fälten du behöver och
  sparar dem som en slice.
- **Slice designer som egen sida finns inte.** Frame 4.6 låter dig bygga en
  slice utan att se den i sitt sammanhang. I stället byggs slices på plats i
  sidredigeraren och sparas därifrån, vilket tar bort ett helt steg och en hel
  vy. Slicebiblioteket bor i panelens flik *Sparade*.

---

## Utveckling

```bash
npm run dev        # Node med --watch
npm test           # Enhetstester (kräver ingen server)
npm run test:e2e   # Genomgång mot en körande stack
npm run test:clean # Rensa rester efter ett avbrutet e2e-test
npm run reset      # Töm databasen och seeda om strukturen
```

`test:e2e` skapar allt under en unik tagg per körning och tar bort det igen,
så den kan köras hur många gånger som helst utan att lämna spår.

Seeden lägger bara in **struktur**: admin-användaren, fyra sidmallar, sju
slices, nio nyhetskategorier, de tio toppnivåsidorna och de två menyerna.
Sidorna är avsiktligt tomma — innehållet skapas i CMS:et.

### Inte byggt än

- **Flerspråkig redigering.** Innehållet finns bara på ett språk. Sidans språk
  sätts under Settings och styr `lang`-attributet. Någon språkväljare finns
  inte — medvetet bortvalt tills resten sitter.

### Att göra innan skarp drift

- Sätt `AUTH_DISABLED=0` och lägg in Brevo-nyckeln.
- Sätt `SITE_URL` till den riktiga domänen.
- Bestäm var TLS avslutas. Utan nginx måste något annat göra det: en proxy
  eller lastbalanserare framför (sätt då `TRUST_PROXY`), eller Node själv med
  ett certifikat. `Secure` på kakorna och HSTS slår på sig själva när
  anropet kom över TLS.
- Lägg hastighetsbegränsning på `/cms/login` — engångskoden har
  försöksbegränsning, men inte antalet utskick.
- Ta backup av `data/cms.db` och `www/media/`; det är hela systemets tillstånd.
  `www/media/` innehåller de utlevererade WebP-filerna, reservbilderna och
  originalen.
