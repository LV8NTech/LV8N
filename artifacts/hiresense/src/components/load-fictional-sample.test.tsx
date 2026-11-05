import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { LoadFictionalSample } from './load-fictional-sample';
import { emptyHiringDecision } from '@/lib/hiring-decision';

const state = vi.hoisted(() => ({ inputs: {} as Record<string, unknown>, loadProfile: vi.fn() }));
vi.mock('@/lib/inputs-store', () => ({
  useInputs: () => state,
  PROFILES: [
    { id: 'northstar-studio', name: 'Northstar Studio Services' },
    { id: 'juniper-kitchen', name: 'Juniper Table Kitchen' },
  ],
}));
it('loads a selected sample directly when inputs are empty', () => {
  state.inputs = { ...emptyHiringDecision };
  state.loadProfile.mockClear();
  render(<LoadFictionalSample />);
  fireEvent.click(screen.getByRole('button', { name: 'Northstar Studio Services' }));
  expect(state.loadProfile).toHaveBeenCalledWith('northstar-studio');
});
it('requires confirmation before replacing inputs, including explicit zero', () => {
  state.inputs = { ...emptyHiringDecision, currentCash: 0 };
  state.loadProfile.mockClear();
  render(<LoadFictionalSample />);
  fireEvent.click(screen.getByRole('button', { name: 'Juniper Table Kitchen' }));
  expect(state.loadProfile).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Keep my inputs' }));
  expect(state.loadProfile).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Juniper Table Kitchen' }));
  fireEvent.click(screen.getByRole('button', { name: 'Replace with sample' }));
  expect(state.loadProfile).toHaveBeenCalledWith('juniper-kitchen');
});
