import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { DISTANCES } from "@/lib/vdot";
import type { Plan } from "@/lib/types";

export const maxDuration = 300;

const DAY_TYPES = [
  "hvile",
  "rolig",
  "langtur",
  "intervall",
  "terskel",
  "repetisjoner",
  "maratonfart",
  "konkurranse",
] as const;

// JSON-skjema som AI-svaret må følge – samme struktur som Plan.weeks
const WEEKS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["weeks"],
  properties: {
    weeks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["nr", "phase", "phaseName", "focus", "km", "days"],
        properties: {
          nr: { type: "integer" },
          phase: { type: "integer" },
          phaseName: { type: "string" },
          focus: { type: "string" },
          km: { type: "number" },
          days: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["dow", "date", "type", "title", "desc", "km", "pace", "hr"],
              properties: {
                dow: { type: "integer" },
                date: { type: "string" },
                type: { type: "string", enum: [...DAY_TYPES] },
                title: { type: "string" },
                desc: { type: "string" },
                km: { type: "number" },
                pace: { type: "string" },
                hr: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
} as const;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "AI er ikke konfigurert. Legg til ANTHROPIC_API_KEY i .env for å aktivere AI-forbedring." },
      { status: 503 }
    );
  }

  const program = await prisma.program.findUnique({ where: { id } });
  if (!program) {
    return NextResponse.json({ error: "Fant ikke programmet" }, { status: 404 });
  }

  const plan: Plan = JSON.parse(program.planJson);
  const client = new Anthropic();

  const system = `Du er en av verdens fremste løpecoacher, med dyp kunnskap om Jack Daniels' treningsfilosofi (VDOT, E/M/T/I/R-intensiteter, periodisering i fire faser), samt prinsippene til Renato Canova, Arthur Lydiard og Peter Coe.

Du får et generert treningsprogram i JSON-format. Forbedre det:
- Gjør øktbeskrivelsene mer levende, motiverende og pedagogiske – forklar HENSIKTEN med hver økt.
- Juster øktene der det gir treningsfaglig mening (variasjon i intervalløkter, progresjon uke for uke, fornuftig restitusjon).
- Behold fartene og pulssonene som står (de er beregnet fra utøverens VDOT) – ikke endre tallene i fart/puls-feltene.
- Behold dager merket som manuelt endret av coachen ("edited": beskrevet i input) nøyaktig som de er.
- Behold datoer, ukenummer og den overordnede fase-strukturen.
- Alt skal være på norsk. Skriv direkte til utøveren ("du").

Returner hele programmet i samme JSON-struktur.`;

  const editedNote = plan.weeks.some((w) => w.days.some((d) => d.edited))
    ? "\n\nMERK: Følgende dager er manuelt endret av coachen og skal beholdes ordrett: " +
      plan.weeks
        .flatMap((w) => w.days.filter((d) => d.edited).map((d) => `uke ${w.nr} ${d.date}`))
        .join(", ")
    : "";

  const userMsg = `Utøver: ${program.athleteName}
Mål: ${DISTANCES[program.targetRace]?.label ?? program.targetRace}
VDOT: ${program.vdot}
Økter per uke: ${program.daysPerWeek}
Nåværende ukesvolum: ${program.weeklyKm} km${program.hrMax ? `\nMakspuls: ${program.hrMax}` : ""}${program.notes ? `\nCoachens notater: ${program.notes}` : ""}${editedNote}

Programmet (JSON):
${JSON.stringify({ weeks: plan.weeks })}`;

  try {
    const stream = client.messages.stream({
      model: "claude-opus-4-8",
      max_tokens: 64000,
      thinking: { type: "adaptive" },
      output_config: { format: { type: "json_schema", schema: WEEKS_SCHEMA } },
      system,
      messages: [{ role: "user", content: userMsg }],
    });
    const message = await stream.finalMessage();

    if (message.stop_reason === "refusal" || message.stop_reason === "max_tokens") {
      return NextResponse.json({ error: "AI-en kunne ikke fullføre forbedringen. Prøv igjen." }, { status: 502 });
    }

    const text = message.content.find((b) => b.type === "text")?.text;
    if (!text) throw new Error("Tomt svar fra AI");
    const result = JSON.parse(text) as { weeks: Plan["weeks"] };

    if (!Array.isArray(result.weeks) || result.weeks.length !== plan.weeks.length) {
      throw new Error("AI-svaret hadde feil struktur");
    }

    // Gjenopprett manuelt endrede dager og edited-flagg
    for (let wi = 0; wi < plan.weeks.length; wi++) {
      for (let di = 0; di < plan.weeks[wi].days.length; di++) {
        if (plan.weeks[wi].days[di].edited) {
          result.weeks[wi].days[di] = plan.weeks[wi].days[di];
        }
      }
    }

    const updated: Plan = { paces: plan.paces, weeks: result.weeks };
    await prisma.program.update({ where: { id }, data: { planJson: JSON.stringify(updated) } });

    return NextResponse.json({ plan: updated });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: "Ugyldig ANTHROPIC_API_KEY." }, { status: 502 });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "AI-tjenesten er opptatt – prøv igjen om litt." }, { status: 502 });
    }
    console.error("AI-forbedring feilet:", err);
    return NextResponse.json({ error: "AI-forbedring feilet. Prøv igjen." }, { status: 502 });
  }
}
