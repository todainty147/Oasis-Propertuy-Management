export default function DocumentPreview({ document }) {
  if (!document) {
    return (
      <div className="text-sm text-slate-500">
        Brak danych dokumentu.
      </div>
    );
  }

  const { mime_type, publicUrl, name } = document;

  if (mime_type?.startsWith("image/") && publicUrl) {
    return (
      <img
        src={publicUrl}
        alt={name}
        className="max-h-[80vh] mx-auto"
      />
    );
  }

  if (mime_type === "application/pdf" && publicUrl) {
    return (
      <iframe
        src={publicUrl}
        className="w-full h-[80vh]"
        title={name}
      />
    );
  }

  return (
    <div className="text-sm text-slate-500">
      Podgląd niedostępny. Pobierz plik.
    </div>
  );
}
