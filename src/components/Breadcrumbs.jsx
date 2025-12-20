import { Link } from "react-router-dom";

export default function Breadcrumbs({ items }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="flex items-center gap-2 text-sm text-slate-500">
        {items.map((item, index) => (
          <li key={index} className="flex items-center gap-2">
            {index > 0 && <span className="text-slate-400">/</span>}

            {item.to ? (
              <Link
                to={item.to}
                className="hover:text-slate-900 focus:outline-none focus-visible:underline"
              >
                {item.label}
              </Link>
            ) : (
              <span className="text-slate-900 font-medium">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
