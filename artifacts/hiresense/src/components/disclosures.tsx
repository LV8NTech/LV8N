import type { ReactNode } from 'react';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export const DISCLOSURES: { title: string; body: string }[] = [
  {
    title: 'Estimates, not guarantees',
    body: 'Any results HireSense shows will be estimates based on the information you supply and the assumptions in the calculator. They are not guarantees of affordability, profitability, financing, or any business outcome.',
  },
  {
    title: 'Lowest balance is a month-end figure',
    body: 'The lowest cash balance shown will be a month-end projection. Cash can dip lower within a month, for example between payroll and customer payments, and a month-end view may miss those shortages.',
  },
  {
    title: 'Revenue alone does not decide affordability',
    body: 'Annual revenue says little about whether a hire fits. HireSense looks at cash, cash flow and the reserve you choose, not a revenue threshold.',
  },
  {
    title: 'AI-assisted content',
    body: 'Local explanations are deterministic calculator text, not AI responses. The optional Generate AI review action sends either an unchanged fictional sample id or, for your own figures, the calculator fields without the business name, plus calculated outputs, only after availability checking and consent. Code-free AI is restricted to this project’s configured development Preview; anyone with Preview access can send requests. App usage is counted; an app cap may or may not be set, and provider credit balance is unknown. Genuine Meta output is labeled separately, may contain errors and cannot replace calculator figures. No automatic requests or retries run.',
  },
  {
    title: 'Not professional advice',
    body: 'HireSense does not provide financial, tax, legal, or employment advice. Talk to a qualified accountant, adviser or employment lawyer before making hiring decisions.',
  },
  {
    title: 'Your information',
    body: 'Inputs live only in this browser tab while it is open. Nothing is saved, uploaded or sent anywhere, and refreshing the page clears them.',
  },
];

export function DisclosureList() {
  return (
    <ol className="min-w-0 space-y-5">
      {DISCLOSURES.map((d, i) => (
        <li key={d.title} className="contrast-disclosure-item grid min-w-0 grid-cols-[2rem_minmax(0,1fr)] gap-2">
          <span className="contrast-disclosure-number font-mono text-xs text-accent-foreground pt-1">{String(i + 1).padStart(2, '0')}</span>
          <div className="min-w-0">
            <h3 className="break-words font-medium text-foreground">{d.title}</h3>
            <p className="contrast-secondary break-words text-sm text-muted-foreground leading-relaxed mt-1">{d.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function DisclosuresDialog({ trigger }: { trigger: ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="contrast-surface w-[calc(100vw-2rem)] max-w-xl max-h-[85dvh] overflow-x-hidden overflow-y-auto">
        <DialogHeader className="pt-2 pr-12">
          <DialogTitle className="font-display text-xl font-normal sm:text-2xl break-words">Disclosures</DialogTitle>
          <DialogDescription className="contrast-secondary break-words">Please read these before relying on anything HireSense shows.</DialogDescription>
        </DialogHeader>
        <div className="pt-2">
          <DisclosureList />
        </div>
        <DialogFooter className="focus-within:sticky focus-within:bottom-0 focus-within:z-10 border-t pt-2 focus-within:bg-background">
          <DialogClose asChild>
            <Button variant="outline" className="max-w-full min-w-0 whitespace-normal break-words [overflow-wrap:anywhere]">
              <span className="min-w-0 [overflow-wrap:anywhere]">Close disclosures</span>
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
