export default function DocumentPreviewModal({
  open,
  onClose,
  signedUrl,
  mime,
  name,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl h-[80vh] flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b flex justify-between items-center">
          <h3 className="font-semibold truncate">{name}</h3>
          <button
            onClick={onClose}
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            Zamknij
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto bg-slate-100">
          {mime.startsWith("image/") && (
            <img
              src={signedUrl}
              alt={name}
              className="mx-auto max-h-full object-contain"
            />
          )}

          {mime === "application/pdf" && (
            <iframe
              src={signedUrl}
              title={name}
              className="w-full h-full"
            />
          )}

          {!mime.startsWith("image/") &&
            mime !== "application/pdf" && (
              <div className="p-6 text-center text-slate-500">
                Podgląd niedostępny dla tego typu pliku
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
