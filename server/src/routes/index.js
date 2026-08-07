import { Router } from 'express';
import authRouter from './auth.js';
import adminRouter from './admin.js';
import classesRouter from './classes.js';
import messagesRouter from './messages.js';
import filesRouter from './files.js';
import usersRouter from './users.js';
import pushRouter from './push.js';
import settingsRouter from './settings.js';

const router = Router();

router.use('/auth', authRouter);
router.use('/admin', adminRouter);
router.use('/classes', classesRouter);
router.use('/messages', messagesRouter);
router.use('/files', filesRouter);
router.use('/users', usersRouter);
router.use('/push', pushRouter);
router.use('/settings', settingsRouter);

export default router;
