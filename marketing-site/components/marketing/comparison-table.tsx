type ComparisonRow = {
  category: string;
  oasis: string;
  competitor: string;
};

export function ComparisonTable({
  title,
  intro,
  competitorName,
  categoryLabel = "Category",
  oasisLabel = "OASIS Rental",
  rows,
}: {
  title: string;
  intro?: string;
  competitorName: string;
  categoryLabel?: string;
  oasisLabel?: string;
  rows: ComparisonRow[];
}) {
  return (
    <section className="section">
      <div className="container">
        <div className="section-title">
          <h2>{title}</h2>
          {intro ? <p className="muted">{intro}</p> : null}
        </div>
        <div className="card comparison-table-wrap">
          <table className="comparison-table">
            <thead>
              <tr>
                <th>{categoryLabel}</th>
                <th>{oasisLabel}</th>
                <th>{competitorName}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.category}>
                  <td>{row.category}</td>
                  <td>{row.oasis}</td>
                  <td>{row.competitor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
