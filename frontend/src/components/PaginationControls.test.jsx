import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import PaginationControls, { getVisiblePages } from './PaginationControls.jsx';

afterEach(cleanup);

const renderPagination = (pagination, properties = {}) => {
  const onPageChange = vi.fn();
  const onLimitChange = vi.fn();
  render(
    <PaginationControls
      pagination={pagination}
      limit={5}
      onPageChange={onPageChange}
      onLimitChange={onLimitChange}
      {...properties}
    />,
  );
  return { onPageChange, onLimitChange };
};

describe('PaginationControls', () => {
  it('keeps one adjacent page, the boundaries and gaps around a middle page', () => {
    expect(getVisiblePages(15, 50)).toEqual([1, 'previous-gap', 14, 15, 16, 'next-gap', 50]);

    renderPagination({ page: 15, totalPages: 50, total: 250 });

    expect(screen.getByText('15').closest('[aria-current="page"]')).toBeInTheDocument();
    expect(screen.getAllByText('…')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Aller à la page 14' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aller à la page 16' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aller à la page 13' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aller à la page 17' })).not.toBeInTheDocument();
  });

  it('navigates directly and with the French previous and next controls', async () => {
    const user = userEvent.setup();
    const { onPageChange } = renderPagination({ page: 15, totalPages: 50, total: 250 });

    await user.click(screen.getByRole('button', { name: 'Aller à la page 14' }));
    await user.click(screen.getByRole('button', { name: 'Précédent' }));
    await user.click(screen.getByRole('button', { name: 'Suivant' }));

    expect(onPageChange.mock.calls).toEqual([[14], [14], [16]]);
  });

  it('adapts the range and disabled actions at both boundaries', () => {
    renderPagination({ page: 1, totalPages: 50, total: 250 });

    expect(getVisiblePages(1, 50)).toEqual([1, 2, 'next-gap', 50]);
    expect(screen.getByRole('button', { name: 'Précédent' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Aller à la page 4' })).not.toBeInTheDocument();

    cleanup();
    renderPagination({ page: 50, totalPages: 50, total: 250 });

    expect(getVisiblePages(50, 50)).toEqual([1, 'previous-gap', 49, 50]);
    expect(screen.getByRole('button', { name: 'Suivant' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Aller à la page 47' })).not.toBeInTheDocument();
  });

  it('shows every page without gaps for a short result set and disables all actions while busy', () => {
    renderPagination(
      { page: 3, totalPages: 5, total: 25 },
      { disabled: true, itemLabel: 'matériel(s)' },
    );

    expect(getVisiblePages(3, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(screen.queryByText('…')).not.toBeInTheDocument();
    expect(screen.getByText('25 matériel(s), page 3 sur 5')).toBeInTheDocument();
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
    expect(screen.getByLabelText('Nombre d’éléments par page')).toBeDisabled();
  });
});

it('changes the result count without submitting an enclosing form', async () => {
  const user = userEvent.setup();
  const submit = vi.fn((event) => event.preventDefault());
  const onLimitChange = vi.fn();
  render(
    <form onSubmit={submit}>
      <PaginationControls
        pagination={{ page: 1, totalPages: 2, total: 10 }}
        limit={5}
        onPageChange={vi.fn()}
        onLimitChange={onLimitChange}
      />
    </form>,
  );
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Nombre d’éléments par page' }),
    '25',
  );
  expect(onLimitChange).toHaveBeenCalledWith(25);
  expect(submit).not.toHaveBeenCalled();
});

it('supports keyboard navigation and marks the current page without a redundant button', async () => {
  const user = userEvent.setup();
  const { onPageChange } = renderPagination({ page: 1, totalPages: 4, total: 20 });
  expect(screen.queryByRole('button', { name: 'Aller à la page 1' })).not.toBeInTheDocument();
  const second = screen.getByRole('button', { name: 'Aller à la page 2' });
  second.focus();
  await user.keyboard('{Enter}');
  expect(onPageChange).toHaveBeenCalledWith(2);
});
