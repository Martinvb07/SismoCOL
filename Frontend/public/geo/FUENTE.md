# Fuente del GeoJSON de departamentos

`colombia-departamentos.json` contiene los 32 departamentos y Bogotá, D.C. (33 polígonos).

- **Fuente**: geoBoundaries (William & Mary geoLab), conjunto `gbOpen/COL/ADM1`,
  build del 12 de diciembre de 2023, derivado de OpenStreetMap (Wambacher).
  - API: https://www.geoboundaries.org/api/current/gbOpen/COL/ADM1/
  - Archivo original: https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/COL/ADM1/geoBoundaries-COL-ADM1_simplified.geojson
- **Licencia**: Open Data Commons Open Database License 1.0 (ODbL), según
  https://www.openstreetmap.org/copyright. Atribución requerida:
  "© colaboradores de OpenStreetMap; geoBoundaries (Runfola et al., 2020)".
  La aplicación muestra esta atribución al pie del mapa.

## Transformaciones aplicadas

1. Simplificación con mapshaper 0.6 (`-simplify 25% keep-shapes`, precisión 0,0001°):
   de 1,2 MB a ~210 kB.
2. Propiedades reducidas a `nombre` (nombre del departamento en español; "Bogota Capital
   District" pasó a "Bogotá, D.C.") y `codigo` (ISO 3166-2, p. ej. `CO-SAN`).
3. Se invirtió el sentido de los anillos (RFC 7946 → sentido horario) porque `d3-geo`
   interpreta los polígonos sobre la esfera y espera el anillo exterior en sentido horario.

Los límites son referenciales y no tienen validez oficial; para límites oficiales usar
el Marco Geoestadístico Nacional del DANE.
