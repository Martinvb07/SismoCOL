import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type DragEvent } from 'react';
import { esErrorApi, mensajeDeError } from '@/api/cliente';
import { apiAdmin } from '@/api/endpoints';
import { FUENTES, type Fuente } from '@/api/tipos';
import { Alerta, Boton } from '@/componentes/ui/Basicos';
import { Selector } from '@/componentes/ui/Formulario';
import { IconoSubir } from '@/componentes/ui/Iconos';
import { TAMANO_MAXIMO_ARCHIVO_BYTES } from '@/config';
import { validarArchivoCarga } from '@/lib/archivos';
import { ETIQUETAS_FUENTE } from '@/lib/etiquetas';
import { formatearBytes } from '@/lib/formato';
import { ReporteValidacion } from './ReporteValidacion';

const ZONAS_HORARIAS = [
  { valor: '', etiqueta: 'Por defecto del servidor' },
  { valor: 'UTC', etiqueta: 'UTC' },
  { valor: 'America/Bogota', etiqueta: 'Hora de Colombia (America/Bogota)' },
] as const;

export function CargaArchivo() {
  const idEntrada = useId();
  const idFuente = useId();
  const idZona = useId();
  const clienteConsultas = useQueryClient();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [fuente, setFuente] = useState<Fuente | ''>('');
  const [zonaHoraria, setZonaHoraria] = useState('');

  const carga = useMutation({
    mutationFn: (a: File) => apiAdmin.cargarArchivo(a, fuente || undefined, zonaHoraria || undefined),
    onSuccess: () => {
      void clienteConsultas.invalidateQueries({ queryKey: ['cargas'] });
      void clienteConsultas.invalidateQueries({ queryKey: ['admin'] });
    },
  });

  const elegir = (a: File | undefined) => {
    if (!a) return;
    carga.reset();
    const error = validarArchivoCarga(a);
    setErrorLocal(error);
    setArchivo(error ? null : a);
  };

  const soltar = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setArrastrando(false);
    elegir(e.dataTransfer.files[0]);
  };

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={soltar}
        className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors ${
          arrastrando ? 'border-primario bg-primario-claro' : 'border-borde bg-fondo'
        }`}
      >
        <IconoSubir className="h-8 w-8 text-primario" />
        <p className="text-sm text-tinta-secundaria">
          Arrastra aquí un archivo CSV o XLSX (máx. {formatearBytes(TAMANO_MAXIMO_ARCHIVO_BYTES)}) o
        </p>
        <label htmlFor={idEntrada} className="cursor-pointer rounded-md border border-borde bg-white px-3 py-1.5 text-sm font-medium text-tinta hover:bg-fondo focus-within:ring-2 focus-within:ring-primario">
          Elegir archivo
          <input
            id={idEntrada}
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={(e) => {
              elegir(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
        {archivo && (
          <p className="text-sm font-medium" aria-live="polite">
            {archivo.name} · {formatearBytes(archivo.size)}
          </p>
        )}
      </div>

      {errorLocal && <Alerta tipo="error">{errorLocal}</Alerta>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={idFuente} className="mb-1 block text-sm font-medium text-tinta-secundaria">
            Fuente (opcional)
          </label>
          <Selector id={idFuente} value={fuente} onChange={(e) => setFuente(e.target.value as Fuente | '')}>
            <option value="">Detectar desde el archivo</option>
            {FUENTES.map((f) => (
              <option key={f} value={f}>
                {ETIQUETAS_FUENTE[f]}
              </option>
            ))}
          </Selector>
        </div>
        <div>
          <label htmlFor={idZona} className="mb-1 block text-sm font-medium text-tinta-secundaria">
            Zona horaria de las fechas (opcional)
          </label>
          <Selector id={idZona} value={zonaHoraria} onChange={(e) => setZonaHoraria(e.target.value)}>
            {ZONAS_HORARIAS.map((z) => (
              <option key={z.valor} value={z.valor}>
                {z.etiqueta}
              </option>
            ))}
          </Selector>
        </div>
      </div>

      <Boton onClick={() => archivo && carga.mutate(archivo)} disabled={!archivo} cargando={carga.isPending}>
        {carga.isPending ? 'Procesando archivo…' : 'Cargar y validar'}
      </Boton>

      {carga.isError && (
        <Alerta tipo="error" titulo={esErrorApi(carga.error) && carga.error.estado === 422 ? 'Archivo rechazado' : 'No se pudo cargar el archivo'}>
          <p>{mensajeDeError(carga.error)}</p>
          {esErrorApi(carga.error) && carga.error.detalles.length > 0 && (
            <ul className="mt-1 list-disc pl-4">
              {carga.error.detalles.map((d) => (
                <li key={`${d.campo}-${d.mensaje}`}>{d.mensaje}</li>
              ))}
            </ul>
          )}
        </Alerta>
      )}

      {carga.data && (
        <>
          <Alerta tipo="exito" titulo="Archivo procesado">
            Se registraron {carga.data.cargas.length} carga(s).
          </Alerta>
          <ReporteValidacion reporte={carga.data.reporte} />
        </>
      )}
    </div>
  );
}
