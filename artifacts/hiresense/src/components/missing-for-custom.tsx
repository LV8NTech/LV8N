/** Lists why the current figures cannot be sent. Shows up to eight reasons. */
export function MissingForCustom({ reasons }: { reasons: string[] }) {
  if (!reasons.length) return null;
  const shown = reasons.slice(0, 8);
  return (
    <div className="mt-2" data-testid="custom-missing">
      <p className="text-xs font-medium">Still needed or invalid:</p>
      <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground space-y-0.5">
        {shown.map((r) => <li key={r}>{r}</li>)}
      </ul>
      {reasons.length > shown.length && <p className="mt-1 text-xs text-muted-foreground">and {reasons.length - shown.length} more. See Business inputs.</p>}
    </div>
  );
}
