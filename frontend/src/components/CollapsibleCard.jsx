export default function CollapsibleCard({ title, headerRight, children, className = '', style, id, defaultOpen = false }) {
  return (
    <details id={id} className={`card collapsible-card ${className}`.trim()} style={style} open={defaultOpen || undefined}>
      <summary className="collapsible-card-summary">
        <span className="collapsible-card-summary-main">
          <span className="collapsible-card-title">{title}</span>
        </span>
        <span className="collapsible-card-summary-trailing">
          {headerRight ? (
            <span className="collapsible-card-summary-actions" onClick={(e) => e.stopPropagation()}>
              {headerRight}
            </span>
          ) : null}
          <span className="collapsible-card-chevron" aria-hidden />
        </span>
      </summary>
      <div className="collapsible-card-body">{children}</div>
    </details>
  );
}
