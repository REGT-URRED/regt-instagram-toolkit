# REGT Instagram Toolkit

Herramienta local para limpiar tu propia cuenta de Instagram y bloquear cuentas de anuncios. Usa la web real en un navegador visible; nunca lee ni guarda tus credenciales.

## Qué hace

- **Limpia tus likes** de todo el historial.
- **Elimina tus comentarios** de todo el historial.
- **Bloquea cuentas de anuncios** usando una lista viva en `instagram_consolidado_ampliado.md` (244 perfiles, ampliable).

Cada acción verifica el resultado real (red y UI), evita repetir trabajo y se detiene si Instagram empieza a limitar la cuenta.

## Requisitos

- Node.js 20 o superior.
- Brave, Chrome, Edge, Chromium, Opera o Vivaldi instalado.
- Tu propia cuenta de Instagram.

## Instalación

```sh
git clone https://github.com/REGT-URRED/regt-instagram-toolkit.git
cd regt-instagram-toolkit
npm install
```

## Inicio rápido

**Windows:** doble clic en `iniciar.cmd`.

**Cualquier sistema:**

```sh
npm run menu
```

Menú de una pantalla:

```
1) Limpiar likes
2) Limpiar comentarios
3) Bloquear cuentas de anuncios
4) Salir
```

Solo pregunta el máximo por lote (Enter = 20); cada lote usa un tamaño aleatorio entre 20 y ese máximo. El navegador se detecta solo y la ventana se cierra al terminar.

## Uso directo

| Acción         | Comando            |
| -------------- | ------------------ |
| Likes          | `npm run likes`    |
| Comentarios    | `npm run comments` |
| Bloquear lista | `npm run block`    |

Opciones útiles:

```sh
node ./dist/cli.js --comments --limit 30          # máximo de lote 30 (aleatorio 20-30)
node ./dist/cli.js --likes --batch-size 20:80     # lotes aleatorios 20-80 (sin tope total)
node ./dist/cli.js --comments --hybrid-passes 0   # drena hasta vaciar
node ./dist/cli.js --block-accounts --block-limit 50 --block-dry-run  # solo verifica
node ./dist/cli.js --comments --browser edge      # fuerza navegador
```

## Lista viva (memoria)

La lista vive en `instagram_consolidado_ampliado.md`. Para añadir tus bloqueados nuevos o listas que te compartan:

```sh
npm run list:merge -- mis_bloqueados.html otra_lista.txt
```

Extrae los usuarios, ignora duplicados y añade solo los nuevos. El bloqueo lee ese `.md` por defecto, salta lo ya procesado (`.state/block-ledger.jsonl`) y reintenta los fallos.

Ver el estado de la lista en cualquier momento (sin abrir el navegador):

```sh
npm run list:count
# Lista: 244 · bloqueadas 143 · ya bloqueadas 20 · fallos 23 · pendientes 58
```

## Navegador

`--browser auto` (por defecto) elige el primero instalado: Brave, Chrome, Edge, Chromium, Opera o Vivaldi. También puedes forzarlo: `--browser brave`, `--browser chrome`, `--browser edge`.

Si usas el perfil del sistema, cierra antes ese navegador. Sin `--profile-dir` se usa un perfil aislado del proyecto y se inicia sesión una vez.

Ambos flags amplían la superficie de riesgo: `--use-system-profile` trabaja sobre tu perfil real de Chrome (misma sesión, cookies y extensiones), y `--no-sandbox` desactiva el sandbox del navegador. Úsalos solo si entiendes el trade-off.

## Qué guarda en disco

La herramienta escribe solo dentro del proyecto y nada de esto se sube al repo:

| Ruta                         | Contenido                                                                                                                                                   |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.chrome-profile/`           | Perfil de Chrome: sesión y cookies de Instagram. Contiene credenciales de sesión válidas.                                                                   |
| `.state/mutations.jsonl`     | Payloads crudos de las mutaciones de like/unlike/delete/block/comment (hasta ~4 KB por línea). Cookies, CSRF, nonce y tokens se redactan antes de escribir. |
| `.state/ledger.jsonl`        | Firmas de elementos ya procesados: `media_id`, URL y `aria-label`.                                                                                          |
| `.state/block-ledger.jsonl`  | Cuentas ya bloqueadas, ya bloqueadas de antes, no encontradas o fallidas.                                                                                   |
| `.state/block-failures.json` | Detalle de los bloqueos fallidos para reintentar.                                                                                                           |

`--no-store` (alias `--privacy`) mantiene todo en memoria: el menú de likes/comentarios no escribe `.state/mutations.jsonl` ni `.state/ledger.jsonl`, y el bloqueo no escribe `.state/block-ledger.jsonl` ni el archivo de fallos. El `.chrome-profile/` se sigue creando porque es el navegador, no un registro de actividad.

Para borrar todo el estado local de una vez:

```sh
npm run reset
```

Esto elimina `dist/`, `.state/` y `.chrome-profile/`.

## Qué verás

Solo contadores, sin logs técnicos:

```
Lote 3: 20 borrados · 21 s · lote 20 · total 60
Total: 60 borrados en 3 lote(s).
```

```
[13/244] @sheinofficial: bloqueada
Block summary: 144 bloqueadas, 20 ya bloqueadas, 23 fallos.
```

Para depurar: añade `--log-level debug`.

## Límites reales

- Cada lote usa un tamaño aleatorio entre 20 y el máximo elegido, nunca un valor fijo.
- Likes: máximo 95 por lote (la UI se deshabilita pasadas ~99 selecciones). Comentarios: máximo 60 por lote.
- Los clics entre checkboxes llevan un retraso aleatorio de 8-45 ms, distinto en cada clic.
- Tras muchos borrados puede bloquear en silencio: la UI se vacía pero no borra. La herramienta lo detecta, se detiene y no marca nada como hecho.
- El bloqueo es reanudable: `.state/block-ledger.jsonl` evita repetir cuentas ya procesadas.
- Usa solo tu cuenta y a tu ritmo.

## Licencia

[Unlicense](LICENSE). Proyecto mantenido por **REGT-URRED**.
