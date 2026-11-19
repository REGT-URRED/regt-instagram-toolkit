# Componentes y Seguridad Preventiva del Proyecto

Inventario vivo de componentes, frescura de versiones y verificación de brechas de seguridad. Regenerar con `contextbase audit`.

---

## Última verificación: 2026-11-19

---

## Inventario de Componentes

- **Node.js / npm** — manifiesto `package.json`, última modificación: 2026-11-19
  - puppeteer (instalado 24.43.1)
  - yargs (instalado 17.7.2)
  - @eslint/js (instalado 10.0.1)
  - @types/node (instalado 22.19.19)
  - @types/yargs (instalado 17.0.35)
  - eslint (instalado 10.4.0)
  - prettier (instalado 3.8.3)
  - typescript (instalado 5.9.3)
  - typescript-eslint (instalado 8.59.4)

---

## Estado de Actualización (frescura)

- **Node.js / npm**:
- `npm` **@types/node**: instalado 22.19.19 → disponible 26.6.6
- `npm` **eslint**: instalado 10.4.0 → disponible 10.15.0
- `npm` **prettier**: instalado 3.8.3 → disponible 3.10.1
- `npm` **puppeteer**: instalado 24.43.1 → disponible 25.18.1
- `npm` **typescript**: instalado 5.9.3 → disponible 7.0.2
- `npm` **typescript-eslint**: instalado 8.59.4 → disponible 8.73.0
- `npm` **yargs**: instalado 17.7.2 → disponible 18.2.0

---

## Brechas de Seguridad Detectadas

- **Node.js / npm**: total 23
- moderate: 9
- high: 14

> ⚠️ **Acción requerida:** 14 vulnerabilidad(es) critical/high detectadas. Registrarlas en `tasklist.md` como tareas `[ ]` y corregirlas de inmediato.

---

## Mantenimiento Automático (regla para agentes)

1. Revisar este documento al iniciar un proyecto o sesión: conocer versión instalada y última actualización de cada componente previene brechas y trabajo a ciegas.
2. Regenerar con `contextbase audit` como verificación final de cada cambio cerrado.
3. Si aparecen vulnerabilidades critical/high: registrar en `tasklist.md` y corregirlas antes de continuar con nuevas funcionalidades.
---
*Generado automáticamente por ContextBase CLI el 2026-11-19.*
