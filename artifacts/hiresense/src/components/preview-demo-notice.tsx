export function PreviewDemoNotice() {
  const main = import.meta.env.VITE_HIRESENSE_MAIN_PREVIEW as string | undefined;
  return <div className="space-y-2 text-xs text-muted-foreground">
    <p>Development demo · no access code required. Anyone with an allowed Preview can send requests, which count toward shared app usage. Provider credit balance is unknown.</p>
    {main && <a className="inline-block underline font-medium" href={`${main}/ask`}>Open current HireSense Preview</a>}
    <details>
      <summary className="cursor-pointer font-medium">Connection details</summary>
      <p className="mt-2 break-all">UI: preview-no-code-v1 · Preview: {window.location.origin}</p>
      <p className="mt-1 break-all">API: {import.meta.env.DEV ? '/__hiresense_api/api' : '/api'} · eligibility check only until you explicitly send or generate.</p>
    </details>
  </div>;
}
