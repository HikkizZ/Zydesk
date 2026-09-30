import { Button } from '@/components/ui/button';
import { ErrorApi } from '@/lib/api';

export function mensajeDeError(error: unknown): string {
  if (error instanceof ErrorApi) return error.message;
  return 'No se pudo conectar. Intenta de nuevo.';
}

export function EstadoError({ error, reintentar }: { error: unknown; reintentar?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-lg border border-urgente-punto/40 bg-urgente-fondo p-4 text-urgente"
    >
      <p>{mensajeDeError(error)}</p>
      {reintentar ? (
        <Button variant="outline" size="sm" onClick={reintentar}>
          Reintentar
        </Button>
      ) : null}
    </div>
  );
}
