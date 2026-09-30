# Servidores y patrocinadores

Edita `content-repository/servers.json` y `content-repository/sponsors.json` en GitHub. Los archivos están preparados con listas vacías para que añadas tus datos reales. No añadas comentarios dentro de los JSON. Cada `id` debe ser único en su archivo y contener solo minúsculas, números y guiones.

La app descarga estos archivos desde la misma carpeta y rama que `manifest.json`, sin que dependan de que todos los paquetes del catálogo estén disponibles. Conserva la última configuración válida si una actualización falla y muestra el error correspondiente. Las configuraciones se consultan cada cinco minutos; el botón de actualizar fuerza una nueva consulta. Los estados de servidor tienen una caché de quince segundos.

## servers.json

Ejemplo de formato: sustituye la IP, nombre y URL por los del servidor real antes de guardarlo. La IP de ejemplo es una dirección reservada para documentación, no un servidor del campeonato.

```json
{
  "servers": [
    {
      "id": "ec3-practice",
      "name": "Nombre de tu servidor",
      "ip": "203.0.113.10",
      "httpPort": 8081,
      "description": "Entrenamientos del campeonato",
      "liveTimingUrl": "https://timing.example.com/ec3",
      "embedTiming": false
    }
  ]
}
```

| Campo | Qué debes poner |
| --- | --- |
| `id` | Identificador estable del servidor. |
| `name` | Nombre que aparece en la app. |
| `ip` | IP pública IPv4 o IPv6 del servidor, sin `http://`, sin corchetes, sin ruta y sin puerto. Es el formato recomendado para configuraciones nuevas. |
| `host` | Campo antiguo compatible con IP o dominio. Úsalo solo si ya tienes una configuración que lo necesita; no lo combines con `ip`. Debe existir exactamente uno de los dos campos. |
| `httpPort` | Puerto **HTTP** configurado en AC, normalmente `8081`. No es el puerto de carrera UDP/TCP, normalmente `9600`. |
| `description` | Texto opcional de hasta 1000 caracteres. |
| `allowLan` | Opcional, `false` por defecto. Pon `true` únicamente si quieres que los usuarios consulten una IP privada de su red local. |
| `liveTimingUrl` | URL HTTPS opcional del servicio que proporciona el cronometraje. |
| `embedTiming` | Opcional, `false` por defecto. Pon `true` solo si el servicio permite mostrar su web en un iframe. El enlace externo está disponible aunque el servicio bloquee el iframe. |

La conexión utiliza la IP y el puerto HTTP que configures, por ejemplo `http://203.0.113.10:8081/INFO`. Para IPv6, el helper añade automáticamente los corchetes necesarios a la URL de consulta; en el JSON escribe únicamente la dirección, por ejemplo `"ip": "2001:db8::10"`. La app muestra la dirección configurada, un botón para copiarla, el nombre del servidor, circuito, jugadores actuales/máximos, tipo de sesión y tiempo restante cuando el servidor publica esos campos. `session` significa `0` Booking, `1` Practice, `2` Qualifying y `3` Race. `/INFO` no ofrece vueltas ni una clasificación de pilotos: esos datos deben venir de la página de cronometraje indicada en `liveTimingUrl`.

«Join» abre Content Manager con `acmanager://race/online/join?ip=IP&httpPort=PUERTO`, usando exactamente la dirección configurada. Las configuraciones antiguas con `host` siguen funcionando. Instala Content Manager y ábrelo al menos una vez para que registre su protocolo Windows. Si lo has desactivado en sus ajustes, habilita la integración del protocolo. La app comprueba que existe un ejecutable registrado; la confirmación de coche, contraseña si hace falta y entrada a la sesión siguen siendo responsabilidad de Content Manager. No guardes contraseñas en este JSON público.

Para **Join**, recomendamos IPv4. El helper consulta `/INFO` mediante IPv6 correctamente, pero el [código público revisado de Content Manager](https://github.com/gro-ove/actools/blob/master/AcManager.Tools/Helpers/Api/KunosApiProvider.cs) no construye correctamente todas las URLs al recibir una IPv6 literal; no garantizamos que Join funcione con esa dirección en CM.

Para servidores LAN, `allowLan: true` admite direcciones privadas y nombres locales del campo antiguo `host`, pero siempre bloquea loopback, link-local y direcciones conocidas de metadatos cloud. `ip` siempre exige una dirección literal, nunca un dominio. Los nombres de `host` también se validan después de resolver DNS. El helper fija la conexión a las direcciones validadas, no sigue redirecciones ni proxies, consulta únicamente `/INFO`, limita cada respuesta a 256 KiB y cada consulta a ocho segundos. Un servidor que no responda no impide mostrar los demás. `liveTimingUrl` nunca se descarga desde el helper: se utiliza como enlace y, si lo activas, como iframe del navegador.

## sponsors.json

Ejemplo de formato: sustituye todos los valores por los de tus patrocinadores.

```json
{
  "sponsors": [
    {
      "id": "sponsor-name",
      "name": "Nombre del patrocinador",
      "logo": "https://images.example.com/sponsor.png",
      "url": "https://sponsor.example.com",
      "order": 0
    }
  ]
}
```

`id`, `name`, `logo` y `url` son obligatorios. `logo` debe ser una imagen pública HTTPS, preferiblemente PNG/WebP transparente o SVG preparado para el fondo de la app. `url` es la web que se abre al pulsar el logo; si falta, el helper informa de un error de configuración. `order` es opcional y ordena los logos de menor a mayor; los empates se ordenan por `id`. Puedes alojar las imágenes en el repo y utilizar sus enlaces de GitHub Raw. Todos los enlaces deben usar HTTPS sin credenciales. Hay un máximo de 32 servidores y 32 patrocinadores; cada archivo admite hasta 512 KiB.

## Contratos del helper

- `GET /api/portal` devuelve `{ servers, sponsors, errors, fetchedAt }`. Los errores incluyen `source`, `code` y `message`; el fallo de un archivo no impide cargar el otro.
- `GET /api/servers` devuelve `{ servers, contentManagerAvailable, errors, checkedAt }`. Cada entrada contiene `{ server, state, info, error, checkedAt, joinAvailable }`; `state` es `online` u `offline` y `info` es `null` cuando falla la consulta.
- Cada `server` conserva `ip` si se configuró mediante IP, o `host` para configuraciones antiguas. El frontend utiliza `ip ?? host` para mostrar la dirección. No se inventan ni se reemplazan IP en el catálogo.
- `info` contiene `{ name, track, currentPlayers, maxPlayers, session, timeLeft, cars, passwordRequired }`. Los datos ausentes son `null`, salvo `cars`, que será `[]`. `timeLeft` está expresado en segundos.
- `POST /api/servers/{id}/join` solo admite un ID de `servers.json`. Devuelve `{ serverId, launched: true, message }` al entregar la petición a Windows. Los fallos usan los códigos habituales del helper, por ejemplo `SERVER_NOT_FOUND` o `CONTENT_MANAGER_NOT_FOUND`.

Los esquemas `servers.schema.json` y `sponsors.schema.json` describen el formato editable. La validación del helper añade comprobaciones de IDs duplicados, hosts y seguridad de red.

## Fuentes del protocolo

La integración usa código público de los proyectos que implementan estos protocolos:

- [Content Manager: handler `ProcessRaceOnlineJoin`](https://github.com/gro-ove/actools/blob/master/AcManager/Tools/ArgumentsHandler.Race.cs) y [registro del protocolo Windows](https://github.com/gro-ove/actools/blob/master/AcManager.Tools/Helpers/CustomUriSchemeHelper.cs).
- [Content Manager: consulta directa `/INFO`](https://github.com/gro-ove/actools/blob/master/AcManager.Tools/Helpers/Api/KunosApiProvider.cs) y [campos de información AC](https://github.com/gro-ove/actools/blob/master/AcManager.Tools/Helpers/Api/Kunos/ServerInformationComplete.cs).
- [AssettoServer: respuesta `/INFO` y conversión a segundos](https://github.com/compujuckel/AssettoServer/blob/master/AssettoServer/Network/Http/HttpController.cs), [campos JSON](https://github.com/compujuckel/AssettoServer/blob/master/AssettoServer.Shared/Network/Http/Responses/InfoResponse.cs) y [tipos de sesión](https://github.com/compujuckel/AssettoServer/blob/master/AssettoServer.Shared/Model/SessionType.cs).
