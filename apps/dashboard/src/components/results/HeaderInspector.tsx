interface HeaderInspectorProps {
  headers: Record<string, string>;
}

/** Renders the benchmark trace headers returned by the API, when present. */
export function HeaderInspector({ headers }: HeaderInspectorProps) {
  const entries = Object.entries(headers);
  if (entries.length === 0) return null;

  return (
    <div className="header-inspector">
      <h4>HTTP trace headers</h4>
      <dl>
        {entries.map(([name, value]) => (
          <div className="header-row" key={name}>
            <dt>{name}</dt>
            <dd>
              <code>{value}</code>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
