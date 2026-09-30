import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  NumeracionEntrada,
  type NumeracionSalidaDatos,
  type NumeracionEntradaDatos,
} from '@zydesk/shared';
import { useState } from 'react';
import { toast } from 'sonner';
import { Cargando } from '@/components/dominio/Cargando';
import { EstadoError, mensajeDeError } from '@/components/dominio/EstadoError';
import { EstadoVacio } from '@/components/dominio/EstadoVacio';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useYo } from '@/features/auth/SesionProvider';
import { EstadoSistema } from '@/features/salud/EstadoSistema';
import { ErrorApi } from '@/lib/api';
import { formatearFechaHora } from '@/lib/fechas';
import {
  guardarMarca,
  guardarNumeracion,
  historialNumeracion,
  numeracion,
  quitarLogo,
  subirLogo,
} from './api';
import { Seleccion } from './Seleccion';
import { Tarjeta } from './Tarjeta';

const TAMANO_MAXIMO_LOGO = 200 * 1024;
const TIPOS_LOGO = ['image/png', 'image/jpeg', 'image/svg+xml'] as const;
type TipoLogo = (typeof TIPOS_LOGO)[number];

async function aBase64(archivo: File): Promise<string> {
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  let binario = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binario);
}

function Marca() {
  const yo = useYo();
  const queryClient = useQueryClient();
  const [nombre, setNombre] = useState(yo.nombre_app);
  const [errorNombre, setErrorNombre] = useState<string | null>(null);
  const [errorLogo, setErrorLogo] = useState<string | null>(null);
  // el logo vive siempre en la misma URL: se cambia `v` para que la vista previa no use una copia vieja
  const [version, setVersion] = useState(() => Date.now());

  const refrescar = async () => {
    setVersion(Date.now());
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['yo'] }),
      queryClient.invalidateQueries({ queryKey: ['marca'] }),
    ]);
  };

  const guardar = useMutation({
    mutationFn: () => guardarMarca({ nombre_app: nombre }),
    onSuccess: async () => {
      toast.success('Nombre guardado');
      await refrescar();
    },
    onError: (err) => setErrorNombre(mensajeDeError(err)),
  });
  const subir = useMutation({
    mutationFn: subirLogo,
    onSuccess: async () => {
      toast.success('Logo guardado');
      await refrescar();
    },
    onError: (err) => setErrorLogo(mensajeDeError(err)),
  });
  const quitar = useMutation({
    mutationFn: quitarLogo,
    onSuccess: async () => {
      toast.success('Logo quitado');
      await refrescar();
    },
    onError: (err) => setErrorLogo(mensajeDeError(err)),
  });

  async function alElegirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    setErrorLogo(null);
    if (!archivo) return;
    if (!TIPOS_LOGO.includes(archivo.type as TipoLogo)) {
      setErrorLogo('El logo debe ser PNG, JPEG o SVG');
      return;
    }
    if (archivo.size > TAMANO_MAXIMO_LOGO) {
      setErrorLogo('El logo no puede pesar más de 200 KB');
      return;
    }
    subir.mutate({ tipo_mime: archivo.type as TipoLogo, base64: await aBase64(archivo) });
  }

  return (
    <Tarjeta titulo="Marca">
      <div className="flex flex-col gap-6">
        <form
          noValidate
          className="flex max-w-md flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setErrorNombre(null);
            if (nombre.trim() === '') {
              setErrorNombre('Escribe el nombre visible');
              return;
            }
            guardar.mutate();
          }}
        >
          <Label htmlFor="marca-nombre">Nombre visible</Label>
          <div className="flex gap-2">
            <Input
              id="marca-nombre"
              maxLength={40}
              value={nombre}
              aria-invalid={errorNombre !== null}
              onChange={(e) => setNombre(e.target.value)}
            />
            <Button type="submit" disabled={guardar.isPending}>
              Guardar
            </Button>
          </div>
          {errorNombre ? (
            <p role="alert" className="text-sm text-urgente">
              {errorNombre}
            </p>
          ) : null}
        </form>

        <div className="flex flex-col gap-2">
          <Label htmlFor="marca-logo">Logo</Label>
          <div className="flex flex-wrap items-center gap-4">
            {yo.logo_url ? (
              <img
                src={`${yo.logo_url}?v=${version}`}
                alt="Logo actual"
                className="h-12 max-w-40 rounded border border-borde bg-white object-contain p-1"
              />
            ) : (
              <span className="text-sm text-tinta-2">Sin logo</span>
            )}
            <Input
              id="marca-logo"
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
              className="max-w-xs"
              onChange={(e) => void alElegirArchivo(e)}
            />
            {yo.logo_url ? (
              <Button
                type="button"
                variant="outline"
                disabled={quitar.isPending}
                onClick={() => quitar.mutate()}
              >
                Quitar logo
              </Button>
            ) : null}
          </div>
          <p className="text-sm text-tinta-2">PNG, JPEG o SVG de hasta 200 KB.</p>
          {errorLogo ? (
            <p role="alert" className="text-sm text-urgente">
              {errorLogo}
            </p>
          ) : null}
        </div>
      </div>
    </Tarjeta>
  );
}

type Clave = 'ticket' | 'ot';

interface FilaForm {
  prefijo: string;
  inicial: string;
  digitos: string;
  modo: 'correlativo' | 'aleatorio';
}

function codigo(prefijo: string, numero: number, digitos: number): string {
  return `${prefijo}${String(numero).padStart(digitos, '0')}`;
}

function aEntrada(f: Record<Clave, FilaForm>): unknown {
  return {
    ticket: {
      prefijo: f.ticket.prefijo,
      inicial: f.ticket.inicial === '' ? NaN : Number(f.ticket.inicial),
      digitos: Number(f.ticket.digitos),
      modo: f.ticket.modo,
    },
    ot: {
      prefijo: f.ot.prefijo,
      inicial: f.ot.inicial === '' ? NaN : Number(f.ot.inicial),
      digitos: Number(f.ot.digitos),
    },
  };
}

const TITULO_CLAVE: Record<Clave, string> = { ticket: 'Tickets', ot: 'Órdenes de trabajo (OT)' };

export function FormularioNumeracion({ datos }: { datos: NumeracionSalidaDatos }) {
  const queryClient = useQueryClient();
  const [filas, setFilas] = useState<Record<Clave, FilaForm>>({
    ticket: {
      prefijo: datos.ticket.prefijo,
      inicial: String(datos.ticket.inicial),
      digitos: String(datos.ticket.digitos),
      modo: datos.ticket.modo,
    },
    ot: {
      prefijo: datos.ot.prefijo,
      inicial: String(datos.ot.inicial),
      digitos: String(datos.ot.digitos),
      modo: 'correlativo',
    },
  });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [confirmando, setConfirmando] = useState(false);
  const [entrada, setEntrada] = useState<NumeracionEntradaDatos | null>(null);

  const cambiar = (clave: Clave, cambios: Partial<FilaForm>) =>
    setFilas((f) => ({ ...f, [clave]: { ...f[clave], ...cambios } }));

  const guardar = useMutation({
    mutationFn: guardarNumeracion,
    onSuccess: async () => {
      toast.success('Numeración guardada');
      await queryClient.invalidateQueries({ queryKey: ['numeracion'] });
    },
    onError: (err) => {
      if (err instanceof ErrorApi && err.codigo.startsWith('NUMERACION_')) {
        const campo = err.detalles?.['campo'];
        setErrores({ [typeof campo === 'string' ? campo : 'general']: err.message });
      } else setErrores({ general: mensajeDeError(err) });
    },
  });

  function pedirConfirmacion() {
    setErrores({});
    const resultado = NumeracionEntrada.safeParse(aEntrada(filas));
    if (!resultado.success) {
      setErrores({ general: 'Revisa el prefijo, el número inicial y los dígitos (entre 3 y 8)' });
      return;
    }
    setEntrada(resultado.data);
    setConfirmando(true);
  }

  const claves: Clave[] = ['ticket', 'ot'];

  return (
    <Tarjeta titulo="Numeración">
      <div className="flex flex-col gap-6">
        {claves.map((clave) => {
          const f = filas[clave];
          const estado = datos[clave];
          const inicial = Number(f.inicial);
          const digitos = Number(f.digitos);
          const aleatorio = clave === 'ticket' && f.modo === 'aleatorio';
          const valido = f.inicial !== '' && Number.isInteger(inicial) && inicial >= 0;
          let proximo = '—';
          if (valido && aleatorio) {
            proximo = `aleatorio entre ${codigo(f.prefijo, inicial, digitos)} y ${codigo(f.prefijo, 10 ** digitos - 1, digitos)}`;
          } else if (valido) {
            const siguiente =
              estado.ultimo_usado === null ? inicial : Math.max(inicial, estado.ultimo_usado + 1);
            proximo = codigo(f.prefijo, siguiente, digitos);
          }
          const error = (campo: string) => errores[`${clave}.${campo}`];
          return (
            <fieldset key={clave} className="flex flex-col gap-3">
              <legend className="mb-1 font-medium">{TITULO_CLAVE[clave]}</legend>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${clave}-prefijo`}>Prefijo</Label>
                  <Input
                    id={`${clave}-prefijo`}
                    maxLength={10}
                    value={f.prefijo}
                    aria-invalid={Boolean(error('prefijo'))}
                    onChange={(e) => cambiar(clave, { prefijo: e.target.value })}
                  />
                  {error('prefijo') ? (
                    <p role="alert" className="text-sm text-urgente">
                      {error('prefijo')}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${clave}-inicial`}>Número inicial</Label>
                  <Input
                    id={`${clave}-inicial`}
                    type="number"
                    min={0}
                    value={f.inicial}
                    aria-invalid={Boolean(error('inicial'))}
                    onChange={(e) => cambiar(clave, { inicial: e.target.value })}
                  />
                  {error('inicial') ? (
                    <p role="alert" className="text-sm text-urgente">
                      {error('inicial')}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${clave}-digitos`}>Dígitos</Label>
                  <Seleccion
                    id={`${clave}-digitos`}
                    valor={f.digitos}
                    alCambiar={(digitos) => cambiar(clave, { digitos })}
                    invalido={Boolean(error('digitos'))}
                    opciones={[3, 4, 5, 6, 7, 8].map((n) => ({
                      valor: String(n),
                      etiqueta: String(n),
                    }))}
                  />
                  {error('digitos') ? (
                    <p role="alert" className="text-sm text-urgente">
                      {error('digitos')}
                    </p>
                  ) : null}
                </div>
                {clave === 'ticket' ? (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="ticket-modo">Modo</Label>
                    <Seleccion
                      id="ticket-modo"
                      valor={f.modo}
                      alCambiar={(modo) => cambiar(clave, { modo: modo as FilaForm['modo'] })}
                      opciones={[
                        { valor: 'correlativo', etiqueta: 'Correlativo' },
                        { valor: 'aleatorio', etiqueta: 'Aleatorio' },
                      ]}
                    />
                  </div>
                ) : null}
              </div>
              <p className="text-sm">Próximo: {proximo}</p>
              {aleatorio ? (
                <p className="text-sm text-tinta-2">
                  {estado.usados} usados / {estado.capacidad} de capacidad
                </p>
              ) : null}
              {aleatorio && estado.advertencia ? (
                <p
                  role="status"
                  className="rounded-md border border-alta-punto/40 bg-alta-fondo px-3 py-2 text-sm text-alta"
                >
                  Ya se usó la mitad o más de los números disponibles. Sube los dígitos antes de que
                  se agoten.
                </p>
              ) : null}
            </fieldset>
          );
        })}
        <p className="text-sm text-tinta-2">COT- deriva de la OT (COT-0218 v1)</p>
        {errores['general'] ? (
          <p role="alert" className="text-sm text-urgente">
            {errores['general']}
          </p>
        ) : null}
        <div>
          <Button type="button" disabled={guardar.isPending} onClick={pedirConfirmacion}>
            Guardar numeración
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Guardar la numeración?</AlertDialogTitle>
            <AlertDialogDescription>
              Los cambios solo afectan a códigos futuros
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (entrada) guardar.mutate(entrada);
              }}
            >
              Guardar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Tarjeta>
  );
}

function Historial() {
  const consulta = useQuery({
    queryKey: ['numeracion', 'historial'],
    queryFn: historialNumeracion,
  });
  let contenido;
  if (consulta.isPending) contenido = <Cargando />;
  else if (consulta.isError) {
    contenido = <EstadoError error={consulta.error} reintentar={() => void consulta.refetch()} />;
  } else if (consulta.data.length === 0) {
    contenido = <EstadoVacio titulo="Aún no hay cambios de numeración" />;
  } else {
    contenido = (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha y hora</TableHead>
              <TableHead>Quién</TableHead>
              <TableHead>Numeración</TableHead>
              <TableHead>Antes</TableHead>
              <TableHead>Después</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {consulta.data.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="whitespace-nowrap">
                  {formatearFechaHora(e.creado_en)}
                </TableCell>
                <TableCell>{e.autor?.nombre ?? '—'}</TableCell>
                <TableCell>{e.entidad_id === 'ot' ? 'OT' : 'Tickets'}</TableCell>
                <TableCell>{e.valor_anterior ?? '—'}</TableCell>
                <TableCell>{e.valor_nuevo ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }
  return <Tarjeta titulo="Historial de cambios de numeración">{contenido}</Tarjeta>;
}

export function NumeracionTab() {
  const consulta = useQuery({ queryKey: ['numeracion'], queryFn: numeracion });

  return (
    <div className="flex flex-col gap-6">
      <Marca />
      {consulta.isPending ? (
        <Cargando />
      ) : consulta.isError ? (
        <EstadoError error={consulta.error} reintentar={() => void consulta.refetch()} />
      ) : (
        <FormularioNumeracion datos={consulta.data} />
      )}
      <Historial />
      <div className="max-w-xl">
        <EstadoSistema />
      </div>
    </div>
  );
}
