-- CreateTable
CREATE TABLE `usuario` (
    `id_usuario` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(100) NOT NULL,
    `correo` VARCHAR(150) NOT NULL,
    `contrasena_hash` VARCHAR(255) NOT NULL,
    `rol` ENUM('ADMIN', 'USUARIO') NOT NULL DEFAULT 'USUARIO',
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `fecha_creacion` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `usuario_correo_key`(`correo`),
    PRIMARY KEY (`id_usuario`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `carga_datos` (
    `id_carga` INTEGER NOT NULL AUTO_INCREMENT,
    `id_usuario` INTEGER NULL,
    `origen` ENUM('ARCHIVO', 'API') NOT NULL DEFAULT 'ARCHIVO',
    `fuente` ENUM('SGC', 'UNGRD', 'DESINVENTAR', 'USGS') NOT NULL,
    `nombre_archivo` VARCHAR(255) NOT NULL,
    `registros_leidos` INTEGER UNSIGNED NOT NULL,
    `registros_validos` INTEGER UNSIGNED NOT NULL,
    `estado` ENUM('PROCESADO', 'RECHAZADO') NOT NULL,
    `fecha_carga` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `carga_datos_fecha_carga_idx`(`fecha_carga`),
    PRIMARY KEY (`id_carga`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `registro_sismico` (
    `id_sismo` INTEGER NOT NULL AUTO_INCREMENT,
    `id_carga` INTEGER NOT NULL,
    `id_evento_origen` VARCHAR(40) NOT NULL,
    `clave_origen` CHAR(64) NOT NULL,
    `fecha_hora` DATETIME(0) NOT NULL,
    `latitud` DECIMAL(9, 6) NULL,
    `longitud` DECIMAL(9, 6) NULL,
    `precision_ubicacion` ENUM('EPICENTRO', 'CENTROIDE_MUNICIPIO') NULL,
    `profundidad_km` DECIMAL(6, 2) NULL,
    `magnitud` DECIMAL(3, 1) NULL,
    `tipo_magnitud` VARCHAR(8) NULL,
    `departamento` VARCHAR(60) NULL,
    `municipio` VARCHAR(80) NULL,
    `zona` VARCHAR(60) NULL,
    `fuente` ENUM('SGC', 'UNGRD', 'DESINVENTAR', 'USGS') NOT NULL,
    `nivel_impacto` ENUM('SIN_AFECTACION', 'BAJO', 'MODERADO', 'ALTO') NULL,
    `es_replica` BOOLEAN NOT NULL DEFAULT false,
    `es_anomalo` BOOLEAN NOT NULL DEFAULT false,
    `motivo_anomalia` VARCHAR(120) NULL,

    UNIQUE INDEX `registro_sismico_clave_origen_key`(`clave_origen`),
    INDEX `registro_sismico_fecha_hora_idx`(`fecha_hora`),
    INDEX `registro_sismico_departamento_fecha_hora_idx`(`departamento`, `fecha_hora`),
    INDEX `registro_sismico_zona_fecha_hora_idx`(`zona`, `fecha_hora`),
    INDEX `registro_sismico_magnitud_idx`(`magnitud`),
    INDEX `registro_sismico_fuente_id_evento_origen_idx`(`fuente`, `id_evento_origen`),
    PRIMARY KEY (`id_sismo`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `afectacion` (
    `id_afectacion` INTEGER NOT NULL AUTO_INCREMENT,
    `id_sismo` INTEGER NOT NULL,
    `fallecidos` INTEGER UNSIGNED NULL,
    `heridos` INTEGER UNSIGNED NULL,
    `desaparecidos` INTEGER UNSIGNED NULL,
    `personas_afectadas` INTEGER UNSIGNED NULL,
    `damnificados` INTEGER UNSIGNED NULL,
    `viviendas_destruidas` INTEGER UNSIGNED NULL,
    `viviendas_averiadas` INTEGER UNSIGNED NULL,
    `fuente` ENUM('SGC', 'UNGRD', 'DESINVENTAR', 'USGS') NOT NULL,

    UNIQUE INDEX `afectacion_id_sismo_key`(`id_sismo`),
    PRIMARY KEY (`id_afectacion`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `modelo_predictivo` (
    `id_modelo` INTEGER NOT NULL AUTO_INCREMENT,
    `version` VARCHAR(20) NOT NULL,
    `algoritmo` VARCHAR(50) NOT NULL,
    `ruta_archivo` VARCHAR(255) NOT NULL,
    `exactitud` DECIMAL(5, 4) NOT NULL,
    `f1_macro` DECIMAL(5, 4) NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT false,
    `fecha_entrenamiento` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `modelo_predictivo_version_key`(`version`),
    PRIMARY KEY (`id_modelo`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `prediccion` (
    `id_prediccion` INTEGER NOT NULL AUTO_INCREMENT,
    `id_usuario` INTEGER NOT NULL,
    `id_modelo` INTEGER NOT NULL,
    `magnitud` DECIMAL(3, 1) NOT NULL,
    `profundidad_km` DECIMAL(6, 2) NOT NULL,
    `latitud` DECIMAL(9, 6) NOT NULL,
    `longitud` DECIMAL(9, 6) NOT NULL,
    `nivel_impacto` ENUM('SIN_AFECTACION', 'BAJO', 'MODERADO', 'ALTO') NOT NULL,
    `probabilidad` DECIMAL(5, 4) NOT NULL,
    `fecha` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `prediccion_fecha_idx`(`fecha`),
    PRIMARY KEY (`id_prediccion`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dispositivo_esp32` (
    `id_dispositivo` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(80) NOT NULL,
    `topico_mqtt` VARCHAR(100) NOT NULL,
    `estado` ENUM('EN_LINEA', 'DESCONECTADO') NOT NULL DEFAULT 'DESCONECTADO',
    `ultima_conexion` DATETIME(0) NULL,

    UNIQUE INDEX `dispositivo_esp32_topico_mqtt_key`(`topico_mqtt`),
    PRIMARY KEY (`id_dispositivo`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `simulacion` (
    `id_simulacion` INTEGER NOT NULL AUTO_INCREMENT,
    `id_usuario` INTEGER NOT NULL,
    `id_dispositivo` INTEGER NOT NULL,
    `magnitud_simulada` DECIMAL(3, 1) NOT NULL,
    `estado_envio` ENUM('PENDIENTE', 'ENVIADA', 'FALLIDA') NOT NULL DEFAULT 'PENDIENTE',
    `fecha` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `simulacion_fecha_idx`(`fecha`),
    PRIMARY KEY (`id_simulacion`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `configuracion_analisis` (
    `id_config` INTEGER NOT NULL AUTO_INCREMENT,
    `id_usuario` INTEGER NOT NULL,
    `ventana_dias` TINYINT UNSIGNED NOT NULL DEFAULT 7,
    `periodo_base_meses` TINYINT UNSIGNED NOT NULL DEFAULT 12,
    `umbral_elevada` DECIMAL(4, 3) NOT NULL DEFAULT 0.050,
    `umbral_alta` DECIMAL(4, 3) NOT NULL DEFAULT 0.001,
    `min_eventos_zona` SMALLINT UNSIGNED NOT NULL DEFAULT 50,
    `fecha_actualizacion` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `configuracion_analisis_fecha_actualizacion_idx`(`fecha_actualizacion`),
    PRIMARY KEY (`id_config`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `analisis_zona` (
    `id_analisis` INTEGER NOT NULL AUTO_INCREMENT,
    `id_config` INTEGER NOT NULL,
    `zona` VARCHAR(60) NOT NULL,
    `agrupada_en` VARCHAR(60) NULL,
    `periodo_inicio` DATE NOT NULL,
    `periodo_fin` DATE NOT NULL,
    `n_eventos` INTEGER UNSIGNED NOT NULL,
    `magnitud_completitud` DECIMAL(3, 1) NOT NULL,
    `valor_a` DECIMAL(6, 3) NOT NULL,
    `valor_b` DECIMAL(5, 3) NOT NULL,
    `error_b` DECIMAL(5, 3) NOT NULL,
    `tasa_anual` DECIMAL(8, 3) NOT NULL,
    `tau_tendencia` DECIMAL(5, 3) NOT NULL,
    `p_valor_tendencia` DECIMAL(6, 5) NOT NULL,
    `pendiente_sen` DECIMAL(8, 4) NOT NULL,
    `fecha_calculo` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `analisis_zona_zona_fecha_calculo_idx`(`zona`, `fecha_calculo`),
    PRIMARY KEY (`id_analisis`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `advertencia_actividad` (
    `id_advertencia` INTEGER NOT NULL AUTO_INCREMENT,
    `id_analisis` INTEGER NOT NULL,
    `zona` VARCHAR(60) NOT NULL,
    `ventana_inicio` DATETIME(0) NOT NULL,
    `ventana_fin` DATETIME(0) NOT NULL,
    `eventos_observados` INTEGER UNSIGNED NOT NULL,
    `eventos_esperados` DECIMAL(8, 3) NOT NULL,
    `p_valor` DECIMAL(6, 5) NOT NULL,
    `nivel` ENUM('NORMAL', 'ELEVADA', 'ALTA') NOT NULL,
    `fecha_emision` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `advertencia_actividad_zona_fecha_emision_idx`(`zona`, `fecha_emision`),
    INDEX `advertencia_actividad_nivel_idx`(`nivel`),
    PRIMARY KEY (`id_advertencia`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `carga_datos` ADD CONSTRAINT `carga_datos_id_usuario_fkey` FOREIGN KEY (`id_usuario`) REFERENCES `usuario`(`id_usuario`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `registro_sismico` ADD CONSTRAINT `registro_sismico_id_carga_fkey` FOREIGN KEY (`id_carga`) REFERENCES `carga_datos`(`id_carga`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `afectacion` ADD CONSTRAINT `afectacion_id_sismo_fkey` FOREIGN KEY (`id_sismo`) REFERENCES `registro_sismico`(`id_sismo`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prediccion` ADD CONSTRAINT `prediccion_id_usuario_fkey` FOREIGN KEY (`id_usuario`) REFERENCES `usuario`(`id_usuario`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prediccion` ADD CONSTRAINT `prediccion_id_modelo_fkey` FOREIGN KEY (`id_modelo`) REFERENCES `modelo_predictivo`(`id_modelo`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `simulacion` ADD CONSTRAINT `simulacion_id_usuario_fkey` FOREIGN KEY (`id_usuario`) REFERENCES `usuario`(`id_usuario`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `simulacion` ADD CONSTRAINT `simulacion_id_dispositivo_fkey` FOREIGN KEY (`id_dispositivo`) REFERENCES `dispositivo_esp32`(`id_dispositivo`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `configuracion_analisis` ADD CONSTRAINT `configuracion_analisis_id_usuario_fkey` FOREIGN KEY (`id_usuario`) REFERENCES `usuario`(`id_usuario`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `analisis_zona` ADD CONSTRAINT `analisis_zona_id_config_fkey` FOREIGN KEY (`id_config`) REFERENCES `configuracion_analisis`(`id_config`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `advertencia_actividad` ADD CONSTRAINT `advertencia_actividad_id_analisis_fkey` FOREIGN KEY (`id_analisis`) REFERENCES `analisis_zona`(`id_analisis`) ON DELETE CASCADE ON UPDATE CASCADE;
