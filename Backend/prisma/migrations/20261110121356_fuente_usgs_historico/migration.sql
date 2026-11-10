-- AlterTable
ALTER TABLE `afectacion` MODIFY `fuente` ENUM('SGC', 'UNGRD', 'DESINVENTAR', 'USGS', 'USGS_HIST') NOT NULL;

-- AlterTable
ALTER TABLE `carga_datos` MODIFY `fuente` ENUM('SGC', 'UNGRD', 'DESINVENTAR', 'USGS', 'USGS_HIST') NOT NULL;

-- AlterTable
ALTER TABLE `registro_sismico` MODIFY `fuente` ENUM('SGC', 'UNGRD', 'DESINVENTAR', 'USGS', 'USGS_HIST') NOT NULL;
