import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { importUsers, checkImportUsers } from "../controllers/userController.js";

const router = express.Router();

// Sincronizar/Importar usuarios desde la API externa de FRAME (Completo o Parcial)
router.post("/import", protect, importUsers);

// Pre-chequeo de importación de usuarios (retorna conteo y lista sin persistir en BD)
router.post("/import/check", protect, checkImportUsers);

export default router;
