import express from 'express';
import ledgerRoutes from './ledger.routes.js';
import accountsRoutes from './accounts.routes.js';
import reportsRoutes from './reports.routes.js';
import expenseRoutes from './expense.routes.js';
import insightflowRoutes from './insightflow.routes.js';
import runtimeRoutes from './runtime.routes.js';
import usersRoutes from './users.routes.js';
import financialRuntimeRoutes from './financialRuntime.routes.js';

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'OK',
      timestamp: new Date().toISOString(),
      traceId: req.traceId,
      version: '0.1.0'
    },
    message: 'API is healthy'
  });
});

router.use('/v1/ledger', ledgerRoutes);
router.use('/v1/accounts', accountsRoutes);
router.use('/v1/reports', reportsRoutes);
router.use('/v1/expenses', expenseRoutes);
router.use('/v1/insightflow', insightflowRoutes);
router.use('/v1/runtime', runtimeRoutes);
router.use('/v1/users', usersRoutes);
router.use('/v1/financial-runtime', financialRuntimeRoutes);
router.use('/users', usersRoutes);

export default router;
