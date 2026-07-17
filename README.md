# 🏃 LøpeCoach

Skreddersydde løpeprogrammer for coacher og utøvere, bygget på Jack Daniels' treningsprinsipper (VDOT).

## Slik fungerer det

**Coach-siden** (`/coach`):
- Opprett program: velg utøver, distanse (3000 m → maraton), VDOT, antall uker, økter per uke, ukesvolum og startdato
- Motoren beregner E/M/T/I/R-farter og pulssoner matematisk fra VDOT (Daniels' formler) og bygger programmet i fire faser: grunntrening → tidlig kvalitet → toppfase → nedtrapping, med restitusjonsuke hver 4. uke og konkurransedag til slutt
- Rediger hvilken som helst dag manuelt – endringene merkes og overskrives aldri av AI
- «✨ Forbedre med AI»: Claude (Opus 4.8) forbedrer og personaliserer øktbeskrivelsene

**Utøver-siden** (`/p/<kode>`): en pen, delbar lenke med hele programmet – dag for dag, uke for uke, med fart, pulssoner, nedtelling til konkurransen og «I DAG»-markering. Utskriftsvennlig.

## Kom i gang lokalt

```bash
npm install
npx prisma db push   # oppretter SQLite-databasen
npm run dev          # http://localhost:3000
```

AI-forbedring krever en Anthropic API-nøkkel i `.env`:

```
ANTHROPIC_API_KEY="sk-ant-..."
```

Appen fungerer fullt ut uten nøkkel – den deterministiske Daniels-motoren lager hele programmet selv.

## Deploy til Vercel

Lokalt brukes SQLite; på Vercel trenger du en Postgres-database (serverless har ikke varig disk):

1. Opprett en Postgres-database, f.eks. **Neon** via Vercel Marketplace (gratis nivå holder lenge)
2. Endre `provider` i [prisma/schema.prisma](prisma/schema.prisma) fra `sqlite` til `postgresql`
3. Sett miljøvariabler i Vercel-prosjektet:
   - `DATABASE_URL` – Postgres-URL-en fra Neon
   - `ANTHROPIC_API_KEY` – (valgfritt) for AI-forbedring
4. Legg til i `package.json` slik at Prisma genereres og skjemaet pushes ved deploy:
   ```json
   "scripts": { "build": "prisma generate && prisma db push && next build" }
   ```
5. `npx vercel` (eller koble GitHub-repoet til Vercel)

> **Merk:** Coach-sidene har ingen innlogging ennå. Utøverlenkene er ugjettbare, men `/coach` er åpen – legg til enkel auth (f.eks. Vercel-passordbeskyttelse eller NextAuth) før du deler URL-en offentlig.

## Teknisk

- **Next.js 16** (App Router) + Tailwind CSS 4
- **Prisma** + SQLite (dev) / Postgres (prod) – hele programmet lagres som JSON per program
- **Treningsmotor** i [src/lib/vdot.ts](src/lib/vdot.ts) (Daniels' formler: VO2 = -4.60 + 0.182258·v + 0.000104·v²) og [src/lib/generator.ts](src/lib/generator.ts) (faser, volumprogresjon, øktbibliotek)
- **AI** i `src/app/api/program/[id]/ai/route.ts` – Claude med strukturert JSON-output; manuelt redigerte dager bevares alltid
