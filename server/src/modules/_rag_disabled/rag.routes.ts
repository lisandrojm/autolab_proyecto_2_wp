import { Router } from "express";
import { RagController } from "./rag.controller.js";
import { authenticateToken } from "../../middleware/auth.js";
import { requireTenant } from "../../middleware/tenant.js";

const router = Router();

// Apply middleware to all routes
router.use(requireTenant);
router.use(authenticateToken);

// RAG routes
router.post("/ingest", RagController.ingestDocument);
router.post("/query", RagController.queryDocuments);
router.get("/docs", RagController.listDocuments);
router.post("/reindex/:docId", RagController.reindexDocument);
router.delete("/docs/:docId", RagController.deleteDocument);

export { router as ragRoutes };