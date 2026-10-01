import { Configuracion } from '../core/config/configuracion.entity.js';
import { Auditoria } from '../core/historial/auditoria.entity.js';
import { Evento } from '../core/historial/evento.entity.js';
import { Contador } from '../core/numeracion/contador.entity.js';
import { Archivo } from '../modulos/archivos/archivo.entity.js';
import { Sesion } from '../modulos/auth/sesion.entity.js';
import { Categoria } from '../modulos/categorias/categoria.entity.js';
import { Cliente } from '../modulos/clientes/cliente.entity.js';
import { Cotizacion } from '../modulos/cotizaciones/cotizacion.entity.js';
import { Contacto } from '../modulos/clientes/contacto.entity.js';
import { ContratoBolsa } from '../modulos/clientes/contrato-bolsa.entity.js';
import { TarifaCliente } from '../modulos/clientes/tarifa-cliente.entity.js';
import { PlantillaCotizacion } from '../modulos/configuracion/plantilla-cotizacion.entity.js';
import { PlantillaLinea } from '../modulos/configuracion/plantilla-linea.entity.js';
import { Departamento } from '../modulos/departamentos/departamento.entity.js';
import { Feriado } from '../modulos/departamentos/feriado.entity.js';
import { HorarioDia } from '../modulos/departamentos/horario-dia.entity.js';
import { LineaCotizacion } from '../modulos/cotizaciones/linea-cotizacion.entity.js';
import { RegistroHoras } from '../modulos/horas/registro-horas.entity.js';
import { Mencion } from '../modulos/mensajes/mencion.entity.js';
import { Mensaje } from '../modulos/mensajes/mensaje.entity.js';
import { AprobacionCliente } from '../modulos/ots/aprobacion-cliente.entity.js';
import { Ot } from '../modulos/ots/ot.entity.js';
import { Tarea } from '../modulos/tareas/tarea.entity.js';
import { CorreoAdjunto } from '../modulos/tickets/correo-adjunto.entity.js';
import { TicketResponsable } from '../modulos/tickets/ticket-responsable.entity.js';
import { TicketSeguidor } from '../modulos/tickets/ticket-seguidor.entity.js';
import { Ticket } from '../modulos/tickets/ticket.entity.js';
import { Usuario } from '../modulos/usuarios/usuario.entity.js';

// Registro explícito: un glob de archivos `.entity` no funciona bajo vitest (import nativo de .ts con
// decoradores). Toda entidad nueva se agrega aquí.
export const entidades = [
  Configuracion,
  Auditoria,
  Evento,
  Contador,
  Sesion,
  Categoria,
  Cliente,
  Contacto,
  ContratoBolsa,
  TarifaCliente,
  Departamento,
  Feriado,
  HorarioDia,
  Usuario,
  Archivo,
  Ticket,
  TicketResponsable,
  TicketSeguidor,
  CorreoAdjunto,
  Tarea,
  Mensaje,
  Mencion,
  RegistroHoras,
  Ot,
  AprobacionCliente,
  Cotizacion,
  LineaCotizacion,
  PlantillaCotizacion,
  PlantillaLinea,
];
