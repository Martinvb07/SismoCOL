-- CreateTable
CREATE TABLE `pronostico_actividad` (
    `id_pronostico` INTEGER NOT NULL AUTO_INCREMENT,
    `zona` VARCHAR(60) NOT NULL,
    `modelo_ganador` ENUM('SARIMA', 'INGENUO', 'MEDIA_MOVIL_12') NOT NULL,
    `magnitud_completitud` DECIMAL(3, 1) NOT NULL,
    `periodo_inicio` DATE NOT NULL,
    `periodo_fin` DATE NOT NULL,
    `n_meses` SMALLINT UNSIGNED NOT NULL,
    `parametros` JSON NOT NULL,
    `resultados` JSON NOT NULL,
    `fecha_calculo` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `pronostico_actividad_zona_fecha_calculo_idx`(`zona`, `fecha_calculo`),
    INDEX `pronostico_actividad_fecha_calculo_idx`(`fecha_calculo`),
    PRIMARY KEY (`id_pronostico`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `backtesting_pronostico` (
    `id_backtesting` INTEGER NOT NULL AUTO_INCREMENT,
    `id_pronostico` INTEGER NOT NULL,
    `modelo` ENUM('SARIMA', 'INGENUO', 'MEDIA_MOVIL_12') NOT NULL,
    `mae` DECIMAL(10, 4) NULL,
    `mape` DECIMAL(10, 4) NULL,
    `n_pronosticos` INTEGER UNSIGNED NOT NULL,
    `detalle` JSON NOT NULL,

    INDEX `backtesting_pronostico_id_pronostico_idx`(`id_pronostico`),
    PRIMARY KEY (`id_backtesting`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `backtesting_pronostico` ADD CONSTRAINT `backtesting_pronostico_id_pronostico_fkey` FOREIGN KEY (`id_pronostico`) REFERENCES `pronostico_actividad`(`id_pronostico`) ON DELETE CASCADE ON UPDATE CASCADE;
