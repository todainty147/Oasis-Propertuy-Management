export default function DocumentPreview({ document }) {
  if (!document) {
    return (
      <div className="text-sm text-slate-500">
        Brak danych dokumentu.
      </div>
    );
  }

  const { mime_type, signedUrl, name } = document;

  if (mime_type?.startsWith("image/") && signedUrl) {
    return (
      <img
        src={signedUrl}
        alt={name}
        className="max-h-[80vh] mx-auto"
      />
    );
  }

  if (mime_type === "application/pdf" && signedUrl) {
    return (
      <iframe
        src={signedUrl}
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
