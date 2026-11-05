import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { PROFILES, useInputs } from '@/lib/inputs-store';
import { emptyHiringDecision } from '@/lib/hiring-decision';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';

export function LoadFictionalSample() {
  const { inputs, loadProfile } = useInputs();
  const [pending, setPending] = useState<string | null>(null);
  const hasInputs = JSON.stringify(inputs) !== JSON.stringify(emptyHiringDecision);
  return <div className="mt-4 space-y-2">
    <p className="font-medium text-sm">Load fictional sample</p>
    <p className="text-xs text-muted-foreground">Loads local calculator inputs only. Nothing is sent to Meta.</p>
    <div className="flex flex-wrap gap-2">
      {PROFILES.map(p => <Button key={p.id} variant="outline" size="sm"
        onClick={() => hasInputs ? setPending(p.id) : loadProfile(p.id)}>
        {p.name}
      </Button>)}
    </div>
    <AlertDialog open={pending !== null} onOpenChange={open => { if (!open) setPending(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Replace current inputs?</AlertDialogTitle>
          <AlertDialogDescription>
            Loading this fictional sample replaces your current temporary inputs and clears the current Q&amp;A history. It does not send a Meta request or change app usage.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep my inputs</AlertDialogCancel>
          <AlertDialogAction onClick={() => { if (pending) loadProfile(pending); setPending(null); }}>Replace with sample</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
