// Aviso ámbar de los documentos legales que aún son borrador (pendiente E3).
export function AvisoBorrador() {
  return (
    <p
      role="note"
      className="my-3 rounded-md border border-alta-punto/50 bg-alta-fondo px-3 py-2 text-sm font-medium text-alta"
    >
      BORRADOR — pendiente de revisión
    </p>
  );
}
