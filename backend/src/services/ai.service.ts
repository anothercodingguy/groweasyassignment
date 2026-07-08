import { GoogleGenerativeAI } from '@google/generative-ai';
import { OpenAI } from 'openai';
import { HttpsProxyAgent } from 'https-proxy-agent';
import dotenv from 'dotenv';
import { RawCsvRecord } from './csv.service';

dotenv.config();


// Standard GrowEasy CRM record shape
export interface CrmRecord {
  created_at?: string;
  name?: string;
  email?: string;
  country_code?: string;
  mobile_without_country_code?: string;
  company?: string;
  city?: string;
  state?: string;
  country?: string;
  lead_owner?: string;
  crm_status?: 'GOOD_LEAD_FOLLOW_UP' | 'DID_NOT_CONNECT' | 'BAD_LEAD' | 'SALE_DONE' | '';
  crm_note?: string;
  data_source?: 'leads_on_demand' | 'meridian_tower' | 'eden_park' | 'varah_swamy' | 'sarjapur_plots' | '';
  possession_time?: string;
  description?: string;
}

export interface ProcessedRecord {
  status: 'success' | 'skipped';
  skip_reason?: string;
  raw: RawCsvRecord;
  mapped?: CrmRecord;
}

export interface ImportSummary {
  totalImported: number;
  totalSkipped: number;
  records: ProcessedRecord[];
}

export class AiService {
  private static getGroqClient() {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return null;
    const proxy = process.env.https_proxy || process.env.http_proxy;
    return new OpenAI({
      apiKey: apiKey,
      baseURL: 'https://api.groq.com/openai/v1',
      httpAgent: proxy ? new HttpsProxyAgent(proxy) : undefined
    });
  }

  private static getGeminiClient() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    return new GoogleGenerativeAI(apiKey);
  }


  private static getOpenAiClient() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;
    const proxy = process.env.https_proxy || process.env.http_proxy;
    return new OpenAI({
      apiKey: apiKey,
      httpAgent: proxy ? new HttpsProxyAgent(proxy) : undefined
    });
  }

  /**
   * Determinisitcally pre-filters records that contain absolutely no contact info (neither email nor mobile)
   */
  public static preFilterRecords(records: RawCsvRecord[]): { valid: RawCsvRecord[]; skipped: ProcessedRecord[] } {
    const valid: RawCsvRecord[] = [];
    const skipped: ProcessedRecord[] = [];

    for (const record of records) {
      // Look for any keys containing "email", "mail", "phone", "mobile", "contact", "number", "cell"
      let hasContactInfo = false;
      
      for (const [key, val] of Object.entries(record)) {
        const lowerKey = key.toLowerCase();
        const cleanedVal = val.trim();
        
        if (cleanedVal) {
          const isEmailField = lowerKey.includes('email') || lowerKey.includes('mail');
          const isPhoneField = lowerKey.includes('phone') || lowerKey.includes('mobile') || lowerKey.includes('contact') || lowerKey.includes('number') || lowerKey.includes('cell');
          
          if (isEmailField && cleanedVal.includes('@')) {
            hasContactInfo = true;
          }
          if (isPhoneField && cleanedVal.replace(/[^0-9]/g, '').length >= 7) {
            hasContactInfo = true;
          }
        }
      }

      if (hasContactInfo) {
        valid.push(record);
      } else {
        skipped.push({
          status: 'skipped',
          skip_reason: 'Skipped: Record does not contain a valid email address or phone number.',
          raw: record
        });
      }
    }

    return { valid, skipped };
  }

  /**
   * Formulates the system prompt explaining CRM mapping rules, status values, dates, etc.
   */
  private static getSystemInstructions(): string {
    return `You are an AI data migration assistant for GrowEasy CRM. Your task is to map variable CSV lead columns into our standard structured CRM lead format.
    
    ### TARGET CRM RECORD SCHEMA:
    The target CRM format is a JSON object with the following fields:
    - created_at: Lead creation date. If present in raw data, output in YYYY-MM-DD HH:mm:ss format, or a format convertible using JavaScript "new Date(created_at)". If not found or empty, default to the current timestamp (use 2026-07-07 10:34:17).
    - name: Lead name. Extract full name.
    - email: Primary email. Must be a valid email.
    - country_code: Country code (e.g. "+91"). If not present, default to blank.
    - mobile_without_country_code: Mobile number without country code.
    - company: Company name.
    - city: City.
    - state: State.
    - country: Country.
    - lead_owner: Lead owner email (default to "test@gmail.com" if not found).
    - crm_status: Lead status. MUST be one of:
      * GOOD_LEAD_FOLLOW_UP
      * DID_NOT_CONNECT
      * BAD_LEAD
      * SALE_DONE
      (Coerce the raw lead status/rating/label into the closest match among these 4. Default to GOOD_LEAD_FOLLOW_UP if none fits).
    - crm_note: General notes, remarks, follow-ups, extra phone numbers, extra email addresses, or any useful info that doesn't fit another field. Escaped line breaks with \\n.
    - data_source: Source of the lead. MUST be one of:
      * leads_on_demand
      * meridian_tower
      * eden_park
      * varah_swamy
      * sarjapur_plots
      (If none matches confidently, leave it empty).
    - possession_time: Property possession time, if mentioned.
    - description: Additional description.

    ### FIELD PROCESSING RULES:
    1. Multiple Emails: If multiple emails exist, set the first as "email", and append the rest to "crm_note".
    2. Multiple Mobiles: If multiple numbers exist, set the first as "mobile_without_country_code" and append the rest to "crm_note".
    3. Skip condition: If a record contains neither a valid email nor a valid mobile number, mark its status as "skipped" and provide a "skip_reason".
    
    ### OUTPUT FORMAT:
    You must output a JSON object containing an array called "mapped_records".
    Each item in the array must correspond to one of the input records and have this structure:
    {
      "index": <number corresponding to the input record index starting at 0>,
      "status": "success" | "skipped",
      "skip_reason": "Reason if skipped, otherwise omit",
      "record": { ... mapped CRM fields as detailed above ... }
    }
    `;
  }

  /**
   * Processes a single batch of records using the available LLM.
   */
  private static async processBatchWithLlm(
    batch: RawCsvRecord[],
    groqClient: OpenAI | null,
    geminiClient: any,
    openAiClient: OpenAI | null
  ): Promise<any[]> {
    const systemInstruction = this.getSystemInstructions();
    const prompt = `Map the following raw CSV records into the CRM lead format. Here is the array of raw records:\n${JSON.stringify(batch, null, 2)}`;

    // 1. Try Groq first
    if (groqClient) {
      try {
        const response = await groqClient.chat.completions.create({
          model: 'llama-3.1-8b-instant',
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: prompt }
          ]
        });

        const text = response.choices[0].message.content || '{}';
        const parsed = JSON.parse(text);
        if (parsed.mapped_records) {
          return parsed.mapped_records;
        }
      } catch (err: any) {
        console.warn('Groq batch processing failed, falling back. Error:', err.message);
      }
    }

    // 2. Try Gemini second
    if (geminiClient) {
      try {
        const model = geminiClient.getGenerativeModel({
          model: 'gemini-1.5-flash',
          generationConfig: {
            responseMimeType: 'application/json'
          }
        });

        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: systemInstruction + '\n\n' + prompt }] }]
        });

        const text = result.response.text();
        const parsed = JSON.parse(text);
        if (parsed.mapped_records) {
          return parsed.mapped_records;
        }
      } catch (err: any) {
        console.warn('Gemini batch processing failed, falling back/retrying. Error:', err.message);
        throw err;
      }
    }

    // 2. Fallback to OpenAI
    if (openAiClient) {
      try {
        const response = await openAiClient.chat.completions.create({
          model: 'gpt-4o-mini',
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: prompt }
          ]
        });

        const text = response.choices[0].message.content || '{}';
        const parsed = JSON.parse(text);
        if (parsed.mapped_records) {
          return parsed.mapped_records;
        }
      } catch (err: any) {
        console.warn('OpenAI batch processing failed. Error:', err.message);
        throw err;
      }
    }

    // 3. Fallback to Mock deterministic mapping if no API keys are present (for testing/graceful degradation)
    console.warn('No active API keys found or APIs failed. Using deterministic local fallback mapper.');
    return batch.map((raw, idx) => {
      // Quick local mapping
      const emailKey = Object.keys(raw).find(k => k.toLowerCase().includes('email') || k.toLowerCase().includes('mail')) || '';
      const nameKey = Object.keys(raw).find(k => k.toLowerCase().includes('name') || k.toLowerCase().includes('first') || k.toLowerCase().includes('lead')) || '';
      const phoneKey = Object.keys(raw).find(k => k.toLowerCase().includes('phone') || k.toLowerCase().includes('mobile') || k.toLowerCase().includes('contact')) || '';
      
      const email = emailKey ? raw[emailKey] : '';
      const name = nameKey ? raw[nameKey] : 'Unknown';
      const phone = phoneKey ? raw[phoneKey] : '';

      return {
        index: idx,
        status: (email || phone) ? 'success' : 'skipped',
        skip_reason: (email || phone) ? undefined : 'Missing contact information',
        record: {
          created_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
          name: name,
          email: email,
          country_code: phone.startsWith('+') ? phone.split(' ')[0] || '' : '',
          mobile_without_country_code: phone.replace(/[^0-9]/g, ''),
          company: raw['Company'] || raw['company'] || '',
          city: raw['City'] || raw['city'] || '',
          state: raw['State'] || raw['state'] || '',
          country: raw['Country'] || raw['country'] || '',
          lead_owner: 'test@gmail.com',
          crm_status: 'GOOD_LEAD_FOLLOW_UP',
          crm_note: 'Imported via local fallback mapper.',
          data_source: '',
          possession_time: '',
          description: ''
        }
      };
    });
  }

  /**
   * Processes records in batches with retry logic and rate limit buffers
   */
  public static async processRecords(
    records: RawCsvRecord[],
    batchSize: number = 15,
    onProgress?: (processedCount: number) => void
  ): Promise<ImportSummary> {
    const { valid, skipped } = this.preFilterRecords(records);
    const results: ProcessedRecord[] = [...skipped];
    
    const groqClient = this.getGroqClient();
    const geminiClient = this.getGeminiClient();
    const openAiClient = this.getOpenAiClient();

    // Split valid records into batches
    const batches: RawCsvRecord[][] = [];
    for (let i = 0; i < valid.length; i += batchSize) {
      batches.push(valid.slice(i, i + batchSize));
    }

    let processedValidCount = 0;

    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const batch = batches[batchIdx];
      let attempts = 0;
      const maxAttempts = 3;
      let success = false;
      let mappedBatchResults: any[] = [];

      while (attempts < maxAttempts && !success) {
        try {
          attempts++;
          mappedBatchResults = await this.processBatchWithLlm(batch, groqClient, geminiClient, openAiClient);
          success = true;
        } catch (error: any) {
          console.error(`Attempt ${attempts} failed for batch ${batchIdx + 1}. Error: ${error.message}`);
          if (attempts >= maxAttempts) {
            // If it failed all retries, map this batch to skipped
            mappedBatchResults = batch.map((raw, idx) => ({
              index: idx,
              status: 'skipped',
              skip_reason: `AI processing failed after ${maxAttempts} attempts: ${error.message}`
            }));
          } else {
            // Exponential backoff
            const delay = Math.pow(2, attempts) * 1000;
            console.log(`Waiting ${delay}ms before retry...`);
            await new Promise((res) => setTimeout(res, delay));
          }
        }
      }

      // Compile batch results
      for (let i = 0; i < batch.length; i++) {
        const rawRecord = batch[i];
        const aiMapped = mappedBatchResults.find((r) => r.index === i);

        if (aiMapped && aiMapped.status === 'success') {
          results.push({
            status: 'success',
            raw: rawRecord,
            mapped: aiMapped.record
          });
        } else {
          results.push({
            status: 'skipped',
            skip_reason: aiMapped?.skip_reason || 'AI mapping marked as skipped without explicit reason',
            raw: rawRecord
          });
        }
      }

      processedValidCount += batch.length;
      if (onProgress) {
        onProgress(skipped.length + processedValidCount);
      }

      // Small delay between batches to respect free-tier rate limits
      if (batchIdx < batches.length - 1) {
        await new Promise((res) => setTimeout(res, 1000));
      }
    }

    const totalImported = results.filter((r) => r.status === 'success').length;
    const totalSkipped = results.filter((r) => r.status === 'skipped').length;

    return {
      totalImported,
      totalSkipped,
      records: results
    };
  }
}
