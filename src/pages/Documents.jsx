import Skeleton from "../components/ui/Skeleton";
import { useEffect } from "react";
import { usePageTitle } from "../layout/PageTitleContext";

/* ======================
   SKELETON
   ====================== */

function DocumentsSkeleton() {
  return (
    <div className="space-y-6">
      {/* Action row */}
      <div className="flex justify-end">
        <Skeleton className="h-10 w-36" />
      </div>

      {/* Document rows */}
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    </div>
  );
}

/* ======================
   DOCUMENTS
   ====================== */

export default function Documents({
  loading = false,
  documents = [],
  onUpload,
  onDelete,
}) {
  /* ---------- PAGE TITLE ---------- */
  const { setTitle } = usePageTitle();

  useEffect(() => {
    setTitle("Dokumenty");
  }, [setTitle]);

  /* ---------- LOADING ---------- */
  if (loading) {
    return <DocumentsSkeleton />;
  }

  /* ---------- EMPTY STATE ---------- */
  if (documents.length === 0) {
    return (
      <div className="text-center py-20">
        <h3 className="text-xl font-semibold text-slate-900">
          Brak dokumentów
        </h3>
        <p className="text-slate-500 mt-2">
          Dodaj pierwszy dokument
        </p>
        <button
          onClick={onUpload}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg"
        >
          Dodaj dokument
        </button>
      </div>
    );
  }

  /* ---------- CONTENT ---------- */
  return (
    <div className="space-y-6">
      {/* Action bar (no duplicated title) */}
      <div className="flex justify-end">
        <button
          onClick={onUpload}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg"
        >
          Dodaj dokument
        </button>
      </div>

      {/* Documents list */}
      <div className="divide-y bg-white border rounded-xl">
        {documents.map((doc) => (
          <div
            key={doc.id}
            className="px-6 py-4 flex justify-between items-center"
          >
            <div>
              <p className="font-medium">{doc.name}</p>
              <p className="text-sm text-slate-500">
                {doc.type} • {doc.size}
              </p>
            </div>

            <button
              onClick={() => onDelete(doc.id)}
              className="text-sm text-red-600 hover:underline"
            >
              Usuń
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
