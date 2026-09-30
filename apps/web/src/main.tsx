import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { z } from 'zod';
import { Proveedores } from './app/proveedores';
import { router } from './app/router';
import './estilos/fuentes.css';
import './estilos/tema.css';

// Mensajes de validación de Zod en español (los esquemas de `shared` se reutilizan en los formularios).
z.config(z.locales.es());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Proveedores>
      <RouterProvider router={router} />
    </Proveedores>
  </StrictMode>,
);
