import { Router } from 'express';
import { verifyIngestAuth, ingest, ingestStatus } from '../controllers/tallyIngest.controller.js';

/**
 * tallyIngest routes — receives signed MDU records from the connector agent.
 * All ingest requests require HMAC signature verification.
 */

const router = Router();

// POST /api/v1/tally-connect/ingest — receive MDU records from connector
router.post('/ingest', verifyIngestAuth, ingest);

// GET /api/v1/tally-connect/ingest/status — last sync runs
router.get('/ingest/status', ingestStatus);

export default router;