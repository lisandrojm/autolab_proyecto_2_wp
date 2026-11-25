/** Solo para el CLI de TypeORM: `npm run migration:run`. El servicio usa `opcionesDb`. */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { cargarEnv, leerConfiguracion } from '../config/configuracion';
import { opcionesDb } from './opciones-db';

cargarEnv();
export default new DataSource(opcionesDb(leerConfiguracion()));
