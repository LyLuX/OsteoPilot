import { useEffect, useId, useRef, useState } from 'react';
import { FormControl } from './BootstrapForm.jsx';

const MAX_FIELDS = 6;
const MOBILE_QUERY = '(max-width: 575.98px)';

/** Shared responsive panel for one search field and up to five list filters. */
export default function FilterPanel({
  fields,
  className = '',
  ariaLabel = 'Recherche et filtres',
  errors = {},
}) {
  const idPrefix = useId();
  const fieldsId = `${idPrefix}-fields`;
  const fieldsRef = useRef(null);
  const [isMobile, setMobile] = useState(() => window.matchMedia?.(MOBILE_QUERY).matches ?? false);
  const [isExpanded, setExpanded] = useState(false);

  useEffect(() => {
    const media = window.matchMedia?.(MOBILE_QUERY);
    if (!media) return undefined;
    const updateViewport = () => {
      if (media.matches && fieldsRef.current?.contains(document.activeElement)) setExpanded(true);
      setMobile(media.matches);
    };
    updateViewport();
    media.addEventListener('change', updateViewport);
    return () => media.removeEventListener('change', updateViewport);
  }, []);

  const searchFields = fields.filter((field) => field.type === 'search');

  if (fields.length > MAX_FIELDS) {
    throw new Error(`Un panneau de filtres ne peut pas contenir plus de ${MAX_FIELDS} champs.`);
  }
  if (searchFields.length > 1) {
    throw new Error('Un panneau de filtres ne peut contenir qu’un seul champ de recherche.');
  }

  return (
    <section aria-label={ariaLabel} className={`filter-panel ${className}`.trim()}>
      {isMobile && (
        <button
          type="button"
          className="filter-panel-toggle"
          aria-expanded={isExpanded}
          aria-controls={fieldsId}
          onClick={() => setExpanded((expanded) => !expanded)}
        >
          <span>{ariaLabel}</span>
          <span className="nav-chevron" aria-hidden="true" />
        </button>
      )}
      <div
        ref={fieldsRef}
        id={fieldsId}
        className="filter-panel-fields"
        hidden={isMobile && !isExpanded}
      >
        {fields.map((field) => {
          const id = `${idPrefix}-${field.name}`;
          const isSelect = field.type === 'select';

          return (
            <div className="form-label mb-0 text-body-secondary" key={field.name}>
              <label htmlFor={id}>{field.type === 'search' ? 'Recherche' : field.label}</label>
              <FormControl
                as={isSelect ? 'select' : 'input'}
                aria-label={field.ariaLabel}
                error={errors[field.name]}
                id={id}
                name={field.name}
                type={isSelect ? undefined : (field.type ?? 'text')}
                placeholder={field.placeholder}
                value={field.value}
                maxLength={field.maxLength}
                pattern={field.pattern}
                min={field.min}
                max={field.max}
                disabled={field.disabled}
                required={field.required}
                onChange={(event) => field.onChange(event.target.value)}
              >
                {isSelect ? (
                  <>
                    {field.emptyLabel !== undefined && <option value="">{field.emptyLabel}</option>}
                    {field.options?.map((option) => (
                      <option key={option.value} value={option.value} disabled={option.disabled}>
                        {option.label}
                      </option>
                    ))}
                  </>
                ) : undefined}
              </FormControl>
            </div>
          );
        })}
      </div>
    </section>
  );
}
