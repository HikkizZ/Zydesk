import { seguridad } from '../http/ruta.js';
import { autenticar } from './autenticar.js';
import { csrf } from './csrf.js';
import { requiere } from './requiere.js';

// Conecta los pasos de seguridad de `ruta()`; debe importarse antes de declarar rutas protegidas.
seguridad.csrf = csrf;
seguridad.autenticar = autenticar;
seguridad.requiere = requiere;

export { autenticar, csrf, requiere };
