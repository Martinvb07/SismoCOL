import type { ContribucionShap, ImportanciaShap } from '@/api/tipos';
import { formatearNumero } from '@/lib/formato';

const COLOR_POSITIVO = '#d23c3c';
const COLOR_NEGATIVO = '#1f8fa6';

/** Importancia global: media de |SHAP| por variable (suma sobre clases). */
export function ImportanciaGlobal({ importancia }: { importancia: ImportanciaShap[] }) {
  const maximo = Math.max(...importancia.map((i) => i.media), 1e-9);
  return (
    <table className="tabla">
      <caption className="sr-only">Importancia global de cada variable según SHAP</caption>
      <thead>
        <tr>
          <th scope="col">Variable</th>
          <th scope="col">Media de |SHAP|</th>
        </tr>
      </thead>
      <tbody>
        {importancia.map((i) => (
          <tr key={i.variable}>
            <td>{i.etiqueta}</td>
            <td className="w-1/2">
              <div className="flex items-center gap-2">
                <div className="h-3 flex-1 rounded bg-fondo" aria-hidden="true">
                  <div className="h-3 rounded" style={{ width: `${(i.media / maximo) * 100}%`, backgroundColor: COLOR_NEGATIVO }} />
                </div>
                <span className="w-16 text-right tabular-nums">{formatearNumero(i.media, 3)}</span>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Contribución de cada variable a la clase predicha en una predicción (a favor en rojo, en contra en azul). */
export function ContribucionesPrediccion({ contribuciones }: { contribuciones: ContribucionShap[] }) {
  const maximo = Math.max(...contribuciones.map((c) => Math.abs(c.contribucion)), 1e-9);
  return (
    <ul className="space-y-1.5 text-sm" aria-label="Contribución de cada variable a la predicción">
      {contribuciones.map((c) => {
        const ancho = (Math.abs(c.contribucion) / maximo) * 50;
        const positiva = c.contribucion >= 0;
        return (
          <li key={c.variable} className="grid grid-cols-[minmax(0,11rem)_1fr_4.5rem] items-center gap-2">
            <span className="truncate text-tinta-secundaria" title={c.etiqueta}>
              {c.etiqueta} <span className="tabular-nums text-tinta-tenue">({formatearNumero(c.valor, 1)})</span>
            </span>
            <div className="relative h-3 rounded bg-fondo" aria-hidden="true">
              <div className="absolute inset-y-0 left-1/2 w-px bg-borde" />
              <div
                className="absolute inset-y-0 rounded"
                style={{
                  backgroundColor: positiva ? COLOR_POSITIVO : COLOR_NEGATIVO,
                  width: `${ancho}%`,
                  left: positiva ? '50%' : `${50 - ancho}%`,
                }}
              />
            </div>
            <span className="text-right tabular-nums">
              {positiva ? '+' : '−'}
              {formatearNumero(Math.abs(c.contribucion), 3)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
