import { useRef } from 'react';
export default function DetailTabs({ id, tabs, active, onChange }) {
  const list = useRef(null);
  return (
    <div
      className="detail-tabs"
      role="tablist"
      aria-label="Rubriques de la fiche patient"
      ref={list}
    >
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={id + '-tab-' + tab.id}
          aria-controls={id + '-panel-' + tab.id}
          aria-selected={active === tab.id}
          tabIndex={active === tab.id ? 0 : -1}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => {
            let next;
            if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
            if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
            if (event.key === 'Home') next = 0;
            if (event.key === 'End') next = tabs.length - 1;
            if (next === undefined) return;
            event.preventDefault();
            onChange(tabs[next].id);
            list.current?.querySelectorAll('[role="tab"]')[next]?.focus();
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
