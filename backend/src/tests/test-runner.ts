import fs from 'fs';
import path from 'path';
import { CsvService } from '../services/csv.service';
import { AiService } from '../services/ai.service';

async function runTests() {
  console.log('🧪 Starting CRM Importer Integration Tests...\n');
  let testCount = 0;
  let passCount = 0;

  const assert = (condition: boolean, message: string) => {
    testCount++;
    if (condition) {
      passCount++;
      console.log(`✅ PASS: ${message}`);
    } else {
      console.log(`❌ FAIL: ${message}`);
    }
  };

  try {
    // -------------------------------------------------------------
    // Test 1: Parser and Deterministic Skip Verification
    // -------------------------------------------------------------
    const invalidCsvPath = path.join(__dirname, '../../../samples/invalid_leads.csv');
    const invalidBuffer = fs.readFileSync(invalidCsvPath);
    const parsedInvalid = await CsvService.parseCsv(invalidBuffer);
    
    assert(parsedInvalid.length === 2, 'CSV parser correctly parsed 2 records from invalid_leads.csv');

    // Run mapping on invalid records
    const invalidSummary = await AiService.processRecords(parsedInvalid);
    
    assert(invalidSummary.totalImported === 1, 'Correctly imported exactly 1 valid record');
    assert(invalidSummary.totalSkipped === 1, 'Correctly skipped exactly 1 record missing contact info');
    
    const skippedRecord = invalidSummary.records.find(r => r.status === 'skipped');
    assert(
      !!(skippedRecord?.skip_reason?.toLowerCase().includes('email') || 
         skippedRecord?.skip_reason?.toLowerCase().includes('contact')),
      'Skipped record has appropriate skip reason'
    );

    // -------------------------------------------------------------
    // Test 2: Date Formatting and Mapping Verification
    // -------------------------------------------------------------
    const fbCsvPath = path.join(__dirname, '../../../samples/facebook_leads.csv');
    const fbBuffer = fs.readFileSync(fbCsvPath);
    const parsedFb = await CsvService.parseCsv(fbBuffer);
    
    assert(parsedFb.length === 4, 'CSV parser correctly parsed 4 records from facebook_leads.csv');
    
    const fbSummary = await AiService.processRecords(parsedFb);
    assert(fbSummary.totalImported > 0, 'Successfully mapped leads from Facebook export format');
    
    const firstImported = fbSummary.records.find(r => r.status === 'success');
    if (firstImported && firstImported.mapped) {
      const dateStr = firstImported.mapped.created_at;
      const dateObj = new Date(dateStr || '');
      assert(!isNaN(dateObj.getTime()), `Lead created_at "${dateStr}" is convertible using new Date()`);
    } else {
      assert(false, 'Expected at least one successfully imported lead in Facebook leads test');
    }

    // -------------------------------------------------------------
    // Test Summary
    // -------------------------------------------------------------
    console.log(`\n📊 Test Execution Summary: ${passCount}/${testCount} assertions passed.`);
    if (passCount === testCount) {
      console.log('🎉 All tests completed successfully!');
    } else {
      console.log('⚠️ Some test assertions failed.');
      process.exit(1);
    }
  } catch (error) {
    console.error('💥 Test run crashed with error:', error);
    process.exit(1);
  }
}

runTests();
