import { z } from 'zod';

export const esquemaPaginacion = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  por_pagina: z.coerce.number().int().min(1).max(200).default(50),
});

export function paginar<T>(
  datos: T[],
  total: number,
  q: { pagina: number; por_pagina: number },
): { datos: T[]; total: number; pagina: number; por_pagina: number } {
  return { datos, total, pagina: q.pagina, por_pagina: q.por_pagina };
}
