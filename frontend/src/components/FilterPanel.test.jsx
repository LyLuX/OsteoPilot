import { useState } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import FilterPanel from './FilterPanel.jsx';

describe('FilterPanel', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const mockViewport = (matches) => {
    const listeners = new Set();
    const media = {
      matches,
      addEventListener: (_event, listener) => listeners.add(listener),
      removeEventListener: (_event, listener) => listeners.delete(listener),
    };
    vi.stubGlobal('matchMedia', () => media);
    return {
      media,
      listeners,
      resize: (mobile) =>
        act(() => {
          media.matches = mobile;
          listeners.forEach((listener) => listener());
        }),
    };
  };

  it('starts collapsed on mobile, opens with the keyboard and preserves entered values', async () => {
    mockViewport(true);
    const user = userEvent.setup();
    function Filters() {
      const [value, setValue] = useState('');
      return (
        <FilterPanel
          fields={[
            { name: 'q', type: 'search', ariaLabel: 'Rechercher', value, onChange: setValue },
          ]}
        />
      );
    }
    render(<Filters />);
    const toggle = screen.getByRole('button', { name: 'Recherche et filtres' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    const fields = document.getElementById(toggle.getAttribute('aria-controls'));
    expect(fields).not.toBeVisible();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    await user.tab();
    expect(toggle).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await user.type(screen.getByRole('searchbox'), 'pompe');
    await user.click(toggle);
    expect(fields).not.toBeVisible();
    await user.click(toggle);
    expect(screen.getByRole('searchbox')).toHaveValue('pompe');
  });

  it('keeps desktop filters visible and restores visibility after resizing', () => {
    const viewport = mockViewport(true);
    const { unmount } = render(
      <FilterPanel fields={[{ name: 'q', type: 'search', value: '', onChange: vi.fn() }]} />,
    );
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    viewport.resize(false);
    expect(screen.getByRole('searchbox')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Recherche et filtres' })).not.toBeInTheDocument();
    viewport.resize(true);
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    unmount();
    expect(viewport.listeners.size).toBe(0);
  });

  it('keeps a focused field available when switching from desktop to mobile', () => {
    const viewport = mockViewport(false);
    render(<FilterPanel fields={[{ name: 'q', type: 'search', value: '', onChange: vi.fn() }]} />);
    const field = screen.getByRole('searchbox');
    field.focus();
    viewport.resize(true);
    expect(field).toBeVisible();
    expect(field).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Recherche et filtres' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('renders a consistently labelled search and forwards selected values', async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    const onStatus = vi.fn();

    render(
      <FilterPanel
        fields={[
          {
            name: 'search',
            type: 'search',
            ariaLabel: 'Rechercher des éléments',
            value: '',
            onChange: onSearch,
          },
          {
            name: 'active',
            type: 'select',
            label: 'Statut',
            ariaLabel: 'Filtrer par statut',
            emptyLabel: 'Tous les statuts',
            options: [{ value: 'true', label: 'Actifs' }],
            value: '',
            onChange: onStatus,
          },
        ]}
      />,
    );

    const panel = screen.getByRole('region', { name: 'Recherche et filtres' });
    expect(panel).toHaveClass('filter-panel');
    expect(screen.getByLabelText('Rechercher des éléments').labels[0]).toHaveTextContent(
      /^Recherche/,
    );

    await user.type(screen.getByLabelText('Rechercher des éléments'), 'pompe');
    await user.selectOptions(screen.getByLabelText('Filtrer par statut'), 'true');

    expect(onSearch).toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalledWith('true');
  });

  it('rejects more than six fields', () => {
    const fields = Array.from({ length: 7 }, (_value, index) => ({
      name: `field-${index}`,
      label: `Champ ${index}`,
      value: '',
      onChange: vi.fn(),
    }));

    expect(() => render(<FilterPanel fields={fields} />)).toThrow(
      'Un panneau de filtres ne peut pas contenir plus de 6 champs.',
    );
  });

  it('rejects more than one search field', () => {
    expect(() =>
      render(
        <FilterPanel
          fields={[
            { name: 'search-a', type: 'search', value: '', onChange: vi.fn() },
            { name: 'search-b', type: 'search', value: '', onChange: vi.fn() },
          ]}
        />,
      ),
    ).toThrow('Un panneau de filtres ne peut contenir qu’un seul champ de recherche.');
  });
});
