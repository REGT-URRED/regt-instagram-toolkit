# Bitácora Histórica del Proyecto (Changelog)

Registro metódico del progreso técnico, decisiones de arquitectura y evolución del sistema.

---

## Cambios Realizados
- [2026-11-19] qa: animación Shruggie con progreso acumulado por fase, scroll virtualizado mejorado (31/40 seleccionados en dry-run), mensajes dry-run honestos, timeout de lista 30s, retry de acción; build+lint limpios
- [2026-11-19] [commit] 0851e83 feat: lotes aleatorios por pasada y micro-clics variables
- [2026-11-19] feat: lotes aleatorios por pasada (likes 20-95, comentarios 20-60) y micro-clics con delay aleatorio 8-45 ms; dry-run verificado (lote 29 elegido de 20-40)
- [2026-11-19] [commit] 82d45cf fix: limpieza de comentarios en espanol con clic real de mouse
- [2026-11-19] fix: limpieza de comentarios en español — traducciones bilingües por defecto, merge de diccionarios (en.json ya no pisa es), clic real de mouse (CDP) en botón Eliminar y confirmación; verificado en producción con Brave del sistema (5 comentarios eliminados sin ban signals)
- [2026-11-19] [commit] dc59df8 chore: registrar commits finales en contextbase
- [2026-11-19] [commit] ffde19b feat: elegir navegador y advertir perfil del sistema en el menú
- [2026-11-19] [commit] 8c69a85 feat: aplicar mejoras de usabilidad y migrar a puppeteer-core
- [2026-11-18] feat: list status command and shared account parser
- [2026-11-18] feat: use the markdown list as the living block memory
- [2026-11-18] docs: rewrite README for a one-minute start
- [2026-11-18] feat: simple start menu and automatic browser selection
- [2026-11-18] chore: ignore screenshots and temp artifacts
- [2026-11-18] feat: resumable blocking for large lists
- [2026-11-18] feat: adaptive batches, phase timings and blank-list wait
- [2026-11-18] fix: bound the selection reload retry
- [2026-11-18] perf: reuse one browser session across hybrid batches
- [2026-11-18] docs: record measured selection speed
- [2026-11-19] Implementación del sistema de memoria persistente `contextbase/` para agentes de código y desarrolladores.
- [2026-11-19] feat: mejoras de usabilidad (flag `--no-store`/`--privacy`, `npm run reset`, `reset.js`, fix de `clean` para Windows)
- [2026-11-19] feat: migración de dependencia `puppeteer` → `puppeteer-core` (package.json, package-lock sincronizado, `npm install`; 24.43.1 instalado)
- [2026-11-19] docs: advertencias de `--use-system-profile`/`--no-sandbox` y tabla de qué almacena en README; mención de `--no-store` y `npm run reset`
- [2026-11-19] docs: revisión read-only confirma comportamiento: sin exfiltración; almacena localmente (`.chrome-profile/`, `.state/*.jsonl`)


---

## Cambios por Hacer

- Consolidar pruebas de funcionamiento y despliegue inicial.
- Documentar guías de uso y endpoints principales.

---
*Nota: Registrar siempre cada nueva tarea completada en "Cambios Realizados" y actualizar los ítems pendientes en "Cambios por Hacer".*
