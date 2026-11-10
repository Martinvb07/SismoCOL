"""Intensidad macrosísmica estimada (MMI) en un municipio (fase 5 de la analítica).

Ecuación de predicción de intensidad de Allen, Wald y Worden (2012), versión con
distancia hipocentral:

    Allen, T. I., Wald, D. J. y Worden, C. B. (2012). Intensity attenuation for
    active crustal regions. Journal of Seismology, 16, 409-433.
    https://doi.org/10.1007/s10950-012-9278-7

    MMI = c0 + c1·M + c2·ln(√(R² + R_M²)) + c4·ln(R/50)·[R > 50 km]
    R_M = m1 + m2·exp(M − 5)
    c0 = 2,085; c1 = 1,428; c2 = −1,402; c4 = 0,078; m1 = −0,209; m2 = 2,042
    σ = s1 + s2 / (1 + (R/s3)²), con s1 = 0,82; s2 = 0,37; s3 = 22,9

Los coeficientes se copiaron de la implementación de referencia de OpenQuake
(openquake.hazardlib.gsim.allen_2012_ipe.AllenEtAl2012Rhypo, versión 3.26.2).

Limitaciones: la ecuación se derivó para corteza activa somera, Mw 5,0-7,9 y
R < 300 km. Aquí se aplica también a sismos de profundidad intermedia (Nido de
Bucaramanga, Chocó a 116 km) y a magnitudes del catálogo (ML/mb/Mw mezcladas),
fuera de su rango de calibración; por eso entra al modelo como una variable más y
no como una predicción de daño por sí misma.
"""

from __future__ import annotations

import numpy as np

from sismocol.geo import haversine_km

C0, C1, C2, C4 = 2.085, 1.428, -1.402, 0.078
M1, M2 = -0.209, 2.042
S1, S2, S3 = 0.82, 0.37, 22.9
DISTANCIA_ANELASTICA_KM = 50.0
DISTANCIA_MAXIMA_KM = 300.0
MMI_MINIMA, MMI_MAXIMA = 1.0, 12.0


def distancia_hipocentral(lat_epi, lon_epi, profundidad_km, lat_sitio, lon_sitio) -> np.ndarray:
    epicentral = haversine_km(lat_epi, lon_epi, lat_sitio, lon_sitio)
    return np.sqrt(np.asarray(epicentral, float) ** 2 + np.asarray(profundidad_km, float) ** 2)


def mmi_allen2012(magnitud, distancia_hipocentral_km) -> np.ndarray:
    """MMI media (acotada entre I y XII)."""
    m = np.asarray(magnitud, dtype=float)
    r = np.maximum(np.asarray(distancia_hipocentral_km, dtype=float), 1e-3)
    r_m = M1 + M2 * np.exp(m - 5.0)
    mmi = C0 + C1 * m + C2 * np.log(np.sqrt(r ** 2 + r_m ** 2))
    mmi = mmi + np.where(r > DISTANCIA_ANELASTICA_KM, C4 * np.log(r / DISTANCIA_ANELASTICA_KM), 0.0)
    return np.clip(mmi, MMI_MINIMA, MMI_MAXIMA)


def sigma_allen2012(distancia_hipocentral_km) -> np.ndarray:
    r = np.asarray(distancia_hipocentral_km, dtype=float)
    return S1 + S2 / (1.0 + (r / S3) ** 2)
