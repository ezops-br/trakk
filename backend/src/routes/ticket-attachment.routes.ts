import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { AppError } from '../lib/app-error';
import {
  ticketAttachmentParamsSchema,
  ticketAttachmentIdParamSchema,
} from './ticket-attachment.schemas';
import {
  listAttachments,
  uploadAttachment,
  deleteAttachment,
  extractUploadedFile,
  getAttachmentForDownload,
} from '../services/ticket-attachment.service';

export const ticketAttachmentRouter = Router();

// In-memory multer instance — single image per request, 8 MB cap, image mimetypes only.
// The handler writes the buffer straight to the DB as a BYTEA column; multer
// here just parses the multipart body and validates limits before the handler.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new AppError(400, 'Only image/jpeg, image/png, image/gif, image/webp are allowed'));
  },
});

ticketAttachmentRouter.use(requireAuth);

ticketAttachmentRouter.get(
  '/:projectId/tickets/:ticketNumber/attachments',
  validate(ticketAttachmentParamsSchema, 'params'),
  async (req, res, next) => {
    try {
      const { projectId, ticketNumber } = req.params as unknown as {
        projectId: string;
        ticketNumber: number;
      };
      const result = await listAttachments(req.user!.userId, projectId, Number(ticketNumber));
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

ticketAttachmentRouter.post(
  '/:projectId/tickets/:ticketNumber/attachments',
  validate(ticketAttachmentParamsSchema, 'params'),
  upload.single('file'),
  async (req, res, next) => {
    try {
      const { projectId, ticketNumber } = req.params as unknown as {
        projectId: string;
        ticketNumber: number;
      };
      const file = extractUploadedFile(req);
      const result = await uploadAttachment(
        req.user!.userId,
        projectId,
        Number(ticketNumber),
        file,
      );
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

ticketAttachmentRouter.delete(
  '/:projectId/tickets/:ticketNumber/attachments/:attachmentId',
  validate(ticketAttachmentIdParamSchema, 'params'),
  async (req, res, next) => {
    try {
      const { projectId, ticketNumber, attachmentId } = req.params as unknown as {
        projectId: string;
        ticketNumber: number;
        attachmentId: string;
      };
      const result = await deleteAttachment(
        req.user!.userId,
        projectId,
        Number(ticketNumber),
        attachmentId,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// Serves the raw bytes for an attachment. The frontend renders this URL as
// an <img src>, so we send the original mime type with no Content-Disposition:
// attachment header (the browser fetches the bytes inline rather than prompting
// a download). Auth + project membership are enforced by the service helper,
// which throws 404 if the attachment is not on this ticket (don't leak
// existence).
ticketAttachmentRouter.get(
  '/:projectId/tickets/:ticketNumber/attachments/:attachmentId/raw',
  validate(ticketAttachmentIdParamSchema, 'params'),
  async (req, res, next) => {
    try {
      const { projectId, ticketNumber, attachmentId } = req.params as unknown as {
        projectId: string;
        ticketNumber: number;
        attachmentId: string;
      };
      const result = await getAttachmentForDownload(
        req.user!.userId,
        projectId,
        Number(ticketNumber),
        attachmentId,
      );
      // Defense-in-depth: if the service ever returns a row whose bytes
      // payload is null (legacy pre-bytea rows from PR #39), throw 404
      // BEFORE any res.setHeader so no Content-Length / Content-Type is
      // sent on the 404 path — matches the "don't leak existence"
      // convention used for cross-ticket attachment IDs.
      if (result.bytes === null || result.bytes === undefined) {
        throw new AppError(404, 'Attachment bytes are not available');
      }
      res.setHeader('Content-Type', result.mimeType);
      res.setHeader('Content-Length', String(result.sizeBytes));
      res.send(result.bytes);
    } catch (err) {
      next(err);
    }
  },
);