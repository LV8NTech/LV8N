import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Router, Route } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { Shell } from './shell';

vi.mock('@/lib/inputs-store', () => ({
  useInputs: () => ({ inputs: {} }), countProvided: () => 0, TOTAL_FIELDS: 25,
}));
vi.mock('@/components/disclosures', () => ({
  DisclosuresDialog: ({ trigger }: { trigger: React.ReactNode }) => trigger,
}));

function mount(path = '/ask') {
  const location = memoryLocation({ path });
  const page = render(<Router hook={location.hook}><Shell>
    <Route path="/ask"><h1>Ask</h1></Route>
    <Route path="/scenarios"><h1>Scenarios title</h1><a href="#detail">Read detail</a><section id="detail">Detail</section></Route>
  </Shell></Router>);
  return { ...page, location };
}
beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })));
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
const top = { top: 0, left: 0, behavior: 'auto' };

describe('explicit sidebar navigation starts at the page top', () => {
  it('opens a directly loaded Scenarios route at the top', () => {
    mount('/scenarios');
    expect(window.scrollTo).toHaveBeenCalledExactlyOnceWith(top);
  });

  it('resets a route change from Ask and focuses main without browser focus-scrolling', () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    mount();
    expect(window.scrollTo).toHaveBeenCalledExactlyOnceWith(top);
    fireEvent.click(screen.getAllByTestId('link-nav-scenarios')[0]);
    expect(screen.getByRole('heading', { name: 'Scenarios title' })).toBeInTheDocument();
    expect(window.scrollTo).toHaveBeenCalledTimes(2);
    expect(window.scrollTo).toHaveBeenNthCalledWith(2, top);
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });
    expect(screen.getByRole('main')).toHaveFocus();
  });

  it('resets when tapping the already-current Scenarios link', () => {
    mount('/scenarios');
    fireEvent.click(screen.getAllByTestId('link-nav-scenarios')[0]);
    expect(window.scrollTo).toHaveBeenCalledTimes(2);
    expect(window.scrollTo).toHaveBeenNthCalledWith(2, top);
  });

  it('closes compact navigation and resets on a same-page tap', () => {
    mount('/scenarios');
    const menu = screen.getByTestId('button-menu');
    fireEvent.click(menu);
    expect(menu).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getAllByTestId('link-nav-scenarios')[1]);
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    expect(window.scrollTo).toHaveBeenCalledTimes(2);
    expect(window.scrollTo).toHaveBeenNthCalledWith(2, top);
  });

  it('does not reset ordinary scrolling, rerenders or in-page hash navigation', () => {
    const { location } = mount('/scenarios');
    fireEvent.scroll(window);
    fireEvent.click(screen.getByRole('link', { name: 'Read detail' }));
    act(() => location.navigate('/scenarios'));
    expect(window.scrollTo).toHaveBeenCalledExactlyOnceWith(top);
  });

  it.each([{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }])('preserves modified link clicks: %o', modifiers => {
    mount('/scenarios');
    fireEvent.click(screen.getAllByTestId('link-nav-scenarios')[0], modifiers);
    expect(window.scrollTo).toHaveBeenCalledExactlyOnceWith(top);
  });
});
