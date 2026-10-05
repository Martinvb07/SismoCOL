import type { ErrorRequestHandler, RequestHandler } from 'express';
import multer from 'multer';
import { z, ZodError } from 'zod';

export interface DetalleError {
  campo: string;
  mensaje: string;
}

/** Error con código HTTP y mensaje apto para mostrar al usuario. */
export class ErrorHttp extends Error {
  constructor(
    readonly estado: number,
    mensaje: string,
    readonly detalles?: DetalleError[],
  ) {
    super(mensaje);
  }
}

function detallesZod(error: ZodError): DetalleError[] {
  return error.issues.map((issue) => ({ campo: issue.path.join('.'), mensaje: issue.message }));
}

/** Valida y reemplaza req.body por el resultado tipado del esquema. */
export function validarCuerpo<T extends z.ZodType>(esquema: T): RequestHandler {
  return (req, _res, next) => {
    const resultado = esquema.safeParse(req.body);
    if (!resultado.success) {
      next(new ErrorHttp(400, 'Datos inválidos', detallesZod(resultado.error)));
      return;
    }
    req.body = resultado.data;
    next();
  };
}

/** Valida req.query; el resultado queda en res.locals.query (req.query es de solo lectura en Express 5). */
export function validarQuery<T extends z.ZodType>(esquema: T): RequestHandler {
  return (req, res, next) => {
    const resultado = esquema.safeParse(req.query);
    if (!resultado.success) {
      next(new ErrorHttp(400, 'Parámetros inválidos', detallesZod(resultado.error)));
      return;
    }
    res.locals.query = resultado.data;
    next();
  };
}

export const manejarErrores: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof ErrorHttp) {
    res.status(error.estado).json({ error: error.message, detalles: error.detalles });
    return;
  }
  if (error instanceof ZodError) {
    res.status(400).json({ error: 'Datos inválidos', detalles: detallesZod(error) });
    return;
  }
  if (error instanceof multer.MulterError) {
    const estado = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    const mensaje =
      error.code === 'LIMIT_FILE_SIZE' ? 'El archivo supera el tamaño máximo permitido' : 'Archivo inválido';
    res.status(estado).json({ error: mensaje });
    return;
  }
  if (error instanceof SyntaxError && 'body' in error) {
    res.status(400).json({ error: 'JSON mal formado' });
    return;
  }
  req.log.error({ err: error }, 'Error no controlado');
  res.status(500).json({ error: 'Error interno del servidor' });
};
