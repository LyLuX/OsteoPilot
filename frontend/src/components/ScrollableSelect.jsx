import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useFieldValidation } from './BootstrapForm.jsx';
const normalized = (value) =>
  value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr-FR');
export default function ScrollableSelect({
  id,
  name,
  value,
  options,
  onChange,
  disabled = false,
  required = false,
  placeholder = 'Choisir une option',
}) {
  const root = useRef(null),
    button = useRef(null),
    native = useRef(null),
    menu = useRef(null);
  const typed = useRef({ value: '', at: 0 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [placement, setPlacement] = useState({ above: false, height: 256 });
  const validation = useFieldValidation(name, id);
  const selected = options.find((option) => option.value === value);
  const expanded = open && !disabled;
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  const select = (index) => {
    const option = options[index];
    if (!option || disabled) return;
    native.current.value = option.value;
    native.current.dispatchEvent(new Event('change', { bubbles: true }));
    setOpen(false);
    button.current.focus();
  };
  const show = (last = false) => {
    const index = options.findIndex((option) => option.value === value);
    setActive(index >= 0 ? index : last ? Math.max(0, options.length - 1) : 0);
    typed.current = { value: '', at: 0 };
    setOpen(true);
  };
  useLayoutEffect(() => {
    if (!expanded) return undefined;
    const measure = (event) => {
      if (event && menu.current?.contains(event.target)) return;
      const rect = button.current.getBoundingClientRect();
      const dialog = button.current.closest('dialog')?.getBoundingClientRect();
      const bottom = Math.min(window.innerHeight - 8, dialog ? dialog.bottom - 12 : Infinity);
      const top = Math.max(8, dialog ? dialog.top + 12 : 0);
      const below = bottom - rect.bottom - 4,
        above = rect.top - top - 4;
      const flip = below < Math.min(menu.current.scrollHeight, 256) && above > below;
      setPlacement({ above: flip, height: Math.max(44, flip ? above : below) });
    };
    measure();
    window.addEventListener('resize', measure);
    document.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      document.removeEventListener('scroll', measure, true);
    };
  }, [expanded, options.length]);
  useEffect(() => {
    if (expanded)
      menu.current
        ?.querySelector('[data-index="' + active + '"]')
        ?.scrollIntoView?.({ block: 'nearest' });
  }, [expanded, active]);
  useEffect(() => {
    if (!expanded) return undefined;
    const close = (event) => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [expanded]);
  const keydown = (event) => {
    const count = options.length;
    if (event.key === 'Tab') {
      setOpen(false);
      return;
    }
    if (event.key === 'Escape' && expanded) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      return;
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      if (!expanded) {
        show(event.key === 'ArrowUp' || event.key === 'End');
        if (event.key === 'Home') setActive(0);
        if (event.key === 'End') setActive(Math.max(0, count - 1));
        return;
      }
      setActive((index) =>
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? Math.max(0, count - 1)
            : (index + (event.key === 'ArrowDown' ? 1 : -1) + count) % Math.max(1, count),
      );
      return;
    }
    if (expanded && ['Enter', ' '].includes(event.key)) {
      event.preventDefault();
      select(active);
      return;
    }
    if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      event.key !== ' '
    ) {
      event.preventDefault();
      const now = Date.now();
      const prefix = now - typed.current.at < 700 ? typed.current.value + event.key : event.key;
      typed.current = { value: prefix, at: now };
      const start = expanded
        ? active
        : Math.max(
            0,
            options.findIndex((option) => option.value === value),
          );
      const find = (query) =>
        Array.from(
          { length: count },
          (_, offset) => (start + offset + (query.length === 1 ? 1 : 0)) % count,
        ).find((index) => normalized(options[index].label).startsWith(normalized(query)));
      const index = find(prefix) ?? find(event.key);
      if (index !== undefined) {
        setActive(index);
        setOpen(true);
      }
    }
  };
  return (
    <>
      <div
        className="scrollable-select"
        ref={root}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
        }}
      >
        <button
          ref={button}
          type="button"
          role="combobox"
          id={id}
          name={name}
          value={value}
          title={selected?.label}
          disabled={disabled}
          className={
            'form-select scrollable-select-trigger' + (validation.message ? ' is-invalid' : '')
          }
          aria-required={required || undefined}
          aria-haspopup="listbox"
          aria-expanded={expanded}
          aria-controls={expanded ? id + '-list' : undefined}
          aria-activedescendant={expanded && options[active] ? id + '-option-' + active : undefined}
          {...validation.attributes}
          onClick={() => (expanded ? setOpen(false) : show())}
          onKeyDown={keydown}
        >
          <span>{selected?.label ?? placeholder}</span>
        </button>
        <select
          ref={native}
          className="visually-hidden"
          aria-hidden="true"
          tabIndex={-1}
          name={name}
          value={value}
          required={required}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {expanded && (
          <div
            ref={menu}
            id={id + '-list'}
            role="listbox"
            aria-labelledby={id}
            className={
              'dropdown-menu show scrollable-select-menu' + (placement.above ? ' opens-above' : '')
            }
            style={{ '--select-menu-available-height': placement.height + 'px' }}
          >
            {options.map((option, index) => (
              <div
                key={option.value}
                id={id + '-option-' + index}
                role="option"
                aria-selected={option.value === value}
                data-index={index}
                className={'dropdown-item' + (active === index ? ' is-highlighted' : '')}
                onPointerDown={(event) => event.preventDefault()}
                onMouseMove={() => setActive(index)}
                onClick={() => select(index)}
              >
                {option.label}
              </div>
            ))}
            {options.length === 0 && (
              <span className="dropdown-item-text muted">Aucune option disponible.</span>
            )}
          </div>
        )}
      </div>
      {validation.message && (
        <div className="invalid-feedback d-block" id={validation.feedbackId}>
          {validation.message}
        </div>
      )}
    </>
  );
}
