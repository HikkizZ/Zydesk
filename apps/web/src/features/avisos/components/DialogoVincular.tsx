import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { EstadoError, mensajeDeError } from '@/components/dominio/EstadoError';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { clavesAvisos, generarCodigo, telegram } from '../api';

const SONDEO_MS = 3000;
const CIERRE_MS = 2500;

// OBS-3: el enlace lo arma la API; igual solo se muestra si apunta a t.me por https
const esEnlaceTelegram = (enlace: string | null): enlace is string =>
  enlace !== null && enlace.startsWith('https://t.me/');

const CONSULTA_ESCRITORIO = '(min-width: 768px)';

// El QR solo sirve donde se puede escanear con otro dispositivo (≥ 768 px). Sin `matchMedia` (jsdom) se asume escritorio.
function useEscritorio(): boolean {
  return useSyncExternalStore(
    (avisar) => {
      if (typeof window.matchMedia !== 'function') return () => {};
      const mq = window.matchMedia(CONSULTA_ESCRITORIO);
      mq.addEventListener('change', avisar);
      return () => mq.removeEventListener('change', avisar);
    },
    () => typeof window.matchMedia !== 'function' || window.matchMedia(CONSULTA_ESCRITORIO).matches,
    () => true,
  );
}

// El SVG lo genera `qrcode` en el navegador a partir del enlace ya validado y se muestra como `<img>` con data URI:
// sin `dangerouslySetInnerHTML` y, dentro de un `<img>`, el SVG no ejecuta scripts.
function CodigoQr({ enlace }: { enlace: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let vigente = true;
    QRCode.toString(enlace, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
      .then((svg) => {
        if (vigente) setSrc(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
      })
      .catch(() => {
        if (vigente) setSrc(null);
      });
    return () => {
      vigente = false;
    };
  }, [enlace]);
  if (!src) return null;
  return (
    <div className="flex flex-col items-center gap-2">
      <img
        src={src}
        alt="Código QR para vincular Telegram"
        width={200}
        height={200}
        className="size-[200px] rounded-md bg-white"
      />
      <p className="text-sm text-tinta-2">Escanéalo con la cámara de tu celular</p>
    </div>
  );
}

function formatearRestante(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const min = Math.floor(total / 60);
  return `${min}:${String(total % 60).padStart(2, '0')}`;
}

// Vive solo mientras el diálogo está abierto: genera el código al montarse y sondea el estado cada 3 s.
function ContenidoVincular({
  alCerrar,
  yaVinculado,
}: {
  alCerrar: () => void;
  yaVinculado: boolean;
}) {
  const queryClient = useQueryClient();
  const [previo] = useState(yaVinculado); // el valor al abrir, no el que cambia al vincular
  const escritorio = useEscritorio();
  const [ahora, setAhora] = useState(() => Date.now());
  const generado = useRef(false);
  const cerrar = useRef(alCerrar);
  useEffect(() => {
    cerrar.current = alCerrar;
  });
  const codigo = useMutation({ mutationFn: generarCodigo });
  const { mutate: generar } = codigo;
  const estado = useQuery({
    queryKey: clavesAvisos.telegram,
    queryFn: telegram,
    refetchInterval: SONDEO_MS,
  });
  // Con vínculo previo (sesión del bot caducada) el éxito es que la sesión vuelva a estar activa.
  const vinculado = estado.data?.vinculado === true && (!previo || estado.data.sesion_bot_activa);

  useEffect(() => {
    if (generado.current) return;
    generado.current = true;
    generar();
  }, [generar]);

  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!vinculado) return;
    void queryClient.invalidateQueries({ queryKey: clavesAvisos.preferencias });
    const t = setTimeout(() => cerrar.current(), CIERRE_MS);
    return () => clearTimeout(t);
  }, [vinculado, queryClient]);

  if (vinculado) {
    const usuario = estado.data?.telegram_usuario;
    return (
      <p role="status" className="py-4 text-center font-medium text-resuelto">
        {usuario ? `¡Listo! Vinculado como @${usuario}` : '¡Listo! Vinculado'}
      </p>
    );
  }

  if (codigo.isError) {
    return <EstadoError error={codigo.error} reintentar={() => generar()} />;
  }

  const datos = codigo.data;
  const restante = datos ? new Date(datos.expira_en).getTime() - ahora : 0;
  const expirado = datos !== undefined && restante <= 0;
  const enlaceValido = datos !== undefined && esEnlaceTelegram(datos.enlace);

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success('Código copiado');
    } catch (err) {
      toast.error(mensajeDeError(err));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {datos ? (
        <>
          <div className="flex flex-col items-center gap-4 rounded-lg bg-superficie-suave p-4 md:flex-row md:justify-center md:gap-8">
            {escritorio && enlaceValido ? <CodigoQr enlace={datos.enlace!} /> : null}
            <div className="flex flex-col items-center gap-2">
              <p
                data-testid="codigo-vinculo"
                className="font-mono text-3xl font-bold tracking-widest"
                aria-label="Código de vinculación"
              >
                {datos.codigo}
              </p>
              <p className="text-sm text-tinta-2" aria-live="off">
                {expirado ? 'El código expiró' : `Expira en ${formatearRestante(restante)}`}
              </p>
              <Button variant="outline" size="sm" onClick={() => void copiar(datos.codigo)}>
                Copiar
              </Button>
              {enlaceValido ? (
                <Button asChild size="sm">
                  <a href={datos.enlace!} target="_blank" rel="noreferrer">
                    Abrir en Telegram
                  </a>
                </Button>
              ) : null}
            </div>
          </div>
          <p className="text-sm text-tinta-2">
            No compartas este código ni el QR: vence en 10 minutos y sirve una sola vez.
          </p>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>Abre el bot</li>
            <li>
              Envía <code className="font-mono">/vincular {datos.codigo}</code>
            </li>
          </ol>
        </>
      ) : (
        <p role="status" className="py-6 text-center text-tinta-2">
          Generando código…
        </p>
      )}
      <Button variant="outline" disabled={codigo.isPending} onClick={() => generar()}>
        Generar otro código
      </Button>
    </div>
  );
}

export function DialogoVincular({
  abierto,
  yaVinculado,
  alCambiar,
}: {
  abierto: boolean;
  yaVinculado: boolean;
  alCambiar: (abierto: boolean) => void;
}) {
  return (
    <Dialog open={abierto} onOpenChange={alCambiar}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Vincular Telegram</DialogTitle>
          <DialogDescription>
            Usa este código en el bot para recibir tus avisos por Telegram.
          </DialogDescription>
        </DialogHeader>
        <ContenidoVincular alCerrar={() => alCambiar(false)} yaVinculado={yaVinculado} />
      </DialogContent>
    </Dialog>
  );
}
