-- CreateTable
CREATE TABLE `pronostico_replicas` (
    `id_pronostico` INTEGER NOT NULL AUTO_INCREMENT,
    `id_sismo_principal` INTEGER NOT NULL,
    `tipo` ENUM('PRONOSTICO', 'VALIDACION') NOT NULL,
    `horas_ajuste` DECIMAL(9, 2) NULL,
    `inicio_ajuste` DATETIME(0) NOT NULL,
    `fin_ajuste` DATETIME(0) NOT NULL,
    `metodo` ENUM('MAXIMA_VEROSIMILITUD', 'GENERICO_A_SECUENCIA', 'GENERICO') NOT NULL,
    `n_replicas` INTEGER UNSIGNED NOT NULL,
    `magnitud_completitud` DECIMAL(3, 1) NOT NULL,
    `valor_a` DECIMAL(7, 4) NOT NULL,
    `valor_b` DECIMAL(6, 4) NOT NULL,
    `valor_p` DECIMAL(6, 4) NOT NULL,
    `valor_c` DECIMAL(8, 5) NOT NULL,
    `parametros` JSON NOT NULL,
    `resultados` JSON NOT NULL,
    `fecha_calculo` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `pronostico_replicas_id_sismo_principal_tipo_fecha_calculo_idx`(`id_sismo_principal`, `tipo`, `fecha_calculo`),
    INDEX `pronostico_replicas_fecha_calculo_idx`(`fecha_calculo`),
    PRIMARY KEY (`id_pronostico`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `pronostico_replicas` ADD CONSTRAINT `pronostico_replicas_id_sismo_principal_fkey` FOREIGN KEY (`id_sismo_principal`) REFERENCES `registro_sismico`(`id_sismo`) ON DELETE CASCADE ON UPDATE CASCADE;
