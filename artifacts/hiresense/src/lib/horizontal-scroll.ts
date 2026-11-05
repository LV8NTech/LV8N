import type { KeyboardEvent } from 'react';

export function handleHorizontalScrollKeyDown(
  event: KeyboardEvent<HTMLDivElement>,
) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;

  event.preventDefault();
  const direction = event.key === 'ArrowRight' ? 1 : -1;
  const distance = Math.max(80, event.currentTarget.clientWidth * 0.75);
  event.currentTarget.scrollBy({ left: direction * distance, behavior: 'auto' });
}
