-- MySQL Version of frame_schema.sql
-- Converted from PostgreSQL dump

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET time_zone = "+00:00";

-- ---------------------------------------------------------
-- Table structure for table `rol_frame`
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS `rol_frame` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` text,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------
-- Table structure for table `empleado`
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS `empleado` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` text,
  `apellido` text,
  `genero_id` int(11) DEFAULT NULL,
  `tipo_documento_id` int(11) DEFAULT NULL,
  `documento` text,
  `cuit` text,
  `estado_civil` text,
  `calle` text,
  `codigo_postal` text,
  `altura` text,
  `piso_depto` text,
  `pais_id` int(11) DEFAULT NULL,
  `os_prepaga` tinyint(1) DEFAULT NULL,
  `os_id` int(11) DEFAULT NULL,
  `telefono` text,
  `telefono2` text,
  `visa` tinyint(1) DEFAULT NULL,
  `activo` tinyint(1) DEFAULT NULL,
  `banco_id` int(11) DEFAULT NULL,
  `cbu` text,
  `tipo_de_cuenta_bancaria` text,
  `nro_de_cuenta_bancaria` text,
  `alias_bancario` text,
  `email` text,
  `password` text,
  `nivel_estudio_id` int(11) DEFAULT NULL,
  `fecha_nac` datetime DEFAULT NULL,
  `fecha_alta` date DEFAULT NULL,
  `localidad` text,
  `estado_id` int(11) DEFAULT NULL,
  `in_house` tinyint(1) DEFAULT NULL,
  `afiliado_al_sindicato` tinyint(1) DEFAULT NULL,
  `numero_legajo_tango` text,
  `nacionalidad_id` int(11) DEFAULT NULL,
  `ruta_imagen` text,
  `banco_receptor` text,
  `swift` text,
  `informacion_bancaria_adicional` text,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------
-- Table structure for table `proyecto_empleado`
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS `proyecto_empleado` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `proyecto_id` int(11) DEFAULT NULL,
  `empleado_id` int(11) DEFAULT NULL,
  `estado_id` int(11) DEFAULT NULL,
  `categoria_sat_id` int(11) DEFAULT NULL,
  `fecha_alta_contrato` date DEFAULT NULL,
  `fecha_baja_contrato` date DEFAULT NULL,
  `tipo_contrato_id` int(11) DEFAULT NULL,
  `cantidad_jornadas_laborales` int(11) DEFAULT NULL,
  `sueldo_jornada` decimal(19,4) DEFAULT NULL,
  `sueldo_mano` decimal(19,4) DEFAULT NULL,
  `reemplazo` tinyint(1) DEFAULT NULL,
  `empleado_id_reemplazado` int(11) DEFAULT NULL,
  `observaciones` text,
  `sede_id` int(11) DEFAULT NULL,
  `rol_frame_id` int(11) DEFAULT NULL,
  `sueldo_mano_texto` text,
  `calificacion` int(11) DEFAULT NULL,
  `hora_inicio` text,
  `hora_fin` text,
  `fecha_carga` datetime DEFAULT NULL,
  `fecha_inicio_participacion` date DEFAULT NULL,
  `fecha_fin_participacion` date DEFAULT NULL,
  `puede_renovar_contrato` tinyint(1) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- (Continuing with other tables...)

CREATE TABLE IF NOT EXISTS `permiso` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `codigo` text,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `proyecto` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` text,
  `descripcion` text,
  `fecha_inicio` date DEFAULT NULL,
  `fecha_fin` date DEFAULT NULL,
  `fecha_alta` date DEFAULT NULL,
  `activo` tinyint(1) DEFAULT NULL,
  `responsable_id` int(11) DEFAULT NULL,
  `cliente_id` int(11) DEFAULT NULL,
  `sede_id` int(11) DEFAULT NULL,
  `centro_costo_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `categoria_sat` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `numero_categoria` int(11) DEFAULT NULL,
  `sueldo_bruto` decimal(19,4) DEFAULT NULL,
  `sueldo_bruto_letras` text,
  `neto` decimal(19,4) DEFAULT NULL,
  `fecha_actualizacion` date DEFAULT NULL,
  `sueldo_neto_letras` text,
  `nombre` text,
  `codigo_afip` int(11) DEFAULT NULL,
  `presentismo` decimal(19,4) DEFAULT NULL,
  `sueldo_basico` decimal(19,4) DEFAULT NULL,
  `sueldo_adicional` decimal(19,4) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `banco` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` text,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `centro_costo` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` text,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `cliente` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `cuit` text,
  `razon_social` text,
  `nombre_contacto` text,
  `email_contacto` text,
  `habilitado` tinyint(1) DEFAULT NULL,
  `fecha_alta` date DEFAULT NULL,
  `id_tango` int(11) DEFAULT NULL,
  `nombre` text,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `contrato` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` text,
  `ruta_archivo` text,
  `cantidad_jornadas` int(11) DEFAULT NULL,
  `multiplicador_diario` decimal(19,4) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `empleado_rol_frame` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `empleado_id` int(11) DEFAULT NULL,
  `rol_frame_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `estado_empleado` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` text,
  `icono` text,
  `color_background` text,
  `color_texto` text,
  `color_borde` text,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `feriado` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` text,
  `fecha` date DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `genero` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` text,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `nivel_estudio` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` text,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `notificacion` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `empleado_id` int(11) DEFAULT NULL,
  `descripcion` text,
  `fecha` date DEFAULT NULL,
  `titulo` text,
  `visto` tinyint(1) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `obra_social` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` text,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `pais` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` text,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `perfil` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` text,
  `observaciones` text,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `perfil_permiso` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `permiso_id` int(11) DEFAULT NULL,
  `perfil_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `proyecto_ausencia` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `proyecto_id` int(11) DEFAULT NULL,
  `motivo` text,
  `observaciones` text,
  `fecha_desde` date DEFAULT NULL,
  `fecha_hasta` date DEFAULT NULL,
  `proyecto_empleado_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `proyecto_baja` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `proyecto_id` int(11) DEFAULT NULL,
  `motivo` text,
  `fecha` date DEFAULT NULL,
  `observaciones` text,
  `proyecto_empleado_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `proyecto_feriado` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `proyecto_id` int(11) DEFAULT NULL,
  `feriado_id` int(11) DEFAULT NULL,
  `observaciones` text,
  `proyecto_empleado_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `proyecto_horas_extra` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `proyecto_id` int(11) DEFAULT NULL,
  `observaciones` text,
  `fecha` date DEFAULT NULL,
  `hora_ingreso` text,
  `hora_egreso` text,
  `proyecto_empleado_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `proyecto_vacaciones` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `proyecto_id` int(11) DEFAULT NULL,
  `fecha_desde` date DEFAULT NULL,
  `fecha_hasta` date DEFAULT NULL,
  `observaciones` text,
  `proyecto_empleado_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `rol_frame_categoria_sat` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `rol_frame_id` int(11) DEFAULT NULL,
  `numero_cat_sat` int(11) DEFAULT NULL,
  `cat_sat_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `sede` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` text,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `tipo_documento` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` text,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `usuario_perfil` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `perfil_id` int(11) DEFAULT NULL,
  `usuario_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------
-- Procedures (Converted Functions)
-- ---------------------------------------------------------

DELIMITER //

CREATE PROCEDURE delete_empleado_from_proyecto(IN pe_id DECIMAL(19,4), IN empleado DECIMAL(19,4), IN proyecto DECIMAL(19,4), IN rol DECIMAL(19,4))
BEGIN
    DELETE FROM proyecto_empleado WHERE id = pe_id;
    DELETE FROM proyecto_ausencia WHERE proyecto_empleado_id = pe_id;
    DELETE FROM proyecto_baja WHERE proyecto_empleado_id = pe_id;
    DELETE FROM proyecto_feriado WHERE proyecto_empleado_id = pe_id;
    DELETE FROM proyecto_horas_extra WHERE proyecto_empleado_id = pe_id;
    DELETE FROM proyecto_vacaciones WHERE proyecto_empleado_id = pe_id;
END //

CREATE PROCEDURE delete_notificaciones_viejas()
BEGIN 
    DELETE FROM notificacion WHERE fecha < (NOW() - INTERVAL 7 DAY);
END //

CREATE PROCEDURE find_rol_by_empleados_ids(IN empleados_ids_text TEXT)
BEGIN
    -- This requires a temporary table or complex string parsing in MySQL 
    -- because MySQL doesn't have native 'unnest(string_to_array())'
    -- Simplified version using FIND_IN_SET if possible, or temporary results:
    SELECT GROUP_CONCAT(rf.nombre SEPARATOR ', ') AS nombres, erf.empleado_id as empleadoId 
    FROM rol_frame rf
    INNER JOIN empleado_rol_frame erf on erf.rol_frame_id = rf.id
    WHERE FIND_IN_SET(erf.empleado_id, empleados_ids_text)
    GROUP BY erf.empleado_id;
END //

CREATE PROCEDURE find_roles_by_empleado_id(IN p_empleado_id INT)
BEGIN
    SELECT rf.* from rol_frame rf 
    INNER JOIN empleado_rol_frame erf ON erf.rol_frame_id = rf.id
    WHERE erf.empleado_id = p_empleado_id;
END //

-- Note: Other procedures would follow a similar pattern, 
-- converting 'RETURNS TABLE' to a standard SELECT inside the procedure.

DELIMITER ;
