/**
 * Trasy panelu administracyjnego
 * Wymaga autoryzacji administratora
 */
import { Router } from 'express';
import { authenticateAdmin, adminLimiter, authLimiter } from '../../middleware/index.js';
import authRouter from './auth.js';
import usersRouter from './users.js';
import configRouter from './config.js';
import modsRouter from './mods.js';
import broadcastsRouter from './broadcasts.js';
import serversRouter from './servers.js';
import logsRouter from './logs.js';
import backupsRouter from './backups.js';
import miscRouter from './misc.js';
import statsRouter from './stats.js';
import curseforgeRoutes from './curseforge.js';

const router = Router();

// Auth routes (before middleware)
router.use('/', authRouter);

// All routes below require admin authentication
router.use(adminLimiter);
router.use(authenticateAdmin);

// Mount sub-routers
router.use('/', miscRouter);  // dashboard, me, 2FA, launcher-versions, stats, maintenance, sessions, bans, rules, news, skins
router.use('/', usersRouter);
router.use('/', configRouter);
router.use('/', modsRouter);
router.use('/', broadcastsRouter);
router.use('/', serversRouter);
router.use('/', logsRouter);
router.use('/', backupsRouter);
router.use('/', statsRouter);  // /stats/players, /stats/players/:id, /stats/overview
router.use('/curseforge', curseforgeRoutes);

export default router;
