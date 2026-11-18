# REGT Instagram Toolkit

Herramienta local para tu propia cuenta de Instagram:

- **Limpiar likes** de todo tu historial.
- **Eliminar tus comentarios** de todo tu historial.
- **Bloquear cuentas** de anuncios (Temu, AliExpress y cualquier lista comunitaria) para dejar de ver sus publicaciones y anuncios.

Funciona con la interfaz web real de Instagram en Chrome o Brave. El programa abre un navegador visible, tú inicias sesión a mano y el código nunca lee ni guarda tus credenciales.

Autor: **REGT-URRED**. Licencia: **Unlicense** (dominio público).

## Requisitos

- Node.js 20 o superior.
- Chrome o Brave instalado.
- Una cuenta de Instagram propia.

## Instalación

```sh
git clone https://github.com/REGT-URRED/regt-instagram-toolkit.git
cd regt-instagram-toolkit
npm install
npm run build
```

## Uso

### Limpiar likes

```sh
npm run likes
```

### Eliminar comentarios

```sh
npm run comments
```

### Bloquear cuentas de anuncios

```sh
npm run block
```

El programa lee `accounts.json`, abre cada perfil y pulsa `Opciones` → `Bloquear` → `Bloquear`. Si una cuenta ya está bloqueada, no existe o falla, lo reporta y sigue con la siguiente.

## Lista comunitaria de cuentas (`accounts.json`)

```json
{
  "accounts": [
    { "username": "temu", "note": "anuncios / marketplace" },
    { "username": "aliexpress", "note": "anuncios / marketplace" }
  ]
}
```

También se acepta un array simple:

```json
["temu", "aliexpress", "otra_cuenta"]
```

**Cómo aportar cuentas:** añade el usuario a `accounts.json` y abre un Pull Request con el nombre y una nota breve (por ejemplo `ads`, `spam`, `marketplace`). Cuantas más cuentas aporte la comunidad, menos anuncios aparecerán en los feeds de todos.

Usa una lista propia con `--accounts-file`:

```sh
node ./dist/cli.js --block-accounts --accounts-file ./mi-lista.json
```

## Navegador y sesión

Por defecto usa un perfil aislado del proyecto (`.chrome-profile`). La primera vez, inicia sesión en la ventana que se abre; el programa continúa solo cuando detecta la sesión.

Para reutilizar tu sesión de Brave (con Brave completamente cerrado):

```sh
node ./dist/cli.js --block-accounts \
  --chrome-executable "C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe" \
  --profile-dir "%LOCALAPPDATA%\BraveSoftware\Brave-Browser\User Data"
```

En Windows, Brave y Chrome se detectan automáticamente en las rutas habituales cuando no pasas `--chrome-executable`.

## Ritmo y seguridad de la cuenta

Todas las esperas son aleatorias y configurables:

| Opción | Por defecto | Uso |
|---|---|---|
| `--batch-size min:max` | `90:99` | Elementos por lote de limpieza (20–99; Instagram limita una acción a 100). |
| `--click-delay min:max` | `120:350` ms | Pausa aleatoria entre clics de selección. |
| `--confirm-delay min:max` | `600:1800` ms | Pausa aleatoria entre `Eliminar`/`Ya no me gusta` y `Confirmar`. |
| `--batch-delay min:max` | `8000:25000` ms | Pausa aleatoria entre lotes. |
| `--toast-timeout` | `12000` ms | Espera del aviso de confirmación de Instagram. |
| `--error-dialog-timeout` | `30000` ms | Espera de un diálogo de error después del aviso. |
| `--notify-done` | desactivado | Notificación de escritorio al terminar. |
| `--close-on-finish` | desactivado | Cierra el navegador al terminar (útil para ejecuciones encadenadas). |

Otros idiomas:

```sh
node ./dist/cli.js --comments --translations ./translations/es.json
```

Archivos disponibles: `translations/en.json`, `translations/es.json`, `translations/fr.json`.

## Prototipo híbrido (medición)

Motor experimental que combina varias defensas y sirve para medir rendimiento con un lote:

```sh
node ./dist/cli.js --hybrid --limit 20 --dry-run   # solo selecciona
node ./dist/cli.js --hybrid --limit 20             # borra el lote
```

- **Capacidades por accesibilidad:** resuelve `Seleccionar`/`Ya no me gusta` por rol y nombre accesible, no por texto traducido (`capabilities.json`). Si falla, cae al clic por etiquetas.
- **Rate governor AIMD:** sube el ritmo con éxitos y lo reduce al doble con señales de bloqueo, con jitter.
- **Ban guard:** cuenta señales (HTTP 429, avisos de la UI) en una ventana; pausa y, al superar el umbral, aborta para proteger la cuenta.
- **Ledger idempotente:** `.state/ledger.jsonl` guarda IDs estables ya procesados; reiniciar no repite trabajo.
- **Grabador de mutaciones:** `.state/mutations.jsonl` registra lo que hace la web (sin cookies ni CSRF) para construir el futuro replay de API.

`.state/` y los perfiles de navegador quedan fuera de git.

## Aviso

- Usa solo tu propia cuenta.
- Instagram cambia su interfaz con frecuencia; el programa trabaja con los textos visibles y falla de forma clara si no encuentra un botón.
- No se usa la API privada de Instagram ni se envían credenciales a terceros.
- Bloquear y limpiar historial es una decisión personal sobre tu cuenta; úsalo de forma responsable.

## Licencia

[Unlicense](LICENSE). Sin atribuciones obligatorias. Proyecto mantenido por **REGT-URRED**.
