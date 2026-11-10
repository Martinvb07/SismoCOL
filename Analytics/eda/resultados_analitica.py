"""Genera docs/resultados_analitica.md con las métricas guardadas en la base.

Todos los números salen de las tablas que llenan los cálculos (pronostico_replicas,
pronostico_actividad, backtesting_pronostico, calculo_amenaza, periodo_retorno,
modelo_predictivo). Si una sección no tiene datos en la base usada, el informe lo
dice en lugar de inventar valores.

    .venv/bin/python -m eda.resultados_analitica --salida ../docs/resultados_analitica.md
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
from sqlalchemy import func, select

from sismocol import amenaza, db, pronostico, replicas
from sismocol.config import RAIZ_REPO, ajustes

ETIQUETA_HORIZONTE = {"24h": "24 h", "7d": "7 días", "30d": "30 días"}
ETIQUETA_MODELO = {"SARIMA": "SARIMA", "INGENUO": "Ingenuo", "MEDIA_MOVIL_12": "Media móvil 12 m"}
ETIQUETA_METODO = {"MAXIMA_VEROSIMILITUD": "Máxima verosimilitud", "GENERICO_A_SECUENCIA": "Genérico con a de la secuencia",
                   "GENERICO": "Genérico (R&J 1989)"}
PENDIENTE = ("> **Sin datos en la base usada para generar este informe.** Ejecute el cálculo en el servidor "
             "(con el catálogo del SGC y los reportes de daño cargados) y regenere el informe.")


def n(valor, d: int = 2) -> str:
    if valor is None or (isinstance(valor, float) and pd.isna(valor)):
        return "—"
    texto = f"{float(valor):,.{d}f}"
    return texto.replace(",", " ").replace(".", ",")


def pct(valor, d: int = 1) -> str:
    return "—" if valor is None else n(float(valor) * 100, d) + " %"


def tabla(encabezados: list[str], filas: list[list[str]]) -> str:
    lineas = ["| " + " | ".join(encabezados) + " |", "|" + "|".join("---" for _ in encabezados) + "|"]
    lineas += ["| " + " | ".join(str(c) for c in f) + " |" for f in filas]
    return "\n".join(lineas)


def leer(valor):
    return json.loads(valor) if isinstance(valor, (str, bytes)) else valor


# ─── Secciones ──────────────────────────────────────────────────────────────

def seccion_datos(url: str) -> str:
    t = db.tablas(url)["registro_sismico"]
    with db.motor(url).connect() as c:
        filas = c.execute(select(t.c.fuente, func.count(), func.min(t.c.fecha_hora), func.max(t.c.fecha_hora))
                          .where(t.c.es_anomalo.is_(False)).group_by(t.c.fuente)).all()
    cuerpo = tabla(["Fuente", "Registros válidos", "Desde", "Hasta"],
                   [[f[0], n(f[1], 0), f"{f[2]:%Y-%m-%d}", f"{f[3]:%Y-%m-%d}"] for f in filas])
    return "## 0. Datos de la base usada\n\n" + cuerpo + "\n"


def _dentro_m4(horizontes: list[dict]) -> float | None:
    casos = [m["dentroIc95"] for h in horizontes for m in h["magnitudes"] if m["magnitud"] == 4]
    return sum(casos) / len(casos) if casos else None


def seccion_replicas(url: str) -> str:
    t = db.tablas(url)["pronostico_replicas"]
    with db.motor(url).connect() as c:
        ids = [r[0] for r in c.execute(select(t.c.id_sismo_principal).where(t.c.tipo == "VALIDACION").distinct()).all()]
    if not ids:
        return "## 2. Pronóstico de réplicas: validación retrospectiva\n\n" + PENDIENTE + "\n"
    partes = ["## 2. Pronóstico de réplicas: validación retrospectiva (Reasenberg-Jones, D15)\n",
              "Para cada sismo principal se ajusta el modelo con las primeras 24 h, 72 h y 7 días, y se compara el número "
              "de réplicas pronosticado (con IC 95 %) con el observado después. «Genérico» usa los parámetros de "
              "Reasenberg y Jones (1989) sin ajustar nada a la secuencia. Si los datos no cubren todo el horizonte, "
              "solo se compara la parte cubierta (columna «Cobertura»). EAM = error absoluto medio |observadas − esperadas|. "
              "Los casos de M 5 y 6 con 0 esperadas y 0 observadas inflan la fracción dentro del IC; por eso se muestra "
              "también la fracción solo para M ≥ 4.\n"]
    for id_sismo in ids:
        d = replicas.detalle(url, id_sismo)
        p = d["principal"]
        lugar = f"{p['municipio']} ({p['departamento']})" if p["municipio"] else f"{n(p['latitud'])}, {n(p['longitud'])}"
        fuentes = ", ".join(d["validacion"][0]["parametros"]["fuentes"]) if d["validacion"] else "—"
        partes.append(f"### M {n(p['magnitud'], 1)} · {p['fechaHora'][:16].replace('T', ' ')} UTC · {lugar} · "
                      f"{n(p['profundidadKm'], 0)} km de profundidad\n")
        partes.append(f"Fuentes de la secuencia: {fuentes}. Datos hasta {d['pronostico']['parametros']['datosHasta'][:10]}.\n")
        resumen = []
        for v in d["validacion"]:
            r, g = v["resultados"]["resumen"], v["resultados"]["resumenGenerico"]
            res = v["resultados"]
            resumen.append([f"{n(v['horasAjuste'], 0)} h", ETIQUETA_METODO[v["metodo"]], n(v["nReplicas"], 0),
                            f"{n(v['p'])} / {n(v['c'], 3)} / {n(v['b'])}", pct(r["fraccionDentroIc95"]),
                            pct(_dentro_m4(res["horizontes"])), n(r["errorAbsolutoMedio"]),
                            pct(g["fraccionDentroIc95"]), pct(_dentro_m4(res["horizontesGenerico"])), n(g["errorAbsolutoMedio"])])
        partes.append(tabla(["Ajuste", "Método", "Réplicas ≥ Mc", "p / c (d) / b", "Dentro IC 95 %", "Dentro IC (M ≥ 4)", "EAM",
                             "Genérico: dentro IC", "Genérico: dentro (M ≥ 4)", "Genérico: EAM"], resumen) + "\n")
        detalle = []
        for v in d["validacion"]:
            for h in v["resultados"]["horizontes"]:
                for m in h["magnitudes"]:
                    if m["magnitud"] < 4:
                        continue
                    detalle.append([f"{n(v['horasAjuste'], 0)} h", ETIQUETA_HORIZONTE[h["horizonte"]], f"≥ {n(m['magnitud'], 0)}",
                                    n(m["observado"], 0), f"{n(m['esperado'])} [{m['ic95'][0]}–{m['ic95'][1]}]",
                                    "sí" if m["dentroIc95"] else "no", pct(h["cobertura"], 0)])
        partes.append(tabla(["Ajuste", "Horizonte", "M", "Observadas", "Esperadas [IC 95 %]", "Dentro", "Cobertura"], detalle) + "\n")
        avisos = sorted({a for v in d["validacion"] for a in v["parametros"].get("avisos", [])})
        if avisos:
            partes.append("Avisos del ajuste:\n\n" + "\n".join(f"- {a}" for a in avisos) + "\n")
    return "\n".join(partes)


def seccion_pronostico(url: str) -> str:
    filas = pronostico.resumen_backtesting(url)
    if not filas:
        return "## 3. Pronóstico de actividad mensual por zona: backtesting\n\n" + PENDIENTE + "\n"
    df = pd.DataFrame(filas)
    pivote = df.pivot_table(index=["zona", "modelo_ganador", "n_meses"], columns="modelo", values=["mae", "mape"])
    cuerpo = []
    for (zona, ganador, meses), fila in pivote.iterrows():
        cuerpo.append([zona, str(meses), *[n(fila[("mae", m)]) for m in ETIQUETA_MODELO],
                       *[n(fila[("mape", m)], 1) for m in ETIQUETA_MODELO], ETIQUETA_MODELO[ganador]])
    zonas = df[df.zona != pronostico.ZONA_NACIONAL]
    victorias = zonas.drop_duplicates("zona").modelo_ganador.value_counts()
    media = zonas.groupby("modelo").mae.mean()
    texto = ("## 3. Pronóstico de actividad mensual por zona: backtesting (D16)\n\n"
             "Origen móvil desde el mes 24, pronosticando t+1..t+3. MAE en sismos/mes; MAPE en %, sin los meses con 0 eventos. "
             "La fila «Colombia» es la serie de todo el catálogo SGC (D21) y no entra en el conteo de zonas ganadas.\n\n"
             + tabla(["Zona", "Meses", *[f"MAE {e}" for e in ETIQUETA_MODELO.values()],
                      *[f"MAPE {e}" for e in ETIQUETA_MODELO.values()], "Elegido"], cuerpo)
             + "\n\nZonas ganadas por cada modelo: "
             + ", ".join(f"{ETIQUETA_MODELO[m]} {int(victorias.get(m, 0))}" for m in ETIQUETA_MODELO)
             + ". MAE medio entre zonas: " + ", ".join(f"{ETIQUETA_MODELO[m]} {n(media.get(m))}" for m in ETIQUETA_MODELO) + ".\n")
    return texto


def seccion_amenaza(url: str) -> str:
    try:
        p = amenaza.periodos(url)
        m = amenaza.mapa(url)
    except amenaza.SinCatalogoHistorico:
        return "## 4. Periodo de retorno y mapa de amenaza\n\n" + PENDIENTE + "\n"
    par = p["parametros"]
    texto = [f"## 4. Periodo de retorno y mapa de amenaza (D17)\n",
             f"Catálogo USGS_HIST (M ≥ {n(par['magnitudMinCatalogo'], 1)}) del {p['periodoInicio'][:10]} al {p['periodoFin'][:10]} "
             f"({n(par['anios'], 1)} años): {n(par['eventosCatalogo'], 0)} eventos, {n(par['eventosDepurados'], 0)} tras "
             f"depurar réplicas ({par['depuracion']}). Mc = {n(par['mc'], 1)} "
             f"(por década: {', '.join(f'{k} {n(v, 1)}' for k, v in par['mcPorDecada'].items())}). "
             f"b regional = {n(par['bRegional'], 3)} ± {n(par['errorBRegional'], 3)}.\n",
             "Zonas con análisis propio (las agrupadas comparten la tasa de su región y se listan aparte):\n"]
    propias, agrupadas = [], {}
    for z in p["zonas"]:
        tr = {mm["magnitud"]: mm for mm in z["magnitudes"]}
        fila = [n(z["b"]), *[f"{n(tr[k]['periodoRetorno'], 1)} [{n(tr[k]['periodoRetornoMin'], 1)}–{n(tr[k]['periodoRetornoMax'], 1)}]"
                             + (" (extrap.)" if tr[k]["extrapolado"] else "") for k in (5.0, 6.0, 7.0)],
                *[pct(tr[6.0]["probabilidades"][h]) for h in ("dias30", "anios1", "anios10", "anios50")]]
        if z["agrupadaEn"]:
            agrupadas.setdefault(z["agrupadaEn"], (fila, []))[1].append(z["zona"])
        else:
            propias.append([z["zona"], n(z["nEventos"], 0), *fila])
    enc = ["b", "Tr M5 (años)", "Tr M6 (años)", "Tr M7 (años)", "P(M6) 30 d", "P(M6) 1 a", "P(M6) 10 a", "P(M6) 50 a"]
    texto.append(tabla(["Zona", "Eventos ≥ Mc", *enc], propias) + "\n")
    if agrupadas:
        texto.append(tabla(["Región", "Zonas", *enc], [[r, ", ".join(z), *f] for r, (f, z) in agrupadas.items()]) + "\n")
    probs = pd.Series([c["probabilidad10a"] for c in m["celdas"]])
    texto.append(f"Mapa de sismicidad suavizada (Frankel 1995, c = {n(par['distanciaCorrelacionKm'], 0)} km, celdas de "
                 f"{n(par['tamanoCeldaGrados'], 1)}°): {len(probs)} celdas; P(M ≥ 5 en 10 años) máxima {pct(probs.max())}, "
                 f"mediana {pct(probs.median())}, percentil 90 {pct(probs.quantile(0.9))}.\n")
    return "\n".join(texto)


def seccion_modelo(url: str) -> str:
    t = db.tablas(url)["modelo_predictivo"]
    with db.motor(url).connect() as c:
        modelos = c.execute(select(t).order_by(t.c.id_modelo)).all()
    v2 = [mo for mo in modelos if mo.reporte is not None]
    if not v2:
        anteriores = tabla(["Versión", "Algoritmo", "F1 macro", "Exactitud", "Activo"],
                           [[mo.version, mo.algoritmo, n(mo.f1_macro, 3), n(mo.exactitud, 3), "sí" if mo.activo else "no"]
                            for mo in modelos]) if modelos else ""
        return "## 5. Modelo de impacto\n\n" + PENDIENTE + "\n\n" + anteriores + "\n"
    mo = v2[-1]
    r = leer(mo.reporte)
    partes = [f"## 5. Modelo de impacto (D18)\n",
              f"Último entrenamiento: {mo.version} ({mo.fecha_entrenamiento:%Y-%m-%d}). {r['validacion']}. "
              f"{n(r['ejemplos'], 0)} ejemplos; {n(r['reportesConEpicentro'], 0)} de {n(r['reportes'], 0)} reportes de daño "
              f"con epicentro asociado.\n",
              tabla(["Modelo", "F1 macro", "Exactitud", "Brier", "F1 sin afect.", "F1 bajo", "F1 moderado", "F1 alto"],
                    [[c["algoritmo"] + (" **(elegido)**" if c["algoritmo"] == r["elegido"] else ""), n(c["f1Macro"], 3),
                      n(c["exactitud"], 3), n(c["brier"], 3),
                      *[n(c["porClase"][k]["f1"], 2) for k in ("SIN_AFECTACION", "BAJO", "MODERADO", "ALTO")]]
                     for c in sorted(r["comparacion"], key=lambda c: -c["f1Macro"])]) + "\n",
              f"Calibración ({r['calibracion']['metodo']}): Brier {n(r['sinCalibrar']['brier'], 3)} → {n(r['calibracion']['brier'], 3)}; "
              f"F1 macro {n(r['sinCalibrar']['f1Macro'], 3)} → {n(r['calibracion']['f1Macro'], 3)}. "
              f"Versión desplegada: {r['desplegado']}.\n"]
    act = r["activacion"]
    vig = act["vigente"]
    partes.append(f"Activación: {act['regla']}. Nuevo {n(act['f1MacroNuevo'], 3)} contra "
                  + (f"vigente {vig['version']} ({vig['algoritmo']}) {n(vig['f1Macro'] if vig['f1Macro'] is not None else vig['f1MacroRegistrado'], 3)} "
                     f"({act.get('comparadoCon', 'mismos pliegues')}; F1 registrado al entrenarlo: {n(vig['f1MacroRegistrado'], 3)})"
                     if vig else "ningún modelo activo")
                  + f" → **{'activado' if act['activado'] else 'no activado'}**.\n")
    partes.append("Matriz de confusión del modelo desplegado (filas: real; columnas: predicha; orden sin afectación, bajo, "
                  "moderado, alto):\n\n" + tabla(["Real \\ Predicha", "Sin afect.", "Bajo", "Moderado", "Alto"],
                                                 [[k, *map(str, fila)] for k, fila in
                                                  zip(("Sin afect.", "Bajo", "Moderado", "Alto"), r["matrizConfusion"])]) + "\n")
    if r.get("shap"):
        partes.append(f"Variables más importantes (SHAP, {r['shap']['metodo']}, media de |SHAP| sobre {r['shap']['muestra']} ejemplos):\n\n"
                      + tabla(["#", "Variable", "Media |SHAP|"],
                              [[str(i + 1), v["etiqueta"], n(v["media"], 4)] for i, v in enumerate(r["shap"]["importancia"][:10])]) + "\n")
    if r.get("avisosDatos"):
        partes.append("Avisos de los datos:\n\n" + "\n".join(f"- {a}" for a in r["avisosDatos"]) + "\n")
    return "\n".join(partes)


def seccion_catalogo(url: str) -> str:
    try:
        p = amenaza.periodos(url)
    except amenaza.SinCatalogoHistorico:
        return "## 1. Catálogo histórico USGS_HIST\n\n" + PENDIENTE + "\n"
    par = p["parametros"]
    return (f"## 1. Catálogo histórico USGS_HIST (D14)\n\n{n(par['eventosCatalogo'], 0)} eventos M ≥ "
            f"{n(par['magnitudMinCatalogo'], 1)} entre {p['periodoInicio'][:10]} y {p['periodoFin'][:10]} en lat −4,5…13,5, "
            f"lon −82…−66. Se usa solo para tasas de sismos grandes (sección 4) y como epicentro de los reportes de daño (sección 5).\n")


def _aviso_fuentes(url: str) -> str:
    t = db.tablas(url)["registro_sismico"]
    with db.motor(url).connect() as c:
        presentes = {r[0] for r in c.execute(select(t.c.fuente).where(t.c.es_anomalo.is_(False)).distinct()).all()}
    faltan = [f for f in ("SGC", "DESINVENTAR") if f not in presentes]
    if not faltan:
        return ""
    return (f"\n> **Versión parcial:** la base usada no tiene {' ni '.join(faltan)}. Las secciones que dependen de esas "
            "fuentes quedan pendientes y la validación de réplicas usa solo los eventos disponibles (ver sección 0). "
            "Regenere el informe en el servidor con todos los datos cargados para obtener los resultados definitivos.\n")


def generar(url: str) -> str:
    ahora = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    encabezado = (
        "# Resultados de la analítica de SismoCol\n\n"
        f"Generado automáticamente el {ahora} con `python -m eda.resultados_analitica` a partir de la base de datos. "
        "No editar a mano: regenerar después de recalcular. Las técnicas, supuestos y limitaciones están en "
        "[decisiones.md](decisiones.md) (D14 a D21).\n\n"
        "> Todos los resultados son estimaciones estadísticas validadas con datos pasados. SismoCol no predice la fecha, "
        "el lugar ni la magnitud de un sismo.\n"
        + _aviso_fuentes(url)
    )
    return "\n".join([encabezado, seccion_datos(url), seccion_catalogo(url), seccion_replicas(url),
                      seccion_pronostico(url), seccion_amenaza(url), seccion_modelo(url)])


def main() -> None:
    analizador = argparse.ArgumentParser(description=__doc__)
    analizador.add_argument("--salida", type=Path, default=RAIZ_REPO / "docs" / "resultados_analitica.md")
    args = analizador.parse_args()
    texto = generar(ajustes().database_url)
    args.salida.write_text(texto, encoding="utf-8")
    print(f"Informe escrito en {args.salida}")


if __name__ == "__main__":
    main()
