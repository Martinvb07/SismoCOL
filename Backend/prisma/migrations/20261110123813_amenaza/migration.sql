-- CreateTable
CREATE TABLE `calculo_amenaza` (
    `id_calculo` INTEGER NOT NULL AUTO_INCREMENT,
    `catalogo` ENUM('SGC', 'UNGRD', 'DESINVENTAR', 'USGS', 'USGS_HIST') NOT NULL,
    `periodo_inicio` DATETIME(0) NOT NULL,
    `periodo_fin` DATETIME(0) NOT NULL,
    `parametros` JSON NOT NULL,
    `fecha_calculo` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `calculo_amenaza_fecha_calculo_idx`(`fecha_calculo`),
    PRIMARY KEY (`id_calculo`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `periodo_retorno` (
    `id_periodo` INTEGER NOT NULL AUTO_INCREMENT,
    `id_calculo` INTEGER NOT NULL,
    `zona` VARCHAR(60) NOT NULL,
    `agrupada_en` VARCHAR(60) NULL,
    `n_eventos` INTEGER UNSIGNED NOT NULL,
    `magnitud_completitud` DECIMAL(3, 1) NOT NULL,
    `valor_a` DOUBLE NOT NULL,
    `valor_b` DOUBLE NOT NULL,
    `error_b` DOUBLE NOT NULL,
    `magnitud` DECIMAL(3, 1) NOT NULL,
    `tasa_anual` DOUBLE NOT NULL,
    `periodo_retorno` DOUBLE NOT NULL,
    `periodo_retorno_min` DOUBLE NOT NULL,
    `periodo_retorno_max` DOUBLE NOT NULL,
    `magnitud_maxima_observada` DECIMAL(3, 1) NOT NULL,
    `extrapolado` BOOLEAN NOT NULL,
    `probabilidades` JSON NOT NULL,

    INDEX `periodo_retorno_id_calculo_zona_idx`(`id_calculo`, `zona`),
    PRIMARY KEY (`id_periodo`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `amenaza_celda` (
    `id_celda` INTEGER NOT NULL AUTO_INCREMENT,
    `id_calculo` INTEGER NOT NULL,
    `latitud` DECIMAL(6, 3) NOT NULL,
    `longitud` DECIMAL(7, 3) NOT NULL,
    `eventos` DOUBLE NOT NULL,
    `tasa_mc` DOUBLE NOT NULL,
    `tasa_m5` DOUBLE NOT NULL,
    `probabilidad_10a` DOUBLE NOT NULL,

    INDEX `amenaza_celda_id_calculo_idx`(`id_calculo`),
    PRIMARY KEY (`id_celda`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `periodo_retorno` ADD CONSTRAINT `periodo_retorno_id_calculo_fkey` FOREIGN KEY (`id_calculo`) REFERENCES `calculo_amenaza`(`id_calculo`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `amenaza_celda` ADD CONSTRAINT `amenaza_celda_id_calculo_fkey` FOREIGN KEY (`id_calculo`) REFERENCES `calculo_amenaza`(`id_calculo`) ON DELETE CASCADE ON UPDATE CASCADE;
