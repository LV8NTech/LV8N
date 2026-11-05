import { Link } from 'wouter';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="py-20 text-center">
      <p className="font-mono text-xs text-accent-foreground">404</p>
      <h1 className="font-display text-3xl mt-2">This page is not part of HireSense.</h1>
      <Button asChild className="mt-6" data-testid="button-home"><Link href="/">Back to overview</Link></Button>
    </div>
  );
}
