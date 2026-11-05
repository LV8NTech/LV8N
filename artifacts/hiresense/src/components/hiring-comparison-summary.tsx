import type { HiringDecisionResult } from "@/lib/hiring-decision";
import { handleHorizontalScrollKeyDown } from "@/lib/horizontal-scroll";

const money = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);

type Row = {
  id: string;
  label: string;
  month12: number | null;
  lowest: number | null;
  diff: number | null;
  belowReserve: number | null;
  belowZero: number | null;
  withheld: boolean;
  missingInputs: string[];
};

export function HiringComparisonSummary({
  result,
  reserveTarget,
}: {
  result: HiringDecisionResult;
  reserveTarget: number | null;
}) {
  const baseline = result.baseline;
  const rows: Row[] = [
    {
      id: "no-hire",
      label: "No hire (baseline)",
      month12: baseline ? baseline.finalEndingCash : null,
      lowest: baseline ? baseline.lowestEndingCash : null,
      diff: baseline ? 0 : null,
      belowReserve:
        baseline && reserveTarget !== null
          ? baseline.endingCash.filter((cash) => cash < reserveTarget).length
          : null,
      belowZero: baseline ? baseline.endingCash.filter((cash) => cash < 0).length : null,
      withheld: !baseline,
      missingInputs: baseline ? [] : result.baselineMissingInputs,
    },
    ...result.scenarios.map((scenario): Row =>
      scenario.status === "calculated"
        ? {
            id: scenario.scenarioId,
            label: scenario.title,
            month12: scenario.projection.finalEndingCash,
            lowest: scenario.projection.lowestEndingCash,
            diff: scenario.projection.finalIncrementalCashImpact,
            belowReserve: scenario.projection.monthsBelowReserve,
            belowZero: scenario.projection.monthsBelowZero,
            withheld: false,
            missingInputs: [],
          }
        : {
            id: scenario.scenarioId,
            label: scenario.title,
            month12: null,
            lowest: null,
            diff: null,
            belowReserve: null,
            belowZero: null,
            withheld: true,
            missingInputs: scenario.missingInputs,
          },
    ),
  ];

  const reserveCell = (row: Row) =>
    row.withheld ? "—" : reserveTarget === null ? "Reserve not entered" : `${row.belowReserve} of 12`;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card" data-testid="hiring-comparison-summary">
      <p className="px-3 pt-3 text-xs text-muted-foreground sm:hidden">
        Scroll horizontally or use the left and right arrow keys to see all columns.
      </p>
      <div
        role="region"
        className="overflow-x-auto"
        tabIndex={0}
        aria-label="Side-by-side comparison; use the left and right arrow keys or scroll horizontally to see all columns"
        onKeyDown={handleHorizontalScrollKeyDown}
      >
        <table role="table" className="contrast-table comparison-table w-full text-left text-sm tabular-nums">
          <caption className="sr-only">Cash after 12 months, lowest month-end cash, difference from not hiring, and months below reserve and below zero for each alternative</caption>
          <thead role="rowgroup" className="comparison-table-header sr-only bg-primary text-primary-foreground sm:not-sr-only sm:table-header-group">
            <tr role="row">
              <th role="columnheader" scope="col" className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.08em]">Alternative</th>
              <th role="columnheader" scope="col" className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.08em]">Cash after 12 months</th>
              <th role="columnheader" scope="col" className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.08em]">Lowest month-end cash</th>
              <th role="columnheader" scope="col" className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.08em]">Difference from not hiring</th>
              <th role="columnheader" scope="col" className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.08em]">Months below reserve</th>
              <th role="columnheader" scope="col" className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.08em]">Months below $0</th>
            </tr>
          </thead>
          <tbody role="rowgroup" className="block divide-y divide-[#e6ebe7] sm:table-row-group">
            {rows.map((row) => (
              <tr role="row" key={row.id} className={`grid grid-cols-2 sm:table-row ${row.id === "no-hire" ? "bg-muted text-foreground" : "text-[#344b44]"}`} data-testid={`compare-row-${row.id}`}>
                <th role="rowheader" scope="row" className="col-span-2 px-3 py-3 font-semibold">{row.label}</th>
                {row.withheld ? (
                  <td role="cell" colSpan={5} className="col-span-2 px-3 py-3 text-[#6c6042]">
                    <p className="font-medium">Projection withheld. Missing or invalid requirements:</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 leading-relaxed">
                      {row.missingInputs.map((missing) => <li key={missing}>{missing}</li>)}
                    </ul>
                  </td>
                ) : (
                  <>
                    <td role="cell" className={`px-3 py-3 font-semibold ${row.month12! < 0 ? "cash-negative" : ""}`}><span aria-hidden="true" className="block text-xs font-normal sm:hidden">Cash after 12 months</span>{money(row.month12!)}</td>
                    <td role="cell" className={`px-3 py-3 ${row.lowest! < 0 ? "cash-negative" : ""}`} data-testid={`compare-lowest-${row.id}`}><span aria-hidden="true" className="block text-xs sm:hidden">Lowest month-end cash</span>{money(row.lowest!)}</td>
                    <td role="cell" className={`px-3 py-3 ${row.diff! < 0 ? "cash-negative" : ""}`}><span aria-hidden="true" className="block text-xs sm:hidden">Difference from not hiring</span>{money(row.diff!)}</td>
                    <td role="cell" className="px-3 py-3"><span aria-hidden="true" className="block text-xs sm:hidden">Months below reserve</span>{reserveCell(row)}</td>
                    <td role="cell" className="px-3 py-3"><span aria-hidden="true" className="block text-xs sm:hidden">Months below $0</span>{row.belowZero} of 12</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-[#e6ebe7] px-3 py-2.5 text-xs leading-5 text-[#657671]">
        Estimates calculated in your browser from month-end cash. No row is a recommendation. Reserve counts are unknown until you enter your cash reserve target.
      </p>
    </div>
  );
}
