# Fotografías de los diputados del Congreso

`descargar_fotos.py` consulta el buscador oficial y descarga sus retratos en carpetas por **formación electoral**. Funciona con Python 3.10 o posterior y no requiere instalar paquetes.

## Ejecutar

Desde esta carpeta:

```powershell
python descargar_fotos.py
```

Si Windows utiliza el lanzador `py`, sustituye `python` por `py`.

La ejecución por defecto descarga todos los **diputados en activo** de la legislatura seleccionada por la web. No presupone una cantidad fija de diputados. En la consulta realizada el 17 de noviembre de 2026, el buscador devolvió 137 activos, 275 bajas y 412 registros en total para la XV legislatura. Son los resultados del buscador en ese momento; no se presenta esta cifra como el número de escaños del Congreso.

Para incluir también a quienes causaron baja durante la legislatura:

```powershell
python descargar_fotos.py --estado todos
```

Otros ejemplos:

```powershell
python descargar_fotos.py --limite 3
python descargar_fotos.py --legislatura 14 --estado todos --salida fotos_legislatura_14
python descargar_fotos.py --estado bajas --salida fotos_bajas
python descargar_fotos.py --sobrescribir
python descargar_fotos.py --help
```

Usa carpetas de salida distintas si quieres conservar por separado varias selecciones. El CSV y la respuesta JSON se sustituyen en cada ejecución; las imágenes anteriores se conservan.

## Resultado

```text
fotos_congreso/
  PP/
    Acedo Reyes, Sofía__69_L15.jpg
  VOX/
    Abascal Conde, Santiago__317_L15.jpg
  PSOE/
    ...
  diputados.csv
  respuesta_buscador.json
```

Cada nombre incorpora el identificador del diputado y la legislatura para evitar colisiones. El CSV, codificado con BOM UTF-8 para facilitar su apertura en Excel, registra nombre, formación, grupo parlamentario, circunscripción, enlaces originales, ruta local y resultado de cada descarga. Los fallos se anotan y el programa sigue con las demás personas; al terminar devuelve código 1 si hubo errores.

Puedes volver a ejecutar el script: valida y reutiliza las imágenes ya descargadas. Guarda el CSV tras cada diputado y escribe las imágenes de forma atómica. Incluye pausas entre peticiones, tiempo máximo de espera y reintentos ante fallos temporales.

## Cómo se organiza la página

Fuente: [Buscador de diputados del Congreso](https://www.congreso.es/es/busqueda-de-diputados).

1. El HTML inicial contiene el formulario y JavaScript. El listado no está incluido como una tabla HTML con todos los diputados.
2. `searchDiputados()` hace un POST al mismo buscador con `p_p_id=diputadomodule`, `p_p_lifecycle=2` y `p_p_resource_id=searchDiputados`.
3. Los filtros llevan el prefijo `_diputadomodule_`. `idLegislatura` selecciona la legislatura; `tipo` vale `0` para activos, `1` para bajas y `2` para todos. Los valores sin filtro de grupo y formación son `all`.
4. La respuesta JSON contiene la lista completa en `data`. La web la pagina después en el navegador mediante `PaginationManager`; no hay que recorrer páginas de resultados.
5. Cada registro aporta `codParlamentario`, `idLegislatura`, `apellidosNombre`, `formacion`, `grupo`, `nombreCircunscripcion` y fechas de alta/baja.
6. La ficha se abre con `_diputadomodule_mostrarFicha=true`, `codParlamentario` e `idLegislatura` en números romanos, tal como hace el JavaScript del sitio.
7. El script lee en cada ficha el `src` de la imagen ubicada bajo `/docu/imgweb/diputados/`. Ejemplo verificado: `https://www.congreso.es/docu/imgweb/diputados/317_15.jpg`. Comprueba la firma y terminación de la imagen antes de guardarla.

La clasificación reproduce **`formacion`**, el dato oficial disponible. Puede designar un partido o una coalición electoral, y no permite deducir la militancia actual dentro de una coalición. Se conservan las etiquetas del Congreso: por ejemplo, `PSC-PSOE`, `PSOE` y `SUMAR` tienen sus propias carpetas. El grupo parlamentario se guarda como dato adicional en el CSV.

El script consulta datos públicos, no utiliza Selenium ni necesita credenciales. Si la estructura de la web cambia, informa del problema en lugar de generar un listado vacío silenciosamente. Las fotografías proceden del Congreso; su descarga no modifica las condiciones de reutilización de la fuente.
