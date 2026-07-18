import type { PlanQualityReport } from "@/lib/plan-quality";

const ISSUE_STYLE = {
  error: "border-red-200 bg-red-50 text-red-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  info: "border-sky-200 bg-sky-50 text-sky-900",
};

export function PlanQualityPanel({ report }: { report: PlanQualityReport }) {
  const clean = report.issues.length === 0;

  return (
    <section className={`rounded-2xl border p-6 mb-6 ${
      clean ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-white"
    }`}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Automatisk fagkontroll
          </p>
          <h2 className="text-xl font-bold mt-1">
            {clean ? "Klar for utøver" : "Coachgjennomgang kreves"}
          </h2>
        </div>
        <div className={`text-2xl font-black ${
          report.score >= 90 ? "text-emerald-700" : report.score >= 70 ? "text-amber-700" : "text-red-700"
        }`}>
          {report.score}/100
        </div>
      </div>

      {clean ? (
        <p className="text-sm text-emerald-800 mt-3">
          Belastning, hardøktfordeling, intensitetssoner og konkurranseuke består alle kontrollen.
        </p>
      ) : (
        <div className="grid gap-2 mt-4">
          {report.issues.map((issue, index) => (
            <div
              key={`${issue.code}-${issue.weekNr ?? "plan"}-${issue.date ?? index}`}
              className={`rounded-xl border px-4 py-3 ${ISSUE_STYLE[issue.severity]}`}
            >
              <p className="text-sm font-bold">{issue.title}</p>
              <p className="text-sm mt-0.5 opacity-80">{issue.desc}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
