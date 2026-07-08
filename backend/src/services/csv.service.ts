import csv from 'csv-parser';
import { Readable } from 'stream';

export interface RawCsvRecord {
  [key: string]: string;
}

export class CsvService {
  /**
   * Parses a CSV file buffer and returns an array of raw objects.
   */
  public static parseCsv(buffer: Buffer): Promise<RawCsvRecord[]> {
    return new Promise((resolve, reject) => {
      const results: RawCsvRecord[] = [];
      const stream = Readable.from(buffer);

      stream
        .pipe(csv())
        .on('data', (data) => {
          // Clean up data keys and values (trim whitespace)
          const cleanedData: RawCsvRecord = {};
          for (const key of Object.keys(data)) {
            const cleanKey = key.trim();
            const cleanVal = data[key] ? String(data[key]).trim() : '';
            cleanedData[cleanKey] = cleanVal;
          }
          results.push(cleanedData);
        })
        .on('end', () => {
          resolve(results);
        })
        .on('error', (error) => {
          reject(error);
        });
    });
  }
}
