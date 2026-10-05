import { Link } from 'react-router';
import { EstadoVacio } from '@/components/dominio/EstadoVacio';
import { Monto } from '@/components/dominio/Monto';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { FilaClienteDatos } from '../api';
import { numeroHoras } from '../formato';

const NUM = 'text-right tabular-nums';

function MontoONulo({ valor, destacar }: { valor: number | null; destacar?: boolean }) {
  if (valor === null) return <span className="text-tinta-3">—</span>;
  return <Monto valor={valor} className={cn(destacar && valor > 0 && 'font-semibold text-alta')} />;
}

function Fila({ f }: { f: FilaClienteDatos }) {
  return (
    <TableRow>
      <TableCell className="font-medium">
        {f.cliente && !f.interno ? (
          <Link
            to={`/clientes/${f.cliente.id}`}
            className="text-acento underline underline-offset-2"
          >
            {f.nombre}
          </Link>
        ) : (
          <span className={cn(f.cliente === null && 'italic')}>{f.nombre}</span>
        )}
      </TableCell>
      <TableCell className={NUM}>{f.abiertos}</TableCell>
      <TableCell className={NUM}>{f.cerrados}</TableCell>
      <TableCell className={NUM}>{numeroHoras(f.horas)} h</TableCell>
      <TableCell className={NUM}>
        <MontoONulo valor={f.facturado} />
      </TableCell>
      <TableCell className={NUM}>
        <MontoONulo valor={f.por_facturar} destacar />
      </TableCell>
    </TableRow>
  );
}

const sumar = (valores: (number | null)[]) => valores.reduce<number>((a, v) => a + (v ?? 0), 0);

// Tabla por cliente (spec fase 7 §4.11): «Interno» y «Sin cliente» no tienen montos.
export function TablaPorCliente({ filas }: { filas: FilaClienteDatos[] }) {
  return (
    <section aria-labelledby="titulo-por-cliente" className="space-y-3">
      <h2 id="titulo-por-cliente" className="font-titulo text-lg font-semibold">
        Por cliente
        <span className="block text-sm font-normal text-tinta-2">
          Abiertos y por facturar son de hoy; el resto, del período
        </span>
      </h2>
      {filas.length === 0 ? (
        <EstadoVacio titulo="Nada que mostrar con estos filtros" />
      ) : (
        <div className="rounded-lg border border-borde bg-superficie">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead className={NUM}>Abiertos</TableHead>
                <TableHead className={NUM}>Cerrados</TableHead>
                <TableHead className={NUM}>Horas</TableHead>
                <TableHead className={NUM}>Facturado</TableHead>
                <TableHead className={NUM}>Por facturar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.map((f) => (
                <Fila key={f.cliente?.id ?? f.nombre} f={f} />
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-semibold">Total</TableCell>
                <TableCell className={NUM}>{filas.reduce((a, f) => a + f.abiertos, 0)}</TableCell>
                <TableCell className={NUM}>{filas.reduce((a, f) => a + f.cerrados, 0)}</TableCell>
                <TableCell className={NUM}>
                  {numeroHoras(Math.round(sumar(filas.map((f) => f.horas)) * 100) / 100)} h
                </TableCell>
                <TableCell className={NUM}>
                  <Monto valor={sumar(filas.map((f) => f.facturado))} />
                </TableCell>
                <TableCell className={NUM}>
                  <Monto valor={sumar(filas.map((f) => f.por_facturar))} />
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
    </section>
  );
}
