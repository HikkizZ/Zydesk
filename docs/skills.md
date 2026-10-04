# Skills de Claude Code para Zydesk

Qué skills se usan en este proyecto y cómo instalarlas en otro PC. Requisito: Node 22 (`npx`). Si un `-s` no reconoce el nombre, `npx skills add <repo> -l` lista las skills del repositorio.

> Antes de instalar skills de terceros, revisar su `SKILL.md`: son instrucciones que Claude va a seguir.

---

## 1. Skills globales (entorno personal)

Instaladas en `~/.claude/skills` del PC original (registro en `~/.agents/.skill-lock.json`).

| Skill | Origen |
|---|---|
| vercel-react-best-practices | vercel-labs/agent-skills |
| find-skills | vercel-labs/skills |
| interface-design | dammyjay93/interface-design |
| brainstorming, systematic-debugging | obra/superpowers |
| api-design-principles, nodejs-backend-patterns | wshobson/agents |
| api-design | affaan-m/everything-claude-code |
| conventional-commit | marcelorodrigo/agent-skills |
| typeorm | rolling-scopes/rsschool-app |
| zod-validation-expert | sickn33/antigravity-awesome-skills |
| vitest | supabase/supabase |
| tailwind-v4-shadcn | secondsky/claude-skills |
| spec-driven-development, documentation-and-adrs | addyosmani/agent-skills |
| caveman | juliusbrussee/caveman |
| graphify | paquete Python `graphifyy` |

### Instalación global

```bash
npx skills add vercel-labs/agent-skills -s vercel-react-best-practices -g -a claude-code -y
npx skills add vercel-labs/skills -s find-skills -g -a claude-code -y
npx skills add dammyjay93/interface-design -s interface-design -g -a claude-code -y
npx skills add obra/superpowers -s brainstorming -s systematic-debugging -g -a claude-code -y
npx skills add wshobson/agents -s api-design-principles -s nodejs-backend-patterns -g -a claude-code -y
npx skills add affaan-m/everything-claude-code -s api-design -g -a claude-code -y
npx skills add marcelorodrigo/agent-skills -s conventional-commit -g -a claude-code -y
npx skills add rolling-scopes/rsschool-app -s typeorm -g -a claude-code -y
npx skills add sickn33/antigravity-awesome-skills -s zod-validation-expert -g -a claude-code -y
npx skills add supabase/supabase -s vitest -g -a claude-code -y
npx skills add secondsky/claude-skills -s tailwind-v4-shadcn -g -a claude-code -y
npx skills add addyosmani/agent-skills -s spec-driven-development -s documentation-and-adrs -g -a claude-code -y
npx skills add juliusbrussee/caveman -s caveman -g -a claude-code -y
```

graphify (requiere Python y `uv`):

```bash
uv tool install graphifyy
graphify install --platform claude
```

---

## 2. Skills recomendadas para Zydesk

### Ya incluidas en las globales

| Skill | Uso en Zydesk |
|---|---|
| spec-driven-development | Ciclo por fase: especificación → tareas → código |
| documentation-and-adrs | ADRs, manuales, CHANGELOG |
| typeorm | Entidades, migraciones, transacciones (historial, cierre de OT) |
| nodejs-backend-patterns, api-design | API Express: rutas, errores, paginación |
| zod-validation-expert | Esquemas compartidos en `packages/shared` |
| vitest | Tests en los tres paquetes |
| tailwind-v4-shadcn | Sistema visual (tokens, componentes) |
| vercel-react-best-practices | Rendimiento y patrones de React |
| systematic-debugging | Diagnóstico de errores |
| conventional-commit | Formato de commits |

### Adicionales (a nivel de proyecto)

| Skill | Origen | Uso en Zydesk |
|---|---|---|
| supabase-postgres-best-practices | supabase/agent-skills | Índices, consultas y bloqueos en Postgres (contadores, auditoría). No requiere Supabase. |
| tanstack-query-best-practices | deckardger/tanstack-agent-skills | Caché, sondeo de avisos, invalidación tras mutaciones |
| security-and-hardening | addyosmani/agent-skills | Sesiones, límite de intentos, cabeceras (ADR 0013) |
| web-design-guidelines | vercel-labs/agent-skills | Accesibilidad y UI (objetivos de 44 px, contraste) |
| webapp-testing | anthropics/skills | Pruebas de flujos en el navegador con Playwright |

Para bots de Telegram no hay una skill confiable; en la Fase 6 se usa la documentación de grammY.

### Instalación a nivel de proyecto

Ejecutar dentro de la carpeta del repositorio, **sin `-g`**. Las skills quedan en el repo junto a un `skills-lock.json`; al commitearlos, cualquier PC que clone el proyecto (y los agentes Fable y Sonnet) las tiene.

```bash
npx skills add supabase/agent-skills -s supabase-postgres-best-practices -a claude-code -y
npx skills add deckardger/tanstack-agent-skills -s tanstack-query-best-practices -a claude-code -y
npx skills add addyosmani/agent-skills -s security-and-hardening -a claude-code -y
npx skills add vercel-labs/agent-skills -s web-design-guidelines -a claude-code -y
npx skills add anthropics/skills -s webapp-testing -a claude-code -y
```

Después: commitear la carpeta de skills creada y `skills-lock.json`. En otro PC, tras clonar:

```bash
npx skills experimental_install
```
