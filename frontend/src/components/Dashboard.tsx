import React, { useState, useEffect } from 'react';
import { 
  Search, 
  MapPin, 
  List, 
  Sparkles, 
  AlertCircle, 
  Filter, 
  ArrowUpDown, 
  ExternalLink,
  Mail,
  MessageSquare,
  Settings,
  Database,
  Map,
  X,
  Play,
  Pause,
  Loader2,
  CheckCircle2,
  Clock
} from 'lucide-react';

interface Lead {
  id: string;
  name: string;
  category: string;
  address: string;
  has_website: boolean;
  website_url?: string;
  scale: 'solo' | 'small' | 'medium' | 'large' | 'unknown';
  review_count: number;
  review_rating: number;
  opportunity_score: number;
  contact_status: 'not_contacted' | 'in_sequence' | 'replied' | 'converted' | 'rejected' | 'unsubscribed';
  distance_km?: number;
}

export default function Dashboard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterNoWebsite, setFilterNoWebsite] = useState(true);
  const [filterScale, setFilterScale] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [showMapView, setShowMapView] = useState(false);
  const [sortBy, setSortBy] = useState<'opportunity_score' | 'distance_km' | 'review_count'>('opportunity_score');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Modal states
  const [showScrapeModal, setShowScrapeModal] = useState(false);
  const [scrapeQuery, setScrapeQuery] = useState('');
  const [scrapeLat, setScrapeLat] = useState('47.6062');
  const [scrapeLng, setScrapeLng] = useState('-122.3321');
  const [scrapeRadius, setScrapeRadius] = useState('5000');
  const [scraping, setScraping] = useState(false);

  // Note states
  const [activeLeadNotesId, setActiveLeadNotesId] = useState<string | null>(null);
  const [newNote, setNewNote] = useState('');

  // Outreach SPA States
  const [currentTab, setCurrentTab] = useState<'leads' | 'sequences' | 'templates'>('leads');
  const [sequences, setSequences] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [loadingOutreach, setLoadingOutreach] = useState(false);
  const [processingQueue, setProcessingQueue] = useState(false);

  const fetchOutreachData = async () => {
    setLoadingOutreach(true);
    try {
      const [seqRes, tempRes, enrollRes] = await Promise.all([
        fetch('http://localhost:3001/api/v1/outreach/sequences'),
        fetch('http://localhost:3001/api/v1/outreach/templates'),
        fetch('http://localhost:3001/api/v1/outreach/enrollments')
      ]);
      if (seqRes.ok) setSequences(await seqRes.json());
      if (tempRes.ok) setTemplates(await tempRes.json());
      if (enrollRes.ok) setEnrollments(await enrollRes.json());
    } catch (e) {
      console.error('Error fetching outreach data:', e);
    } finally {
      setLoadingOutreach(false);
    }
  };

  const handleTogglePause = async (id: string) => {
    try {
      const response = await fetch(`http://localhost:3001/api/v1/outreach/enrollments/${id}/toggle-pause`, {
        method: 'POST'
      });
      if (response.ok) {
        fetchOutreachData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleProcessQueue = async () => {
    setProcessingQueue(true);
    try {
      const response = await fetch('http://localhost:3001/api/v1/outreach/process', {
        method: 'POST'
      });
      if (response.ok) {
        await response.json();
        alert('Queue processing complete!');
        fetchOutreachData();
        fetchLeads();
      }
    } catch (e) {
      console.error(e);
      alert('Failed to process queue.');
    } finally {
      setProcessingQueue(false);
    }
  };

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const url = new URL('http://localhost:3001/api/v1/leads');
      if (filterNoWebsite) url.searchParams.append('has_website', 'false');
      if (filterScale !== 'all') url.searchParams.append('scale', filterScale);
      if (filterStatus !== 'all') url.searchParams.append('contact_status', filterStatus);
      if (searchTerm) url.searchParams.append('category', searchTerm);
      url.searchParams.append('sort_by', sortBy === 'distance_km' ? 'distance' : sortBy);
      url.searchParams.append('order', sortOrder);
      url.searchParams.append('ref_lat', scrapeLat);
      url.searchParams.append('ref_lng', scrapeLng);

      const res = await fetch(url.toString());
      if (res.ok) {
        const result = await res.json();
        setLeads(result.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch leads from server:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
    fetchOutreachData();
  }, [filterNoWebsite, filterScale, filterStatus, searchTerm, sortBy, sortOrder, scrapeLat, scrapeLng]);

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedLeads(leads.map(l => l.id));
    } else {
      setSelectedLeads([]);
    }
  };

  const handleSelectLead = (id: string) => {
    setSelectedLeads(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const toggleSort = (field: 'opportunity_score' | 'distance_km' | 'review_count') => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const handleBulkAction = async (action: 'enroll' | 'status' | 'approve' | 'reject') => {
    if (selectedLeads.length === 0) return;
    try {
      let bodyData: any = {
        business_ids: selectedLeads,
        action: action === 'enroll' ? 'enroll_sequence' : 
                action === 'approve' ? 'approve' : 
                action === 'reject' ? 'reject' : 'update_status'
      };
      if (action === 'enroll') {
        bodyData.params = {
          sequence_id: 'c3b9b4f6-8c9e-4e4f-b4e6-8c9e4e4fb4e6' // Default sequence id
        };
      } else if (action === 'status') {
        bodyData.params = {
          contact_status: 'in_sequence'
        };
      }
      
      const response = await fetch('http://localhost:3001/api/v1/leads/bulk-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyData)
      });
      if (response.ok) {
        const data = await response.json();
        alert(data.message);
        setSelectedLeads([]);
        fetchLeads();
      } else {
        const error = await response.json();
        alert(`Error: ${error.error}`);
      }
    } catch (e) {
      console.error(e);
      alert('Failed to execute bulk action.');
    }
  };

  const runScraper = async (e: React.FormEvent) => {
    e.preventDefault();
    setScraping(true);
    try {
      const response = await fetch('http://localhost:3001/api/v1/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: scrapeQuery,
          latitude: parseFloat(scrapeLat),
          longitude: parseFloat(scrapeLng),
          radius_meters: parseFloat(scrapeRadius)
        })
      });
      if (response.ok) {
        const data = await response.json();
        alert(data.message);
        setShowScrapeModal(false);
        fetchLeads();
      } else {
        alert('Failed to start scraper. Please try again.');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to connect to scraper API.');
    } finally {
      setScraping(false);
    }
  };

  const addNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim() || !activeLeadNotesId) return;
    try {
      const response = await fetch(`http://localhost:3001/api/v1/leads/${activeLeadNotesId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: newNote })
      });
      if (response.ok) {
        alert('Note added successfully!');
        setNewNote('');
        setActiveLeadNotesId(null);
      } else {
        alert('Failed to save note.');
      }
    } catch (err) {
      console.error(err);
      alert('Network error while saving note.');
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 font-sans antialiased">
      {/* Background radial overlay for design depth */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(99,102,241,0.08),transparent_50%)] pointer-events-none" />

      {/* Top Banner / Navigation */}
      <nav className="border-b border-slate-800 bg-[#0f172a]/60 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-500/30">
              ⚡
            </div>
            <div>
              <span className="font-extrabold tracking-tight text-white text-lg">LEADSTREAM</span>
              <span className="text-[10px] ml-1 bg-indigo-500/20 text-indigo-300 font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider border border-indigo-500/30">
                PRO
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs font-semibold text-slate-400">
            <span 
              onClick={() => setCurrentTab('leads')}
              className={`hover:text-white transition-colors cursor-pointer ${currentTab === 'leads' ? 'text-indigo-400 font-extrabold' : ''}`}
            >
              Dashboard
            </span>
            <span 
              onClick={() => setCurrentTab('sequences')}
              className={`hover:text-white transition-colors cursor-pointer ${currentTab === 'sequences' ? 'text-indigo-400 font-extrabold' : ''}`}
            >
              Outreach Sequences
            </span>
            <span 
              onClick={() => setCurrentTab('templates')}
              className={`hover:text-white transition-colors cursor-pointer ${currentTab === 'templates' ? 'text-indigo-400 font-extrabold' : ''}`}
            >
              Templates
            </span>
            <span className="w-px h-4 bg-slate-800" />
            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 cursor-pointer hover:bg-slate-700 transition-colors">
              <Settings className="w-4 h-4" />
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-8 relative z-10">
        {currentTab === 'leads' && (
          <>
        {/* Hero Header */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-8">
          <div>
            <h2 className="text-2xl lg:text-3xl font-extrabold tracking-tight text-white">
              Invisible Business Finder
            </h2>
            <p className="text-slate-400 text-sm mt-1.5 max-w-xl">
              Target businesses with robust active review activity but completely lacking website presences. Convert them into clients.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button 
              onClick={() => setShowMapView(!showMapView)}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all shadow-md"
            >
              {showMapView ? (
                <>
                  <List className="w-4 h-4" /> Table View
                </>
              ) : (
                <>
                  <Map className="w-4 h-4" /> Map pins
                </>
              )}
            </button>
            <button 
              onClick={() => setShowScrapeModal(true)}
              className="px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-lg shadow-indigo-600/30"
            >
              <Sparkles className="w-4 h-4" /> Discover New Leads
            </button>
          </div>
        </div>

        {/* Dashboard Filters Panel */}
        <section className="bg-[#111827]/80 border border-slate-800 rounded-2xl p-5 mb-8 shadow-xl backdrop-blur-sm">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Search */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5" /> Search Leads
              </label>
              <input 
                type="text"
                placeholder="Search name, category..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="px-3.5 py-2.5 bg-slate-950/80 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl text-sm text-slate-100 placeholder-slate-500 outline-none transition-all"
              />
            </div>

            {/* Filter Website */}
            <div className="flex flex-col gap-2 justify-center">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Website Presence
              </span>
              <label className="relative flex items-center gap-3 cursor-pointer select-none">
                <input 
                  type="checkbox"
                  checked={filterNoWebsite}
                  onChange={(e) => setFilterNoWebsite(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-10 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-300 after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
                <span className="text-sm font-semibold text-slate-300">Lacks Website Only</span>
              </label>
            </div>

            {/* Scale Filter */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5" /> Business Size
              </label>
              <select
                value={filterScale}
                onChange={(e) => setFilterScale(e.target.value)}
                className="px-3.5 py-2.5 bg-slate-950/80 border border-slate-800 focus:border-indigo-500 rounded-xl text-sm text-slate-100 outline-none transition-all cursor-pointer"
              >
                <option value="all">All Sizes</option>
                <option value="solo">Solo Operator</option>
                <option value="small">Small Business</option>
                <option value="medium">Medium Size</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5" /> Contact Status
              </label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3.5 py-2.5 bg-slate-950/80 border border-slate-800 focus:border-indigo-500 rounded-xl text-sm text-slate-100 outline-none transition-all cursor-pointer"
              >
                <option value="all">All Stages</option>
                <option value="not_contacted">Not Contacted</option>
                <option value="in_sequence">Active In Sequence</option>
                <option value="replied">Replied / Hot</option>
              </select>
            </div>
          </div>
        </section>

        {/* Selected Leads Floating Bar */}
        {selectedLeads.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-4 bg-indigo-950/40 border border-indigo-500/30 rounded-2xl p-4 mb-8 backdrop-blur-md shadow-xl animate-in slide-in-from-top duration-300">
            <div className="flex items-center gap-2.5">
              <div className="w-5 h-5 bg-indigo-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                {selectedLeads.length}
              </div>
              <span className="text-sm font-semibold text-indigo-200">leads selected for bulk operations</span>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => handleBulkAction('approve')}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md"
              >
                Approve
              </button>
              <button 
                onClick={() => handleBulkAction('reject')}
                className="px-3.5 py-2 bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-500/20 rounded-xl text-xs font-bold transition-all"
              >
                Reject
              </button>
              <button 
                onClick={() => handleBulkAction('enroll')}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md"
              >
                <Mail className="w-3.5 h-3.5" /> Enroll in Sequence
              </button>
              <button 
                onClick={() => handleBulkAction('status')}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-xs font-semibold transition-all"
              >
                Update Status
              </button>
            </div>
          </div>
        )}

        {/* Lead Presentation Area */}
        {showMapView ? (
          <div className="bg-slate-900/40 border border-slate-800 rounded-2xl h-[450px] flex flex-col items-center justify-center text-center p-6 backdrop-blur-sm relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/5 to-transparent pointer-events-none" />
            <div className="w-14 h-14 bg-indigo-500/10 rounded-full flex items-center justify-center text-indigo-400 mb-4 border border-indigo-500/20">
              <MapPin className="w-6 h-6 animate-pulse" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Interactive Map Pins View</h3>
            <p className="text-slate-400 text-sm max-w-sm">
              Displays locations for the {leads.length} filtered leads using map coordinates. Integrate Leaflet or Mapbox GL in production.
            </p>
          </div>
        ) : (
          <div className="bg-[#111827]/60 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-sm">
            {loading ? (
              <div className="py-24 text-center">
                <div className="inline-block w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-slate-400 text-sm">Searching leads database...</p>
              </div>
            ) : leads.length === 0 ? (
              <div className="py-24 text-center text-slate-400">
                <AlertCircle className="w-10 h-10 mx-auto mb-3 text-slate-500" />
                <p className="font-semibold text-white">No Leads Found</p>
                <p className="text-xs text-slate-500 mt-1">Try expanding your filter constraints or run the discovery scraper.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-950/60 border-b border-slate-800 text-slate-400 text-xs font-bold uppercase tracking-wider select-none">
                      <th className="py-5 px-5 w-12 text-center">
                        <input 
                          type="checkbox"
                          onChange={handleSelectAll}
                          checked={leads.length > 0 && selectedLeads.length === leads.length}
                          className="w-4 h-4 rounded border-slate-700 text-indigo-600 bg-slate-900 focus:ring-indigo-500"
                        />
                      </th>
                      <th className="py-5 px-5">Business Profile</th>
                      <th className="py-5 px-5">Category</th>
                      <th className="py-5 px-5 cursor-pointer hover:text-white transition-colors" onClick={() => toggleSort('review_count')}>
                        <div className="flex items-center gap-1.5">
                          Reviews / Rating <ArrowUpDown className="w-3 h-3" />
                        </div>
                      </th>
                      <th className="py-5 px-5 cursor-pointer hover:text-white transition-colors" onClick={() => toggleSort('distance_km')}>
                        <div className="flex items-center gap-1.5">
                          Distance <ArrowUpDown className="w-3 h-3" />
                        </div>
                      </th>
                      <th className="py-5 px-5 cursor-pointer hover:text-white transition-colors text-center" onClick={() => toggleSort('opportunity_score')}>
                        <div className="flex items-center justify-center gap-1.5">
                          Opportunity Score <ArrowUpDown className="w-3 h-3" />
                        </div>
                      </th>
                      <th className="py-5 px-5">Status</th>
                      <th className="py-5 px-5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {leads.map((lead) => (
                      <tr 
                        key={lead.id} 
                        className={`hover:bg-slate-800/30 transition-colors text-sm ${
                          selectedLeads.includes(lead.id) ? 'bg-indigo-950/10' : ''
                        }`}
                      >
                        <td className="py-5 px-5 text-center">
                          <input 
                            type="checkbox"
                            checked={selectedLeads.includes(lead.id)}
                            onChange={() => handleSelectLead(lead.id)}
                            className="w-4 h-4 rounded border-slate-700 text-indigo-600 bg-slate-900 focus:ring-indigo-500"
                          />
                        </td>
                        <td className="py-5 px-5">
                          <div className="font-bold text-white text-base">{lead.name}</div>
                          <div className="text-slate-400 text-xs mt-0.5 flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-slate-500" /> {lead.address}
                          </div>
                        </td>
                        <td className="py-5 px-5">
                          <span className="px-2.5 py-1 bg-slate-800/80 rounded-lg text-slate-300 text-xs font-semibold">
                            {lead.category}
                          </span>
                        </td>
                        <td className="py-5 px-5">
                          <div className="flex items-center gap-1 text-slate-200 font-semibold">
                            ⭐ {lead.review_rating}
                          </div>
                          <div className="text-slate-500 text-xs mt-0.5">{lead.review_count} reviews</div>
                        </td>
                        <td className="py-5 px-5 text-slate-300 font-medium">
                          {lead.distance_km ? `${Number(lead.distance_km).toFixed(1)} km` : 'N/A'}
                        </td>
                        <td className="py-5 px-5 text-center">
                          <span className={`px-3 py-1.5 rounded-full text-xs font-extrabold border ${
                            Number(lead.opportunity_score) >= 80 
                              ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/20 shadow-lg shadow-emerald-950/20' 
                              : 'bg-amber-950/60 text-amber-300 border-amber-500/20 shadow-lg shadow-amber-950/20'
                          }`}>
                            {Number(lead.opportunity_score).toFixed(1)}
                          </span>
                        </td>
                        <td className="py-5 px-5">
                          <span className={`px-2.5 py-1 rounded-md text-xs font-bold border flex items-center gap-1.5 w-fit ${
                            lead.contact_status === 'in_sequence' 
                              ? 'bg-indigo-950/80 text-indigo-300 border-indigo-500/20' 
                              : lead.contact_status === 'replied'
                              ? 'bg-rose-950/80 text-rose-300 border-rose-500/20'
                              : 'bg-slate-900 text-slate-400 border-slate-800'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              lead.contact_status === 'in_sequence' ? 'bg-indigo-400' :
                              lead.contact_status === 'replied' ? 'bg-rose-400' : 'bg-slate-400'
                            }`} />
                            {lead.contact_status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-5 px-5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              onClick={() => setActiveLeadNotesId(lead.id)}
                              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg hover:text-white transition-colors"
                              title="Add Note"
                            >
                              <MessageSquare className="w-4 h-4" />
                            </button>
                            {lead.website_url && (
                              <a 
                                href={lead.website_url} 
                                target="_blank" 
                                rel="noreferrer" 
                                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg hover:text-white transition-colors inline-block"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
          </>
        )}

        {currentTab === 'sequences' && (
          <div className="space-y-8 animate-in fade-in duration-300">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div>
                <h2 className="text-2xl lg:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2.5">
                  ⚡ Outreach Campaigns
                </h2>
                <p className="text-slate-400 text-sm mt-1.5 max-w-xl">
                  Monitor campaign steps, channel delivery delays, and active enrollments.
                </p>
              </div>
              <button
                onClick={handleProcessQueue}
                disabled={processingQueue}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-lg shadow-indigo-500/20 active:scale-95 cursor-pointer"
              >
                {processingQueue ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Processing...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-white" /> Process Outreach Queue
                  </>
                )}
              </button>
            </div>

            {/* Grid of Sequences */}
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-white border-l-2 border-indigo-500 pl-3">Active Sequences</h3>
              {loadingOutreach ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                </div>
              ) : sequences.length === 0 ? (
                <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-8 text-center text-slate-400">
                  No active sequences found. Run seed script or create one.
                </div>
              ) : (
                sequences.map((seq: any) => (
                  <div key={seq.id} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm relative overflow-hidden shadow-xl">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h4 className="text-lg font-bold text-white">{seq.name}</h4>
                        <p className="text-slate-400 text-xs mt-1">{seq.description}</p>
                      </div>
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-semibold px-2 py-0.5 rounded-full border border-emerald-500/30 uppercase tracking-wider">
                        Active
                      </span>
                    </div>

                    {/* Visual Steps Timeline */}
                    <div className="mt-6 border-t border-slate-850 pt-6">
                      <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Sequence Steps</h5>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
                        {seq.steps?.map((step: any, index: number) => (
                          <div key={step.id} className="relative flex flex-col bg-slate-955 border border-slate-850 rounded-xl p-4">
                            {/* Connector line for large screens */}
                            {index < seq.steps.length - 1 && (
                              <div className="hidden md:block absolute top-1/2 -right-3 w-6 h-px bg-slate-800 z-0" />
                            )}
                            <div className="flex justify-between items-center mb-3">
                              <span className="text-[10px] font-extrabold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-md uppercase">
                                Step {step.step_order}
                              </span>
                              {step.wait_days === 0 ? (
                                <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md font-semibold">Immediate</span>
                              ) : (
                                <span className="text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md font-semibold flex items-center gap-1">
                                  <Clock className="w-3 h-3" /> Wait {step.wait_days}d
                                </span>
                              )}
                            </div>
                            <h6 className="text-sm font-bold text-white truncate">{step.template_name}</h6>
                            <div className="flex items-center gap-1.5 mt-2.5 text-xs text-slate-400">
                              <span className="capitalize px-1.5 py-0.5 bg-slate-900 border border-slate-800 rounded font-semibold text-[10px]">
                                {step.channel}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Active Enrollments */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm shadow-xl space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-white border-l-2 border-indigo-500 pl-3">Active Enrollments</h3>
                <span className="text-xs text-slate-400 font-semibold bg-slate-950/40 px-2.5 py-1 border border-slate-800 rounded-lg">
                  {enrollments.length} total enrolled
                </span>
              </div>

              {loadingOutreach ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                </div>
              ) : enrollments.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-sm">
                  No active enrollments yet. Go to the dashboard, select approved leads, and click "Enroll in Sequence".
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm text-slate-300">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 font-semibold text-xs uppercase tracking-wider">
                        <th className="py-4.5 px-4">Business</th>
                        <th className="py-4.5 px-4">Sequence</th>
                        <th className="py-4.5 px-4">Current Step</th>
                        <th className="py-4.5 px-4">Last Status</th>
                        <th className="py-4.5 px-4">Enrolled At</th>
                        <th className="py-4.5 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850/50">
                      {enrollments.map((enroll: any) => (
                        <tr key={enroll.id} className="hover:bg-slate-950/20 transition-colors">
                          <td className="py-4 px-4">
                            <div className="font-bold text-white">{enroll.business_name}</div>
                            <div className="text-[10px] text-indigo-300 capitalize">{enroll.business_category}</div>
                          </td>
                          <td className="py-4 px-4 text-xs font-semibold">{enroll.sequence_name}</td>
                          <td className="py-4 px-4">
                            {enroll.completed_at ? (
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Completed
                              </span>
                            ) : (
                              <span className="text-xs font-bold text-slate-300 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-full">
                                Step {enroll.current_step}
                              </span>
                            )}
                          </td>
                          <td className="py-4 px-4">
                            {enroll.last_sent_at ? (
                              <div className="space-y-1">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${
                                  enroll.last_status === 'sent' ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' :
                                  enroll.last_status === 'failed' ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' :
                                  'bg-slate-800 text-slate-300'
                                }`}>
                                  {enroll.last_status}
                                </span>
                                <div className="text-[10px] text-slate-400">
                                  {new Date(enroll.last_sent_at).toLocaleDateString(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-500">Not started</span>
                            )}
                          </td>
                          <td className="py-4 px-4 text-xs text-slate-400">
                            {new Date(enroll.enrolled_at).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric'
                            })}
                          </td>
                          <td className="py-4 px-4 text-right">
                            {!enroll.completed_at && (
                              <button
                                onClick={() => handleTogglePause(enroll.id)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ml-auto cursor-pointer ${
                                  enroll.is_paused 
                                    ? 'bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 border border-emerald-500/30' 
                                    : 'bg-amber-600/20 text-amber-400 hover:bg-amber-600/30 border border-amber-500/30'
                                }`}
                              >
                                {enroll.is_paused ? (
                                  <>
                                    <Play className="w-3 h-3 fill-emerald-400" /> Resume
                                  </>
                                ) : (
                                  <>
                                    <Pause className="w-3 h-3 fill-amber-400" /> Pause
                                  </>
                                )}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {currentTab === 'templates' && (
          <div className="space-y-8 animate-in fade-in duration-300">
            {/* Header */}
            <div>
              <h2 className="text-2xl lg:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2.5">
                ✉️ Outreach Templates
              </h2>
              <p className="text-slate-400 text-sm mt-1.5 max-w-xl">
                Manage message templates with dynamic variable substitutions.
              </p>
            </div>

            {/* Templates List */}
            {loadingOutreach ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
              </div>
            ) : templates.length === 0 ? (
              <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-8 text-center text-slate-400">
                No templates found. Run seed script or create one.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {templates.map((temp: any) => (
                  <div key={temp.id} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm flex flex-col justify-between shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/[0.02] rounded-full blur-2xl pointer-events-none" />
                    <div>
                      <div className="flex justify-between items-center mb-3">
                        <h4 className="text-md font-bold text-white">{temp.name}</h4>
                        <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border uppercase tracking-wider ${
                          temp.channel === 'email' ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' :
                          temp.channel === 'whatsapp' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
                          'bg-amber-500/20 text-amber-300 border-amber-500/30'
                        }`}>
                          {temp.channel}
                        </span>
                      </div>

                      {temp.subject && (
                        <div className="mb-3 text-xs">
                          <span className="text-slate-400 font-semibold uppercase tracking-wider block mb-1">Subject</span>
                          <div className="bg-slate-950/60 border border-slate-850 px-3 py-2 rounded-lg text-slate-200 font-medium">
                            {temp.subject}
                          </div>
                        </div>
                      )}

                      <div className="text-xs">
                        <span className="text-slate-400 font-semibold uppercase tracking-wider block mb-1">Body</span>
                        <pre className="bg-slate-950/60 border border-slate-850 px-3.5 py-3 rounded-lg text-slate-300 font-mono text-[11px] leading-relaxed whitespace-pre-wrap font-sans">
                          {temp.body.split(/({{[^{}]+}})/g).map((part: string, idx: number) => 
                            part.startsWith('{{') && part.endsWith('}}') ? (
                              <span key={idx} className="text-indigo-400 font-bold bg-indigo-500/10 px-1 py-0.5 rounded">
                                {part}
                              </span>
                            ) : part
                          )}
                        </pre>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Discovery Scraper Modal */}
      {showScrapeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-[#0f172a] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60">
              <h3 className="font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-400" /> Discover Businesses
              </h3>
              <button onClick={() => setShowScrapeModal(false)} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={runScraper} className="p-6 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Search Keyword</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Plumber, Cafe, Bakery" 
                  value={scrapeQuery}
                  onChange={(e) => setScrapeQuery(e.target.value)}
                  className="px-3.5 py-2.5 bg-slate-950 border border-slate-850 rounded-xl text-slate-100 outline-none focus:border-indigo-500 text-sm transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Latitude</label>
                  <input 
                    type="number" 
                    step="any"
                    required
                    value={scrapeLat}
                    onChange={(e) => setScrapeLat(e.target.value)}
                    className="px-3.5 py-2.5 bg-slate-950 border border-slate-850 rounded-xl text-slate-100 outline-none focus:border-indigo-500 text-sm transition-all"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Longitude</label>
                  <input 
                    type="number" 
                    step="any"
                    required
                    value={scrapeLng}
                    onChange={(e) => setScrapeLng(e.target.value)}
                    className="px-3.5 py-2.5 bg-slate-950 border border-slate-850 rounded-xl text-slate-100 outline-none focus:border-indigo-500 text-sm transition-all"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Radius (Meters)</label>
                <input 
                  type="number" 
                  required
                  value={scrapeRadius}
                  onChange={(e) => setScrapeRadius(e.target.value)}
                  className="px-3.5 py-2.5 bg-slate-950 border border-slate-850 rounded-xl text-slate-100 outline-none focus:border-indigo-500 text-sm transition-all"
                />
              </div>

              <div className="flex gap-3 justify-end mt-4">
                <button 
                  type="button"
                  onClick={() => setShowScrapeModal(false)}
                  className="px-4 py-2.5 bg-slate-900 hover:bg-slate-855 text-slate-300 border border-slate-800 rounded-xl text-sm font-semibold transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={scraping}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {scraping ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Scraping...
                    </>
                  ) : 'Start Search'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Note Modal */}
      {activeLeadNotesId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-[#0f172a] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60">
              <h3 className="font-bold text-white flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-indigo-400" /> Add Annotation Note
              </h3>
              <button onClick={() => setActiveLeadNotesId(null)} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={addNote} className="p-6 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Note Content</label>
                <textarea 
                  required
                  rows={4}
                  placeholder="Enter details about owner contact, custom quotes, or schedule dates..." 
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  className="px-3.5 py-2.5 bg-slate-950 border border-slate-850 rounded-xl text-slate-100 outline-none focus:border-indigo-500 text-sm transition-all resize-none"
                />
              </div>
              <div className="flex gap-3 justify-end mt-2">
                <button 
                  type="button"
                  onClick={() => setActiveLeadNotesId(null)}
                  className="px-4 py-2.5 bg-slate-900 hover:bg-slate-855 text-slate-300 border border-slate-800 rounded-xl text-sm font-semibold transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm transition-all"
                >
                  Save Note
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
