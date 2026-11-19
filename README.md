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

Solo pregunta cuántos por lote (Enter = 20). El navegador se detecta solo y la ventana se cierra al terminar.

## Uso directo

| Acción | Comando |
|---|---|
| Likes | `npm run likes` |
| Comentarios | `npm run comments` |
| Bloquear lista | `npm run block` |

Opciones útiles:

```sh
node ./dist/cli.js --comments --limit 30          # lote de 30
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

## Navegador

`--browser auto` (por defecto) elige el primero instalado: Brave, Chrome, Edge, Chromium, Opera o Vivaldi. También puedes forzarlo: `--browser brave`, `--browser chrome`, `--browser edge`.

Si usas el perfil del sistema, cierra antes ese navegador. Sin `--profile-dir` se usa un perfil aislado del proyecto y se inicia sesión una vez.

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

- Instagram permite ~95 selecciones por lote; la herramienta usa 20 por defecto y crece sola si todo va bien.
- Tras muchos borrados puede bloquear en silencio: la UI se vacía pero no borra. La herramienta lo detecta, se detiene y no marca nada como hecho.
- El bloqueo es reanudable: `.state/block-ledger.jsonl` evita repetir cuentas ya procesadas.
- Usa solo tu cuenta y a tu ritmo.

## Licencia

[Unlicense](LICENSE). Proyecto mantenido por **REGT-URRED**.
