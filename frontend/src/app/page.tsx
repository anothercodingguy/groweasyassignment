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
      if (!response.ok) throw new Error('Failed to retrieve leads from persistent DB.');
      const data = await response.json();
      
      // Map raw CRM record to front-end lead schema
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
      if (!response.ok) throw new Error('Failed to wipe the remote database.');
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
          {/* MAIN Nav Group */}
          <div className="sidebar-nav-group">
            <span className="nav-group-label">Main</span>
            <div 
              className={`sidebar-nav-item ${activeTab === 'manage-leads' ? '' : ''}`}
              onClick={() => setActiveTab('manage-leads')}
            >
              <span className="sidebar-nav-item-icon">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="9" />
                  <rect x="14" y="3" width="7" height="5" />
                  <rect x="14" y="12" width="7" height="9" />
                  <rect x="3" y="16" width="7" height="5" />
                </svg>
              </span>
              <span>Dashboard</span>
            </div>
            <div className="sidebar-nav-item">
              <span className="sidebar-nav-item-icon">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </span>
              <span>Generate Leads</span>
            </div>
            <div 
              className={`sidebar-nav-item ${activeTab === 'manage-leads' ? 'active' : ''}`}
              onClick={() => setActiveTab('manage-leads')}
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
              <span>Manage Leads</span>
            </div>
            <div className="sidebar-nav-item">
              <span className="sidebar-nav-item-icon">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </span>
              <span>Engage Leads</span>
            </div>
          </div>

          {/* CONTROL CENTER Nav Group */}
          <div className="sidebar-nav-group">
            <span className="nav-group-label">Control Center</span>
            <div className="sidebar-nav-item">
              <span className="sidebar-nav-item-icon">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </span>
              <span>Team Members</span>
            </div>
            <div 
              className={`sidebar-nav-item ${activeTab === 'lead-sources' ? 'active' : ''}`}
              onClick={() => setActiveTab('lead-sources')}
            >
              <span className="sidebar-nav-item-icon">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22 6 12 13 2 6" />
                </svg>
              </span>
              <span>Lead Sources</span>
            </div>
            <div className="sidebar-nav-item">
              <span className="sidebar-nav-item-icon">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                  <line x1="1" y1="10" x2="23" y2="10" />
                </svg>
              </span>
              <span>Ad Accounts</span>
            </div>
            <div className="sidebar-nav-item">
              <span className="sidebar-nav-item-icon">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
              </span>
              <span>WhatsApp Account</span>
            </div>
            <div className="sidebar-nav-item">
              <span className="sidebar-nav-item-icon">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
              </span>
              <span>Tele Calling</span>
            </div>
            <div className="sidebar-nav-item">
              <span className="sidebar-nav-item-icon">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="4" y1="21" x2="4" y2="14" />
                  <line x1="4" y1="10" x2="4" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12" y2="3" />
                  <line x1="20" y1="21" x2="20" y2="16" />
                  <line x1="20" y1="12" x2="20" y2="3" />
                  <line x1="1" y1="14" x2="7" y2="14" />
                  <line x1="9" y1="8" x2="15" y2="8" />
                  <line x1="17" y1="16" x2="23" y2="16" />
                </svg>
              </span>
              <span>CRM Fields</span>
            </div>
            <div className="sidebar-nav-item">
              <span className="sidebar-nav-item-icon">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </span>
              <span>API Center</span>
            </div>
          </div>

          <div style={{ marginTop: 'auto' }}>
            <div className="sidebar-nav-item" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', borderRadius: 0 }}>
              <span className="sidebar-nav-item-icon">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                </svg>
              </span>
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
                    {theme === 'light' ? (
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                    ) : (
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                    )}
                  </button>
                  <button onClick={() => setIsModalOpen(true)} className="btn btn-primary">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '0.25rem' }}>
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    Import CSV Leads
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
                  <div className="source-icon-wrapper" style={{ background: 'rgba(29, 78, 216, 0.08)', color: '#1d4ed8', border: '1px solid rgba(29, 78, 216, 0.15)' }}>
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                    </svg>
                  </div>
                  <div className="source-details">
                    <span className="source-title">Facebook Leads Export</span>
                    <span className="source-desc">Ingest and map offline campaign lead forms</span>
                  </div>
                </div>
                <div className="source-footer">
                  <span className="source-status">
                    <span className="status-dot inactive" style={{ background: '#f59e0b' }}></span>
                    <span>Ready for Import</span>
                  </span>
                  <button onClick={() => { setIsModalOpen(true); setCurrentStep(1); }} className="btn btn-secondary" style={{ padding: '0.45rem 1rem', fontSize: '0.8rem' }}>
                    Import CSV
                  </button>
                </div>
              </div>

              {/* Card 2: Google Ads Link */}
              <div className="source-card">
                <div className="source-header">
                  <div className="source-icon-wrapper" style={{ background: 'rgba(234, 179, 8, 0.08)', color: '#eab308', border: '1px solid rgba(234, 179, 8, 0.15)' }}>
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                      <path d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-5.136 4.114-3.44 0-6.228-2.77-6.228-6.2s2.788-6.2 6.228-6.2c1.54 0 2.94.57 4.03 1.49l3.07-3.08C19.24 2.9 16.32 1.7 13 1.7 7.15 1.7 2.4 6.3 2.4 12.2s4.75 10.5 10.6 10.5c5.96 0 10.43-4.2 10.43-10.6 0-.7-.08-1.4-.22-2.1H12.24z"/>
                    </svg>
                  </div>
                  <div className="source-details">
                    <span className="source-title">Google Ads API</span>
                    <span className="source-desc">Direct Webhook sync and lead tracking connection</span>
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
                  <div className="source-icon-wrapper" style={{ background: 'rgba(34, 197, 94, 0.08)', color: '#22c55e', border: '1px solid rgba(34, 197, 94, 0.15)' }}>
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.731-1.456L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.625 1.45 5.489 0 9.953-4.437 9.956-9.897.002-2.644-1.017-5.13-2.87-6.983a9.885 9.885 0 0 0-6.99-2.895C6.183.839 1.72 5.276 1.717 10.739c-.002 1.56.418 3.085 1.218 4.418l-.997 3.64 3.766-.988c1.32.723 2.766 1.096 4.957 1.047z"/>
                    </svg>
                  </div>
                  <div className="source-details">
                    <span className="source-title">WhatsApp Chats</span>
                    <span className="source-desc">Extract, parse, and structure chats into leads</span>
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
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button onClick={toggleTheme} className="theme-toggle" title="Toggle Theme">
                    {theme === 'light' ? (
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                    ) : (
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                    )}
                  </button>
                  <button onClick={clearLeadsDatabase} className="btn btn-secondary" style={{ color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.2)', background: 'rgba(239, 68, 68, 0.02)' }} title="Clear all stored leads from the database">
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
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                Monitor lead status, assign tasks, and close deals faster.
              </p>
            </div>

            <div className="card card-glass" style={{ padding: '1.5rem' }}>
              <div className="leads-control-header" style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Database Records ({leadsList.length})</h3>
                
                <div className="leads-search-bar">
                  <input 
                    type="text"
                    className="leads-search-input"
                    placeholder="Search by name, email, number..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <button className="btn btn-primary btn-icon" title="Search Leads">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                  </button>
                  <button onClick={() => { setSearchQuery(''); fetchLeads(); }} className="btn btn-secondary btn-icon" title="Sync database & Clear Filters">
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
                  <svg className="pulse" viewBox="0 0 24 24" width="38" height="38" stroke="var(--primary)" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
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
                                Go to the <strong>Lead Sources</strong> page or click "Import CSV Leads" to parse and upload CRM lead records via AI.
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
                    <div className="dropzone-icon" style={{ width: '48px', height: '48px', fontSize: '1.35rem' }}>
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                    </div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Drop your CSV file here</h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>or click to browse files</p>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', background: 'var(--bg-primary)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                      Supported format: .csv (max 5MB)
                    </span>
                  </div>

                  <div style={{ padding: '0.75rem', background: 'var(--bg-primary)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.4, textAlign: 'center' }}>
                      Required fields: <code>name</code> or <code>contact number</code> or <code>email</code>. The AI model will dynamically parse any column layout structure and map headers to GrowEasy leads requirements.
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
                      <span className="file-icon" style={{ display: 'flex', alignItems: 'center' }}>
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="var(--success)" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      </span>
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
                <div className="slide-in" style={{ padding: '2.5rem 1rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem' }}>
                  <div style={{ animation: 'spin 1.5s linear infinite' }}>
                    <svg viewBox="0 0 24 24" width="48" height="48" stroke="var(--primary)" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="8" />
                    </svg>
                  </div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>AI Lead Extraction is in Progress</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.825rem', maxWidth: '400px' }}>
                    Analyzing layout structures, matching dynamic columns, and cleansing user contact identifiers using LLM.
                  </p>
                  
                  <div style={{ width: '100%', maxWidth: '300px', height: '6px', background: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden' }}>
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
