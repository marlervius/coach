# 🏃 LøpeCoach

Skreddersydde løpeprogrammer for coacher og utøvere, bygget på Jack Daniels' treningsprinsipper (VDOT).

## Slik fungerer det

**Coach-siden** (`/coach`):

- Logg inn med coach-passord før du kan lese eller endre programmer
- Opprett program: velg utøver, distanse (3000 m → maraton), VDOT, antall uker, økter per uke, ukesvolum og startdato
- Motoren bygger programmet i fire faser og skalerer kvalitetsøktene slik at vanlige treningsuker ikke presses over planlagt ukesvolum
- Rediger hvilken som helst dag manuelt – endringene merkes og overskrives aldri av AI
- «✨ Forbedre med AI» forbedrer titler og beskrivelser, men får ikke endre distanse, fart, puls eller dato

**Utøver-siden** (`/p/<kode>`) er en delbar, utskriftsvennlig visning med fart, pulssoner, nedtelling og «I DAG»-markering. Delingskodene er kryptografisk tilfeldige, og sidene er merket for ikke å indekseres av søkemotorer.

## Kom i gang lokalt

```bash
npm install
npm run db:migrate
npm run dev
```

Kopier `.env.example` til `.env` og fyll inn:

```dotenv
DATABASE_URL="postgresql://..."
DATABASE_URL_UNPOOLED="postgresql://..."
COACH_PASSWORD="et-unikt-passord-med-minst-12-tegn"
AUTH_SECRET="en-tilfeldig-hemmelighet-med-minst-32-tegn"
ANTHROPIC_API_KEY="sk-ant-..."
```

`ANTHROPIC_API_KEY` er valgfri. Appen fungerer uten den; den deterministiske Daniels-motoren lager hele programmet selv.

Kvalitetssjekker:

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

## Deploy til Vercel

1. Importer GitHub-repoet som et nytt prosjekt.
2. Opprett en Neon-database og koble den til prosjektet.
3. Legg til `COACH_PASSWORD` og en tilfeldig `AUTH_SECRET` under *Environment Variables*.
4. Legg eventuelt til `ANTHROPIC_API_KEY`.
5. Kjør `npm run db:migrate` mot databasen før første deploy.
6. Deploy. Byggesteget genererer Prisma-klienten, men endrer ikke databasen.

Har databasen tidligere blitt opprettet med `prisma db push`, må den eksisterende strukturen registreres én gang før første migrering:

```bash
npx prisma migrate resolve --applied 20260717160000_init
npm run db:migrate
```

Kjør bare `migrate resolve` når den eksisterende databasen allerede har `Program`-tabellen.

## Teknisk

- **Next.js 16** (App Router) + Tailwind CSS 4
- **Prisma** + PostgreSQL (Neon), med versjonerte migrasjoner
- **Treningsmotor** i [src/lib/vdot.ts](src/lib/vdot.ts) og [src/lib/generator.ts](src/lib/generator.ts)
- **Sikkerhet**: signert `HttpOnly`-sesjon, autorisasjon i alle mutasjoner, servervalidering, revisjonskontroll og begrensning av parallelle AI-kall
- **AI** i `src/app/api/program/[id]/ai/route.ts`: bare validerte tekstfelt flettes tilbake, og manuelt redigerte dager bevares
