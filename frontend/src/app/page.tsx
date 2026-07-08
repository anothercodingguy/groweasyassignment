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
}

export default function ImporterDashboard() {
  // Navigation & Theme
  const [activeTab, setActiveTab] = useState<'lead-sources' | 'manage-leads'>('lead-sources');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  // Modal Control
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1); // 1 = Upload, 2 = Preview, 3 = Processing, 4 = Results

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

  // CRM Search & Live Lead Data
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [leadsList, setLeadsList] = useState<CrmLeadItem[]>([
    {
      name: 'punnnf g',
      email: 'kjgkhv2@gcghc.com',
      contact: '+917894561177',
      dateCreated: 'Jun 23, 2026, 2:37 PM',
      company: '—',
      status: 'Sale Done',
      quality: '—',
      owner: 'P'
    },
    {
      name: 'kjjkvkh',
      email: 'jkhbkn@hjf.hfv',
      contact: '+911212121415',
      dateCreated: 'Jun 23, 2026, 12:23 PM',
      company: 'fhtf',
      status: 'Not Dialed',
      quality: '—',
      owner: 'A'
    },
    {
      name: 'kugkkh',
      email: 'ljgbjg@hgdh.hjc',
      contact: '+911212121217',
      dateCreated: 'Jun 23, 2026, 12:17 PM',
      company: 'fhtf',
      status: 'Not Dialed',
      quality: '—',
      owner: 'P'
    },
    {
      name: 'hjvjv',
      email: 'jfgf@fgd.com',
      contact: '+911515151515',
      dateCreated: 'Jun 23, 2026, 12:16 PM',
      company: 'fhtf',
      status: 'Good Lead',
      quality: '—',
      owner: 'A'
    },
    {
      name: 'Abhraneel Dhar',
      email: 'abhraneeldhar7@groweasy.com',
      contact: '+919051589728',
      dateCreated: 'Jun 23, 2026, 11:01 AM',
      company: 'groweasy',
      status: 'Good Lead',
      quality: '—',
      owner: 'A'
    },
    {
      name: 'fhjf ghf',
      email: 'tjrf.ft@gfjj.com',
      contact: '+911414141414',
      dateCreated: 'Jun 22, 2026, 4:49 PM',
      company: 'thr rh',
      status: 'Not Dialed',
      quality: '—',
      owner: '7'
    },
    {
      name: 'fhf',
      email: 'gnhfg@fgjf.com',
      contact: '+911313131313',
      dateCreated: 'Jun 22, 2026, 4:48 PM',
      company: 'fhtf',
      status: 'Not Dialed',
      quality: '—',
      owner: 'A'
    },
    {
      name: 'Abc 1',
      email: 'abc1@kryf.com',
      contact: '+911212121212',
      dateCreated: 'Jun 22, 2026, 4:44 PM',
      company: '—',
      status: 'Not Dialed',
      quality: '—',
      owner: 'A'
    }
  ]);

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
        setCurrentStep(2); // Go to Preview inside Modal
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
      
      // Inject successfully mapped leads directly into our active dashboard database
      if (result.records && result.records.length > 0) {
        const newLeads: CrmLeadItem[] = result.records
          .filter((item: any) => item.status === 'success')
          .map((item: any) => {
            const m = item.mapped;
            // Format status to visual status names
            let formattedStatus = 'Not Dialed';
            if (m.crm_status === 'GOOD_LEAD_FOLLOW_UP') formattedStatus = 'Good Lead';
            else if (m.crm_status === 'SALE_DONE') formattedStatus = 'Sale Done';
            else if (m.crm_status === 'DID_NOT_CONNECT') formattedStatus = 'Not Dialed';
            else if (m.crm_status === 'BAD_LEAD') formattedStatus = 'Bad Lead';

            // Format date
            let displayDate = new Date().toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true
            });
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
              } catch (e) {}
            }

            return {
              name: m.name || 'Imported Lead',
              email: m.email || '—',
              contact: `${m.country_code ? '+' + m.country_code : ''} ${m.mobile_without_country_code || ''}`.trim() || '—',
              dateCreated: displayDate,
              company: m.company || '—',
              status: formattedStatus,
              quality: '—',
              owner: 'U' // User/Import badge
            };
          });

        if (newLeads.length > 0) {
          setLeadsList((prev) => [...newLeads, ...prev]);
        }
      }

      setCurrentStep(4); // Show results dashboard inside Modal
    } catch (err: any) {
      clearInterval(progressInterval);
      setError(err.message || 'An error occurred during import.');
      setCurrentStep(2); // Go back to preview if error
    }
  };

  // Close modal and reset states
  const closeModal = () => {
    setIsModalOpen(false);
    setFile(null);
    setCsvHeaders([]);
    setCsvRows([]);
    setImportSummary(null);
    setError(null);
    setProgressVal(0);
    setCurrentStep(1);
  };

  // Reset file selections in modal
  const handleResetFile = () => {
    setFile(null);
    setCsvHeaders([]);
    setCsvRows([]);
    setError(null);
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
      lead.company.toLowerCase().includes(q)
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
          <div className="sidebar-logo-icon">↗</div>
          <span className="sidebar-logo-text">GrowEasy</span>
        </div>

        <div className="sidebar-profile">
          <div className="profile-avatar">VK</div>
          <div className="profile-info">
            <span className="profile-name">VK Test</span>
            <span className="profile-role">Owner</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {/* MAIN Nav Group */}
          <div className="sidebar-nav-group">
            <span className="nav-group-label">Main</span>
            <div 
              className={`sidebar-nav-item ${activeTab === 'manage-leads' ? '' : ''}`}
              onClick={() => setActiveTab('manage-leads')}
            >
              <span className="sidebar-nav-item-icon">📊</span>
              <span>Dashboard</span>
            </div>
            <div className="sidebar-nav-item">
              <span className="sidebar-nav-item-icon">⚡</span>
              <span>Generate Leads</span>
            </div>
            <div 
              className={`sidebar-nav-item ${activeTab === 'manage-leads' ? 'active' : ''}`}
              onClick={() => setActiveTab('manage-leads')}
            >
              <span className="sidebar-nav-item-icon">🗂️</span>
              <span>Manage Leads</span>
            </div>
            <div className="sidebar-nav-item">
              <span className="sidebar-nav-item-icon">💬</span>
              <span>Engage Leads</span>
            </div>
          </div>

          {/* CONTROL CENTER Nav Group */}
          <div className="sidebar-nav-group">
            <span className="nav-group-label">Control Center</span>
            <div className="sidebar-nav-item">
              <span className="sidebar-nav-item-icon">👥</span>
              <span>Team Members</span>
            </div>
            <div 
              className={`sidebar-nav-item ${activeTab === 'lead-sources' ? 'active' : ''}`}
              onClick={() => setActiveTab('lead-sources')}
            >
              <span className="sidebar-nav-item-icon">📢</span>
              <span>Lead Sources</span>
            </div>
            <div className="sidebar-nav-item">
              <span className="sidebar-nav-item-icon">💳</span>
              <span>Ad Accounts</span>
            </div>
            <div className="sidebar-nav-item">
              <span className="sidebar-nav-item-icon">💬</span>
              <span>WhatsApp Account</span>
            </div>
            <div className="sidebar-nav-item">
              <span className="sidebar-nav-item-icon">📞</span>
              <span>Tele Calling</span>
            </div>
            <div className="sidebar-nav-item">
              <span className="sidebar-nav-item-icon">🎛️</span>
              <span>CRM Fields</span>
            </div>
            <div className="sidebar-nav-item">
              <span className="sidebar-nav-item-icon">🔑</span>
              <span>API Center</span>
            </div>
          </div>

          <div style={{ marginTop: 'auto' }}>
            <div className="sidebar-nav-item" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', borderRadius: 0 }}>
              <span className="sidebar-nav-item-icon">🏢</span>
              <span>Business Center</span>
            </div>
          </div>
        </nav>
      </aside>

      {/* 2. MAIN WORKSPACE */}
      <main className="crm-main-content">
        {/* TAB 1: LEAD SOURCES DASHBOARD */}
        {activeTab === 'lead-sources' && (
          <>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)' }}>Lead Sources</h1>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button onClick={toggleTheme} className="theme-toggle" title="Toggle Theme">
                    {theme === 'light' ? '🌙' : '☀️'}
                  </button>
                  <button onClick={() => setIsModalOpen(true)} className="btn btn-primary">
                    📥 Import CSV File
                  </button>
                </div>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                Connect, manage, and control all your lead channels from one dashboard.
              </p>
            </div>

            <div className="sources-grid">
              {/* Card 1: Facebook Ads Import */}
              <div className="source-card">
                <div className="source-header">
                  <div className="source-icon-wrapper" style={{ background: '#eff6ff', color: '#1d4ed8' }}>📘</div>
                  <div className="source-details">
                    <span className="source-title">Facebook Leads Export</span>
                    <span className="source-desc">Import FB Lead Gen Forms CSV</span>
                  </div>
                </div>
                <div className="source-footer">
                  <span className="source-status">
                    <span className="status-dot inactive"></span>
                    <span>Offline Mappings</span>
                  </span>
                  <button onClick={() => { setIsModalOpen(true); setCurrentStep(1); }} className="btn btn-secondary" style={{ padding: '0.45rem 1rem', fontSize: '0.8rem' }}>
                    Import CSV
                  </button>
                </div>
              </div>

              {/* Card 2: Google Ads Link */}
              <div className="source-card">
                <div className="source-header">
                  <div className="source-icon-wrapper" style={{ background: '#fffbeb', color: '#d97706' }}>🔍</div>
                  <div className="source-details">
                    <span className="source-title">Google Ads API</span>
                    <span className="source-desc">Direct CRM push sync integration</span>
                  </div>
                </div>
                <div className="source-footer">
                  <span className="source-status">
                    <span className="status-dot inactive"></span>
                    <span>Not Connected</span>
                  </span>
                  <button className="btn btn-secondary" style={{ padding: '0.45rem 1rem', fontSize: '0.8rem' }}>
                    Connect
                  </button>
                </div>
              </div>

              {/* Card 3: WhatsApp Ingest */}
              <div className="source-card">
                <div className="source-header">
                  <div className="source-icon-wrapper" style={{ background: '#ecfdf5', color: '#059669' }}>🟢</div>
                  <div className="source-details">
                    <span className="source-title">WhatsApp Chats</span>
                    <span className="source-desc">Extract contact details from chats</span>
                  </div>
                </div>
                <div className="source-footer">
                  <span className="source-status">
                    <span className="status-dot inactive"></span>
                    <span>Inactive</span>
                  </span>
                  <button className="btn btn-secondary" style={{ padding: '0.45rem 1rem', fontSize: '0.8rem' }}>
                    Connect
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* TAB 2: MANAGE LEADS TABLE VIEW */}
        {activeTab === 'manage-leads' && (
          <>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)' }}>Manage Your Leads</h1>
                <button onClick={toggleTheme} className="theme-toggle" title="Toggle Theme">
                  {theme === 'light' ? '🌙' : '☀️'}
                </button>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                Monitor lead status, assign tasks, and close deals faster.
              </p>
            </div>

            <div className="card card-glass" style={{ padding: '1.5rem' }}>
              <div className="leads-control-header" style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Your Leads</h3>
                
                <div className="leads-search-bar">
                  <input 
                    type="text"
                    className="leads-search-input"
                    placeholder="Enter email or phone number..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <button className="btn btn-primary btn-icon" title="Search Leads">
                    🔍
                  </button>
                  <button onClick={() => setSearchQuery('')} className="btn btn-secondary btn-icon" title="Refresh/Clear filter">
                    🔄
                  </button>
                </div>
              </div>

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
                      <th>Quality</th>
                      <th style={{ textAlign: 'center' }}>Lead Owner</th>
                      <th>Actions</th>
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
                        <td>{lead.quality}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`owner-avatar avatar-${lead.owner.toLowerCase()}`}>
                            {lead.owner}
                          </span>
                        </td>
                        <td>
                          <button className="btn btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', borderRadius: '4px' }}>
                            More &gt;
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredLeads.length === 0 && (
                      <tr>
                        <td colSpan={9} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                          No leads matched your search query.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1.5rem' }}>
                <button className="btn btn-secondary" style={{ padding: '0.5rem 1.5rem', borderRadius: '50px', fontSize: '0.8rem' }}>
                  Load more
                </button>
              </div>
            </div>
          </>
        )}
      </main>

      {/* 3. CSV MIGRATION DIALOG (MODAL WINDOW) */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-wrapper" style={{ maxWidth: currentStep === 2 || currentStep === 4 ? '850px' : '600px' }}>
            
            {/* Modal Header */}
            <div className="modal-header">
              <div>
                <h2 className="modal-title">Import Leads via CSV</h2>
                <p className="modal-subtitle">
                  {currentStep === 1 && 'Upload a CSV file to bulk import leads into your system.'}
                  {currentStep === 2 && 'Review detected columns and formatting before finalizing.'}
                  {currentStep === 3 && 'AI engine mapping is running. Please wait.'}
                  {currentStep === 4 && 'Structured results normalized by the AI.'}
                </p>
              </div>
              <button onClick={closeModal} className="modal-close-btn">✕</button>
            </div>

            {/* Modal Error Banner */}
            {error && (
              <div style={{ background: 'var(--danger-bg)', borderBottom: '1px solid var(--border-color)', color: 'var(--danger)', padding: '0.75rem 1.5rem', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>⚠️ {error}</span>
                <button onClick={() => setError(null)} style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
              </div>
            )}

            {/* Modal Body content changes based on step */}
            <div className="modal-body">
              
              {/* STEP 1: DROPZONE FILE PICKER */}
              {currentStep === 1 && (
                <div className="slide-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div 
                    onDragEnter={handleDrag}
                    onDragOver={handleDrag}
                    onDragLeave={handleDrag}
                    onDrop={handleDrop}
                    className={`dropzone ${isDragActive ? 'active' : ''}`}
                    onClick={triggerFileSelect}
                    style={{ padding: '2.5rem 1rem' }}
                  >
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileChange} 
                      style={{ display: 'none' }} 
                      accept=".csv"
                    />
                    <div className="dropzone-icon" style={{ width: '48px', height: '48px', fontSize: '1.35rem' }}>↑</div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Drop your CSV file here</h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>or click to browse files</p>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', background: 'var(--bg-primary)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                      ℹ️ Supported file: .csv (max 5MB)
                    </span>
                  </div>

                  <div style={{ padding: '0.75rem', background: 'var(--bg-primary)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.4, textAlign: 'center' }}>
                      Required headers: <code>created_at</code>, <code>name</code>, <code>email</code>, <code>country_code</code>, <code>mobile_without_country_code</code>, <code>company</code>, <code>city</code>, <code>state</code>, <code>country</code>, <code>lead_owner</code>, <code>crm_status</code>, <code>crm_note</code>. Template includes default + custom CRM fields to reduce upload errors.
                    </p>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <button onClick={downloadSampleTemplate} className="btn btn-secondary" style={{ padding: '0.45rem 1rem', fontSize: '0.75rem' }}>
                      📄 Download Sample CSV Template
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 2: PREVIEW PRE-MAPPING TABLE */}
              {currentStep === 2 && file && (
                <div className="slide-in">
                  <div className="file-uploaded-block">
                    <div className="file-info">
                      <span className="file-icon">📄</span>
                      <div>
                        <div className="file-name">{file.name}</div>
                        <div className="file-size">{(file.size / 1024).toFixed(2)} KB</div>
                      </div>
                    </div>
                    <button onClick={handleResetFile} className="modal-close-btn" style={{ fontSize: '0.9rem' }} title="Remove file">
                      ✕
                    </button>
                  </div>

                  <div className="table-container" style={{ maxHeight: '250px' }}>
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
                        {csvRows.slice(0, 15).map((row, rowIdx) => (
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
                  {csvRows.length > 15 && (
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.5rem', textAlign: 'right' }}>
                      * Showing first 15 rows for preview. Mappers will process all {csvRows.length} rows.
                    </p>
                  )}
                </div>
              )}

              {/* STEP 3: RUNNING PROMPT AI MAPPING */}
              {currentStep === 3 && (
                <div className="slide-in" style={{ padding: '2rem 1rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem' }}>
                  <div className="pulse" style={{ fontSize: '2.5rem' }}>🧠</div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>AI Lead Extraction is in Progress</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.825rem', maxWidth: '400px' }}>
                    Analyzing layout structures, matching dynamic columns, and cleansing user contact identifiers.
                  </p>
                  
                  <div style={{ width: '100%', maxWidth: '400px', height: '6px', background: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden' }}>
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
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--primary)' }}>
                    {loadingMessage} ({progressVal}%)
                  </span>
                </div>
              )}

              {/* STEP 4: MAPPED OUTPUT SUMMARY */}
              {currentStep === 4 && importSummary && (
                <div className="slide-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  {/* Miniature Stats */}
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, padding: '0.75rem', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--bg-primary)' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>TOTAL ROWS</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{importSummary.totalImported + importSummary.totalSkipped}</div>
                    </div>
                    <div style={{ flex: 1, padding: '0.75rem', border: '1px solid rgba(16, 185, 129, 0.15)', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.03)' }}>
                      <div style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600 }}>SUCCESS</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#10b981' }}>{importSummary.totalImported}</div>
                    </div>
                    <div style={{ flex: 1, padding: '0.75rem', border: '1px solid rgba(239, 68, 68, 0.15)', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.03)' }}>
                      <div style={{ fontSize: '0.75rem', color: '#ef4444', fontWeight: 600 }}>SKIPPED</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ef4444' }}>{importSummary.totalSkipped}</div>
                    </div>
                  </div>

                  {/* Results preview table */}
                  <div className="table-container" style={{ maxHeight: '250px' }}>
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
                              <td style={{ fontWeight: 600 }}>{lead.name || item.raw['name'] || item.raw['Name'] || '-'}</td>
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

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                    <button onClick={downloadJSON} className="btn btn-secondary" style={{ padding: '0.45rem 1rem', fontSize: '0.8rem' }}>
                      💾 Export JSON
                    </button>
                    <button onClick={downloadCSV} className="btn btn-primary" style={{ padding: '0.45rem 1rem', fontSize: '0.8rem' }}>
                      📥 Download CSV Leads
                    </button>
                  </div>
                </div>
              )}

            </div>

            {/* Modal Footer Controls */}
            {currentStep !== 3 && (
              <div className="modal-footer">
                {currentStep === 1 && (
                  <>
                    <button onClick={closeModal} className="btn btn-secondary">
                      Cancel
                    </button>
                    <button disabled className="btn btn-primary" style={{ opacity: 0.5, cursor: 'not-allowed' }}>
                      Upload File
                    </button>
                  </>
                )}

                {currentStep === 2 && (
                  <>
                    <button onClick={handleResetFile} className="btn btn-secondary">
                      Cancel
                    </button>
                    <button onClick={handleConfirmImport} className="btn btn-primary" style={{ background: '#f97316' }}>
                      Upload File
                    </button>
                  </>
                )}

                {currentStep === 4 && (
                  <button onClick={() => { closeModal(); setActiveTab('manage-leads'); }} className="btn btn-primary">
                    View in Dashboard
                  </button>
                )}
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
