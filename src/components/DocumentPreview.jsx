export default function DocumentPreview({ document }) {
  const { mime_type, publicUrl } = document;

  if (mime_type.startsWith("image/")) {
    return (
      <img
        src={publicUrl}
        alt={document.name}
        className="max-h-[80vh] mx-auto"
      />
    );
  }

  if (mime_type === "application/pdf") {
    return (
      <iframe
        src={publicUrl}
        className="w-full h-[80vh]"
        title={document.name}
      />
    );
  }

  return (
    <div className="text-sm text-slate-500">
      Podgląd niedostępny. Pobierz plik.
    </div>
  );
}
