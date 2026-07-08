import { Router } from 'express';
import multer from 'multer';
import { ImportController } from '../controllers/import.controller';

const router = Router();

// Configure multer to store files in memory
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // Limit to 5MB
  }
});

// Route for CSV uploading and parsing
router.post('/upload', upload.single('file'), ImportController.uploadAndProcessCsv);

export default router;
