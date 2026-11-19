# Bitácora Histórica del Proyecto (Changelog)

Registro metódico del progreso técnico, decisiones de arquitectura y evolución del sistema.

---

## Cambios Realizados
- [2026-11-19] [commit] 14d7cef chore: sincronizar memoria contextbase
- [2026-11-19] [commit] 63a4a6d chore: registrar commit en contextbase
- [2026-11-19] [commit] 8b07e1b fix: detect real instagram likes mutations and add bounded error recovery
- [2026-11-19] fix: la deteccion de la peticion real de Instagram comparaba el blocklist ("events", "logging", etc.) contra el cuerpo del request, y todo payload de Instagram contiene "events"; eso descartaba TODAS las peticiones validas y el lote se contaba como exitoso sin verificar nada. Ahora el blocklist solo mira la URL y el unlike se detecta por appid liked_unlike/unlike.
- [2026-11-19] fix: el toast real de likes cambio en Instagram a "Indicaste que no te gustan N publicaciones"; se agregaron variantes es/en/fr al verificador y ya no depende del archivo de traducciones.
- [2026-11-19] fix: el boton de accion y la confirmacion ahora se pulsan con mouse real (CDP) en vez de element.click(); el centro de actividades ignora el clic sintetico y el lote quedaba sin aplicar.
- [2026-11-19] fix: la confirmacion es opcional inteligente (se espera 3s el dialogo, si aparece se acepta con mouse y se exige exito; si no aparece se aplica directo), sin falsos positivos.
- [2026-11-19] feat: contraalgoritmo de manejo de errores "buen camino / mal camino" (RecoveryPolicy): clasifica el fallo (action-button-missing, confirmation-missing, instagram-error-dialog, unacknowledged-batch, items-still-visible, navigation-lost), aplica recarga+reintento acotado o aborta con mensaje claro; nunca reintenta infinito.
- [2026-11-19] fix: un lote sin toast y sin respuesta de red ya no se cuenta como exitoso: se verifica contra la lista de actividad y, si los elementos siguen visibles, se trata como fallo con recarga.
- [2026-11-19] fix: el tile negro no disponible se excluye por imagen (null.jpg sin miniatura real) y no solo por posicion; el salto posicional queda como respaldo.
- [2026-11-19] qa: verificado en produccion con Brave del sistema: 2 lotes de 20 likes eliminados (40 reales), confirmados por toast y HTTP 200 liked_unlike, 0 errores; build+lint limpios.
- [2026-11-19] [commit] 023f895 fix: never select the unavailable first likes tile
- [2026-11-19] fix: el primer ítem de la grilla de likes (tile negro no disponible) ya no se selecciona nunca, desde el primer lote y en todos los siguientes, porque Instagram rechaza el lote entero
- [2026-11-19] fix: la selección descarta candidatos sin firma (sin link, imagen ni texto), que son los tiles rotos que hacen fallar la eliminación
- [2026-11-19] fix: tras un lote exitoso el salto vuelve a 1 (solo el tile negro), para no saltear likes válidos de más
- [2026-11-19] [commit] 438ca32 chore: actualizar memoria contextbase
- [2026-11-19] [commit] 48c3133 fix: skip black unavailable tile and stop on instagram throttle
- [2026-11-19] fix: el salto de elementos rechazados ahora es posicional (ignora el primer tile de la lista) en vez de por firma; el tile negro sin link ni imagen no generaba firma y por eso se marcaba el elemento equivocado y el lote volvía a fallar siempre
- [2026-11-19] fix: el salto posicional se aplica solo al primer lote tras recargar la página (no en cada scroll), así no se saltean likes válidos
- [2026-11-19] feat: si Instagram rechaza un lote, la limpieza ahora salta el primer elemento seleccionado (carrusel o publicación no disponible) y continúa desde el siguiente en vez de fallar el lote entero; tras 3 rechazos seguidos se detiene y avisa
- [2026-11-19] fix: la limpieza se detiene con mensaje claro tras 3 lotes rechazados seguidos por Instagram (límite temporal de likes/comentarios) en vez de reintentar sin fin; cierra el navegador, sale con código 1 y explica cuánto esperar
- [2026-11-19] fix: el flujo híbrido detecta el diálogo de error de Instagram antes de buscar la confirmación (antes fallaba con "confirmation control was not found" y reintentaba en vano)
- [2026-11-19] fix: el bucle de recuperación clásico ya no reintenta cuando el error es un límite de Instagram (antes podía quedar girando indefinidamente)
- [2026-11-19] fix: menú reescrito sin conflicto readline/raw-mode (las respuestas ya no se corren de lugar: navegador de una letra con enter automático y preguntas posteriores correctas)
- [2026-11-19] fix: consola Windows en UTF-8 (chcp 65001 en iniciar.cmd + runtime) para que la animación Shruggie se vea bien
- [2026-11-19] feat: animación Shruggie también en limpieza de likes y bloqueo de cuentas (antes solo en comentarios)
- [2026-11-19] fix: flujo clásico de likes ahora detecta el diálogo de error en español ("Se produjo un error"/"Hubo un problema") y pulsa "Aceptar"
- [2026-11-19] [commit] 40cf57b chore: actualizar changelog con fix batch-size 100
- [2026-11-19] fix: batch-size tope subido de 99 a 100 para que máximo 100 no falle al parsear --batch-size 20:100
- [2026-11-19] [commit] f646b1a fix: batch-size tope 100 para no fallar con máximo 100
- [2026-11-19] [commit] 8b863af chore: actualizar changelog
- [2026-11-19] fix: emojis Shruggie siempre visibles en terminal (no dependen de isTTY); selector de navegador de una sola letra con enter automático (a=auto, b=brave, c=chrome, e=edge, o=opera, v=vivaldi)
- [2026-11-19] [commit] c463a41 fix: emojis Shruggie siempre visibles + selector de navegador de una letra
- [2026-11-19] [commit] ec85f11 chore: actualizar changelog con commits recientes
- [2026-11-19] [commit] 3ff4008 fix: diálogo de confirmación de eliminación con botones BUTTON reales
- [2026-11-19] fix: diálogo de confirmación de eliminación (botones BUTTON reales no divs) en botón Eliminar y confirmación; manejo de texto singular/plural del diálogo (¿Eliminar este comentario? / ¿Eliminar comentarios?); verificado en producción con bloques de 60 y 20 comentarios eliminados, 0 ban signals
- [2026-11-19] feat: progreso Shruggie animado y QA final
- [2026-11-19] [commit] 8385b83 chore: actualizar changelog con commits recientes
- [2026-11-19] [commit] 231a7fb chore: sync contextbase tras limpieza del proyecto
- [2026-11-19] [commit] 0028693 fix: manejar dialogo de error de Instagram y limpiar proyecto
- [2026-11-19] fix: manejo del dialogo de error de Instagram ("Se produjo un error") en likes/comentarios: cierra con Aceptar, registra ban signal y hace backoff para proteger la cuenta
- [2026-11-19] chore: limpieza del proyecto — antiguos_ya_funcionales movido a D:/PROCESO/antiguos_ya_funcionales_backup; reset de dist/.state/.chrome-profile y rebuild
- [2026-11-19] [commit] 5350efb feat: progreso Shruggie animado y QA final
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
