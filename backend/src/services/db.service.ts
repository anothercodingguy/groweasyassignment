import fs from 'fs';
import path from 'path';
import { CrmRecord } from './ai.service';

const DB_PATH = path.join(__dirname, '../../data/leads.json');

export class DbService {
  public static getLeads(): CrmRecord[] {
    try {
      if (!fs.existsSync(DB_PATH)) {
        const dir = path.dirname(DB_PATH);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(DB_PATH, JSON.stringify([]));
        return [];
      }
      const data = fs.readFileSync(DB_PATH, 'utf-8');
      return JSON.parse(data || '[]');
    } catch (e) {
      console.error('Failed to read leads database:', e);
      return [];
    }
  }

  public static saveLeads(leads: CrmRecord[]): void {
    try {
      const dir = path.dirname(DB_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(DB_PATH, JSON.stringify(leads, null, 2));
    } catch (e) {
      console.error('Failed to save leads to database:', e);
    }
  }

  public static appendLeads(newLeads: CrmRecord[]): void {
    const current = this.getLeads();
    const updated = [...newLeads, ...current];
    this.saveLeads(updated);
  }

  public static clearLeads(): void {
    this.saveLeads([]);
  }
}
