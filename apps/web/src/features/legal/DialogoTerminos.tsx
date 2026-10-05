import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Cargando } from '@/components/dominio/Cargando';
import { EstadoError, mensajeDeError } from '@/components/dominio/EstadoError';
import { aceptarTerminos, salir } from '@/features/auth/api';
import { useSesion } from '@/features/auth/SesionProvider';
import { AvisoBorrador } from './AvisoBorrador';
import { documentoLegal } from './api';
import { Markdown } from './Markdown';

// Diálogo bloqueante: no se cierra con Esc ni al hacer clic fuera. Una sola aceptación cubre
// Términos de uso y Política de privacidad (ADR 0018 punto 6).
export function DialogoTerminos() {
  const { recargar } = useSesion();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [leido, setLeido] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const consulta = useQuery({
    queryKey: ['legal', 'terminos'],
    queryFn: () => documentoLegal('terminos'),
  });

  async function aceptar(version: string) {
    setEnviando(true);
    setError(null);
    try {
      await aceptarTerminos(version);
      await recargar();
      // Las consultas de la página de fondo fallaron con «términos pendientes» mientras el diálogo
      // estaba abierto: se vuelven a pedir.
      void queryClient.invalidateQueries();
    } catch (err) {
      setError(mensajeDeError(err));
      setEnviando(false);
    }
  }

  async function cerrarSesion() {
    try {
      await salir();
    } finally {
      queryClient.clear();
      queryClient.setQueryData(['yo'], null);
      void navigate('/ingresar', { replace: true });
    }
  }

  return (
    <AlertDialog open>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Términos de uso y privacidad</AlertDialogTitle>
          <AlertDialogDescription className="sr-only">
            Debes aceptar los términos de uso y la política de privacidad para continuar.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {consulta.isPending ? (
          <Cargando />
        ) : consulta.isError ? (
          <EstadoError error={consulta.error} reintentar={() => void consulta.refetch()} />
        ) : (
          <>
            {consulta.data.borrador ? <AvisoBorrador /> : null}
            <div
              tabIndex={0}
              aria-label="Texto de los términos de uso"
              className="max-h-[60vh] overflow-y-auto rounded-md border border-borde p-4 text-sm"
            >
              <Markdown texto={consulta.data.contenido_md} />
            </div>
            <div className="flex items-start gap-2">
              <Checkbox
                id="terminos-leidos"
                checked={leido}
                onCheckedChange={(v) => setLeido(v === true)}
                className="mt-0.5"
              />
              <Label htmlFor="terminos-leidos" className="leading-snug">
                He leído los Términos de uso y la{' '}
                <a
                  href="/privacidad"
                  target="_blank"
                  rel="noreferrer"
                  className="text-acento underline underline-offset-2"
                >
                  Política de privacidad
                </a>
              </Label>
            </div>
            {error ? (
              <p role="alert" className="text-sm text-urgente">
                {error}
              </p>
            ) : null}
            <AlertDialogFooter>
              <Button variant="outline" onClick={() => void cerrarSesion()}>
                Cerrar sesión
              </Button>
              <Button
                disabled={!leido || enviando}
                onClick={() => void aceptar(consulta.data.version)}
              >
                {enviando ? 'Guardando…' : 'Aceptar y continuar'}
              </Button>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
