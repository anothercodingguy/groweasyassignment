import { Request, Response } from 'express';
import { CsvService } from '../services/csv.service';
import { AiService } from '../services/ai.service';

export class ImportController {
  public static async uploadAndProcessCsv(req: Request, res: Response): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded. Please upload a valid CSV file.' });
        return;
      }

      // Check file type
      if (!req.file.originalname.endsWith('.csv') && req.file.mimetype !== 'text/csv') {
        res.status(400).json({ error: 'Invalid file format. Only CSV files are supported.' });
        return;
      }

      const fileBuffer = req.file.buffer;
      console.log(`Received file: ${req.file.originalname}, size: ${req.file.size} bytes`);

      // 1. Parse CSV into records
      let rawRecords;
      try {
        rawRecords = await CsvService.parseCsv(fileBuffer);
      } catch (parseError: any) {
        console.error('Failed to parse CSV:', parseError);
        res.status(400).json({ error: `Failed to parse CSV file: ${parseError.message}` });
        return;
      }

      if (rawRecords.length === 0) {
        res.status(200).json({
          totalImported: 0,
          totalSkipped: 0,
          records: [],
          message: 'The uploaded CSV file is empty.'
        });
        return;
      }

      console.log(`Parsed ${rawRecords.length} records. Starting AI field mapping...`);

      // Get batch size from query if provided, default to 15
      const batchSize = req.query.batchSize ? parseInt(req.query.batchSize as string, 10) : 15;

      // 2. Perform AI field mapping in batches
      const importSummary = await AiService.processRecords(rawRecords, batchSize);

      console.log(`Processing complete. Success: ${importSummary.totalImported}, Skipped: ${importSummary.totalSkipped}`);

      // 3. Return structured JSON
      res.status(200).json(importSummary);
    } catch (error: any) {
      console.error('Unexpected error in CSV processing:', error);
      res.status(500).json({ error: `An unexpected error occurred during processing: ${error.message}` });
    }
  }
}
