'use client';

import React, { useState, useRef, DragEvent, ChangeEvent } from 'react';

// Self-contained CSV parser that supports double quotes, escaped commas, and different line endings
function parseCsvString(text: string): string[][] {
  const lines: string[][] = [];
  let row: string[] = [];
  let inQuotes = false;
  let currentValue = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentValue += '"';
        i++; // skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(currentValue.trim());
      currentValue = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      row.push(currentValue.trim());
      // Only push non-empty rows
      if (row.some(val => val !== '')) {
        lines.push(row);
      }
      row = [];
      currentValue = '';
    } else {
      currentValue += char;
    }
  }
  if (currentValue !== '' || row.length > 0) {
    row.push(currentValue.trim());
    lines.push(row);
  }
  return lines;
}

export default function ImporterDashboard() {
  // Theme state
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  // Flow steps: 1 = Upload, 2 = Preview, 3 = Processing, 4 = Results
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);

  // File states
  const [file, setFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [isDragActive, setIsDragActive] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Backend API states
  const [importSummary, setImportSummary] = useState<any | null>(null);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [progressVal, setProgressVal] = useState<number>(0);

  // Toggle Dark Mode
  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  // Drag and Drop handlers
  const handleDrag = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processSelectedFile(e.target.files[0]);
    }
  };

  const processSelectedFile = (selectedFile: File) => {
    if (!selectedFile.name.endsWith('.csv')) {
      setError('Please select a valid CSV file.');
      return;
    }
    setError(null);
    setFile(selectedFile);

    // Read file for local preview
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const parsed = parseCsvString(text);
      if (parsed.length > 0) {
        setCsvHeaders(parsed[0]);
        setCsvRows(parsed.slice(1));
        setCurrentStep(2); // Go to Preview
      } else {
        setError('The CSV file appears to be empty.');
      }
    };
    reader.readAsText(selectedFile);
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  // Upload file to Backend and start AI processing
  const handleConfirmImport = async () => {
    if (!file) return;

    setCurrentStep(3); // Go to processing
    setError(null);
    setProgressVal(10);
    setLoadingMessage('Uploading file and initializing parser...');

    const formData = new FormData();
    formData.append('file', file);

    // Smoothly simulate progress indicator state
    const progressInterval = setInterval(() => {
      setProgressVal((prev) => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        // Change status message at intervals
        if (prev === 30) setLoadingMessage('Splitting rows into batches...');
        if (prev === 60) setLoadingMessage('Running AI Field Mapping & Normalization...');
        return prev + 5;
      });
    }, 800);

    try {
      let apiUrl = '';
      if (typeof window !== 'undefined') {
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        apiUrl = isLocalhost ? 'http://localhost:5001' : '';
      }
      if (process.env.NEXT_PUBLIC_API_URL) {
        apiUrl = process.env.NEXT_PUBLIC_API_URL;
      }

      // Prepend https:// if protocol is missing
      if (apiUrl) {
        apiUrl = apiUrl.trim();
        if (!/^https?:\/\//i.test(apiUrl)) {
          apiUrl = `https://${apiUrl}`;
        }
        if (apiUrl.endsWith('/')) {
          apiUrl = apiUrl.slice(0, -1);
        }
      }

      // Connect to our backend API
      const response = await fetch(`${apiUrl}/api/upload`, {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);
      setProgressVal(100);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Server processing failed');
      }

      const result = await response.json();
      setImportSummary(result);
      setCurrentStep(4); // Go to results
    } catch (err: any) {
      clearInterval(progressInterval);
      setError(err.message || 'An error occurred during import.');
      setCurrentStep(2); // Fallback to preview step on error
    }
  };

  // Reset the flow back to Step 1
  const handleReset = () => {
    setFile(null);
    setCsvHeaders([]);
    setCsvRows([]);
    setImportSummary(null);
    setError(null);
    setProgressVal(0);
    setCurrentStep(1);
  };

  // Helper to convert results to download formats
  const downloadJSON = () => {
    if (!importSummary) return;
    const jsonStr = JSON.stringify(importSummary, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `imported_crm_leads_${new Date().toISOString().slice(0,10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadCSV = () => {
    if (!importSummary) return;
    const successRecords = importSummary.records
      .filter((r: any) => r.status === 'success')
      .map((r: any) => r.mapped);

    if (successRecords.length === 0) return;

    // Define CSV fields in order
    const fields = [
      'created_at', 'name', 'email', 'country_code', 'mobile_without_country_code',
      'company', 'city', 'state', 'country', 'lead_owner', 'crm_status', 'crm_note',
      'data_source', 'possession_time', 'description'
    ];

    const csvRows = [fields.join(',')];

    for (const record of successRecords) {
      const row = fields.map(field => {
        let val = record[field] || '';
        // Escape quotes and line breaks for valid CSV row output
        val = String(val).replace(/"/g, '""');
        if (val.includes(',') || val.includes('\n') || val.includes('\r')) {
          val = `"${val}"`;
        }
        return val;
      });
      csvRows.push(row.join(','));
    }

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `imported_crm_leads_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="app-container">
      {/* Header Section */}
      <header className="header">
        <div className="logo-section">
          <div className="logo-icon">↗</div>
          <div>
            <h1 className="logo-text">GrowEasy CRM</h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
              AI-Powered Lead Migration System
            </p>
          </div>
        </div>
        <button onClick={toggleTheme} className="theme-toggle" title="Toggle Theme">
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
      </header>

      {/* Steps Progress Indicator */}
      <div className="steps-container">
        <div className="steps-bar"></div>
        <div 
          className="steps-bar-active" 
          style={{ width: `${((currentStep - 1) / 3) * 100}%` }}
        ></div>
        
        <div className={`step-node ${currentStep >= 1 ? 'completed' : ''} ${currentStep === 1 ? 'active' : ''}`}>
          1
          <div className="step-label">Upload File</div>
        </div>
        <div className={`step-node ${currentStep >= 2 ? 'completed' : ''} ${currentStep === 2 ? 'active' : ''}`}>
          2
          <div className="step-label">Preview Data</div>
        </div>
        <div className={`step-node ${currentStep >= 3 ? 'completed' : ''} ${currentStep === 3 ? 'active' : ''}`}>
          3
          <div className="step-label">AI Processing</div>
        </div>
        <div className={`step-node ${currentStep >= 4 ? 'completed' : ''} ${currentStep === 4 ? 'active' : ''}`}>
          4
          <div className="step-label">CRM Results</div>
        </div>
      </div>

      {/* Global Error Banner */}
      {error && (
        <div 
          className="slide-in" 
          style={{
            background: 'var(--danger-bg)',
            border: '1px solid var(--danger)',
            color: 'var(--danger)',
            padding: '1rem 1.5rem',
            borderRadius: 'var(--radius-sm)',
            marginBottom: '2rem',
            fontSize: '0.875rem',
            fontWeight: 500,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <span>⚠️ {error}</span>
          <button 
            onClick={() => setError(null)} 
            style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontWeight: 'bold' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* STEP 1: UPLOAD FILE */}
      {currentStep === 1 && (
        <div className="card card-glass slide-in" style={{ padding: '2.5rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>Import Leads via CSV</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              Upload any lead file (Facebook Ads, Google Sheets, Sales Reports). Our AI will automatically identify name, contact, status, and custom note columns.
            </p>
          </div>

          <div 
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            className={`dropzone ${isDragActive ? 'active' : ''}`}
            onClick={triggerFileSelect}
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              style={{ display: 'none' }} 
              accept=".csv"
            />
            <div className="dropzone-icon">📥</div>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Drop your CSV file here</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>or click to browse files</p>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Supported format: .csv (max 5MB)</span>
          </div>

          <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              <span>🔒 Stateless: Your uploaded files are parsed on the fly and never stored on disk.</span>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: PREVIEW DATA */}
      {currentStep === 2 && file && (
        <div className="card card-glass slide-in" style={{ padding: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Preview Uploaded CSV Data</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                File: <strong>{file.name}</strong> ({csvRows.length} rows detected)
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={handleReset} className="btn btn-secondary">
                Cancel
              </button>
              <button onClick={handleConfirmImport} className="btn btn-primary">
                Confirm & Run AI Import ↗
              </button>
            </div>
          </div>

          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Row</th>
                  {csvHeaders.map((header, idx) => (
                    <th key={idx}>{header || `Column ${idx + 1}`}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {csvRows.slice(0, 50).map((row, rowIdx) => (
                  <tr key={rowIdx}>
                    <td style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{rowIdx + 1}</td>
                    {csvHeaders.map((_, colIdx) => (
                      <td key={colIdx} title={row[colIdx] || ''}>{row[colIdx] || '-'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {csvRows.length > 50 && (
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.75rem', textAlign: 'right' }}>
              * Showing first 50 rows for preview performance. Total {csvRows.length} records will be processed.
            </p>
          )}
        </div>
      )}

      {/* STEP 3: PROCESSING SCREEN */}
      {currentStep === 3 && (
        <div className="card card-glass slide-in" style={{ padding: '4rem 2rem', textAlign: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', maxWidth: '500px', margin: '0 auto' }}>
            <div className="pulse" style={{ fontSize: '3rem' }}>🧠</div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>AI Lead Extraction is in Progress</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              We are parsing your column headers, matching lead contexts, and formatting emails/phone numbers.
            </p>
            
            {/* Custom Progress Bar */}
            <div style={{ width: '100%', height: '8px', background: 'var(--border-color)', borderRadius: '4px', overflow: 'hidden', margin: '1rem 0' }}>
              <div 
                style={{ 
                  width: `${progressVal}%`, 
                  height: '100%', 
                  background: 'linear-gradient(95deg, var(--primary) 0%, #ea580c 100%)', 
                  borderRadius: '4px',
                  transition: 'width 0.4s ease-out' 
                }}
              ></div>
            </div>

            <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--primary)' }}>
              {loadingMessage} ({progressVal}%)
            </p>
            
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              Do not close this page. Depending on the size of your CSV, this may take 10-45 seconds.
            </p>
          </div>
        </div>
      )}

      {/* STEP 4: IMPORT RESULTS */}
      {currentStep === 4 && importSummary && (
        <div className="slide-in">
          {/* Stats Cards */}
          <div className="stats-grid">
            <div className="card card-glass stat-card" style={{ borderLeft: '4px solid var(--primary)' }}>
              <span className="stat-label">Total Uploaded</span>
              <span className="stat-value">{importSummary.totalImported + importSummary.totalSkipped}</span>
            </div>
            <div className="card card-glass stat-card" style={{ borderLeft: '4px solid var(--success)' }}>
              <span className="stat-label">Successfully Mapped</span>
              <span className="stat-value" style={{ color: 'var(--success)' }}>{importSummary.totalImported}</span>
            </div>
            <div className="card card-glass stat-card" style={{ borderLeft: '4px solid var(--danger)' }}>
              <span className="stat-label">Skipped (No Contact Info)</span>
              <span className="stat-value" style={{ color: 'var(--danger)' }}>{importSummary.totalSkipped}</span>
            </div>
          </div>

          {/* Results Action Table Panel */}
          <div className="card card-glass" style={{ padding: '2rem', marginBottom: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>AI Structured CRM Output</h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  Leads mapped to standard CRM definitions.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button onClick={handleReset} className="btn btn-secondary">
                  Start New Import
                </button>
                <button onClick={downloadJSON} className="btn btn-secondary" title="Export as structured JSON file">
                  💾 Export JSON
                </button>
                <button onClick={downloadCSV} className="btn btn-primary" title="Download formatted CRM leads CSV">
                  📥 Download CSV Leads
                </button>
              </div>
            </div>

            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Mapping Status</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>CRM Status</th>
                    <th>Data Source</th>
                    <th>Company</th>
                    <th>City/State/Country</th>
                    <th>Notes</th>
                    <th>Creation Date</th>
                  </tr>
                </thead>
                <tbody>
                  {importSummary.records.map((item: any, idx: number) => {
                    const isSuccess = item.status === 'success';
                    const lead = item.mapped || {};
                    return (
                      <tr key={idx}>
                        <td>
                          <span className={`badge ${isSuccess ? 'badge-success' : 'badge-danger'}`}>
                            {isSuccess ? 'MAPPED' : 'SKIPPED'}
                          </span>
                          {!isSuccess && item.skip_reason && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--danger)', marginTop: '0.25rem', whiteSpace: 'normal', minWidth: '150px' }}>
                              {item.skip_reason}
                            </div>
                          )}
                        </td>
                        <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{lead.name || item.raw['name'] || item.raw['Name'] || '-'}</td>
                        <td>{lead.email || '-'}</td>
                        <td>
                          {lead.country_code || lead.mobile_without_country_code ? (
                            <span>{lead.country_code || ''} {lead.mobile_without_country_code || ''}</span>
                          ) : '-'}
                        </td>
                        <td>
                          {isSuccess && lead.crm_status ? (
                            <span className={`badge ${
                              lead.crm_status === 'GOOD_LEAD_FOLLOW_UP' ? 'badge-success' :
                              lead.crm_status === 'SALE_DONE' ? 'badge-info' :
                              lead.crm_status === 'DID_NOT_CONNECT' ? 'badge-warning' : 'badge-danger'
                            }`}>
                              {lead.crm_status}
                            </span>
                          ) : '-'}
                        </td>
                        <td>
                          {isSuccess && lead.data_source ? (
                            <span className="badge badge-info" style={{ background: 'var(--primary-glow)', color: 'var(--primary)' }}>
                              {lead.data_source}
                            </span>
                          ) : '-'}
                        </td>
                        <td>{lead.company || '-'}</td>
                        <td>
                          {[lead.city, lead.state, lead.country].filter(Boolean).join(', ') || '-'}
                        </td>
                        <td title={lead.crm_note || ''} style={{ whiteSpace: 'normal', minWidth: '200px' }}>{lead.crm_note || '-'}</td>
                        <td>{lead.created_at || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
