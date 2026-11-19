# Fundamentos del Proyecto: regt-instagram-toolkit

## 1. Objetivo Principal
Clean Instagram likes and comments, and block ad accounts from a community-maintained list.

Este documento establece las bases arquitectónicas, directivas operativas y contexto técnico esencial para mantener la coherencia y calidad a través de múltiples sesiones de trabajo y entre diversos agentes de código o desarrolladores.

---

## 2. Reglas de Desarrollo y Buenas Prácticas
1. **Regla Crítica de Actualización (Obligatoria):**
   - Toda corrección, mejora, alteración o nueva implementación en el código debe concluir **siempre y de manera obligatoria** con la actualización de los registros dentro de `contextbase/` (`changelog.md`, `tasklist.md` y este documento si hay cambios estructurales).
2. **Minimalismo y Simplicidad:**
   - Evitar complejidad accidental, dependencias innecesarias o abstracciones prematuras.
   - Preferir soluciones limpias, mantenibles y de ejecución directa.
3. **Calidad de Código y Estilo:**
   - Mantener consistencia en el estilo, tipado y convenciones del proyecto.
   - No dejar código muerto ni archivos huérfanos.
4. **Idioma de Documentación:**
   - Todas las notas técnicas, bitácoras y registros en `contextbase/` deben mantenerse estrictamente en **español**.
5. **Mantenimiento Preventivo Automático:**
   - Revisar `contextbase/componentes.md` al iniciar un proyecto o sesión, y regenerarlo con `contextbase audit` como verificación final al cerrar cada cambio (estado de componentes y brechas de seguridad).

---

## 3. Arquitectura y Contexto Técnico General
- **Nombre:** `regt-instagram-toolkit`
- **Versión:** `1.0.0`
- **Tipo de Ecosistema:** Node.js / JavaScript / TypeScript
- **Tecnologías y Frameworks Clave:** Librerías estándar / Vanilla
- **Lenguajes Dominantes:** TypeScript (53 archivos), JSON (7 archivos), Markdown (2 archivos), JavaScript (1 archivos)
- **Dependencias Principales:** puppeteer-core, yargs
- **Almacenamiento local del toolkit (2026-11-19):** `.chrome-profile/` (perfil Chrome: sesión/cookies de Instagram), `.state/mutations.jsonl` (payloads crudos de comentarios ≤4KB), `.state/ledger.jsonl` (firmas), `.state/block-ledger.jsonl`, `.state/block-failures.json`; flag `--no-store` (alias `--privacy`) evita escribir los JSONL de `.state/`; `npm run reset` borra `dist/`, `.state/`, `.chrome-profile/`.
- **Estado de Componentes y Seguridad:** `contextbase/componentes.md` (inventario, frescura de versiones y brechas; regenerar con `contextbase audit`)

### Comandos de Ejecución y Scripts Disponibles:
- `npm run build`: `tsc`
- `npm run start`: `npm run build --silent && node ./dist/start.js`
- `npm run likes`: `npm run build --silent && node ./dist/cli.js --likes`
- `npm run comments`: `npm run build --silent && node ./dist/cli.js --comments`
- `npm run block`: `npm run build --silent && node ./dist/cli.js --block-accounts`
- `npm run clean`: `node -e "require('node:fs').rmSync('dist',{recursive:true,force:true})"`
- `npm run reset`: `node reset.js` (borra `dist/`, `.state/`, `.chrome-profile/`)
- `npm run lint`: `eslint .`
- `npm run lint:fix`: `eslint . --fix`
- `npm run format`: `prettier . --write`
- `npm run format:check`: `prettier . --check`
- `npm run menu`: `npm run build --silent && node ./dist/start.js`
- `npm run list:merge`: `npm run build --silent && node ./dist/mergeList.js`
- `npm run list:count`: `npm run build --silent && node ./dist/listCount.js`

---

## 4. Mapa de Estructura de Directorios Clave
```
regt-instagram-toolkit/
├── contextbase/               # Memoria técnica persistente y bitácora
├── contextbase/
├── src/
├── translations/
```

<!-- CONTEXTBASE:SYNC:START -->
## Contexto Técnico Sincronizado (auto)
> Generado por `contextbase sync`. No editar dentro de este bloque: se reemplaza completo.
- **Versión:** 1.0.0
- **Ecosistema:** Node.js / JavaScript / TypeScript
- **Frameworks:** Librerías estándar / Vanilla
- **Lenguajes dominantes:** TypeScript (56), Markdown (18), JSON (15), Python (4), JavaScript (3)
- **Dependencias:** puppeteer-core, yargs
- **Scripts:** build, start, likes, comments, block, clean, reset, lint, lint:fix, format, format:check, menu, list:merge, list:count
- **Directorios raíz:** .agents, .kilo, .kilocode, .opencode, contextbase, src, translations
<!-- CONTEXTBASE:SYNC:END -->

---
*Generado automáticamente por ContextBase CLI el 19/11/2026.*
