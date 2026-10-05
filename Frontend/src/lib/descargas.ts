/** Dispara la descarga de un Blob en el navegador. */
export function descargarBlob(blob: Blob, nombreArchivo: string): void {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  // Se libera después de que el navegador inicie la descarga
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
