# Lista de Tareas Visual (Tasklist)

Seguimiento del estado de tareas con alto contraste visual.

---

## Tareas Completadas

- [x] Creación de carpeta de memoria persistente `contextbase/`
- [x] Generación de documento estructurado `fundamentos.md`
- [x] Creación de bitácora histórica `changelog.md`
- [x] Configuración de lista de tareas visual de alto contraste `tasklist.md`
- [x] Inyección de directivas y reglas críticas para agentes de código (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`)
- [x] Escaneo y análisis retroactivo de los archivos del proyecto (`regt-instagram-toolkit`)

---

## Tareas Pendientes / En Progreso
- [ ] Ejecutar limpieza completa real (likes/comentarios/bloqueo) desde el menu con el nuevo RecoveryPolicy

- [ ] Validar cobertura de pruebas funcionales y unitarias
- [ ] Revisar optimizaciones de rendimiento y seguridad
- [ ] Preparar empaquetado o despliegue a producción
- [x] Verificar funcionalidad del toolkit manualmente: `npm run menu`, `npm run reset` (ejecutar con el navegador)
- [x] Verificar limpieza de comentarios en producción con Brave del sistema (5 comentarios, sin ban signals)
- [x] Implementar lotes aleatorios y micro-clics variables (likes 20-95, comentarios 20-60, delay 8-45 ms)
- [x] QA final: spinner Shruggie animado, scroll virtualizado, mensajes dry-run honestos, build+lint limpios
- [x] QA del dialogo de error de Instagram (cierre con Aceptar + backoff)
- [x] Limpieza y organizacion del proyecto (antiguos fuera del repo, runtime reseteado)
- [x] Fix del diálogo de confirmación de eliminación (botones BUTTON reales, no divs con texto general)
- [x] Reintentar limpieza de likes despues del limite temporal de Instagram (verificado: 40 likes eliminados en produccion)
- [ ] Ejecutar limpieza completa real (likes/comentarios/bloqueo) desde el menu
- [x] Implementar contraalgoritmo buen camino / mal camino (RecoveryPolicy) con limites por tipo de fallo
- [x] Corregir deteccion de red y toast de likes (40 likes eliminados y verificados)

---
*Regla: Marcar con `[x]` las tareas completadas y agregar con `[ ]` cualquier nuevo requerimiento técnico.*
