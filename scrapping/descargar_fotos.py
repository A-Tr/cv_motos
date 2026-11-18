#!/usr/bin/env python3
"""Descarga retratos oficiales del Congreso agrupados por formación electoral.

Solo requiere Python 3.10 o posterior (biblioteca estándar).
"""

import argparse
import csv
import json
import re
import sys
import time
import unicodedata
from collections import Counter
from html.parser import HTMLParser
from http.cookiejar import CookieJar
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urljoin
from urllib.request import HTTPCookieProcessor, Request, build_opener

BASE = "https://www.congreso.es/es/busqueda-de-diputados"
PORTLET = {
    "p_p_id": "diputadomodule", "p_p_lifecycle": "2",
    "p_p_state": "normal", "p_p_mode": "view",
    "p_p_resource_id": "searchDiputados", "p_p_cacheability": "cacheLevelPage",
}


class Pagina(HTMLParser):
    """Extrae la legislatura seleccionada y el retrato de una ficha."""

    def __init__(self, html):
        super().__init__()
        self.en_legislatura = False
        self.legislatura = None
        self.foto = None
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "select":
            self.en_legislatura = a.get("id") == "_diputadomodule_legislatura"
        if tag == "option" and self.en_legislatura and "selected" in a:
            valor = a.get("value", "")
            if valor.isdigit():
                self.legislatura = int(valor)
        if tag == "img" and "/docu/imgweb/diputados/" in a.get("src", ""):
            self.foto = urljoin(BASE, a["src"])

    def handle_endtag(self, tag):
        if tag == "select":
            self.en_legislatura = False


class Cliente:
    def __init__(self, pausa, timeout):
        self.opener = build_opener(HTTPCookieProcessor(CookieJar()))
        self.pausa = pausa
        self.timeout = timeout
        self.ultima_peticion = 0.0

    def obtener(self, url, datos=None):
        for intento in range(4):
            time.sleep(max(0, self.pausa - (time.monotonic() - self.ultima_peticion)))
            self.ultima_peticion = time.monotonic()
            req = Request(url, data=urlencode(datos).encode() if datos is not None else None,
                          headers={"User-Agent": "Mozilla/5.0 (compatible; FotosCongreso/1.0)",
                                   "Referer": BASE})
            try:
                with self.opener.open(req, timeout=self.timeout) as r:
                    contenido = r.read()
                    charset = r.headers.get_content_charset() or "utf-8"
                    return contenido, charset
            except HTTPError as exc:
                if exc.code not in (429, 500, 502, 503, 504) or intento == 3:
                    raise
                espera = exc.headers.get("Retry-After", "")
                time.sleep(float(espera) if espera.isdigit() else 2 ** intento)
            except (URLError, TimeoutError, OSError):
                if intento == 3:
                    raise
                time.sleep(2 ** intento)
        raise RuntimeError("No se pudo completar la petición")

    def texto(self, url, datos=None):
        contenido, charset = self.obtener(url, datos)
        return contenido.decode(charset)


def nombre_seguro(texto):
    texto = unicodedata.normalize("NFC", texto)
    texto = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", texto)
    texto = re.sub(r"\s+", " ", texto).strip(" .")[:120].rstrip(" .") or "Sin_formacion"
    if texto.split(".")[0].upper() in {"CON", "PRN", "AUX", "NUL", *[f"COM{i}" for i in range(1, 10)], *[f"LPT{i}" for i in range(1, 10)]}:
        texto = "_" + texto
    return texto


def romano(numero):
    resultado = ""
    for valor, simbolo in [(1000, "M"), (900, "CM"), (500, "D"), (400, "CD"),
                           (100, "C"), (90, "XC"), (50, "L"), (40, "XL"),
                           (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")]:
        veces, numero = divmod(numero, valor)
        resultado += simbolo * veces
    return resultado or "0"


def url_ficha(diputado):
    return BASE + "?" + urlencode({
        "p_p_id": "diputadomodule", "p_p_lifecycle": "0", "p_p_state": "normal",
        "p_p_mode": "view", "_diputadomodule_mostrarFicha": "true",
        "codParlamentario": diputado["codParlamentario"],
        "idLegislatura": romano(int(diputado["idLegislatura"])),
    })


def imagen_valida(datos):
    # No guardar páginas HTML de error con extensión de imagen.
    if datos.startswith(b"\xff\xd8\xff") and datos.endswith(b"\xff\xd9"):
        return ".jpg"
    if datos.startswith(b"\x89PNG\r\n\x1a\n") and b"IEND" in datos[-16:]:
        return ".png"
    if datos[:6] in (b"GIF87a", b"GIF89a") and datos.endswith(b";"):
        return ".gif"
    raise ValueError("La respuesta no es una imagen JPEG, PNG o GIF completa")


def guardar_indice(salida, filas):
    temporal = salida / "diputados.csv.tmp"
    with temporal.open("w", encoding="utf-8-sig", newline="") as f:
        escritor = csv.DictWriter(f, fieldnames=["id", "legislatura", "nombre", "formacion",
            "grupo", "circunscripcion", "ficha", "foto", "archivo", "estado", "error"])
        escritor.writeheader()
        escritor.writerows(filas)
    temporal.replace(salida / "diputados.csv")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--salida", type=Path, default=Path(__file__).resolve().parent / "fotos_congreso")
    parser.add_argument("--legislatura", type=int, help="Por defecto, la seleccionada en la web")
    parser.add_argument("--estado", choices=["activos", "bajas", "todos"], default="activos")
    parser.add_argument("--limite", type=int, help="Procesar solo N diputados para una prueba")
    parser.add_argument("--pausa", type=float, default=0.3, help="Segundos mínimos entre peticiones")
    parser.add_argument("--timeout", type=float, default=45)
    parser.add_argument("--sobrescribir", action="store_true")
    args = parser.parse_args()
    if args.pausa < 0 or args.timeout <= 0 or (args.limite is not None and args.limite <= 0) or (args.legislatura is not None and args.legislatura < 0):
        parser.error("Revisa los valores: pausa >= 0; timeout y límite > 0; legislatura >= 0")
    cliente = Cliente(args.pausa, args.timeout)
    pagina = Pagina(cliente.texto(BASE))
    legislatura = args.legislatura if args.legislatura is not None else pagina.legislatura
    if legislatura is None:
        raise ValueError("No se ha detectado la legislatura; usa --legislatura")
    filtros = {"idLegislatura": str(legislatura), "tipo": {"activos": "0", "bajas": "1", "todos": "2"}[args.estado],
               "genero": "0", "grupo": "all", "formacion": "all", "nombre": "",
               "apellidos": "", "filtroProvincias": "[]", "nombreCircunscripcion": ""}
    respuesta = json.loads(cliente.texto(BASE + "?" + urlencode(PORTLET),
                                        {"_diputadomodule_" + k: v for k, v in filtros.items()}))
    diputados = respuesta.get("data")
    if not isinstance(diputados, list) or not diputados:
        raise ValueError("El buscador no devuelve diputados para estos filtros")
    requeridos = {"codParlamentario", "idLegislatura", "apellidosNombre", "formacion"}
    if any(not isinstance(d, dict) or not requeridos <= d.keys() for d in diputados):
        raise ValueError("La estructura del buscador ha cambiado")
    if any(int(d["idLegislatura"]) != legislatura for d in diputados):
        raise ValueError("La respuesta contiene una legislatura distinta de la solicitada")
    if args.estado == "activos" and any(d.get("fchBaja") for d in diputados):
        raise ValueError("El buscador devolvió bajas al solicitar activos")
    # El JSON contiene el listado entero; la web lo pagina en JavaScript.
    diputados = list({(d["idLegislatura"], d["codParlamentario"]): d for d in diputados}.values())
    print(f"Legislatura {legislatura}: {len(diputados)} diputados ({args.estado}).", flush=True)
    args.salida.mkdir(parents=True, exist_ok=True)
    (args.salida / "respuesta_buscador.json").write_text(json.dumps(respuesta, ensure_ascii=False, indent=2), encoding="utf-8")
    filas = []
    for d in diputados[:args.limite]:
        ficha = url_ficha(d)
        fila = dict(id=d["codParlamentario"], legislatura=d["idLegislatura"], nombre=d["apellidosNombre"],
                    formacion=d["formacion"] or "Sin_formacion", grupo=d.get("grupo", ""),
                    circunscripcion=d.get("nombreCircunscripcion", ""), ficha=ficha,
                    foto="", archivo="", estado="error", error="")
        try:
            carpeta = args.salida / nombre_seguro(fila["formacion"])
            carpeta.mkdir(exist_ok=True)
            base = carpeta / (nombre_seguro(fila["nombre"]) + f"__{fila['id']}_L{legislatura}")
            existente = next((Path(str(base) + ext) for ext in (".jpg", ".png", ".gif") if Path(str(base) + ext).exists()), None)
            foto = f"https://www.congreso.es/docu/imgweb/diputados/{fila['id']}_{legislatura}.jpg"
            if existente and not args.sobrescribir:
                imagen_valida(existente.read_bytes())
                fila.update(archivo=str(existente.relative_to(args.salida)), estado="existente", foto=foto)
            else:
                # Leer el src real de cada ficha evita depender de un patrón de nombres.
                foto = Pagina(cliente.texto(ficha)).foto
                if not foto:
                    raise ValueError("La ficha no contiene un retrato oficial")
                fila["foto"] = foto
                contenido, _ = cliente.obtener(foto)
                archivo = Path(str(base) + imagen_valida(contenido))
                temporal = archivo.with_suffix(archivo.suffix + ".tmp")
                temporal.write_bytes(contenido)
                temporal.replace(archivo)
                fila.update(archivo=str(archivo.relative_to(args.salida)), estado="descargada")
        except (OSError, URLError, ValueError) as exc:
            fila["error"] = str(exc)
        filas.append(fila)
        guardar_indice(args.salida, filas)
        print(f"[{len(filas)}/{min(len(diputados), args.limite or len(diputados))}] {fila['estado']}: {fila['nombre']} ({fila['formacion']}) {fila['error']}", flush=True)
    print(f"Resultado: {dict(Counter(f['estado'] for f in filas))}. Carpeta: {args.salida.resolve()}")
    return 1 if any(f["estado"] == "error" for f in filas) else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, URLError, ValueError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        print("\nInterrumpido. Ejecuta de nuevo para continuar.", file=sys.stderr)
        sys.exit(130)
