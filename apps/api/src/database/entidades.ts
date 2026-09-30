import { Configuracion } from '../core/config/configuracion.entity.js';
import { Auditoria } from '../core/historial/auditoria.entity.js';
import { Evento } from '../core/historial/evento.entity.js';
import { Contador } from '../core/numeracion/contador.entity.js';
import { Sesion } from '../modulos/auth/sesion.entity.js';
import { Categoria } from '../modulos/categorias/categoria.entity.js';
import { Cliente } from '../modulos/clientes/cliente.entity.js';
import { Contacto } from '../modulos/clientes/contacto.entity.js';
import { ContratoBolsa } from '../modulos/clientes/contrato-bolsa.entity.js';
import { TarifaCliente } from '../modulos/clientes/tarifa-cliente.entity.js';
import { Departamento } from '../modulos/departamentos/departamento.entity.js';
import { Feriado } from '../modulos/departamentos/feriado.entity.js';
import { HorarioDia } from '../modulos/departamentos/horario-dia.entity.js';
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
];
