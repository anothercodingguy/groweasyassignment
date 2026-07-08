'use client';

import React, { useState, useEffect, useRef, DragEvent, ChangeEvent } from 'react';

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

interface CrmLeadItem {
  name: string;
  email: string;
  contact: string;
  dateCreated: string;
  company: string;
  status: string;
  quality: string;
  owner: string;
  source: string;
  notes: string;
}

export default function ImporterDashboard() {
  // Navigation & Theme
  const [activeTab, setActiveTab] = useState<'import-workspace' | 'crm-database'>('import-workspace');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  // Import flow steps: 1 = Upload, 2 = Preview, 3 = Processing, 4 = Results
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

  // Persistent Lead Database
  const [leadsList, setLeadsList] = useState<CrmLeadItem[]>([]);
  const [isLoadingLeads, setIsLoadingLeads] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Fetch persistent leads on mount
  useEffect(() => {
    fetchLeads();
  }, []);

  const getApiUrl = () => {
    let apiUrl = '';
    if (typeof window !== 'undefined') {
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      apiUrl = isLocalhost ? 'http://localhost:5001' : '';
    }
    if (process.env.NEXT_PUBLIC_API_URL) {
      apiUrl = process.env.NEXT_PUBLIC_API_URL;
    }
    if (apiUrl) {
      apiUrl = apiUrl.trim();
      if (!/^https?:\/\//i.test(apiUrl)) {
        apiUrl = `https://${apiUrl}`;
      }
      if (apiUrl.endsWith('/')) {
        apiUrl = apiUrl.slice(0, -1);
      }
    }
    return apiUrl;
  };

  const fetchLeads = async () => {
    setIsLoadingLeads(true);
    try {
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/api/leads`);
      if (!response.ok) throw new Error('Failed to retrieve leads from database.');
      const data = await response.json();
      
      const mapped = data.map((m: any) => {
        let formattedStatus = 'Not Dialed';
        if (m.crm_status === 'GOOD_LEAD_FOLLOW_UP') formattedStatus = 'Good Lead';
        else if (m.crm_status === 'SALE_DONE') formattedStatus = 'Sale Done';
        else if (m.crm_status === 'DID_NOT_CONNECT') formattedStatus = 'Not Dialed';
        else if (m.crm_status === 'BAD_LEAD') formattedStatus = 'Bad Lead';

        let displayDate = '—';
        if (m.created_at) {
          try {
            displayDate = new Date(m.created_at).toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true
            });
          } catch (e) {
            displayDate = m.created_at;
          }
        }

        return {
          name: m.name || 'Unnamed Lead',
          email: m.email || '—',
          contact: `${m.country_code ? '+' + m.country_code : ''} ${m.mobile_without_country_code || ''}`.trim() || '—',
          dateCreated: displayDate,
          company: m.company || '—',
          status: formattedStatus,
          quality: '—',
          owner: m.lead_owner ? m.lead_owner.charAt(0).toUpperCase() : 'U',
          source: m.data_source || 'Offline CSV',
          notes: m.crm_note || '—'
        };
      });

      setLeadsList(mapped);
    } catch (e: any) {
      console.error(e);
      setError(e.message || 'Failed to sync with remote database.');
    } finally {
      setIsLoadingLeads(false);
    }
  };

  const clearLeadsDatabase = async () => {
    if (!window.confirm('Are you sure you want to delete all leads from the database? This action is permanent.')) return;
    try {
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/api/leads/clear`, { method: 'POST' });
      if (!response.ok) throw new Error('Failed to clear the database.');
      setLeadsList([]);
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Failed to clear the database.');
    }
  };

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

    setCurrentStep(3); // Go to processing loading screen
    setError(null);
    setProgressVal(10);
    setLoadingMessage('Uploading file and initializing parser...');

    const formData = new FormData();
    formData.append('file', file);

    const progressInterval = setInterval(() => {
      setProgressVal((prev) => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        if (prev === 30) setLoadingMessage('Splitting rows into batches...');
        if (prev === 60) setLoadingMessage('Running AI Field Mapping & Normalization...');
        return prev + 5;
      });
    }, 800);

    try {
      const apiUrl = getApiUrl();
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
      
      // Reload actual database items from backend
      await fetchLeads();

      setCurrentStep(4); // Show results dashboard
    } catch (err: any) {
      clearInterval(progressInterval);
      setError(err.message || 'An error occurred during import.');
      setCurrentStep(2); // Go back to preview if error
    }
  };

  // Reset file selections
  const handleResetFile = () => {
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

    const fields = [
      'created_at', 'name', 'email', 'country_code', 'mobile_without_country_code',
      'company', 'city', 'state', 'country', 'lead_owner', 'crm_status', 'crm_note',
      'data_source', 'possession_time', 'description'
    ];

    const csvContentRows = [fields.join(',')];

    for (const record of successRecords) {
      const row = fields.map(field => {
        let val = record[field] || '';
        val = String(val).replace(/"/g, '""');
        if (val.includes(',') || val.includes('\n') || val.includes('\r')) {
          val = `"${val}"`;
        }
        return val;
      });
      csvContentRows.push(row.join(','));
    }

    const csvContent = csvContentRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `imported_crm_leads_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Filter Leads by Search Input
  const filteredLeads = leadsList.filter((lead) => {
    const q = searchQuery.toLowerCase();
    return (
      lead.name.toLowerCase().includes(q) ||
      lead.email.toLowerCase().includes(q) ||
      lead.contact.toLowerCase().includes(q) ||
      lead.company.toLowerCase().includes(q) ||
      lead.source.toLowerCase().includes(q) ||
      lead.notes.toLowerCase().includes(q)
    );
  });

  // Export static sample template
  const downloadSampleTemplate = () => {
    const headers = 'created_at,name,email,country_code,mobile_without_country_code,company,city,state,country,lead_owner,crm_status,crm_note,data_source,possession_time,description';
    const sampleRow = '2026-07-08 10:00:00,John Doe,john.doe@example.com,91,9876543210,Alpha Corp,Mumbai,Maharashtra,India,owner@company.com,GOOD_LEAD_FOLLOW_UP,Interested in plot projects.,leads_on_demand,,Plot description';
    const blob = new Blob([headers + '\n' + sampleRow], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'crm_leads_import_template.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="crm-layout">
      {/* 1. LEFT SIDEBAR */}
      <aside className="crm-sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
              <polyline points="16 7 22 7 22 13" />
            </svg>
          </div>
          <span className="sidebar-logo-text">GrowEasy</span>
        </div>

        <div className="sidebar-profile">
          <div className="profile-avatar">VT</div>
          <div className="profile-info">
            <span className="profile-name">VK Test</span>
            <span className="profile-role">Owner</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-nav-group">
            <span className="nav-group-label">Core Workspace</span>
            <div 
              className={`sidebar-nav-item ${activeTab === 'import-workspace' ? 'active' : ''}`}
              onClick={() => setActiveTab('import-workspace')}
            >
              <span className="sidebar-nav-item-icon">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </span>
              <span>Import Workspace</span>
            </div>
            
            <div 
              className={`sidebar-nav-item ${activeTab === 'crm-database' ? 'active' : ''}`}
              onClick={() => setActiveTab('crm-database')}
            >
              <span className="sidebar-nav-item-icon">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" />
                  <line x1="3" y1="12" x2="3.01" y2="12" />
                  <line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
              </span>
              <span>CRM Database</span>
            </div>
          </div>
        </nav>
      </aside>

      {/* 2. MAIN WORKSPACE */}
      <main className="crm-main-content">
        {/* TAB 1: IMPORT WORKSPACE */}
        {activeTab === 'import-workspace' && (
          <>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)' }}>Import Workspace</h1>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                    Upload, preview, and process CSV leads dynamically mapping columns using AI.
                  </p>
                </div>
                <button onClick={toggleTheme} className="theme-toggle" title="Toggle Theme">
                  {theme === 'light' ? (
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div style={{ background: 'var(--danger-bg)', border: '1px solid rgba(239, 68, 68, 0.15)', color: 'var(--danger)', padding: '1rem 1.5rem', borderRadius: '8px', fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>⚠️ {error}</span>
                <button onClick={() => setError(null)} style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
              </div>
            )}

            {/* STEP 1: UPLOAD DROPZONE */}
            {currentStep === 1 && (
              <div className="card card-glass slide-in" style={{ padding: '3rem 2rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                <div 
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  className={`dropzone ${isDragActive ? 'active' : ''}`}
                  onClick={triggerFileSelect}
                  style={{ padding: '4rem 2rem' }}
                >
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    style={{ display: 'none' }} 
                    accept=".csv"
                  />
                  <div className="dropzone-icon" style={{ width: '56px', height: '56px', fontSize: '1.5rem' }}>
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Drop your CSV file here</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>or click to browse files</p>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'var(--bg-primary)', padding: '0.25rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                    Supported format: .csv (max 5MB)
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', maxWidth: '500px', lineHeight: 1.4 }}>
                    <strong>Note:</strong> The AI extraction engine accepts any custom CSV layout. It will automatically match dynamic headers to standard CRM structures (Name, Email, Mobile, DataSource, Status).
                  </p>
                  <button onClick={downloadSampleTemplate} className="btn btn-secondary" style={{ padding: '0.5rem 1.25rem', fontSize: '0.8rem' }}>
                    📄 Download Sample CSV Template
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: PREVIEW PRE-MAPPED CSV DATA */}
            {currentStep === 2 && file && (
              <div className="card card-glass slide-in" style={{ padding: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                  <div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Preview Lead Data</h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.15rem' }}>
                      File: <strong>{file.name}</strong> ({(file.size / 1024).toFixed(2)} KB • {csvRows.length} rows parsed)
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button onClick={handleResetFile} className="btn btn-secondary" style={{ padding: '0.5rem 1.25rem', fontSize: '0.8rem' }}>
                      Cancel
                    </button>
                    <button onClick={handleConfirmImport} className="btn btn-primary" style={{ padding: '0.5rem 1.5rem', fontSize: '0.8rem', background: '#f97316' }}>
                      Run AI Import
                    </button>
                  </div>
                </div>

                <div className="table-container" style={{ maxHeight: '400px' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Row</th>
                        {csvHeaders.map((header, idx) => (
                          <th key={idx}>{header || `Col ${idx + 1}`}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {csvRows.slice(0, 50).map((row, rowIdx) => (
                        <tr key={rowIdx}>
                          <td style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{rowIdx + 1}</td>
                          {csvHeaders.map((_, colIdx) => (
                            <td key={colIdx}>{row[colIdx] || '-'}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {csvRows.length > 50 && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.75rem', textAlign: 'right' }}>
                    * Showing first 50 rows for preview. AI mapping will process all {csvRows.length} records.
                  </p>
                )}
              </div>
            )}

            {/* STEP 3: RUNNING PROMPT AI MAPPING */}
            {currentStep === 3 && (
              <div className="card card-glass slide-in" style={{ padding: '5rem 2rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
                <div className="spin" style={{ color: 'var(--primary)' }}>
                  <svg viewBox="0 0 24 24" width="48" height="48" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="2" x2="12" y2="6" />
                    <line x1="12" y1="18" x2="12" y2="22" />
                    <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
                    <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
                    <line x1="2" y1="12" x2="6" y2="12" />
                    <line x1="18" y1="12" x2="22" y2="12" />
                    <line x1="6.34" y1="17.66" x2="9.17" y2="14.83" />
                    <line x1="14.83" y1="9.17" x2="17.66" y2="6.34" />
                  </svg>
                </div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Extracting Lead Records via AI</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', maxWidth: '420px', lineHeight: 1.4 }}>
                  Analyzing column structures, normalizing telephone country codes, and formatting email addresses dynamically.
                </p>
                
                <div style={{ width: '100%', maxWidth: '320px', height: '6px', background: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div 
                    style={{ 
                      width: `${progressVal}%`, 
                      height: '100%', 
                      background: 'linear-gradient(95deg, var(--primary) 0%, #ea580c 100%)', 
                      borderRadius: '3px',
                      transition: 'width 0.4s ease-out' 
                    }}
                  ></div>
                </div>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--primary)' }}>
                  {loadingMessage} ({progressVal}%)
                </span>
              </div>
            )}

            {/* STEP 4: MAPPED OUTPUT SUMMARY */}
            {currentStep === 4 && importSummary && (
              <div className="slide-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                {/* Stats cards */}
                <div className="stats-grid">
                  <div className="card card-glass stat-card" style={{ borderLeft: '4px solid var(--text-primary)' }}>
                    <span className="stat-label">Total Rows</span>
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

                {/* Table containing results */}
                <div className="card card-glass" style={{ padding: '2rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>AI Structured CRM Output</h3>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Leads mapped and committed to database successfully.</p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <button onClick={handleResetFile} className="btn btn-secondary" style={{ padding: '0.5rem 1.25rem', fontSize: '0.8rem' }}>
                        Start New Import
                      </button>
                      <button onClick={downloadJSON} className="btn btn-secondary" style={{ padding: '0.5rem 1.25rem', fontSize: '0.8rem' }}>
                        💾 Export JSON
                      </button>
                      <button onClick={downloadCSV} className="btn btn-primary" style={{ padding: '0.5rem 1.25rem', fontSize: '0.8rem' }}>
                        📥 Download CSV
                      </button>
                    </div>
                  </div>

                  <div className="table-container" style={{ maxHeight: '350px' }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Status</th>
                          <th>Name</th>
                          <th>Email</th>
                          <th>Phone</th>
                          <th>CRM Status</th>
                          <th>DataSource</th>
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
                              </td>
                              <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{lead.name || item.raw['name'] || item.raw['Name'] || '-'}</td>
                              <td>{lead.email || '-'}</td>
                              <td>
                                {lead.country_code || lead.mobile_without_country_code ? (
                                  <span>+{lead.country_code || ''} {lead.mobile_without_country_code || ''}</span>
                                ) : '-'}
                              </td>
                              <td>{isSuccess ? lead.crm_status : '-'}</td>
                              <td>{isSuccess ? lead.data_source : '-'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* TAB 2: CRM DATABASE */}
        {activeTab === 'crm-database' && (
          <>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)' }}>CRM Database</h1>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                    Monitor status, assign tasks, and track leads committed to the database.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button onClick={toggleTheme} className="theme-toggle" title="Toggle Theme">
                    {theme === 'light' ? (
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                    ) : (
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                    )}
                  </button>
                  <button onClick={clearLeadsDatabase} className="btn btn-secondary" style={{ color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.2)', background: 'rgba(239, 68, 68, 0.02)' }} title="Wipe database leads">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '0.25rem' }}>
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      <line x1="10" y1="11" x2="10" y2="17" />
                      <line x1="14" y1="11" x2="14" y2="17" />
                    </svg>
                    Wipe Database
                  </button>
                </div>
              </div>
            </div>

            <div className="card card-glass" style={{ padding: '1.5rem' }}>
              <div className="leads-control-header" style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Database Records ({leadsList.length})</h3>
                
                <div className="leads-search-bar">
                  <input 
                    type="text"
                    className="leads-search-input"
                    placeholder="Search by name, email, contact..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <button className="btn btn-primary btn-icon" title="Search Leads">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                  </button>
                  <button onClick={() => { setSearchQuery(''); fetchLeads(); }} className="btn btn-secondary btn-icon" title="Refresh records">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23 4 23 10 17 10" />
                      <polyline points="1 20 1 14 7 14" />
                      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                    </svg>
                  </button>
                </div>
              </div>

              {isLoadingLeads ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem', gap: '1rem' }}>
                  <svg className="spin" viewBox="0 0 24 24" width="32" height="32" stroke="var(--primary)" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="2" x2="12" y2="6" />
                    <line x1="12" y1="18" x2="12" y2="22" />
                    <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
                    <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
                    <line x1="2" y1="12" x2="6" y2="12" />
                    <line x1="18" y1="12" x2="22" y2="12" />
                    <line x1="6.34" y1="17.66" x2="9.17" y2="14.83" />
                    <line x1="14.83" y1="9.17" x2="17.66" y2="6.34" />
                  </svg>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Syncing database records...</span>
                </div>
              ) : (
                <div className="table-container" style={{ maxHeight: '600px' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Lead Name</th>
                        <th>Email</th>
                        <th>Contact</th>
                        <th>Date Created</th>
                        <th>Company</th>
                        <th>Status</th>
                        <th>DataSource</th>
                        <th>CRM Note</th>
                        <th style={{ textAlign: 'center' }}>Lead Owner</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLeads.map((lead, idx) => (
                        <tr key={idx}>
                          <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            {lead.name}
                          </td>
                          <td>{lead.email}</td>
                          <td style={{ fontWeight: 500 }}>{lead.contact}</td>
                          <td>{lead.dateCreated}</td>
                          <td>{lead.company}</td>
                          <td>
                            <span className={`badge ${
                              lead.status === 'Sale Done' ? 'badge-blue' :
                              lead.status === 'Good Lead' ? 'badge-green' : 'badge-gray'
                            }`}>
                              {lead.status}
                            </span>
                          </td>
                          <td>
                            <span className="badge badge-info" style={{ background: 'var(--primary-glow)', color: 'var(--primary)', textTransform: 'none' }}>
                              {lead.source}
                            </span>
                          </td>
                          <td title={lead.notes} style={{ maxHeight: '40px', maxWidth: '300px', whiteSpace: 'normal', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            {lead.notes}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span className={`owner-avatar avatar-${lead.owner.toLowerCase()}`}>
                              {lead.owner}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {filteredLeads.length === 0 && (
                        <tr>
                          <td colSpan={9} style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                              <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
                                <circle cx="12" cy="12" r="10" />
                                <line x1="8" y1="12" x2="16" y2="12" />
                              </svg>
                              <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)' }}>No Leads Saved Yet</span>
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: '300px' }}>
                                Go to the <strong>Import Workspace</strong> page and upload your CSV to parse and save lead records.
                              </span>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {filteredLeads.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1.5rem' }}>
                  <button className="btn btn-secondary" style={{ padding: '0.5rem 1.5rem', borderRadius: '50px', fontSize: '0.8rem' }}>
                    Load more
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
