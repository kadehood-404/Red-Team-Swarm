import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Shield, 
  Terminal, 
  Search, 
  AlertTriangle, 
  FileText, 
  Play, 
  RefreshCw, 
  ChevronRight, 
  Cpu, 
  UserCheck,
  Zap,
  CheckCircle2,
  XCircle,
  Upload,
  FileJson,
  FileSpreadsheet,
  Activity,
  Box,
  Layers
} from 'lucide-react';

interface ToolResult {
  tool: string;
  output: string;
  timestamp: string;
}

interface Vulnerability {
  id: string;
  title: string;
  severity: "Low" | "Medium" | "High" | "Critical";
  summary: string;
  description: string;
  platformsAffected: string;
  browsersVerified?: string[];
  stepsToReproduce: string[];
  supportingMaterial?: string[];
  remediation: string;
}

interface AgentState {
  target: string;
  scope: string[];
  guidelines: string;
  logs: string[];
  scanResults: ToolResult[];
  vulnerabilities: Vulnerability[];
  nextStep: string;
  missionComplete: boolean;
  requiresHumanAuth: boolean;
  wafDetected?: boolean;
  toolConfig?: {
    nmapIntensity: number;
    ffufWordlist: string;
    stealthMode?: boolean;
    delayRange?: [number, number];
    rotateUserAgents?: boolean;
    proxies?: string[];
  };
}

const INITIAL_STATE: AgentState = {
  target: '',
  scope: [],
  guidelines: '',
  logs: [],
  scanResults: [],
  vulnerabilities: [],
  nextStep: 'START',
  missionComplete: false,
  requiresHumanAuth: false,
  wafDetected: false,
  toolConfig: {
    nmapIntensity: 3,
    ffufWordlist: 'common.txt'
  }
};

interface Mission {
  id: string;
  target: string;
  date: string;
  vulns: number;
  status: 'Complete' | 'Failed' | 'In Progress';
}

const MOCK_HISTORY: Mission[] = [
  { id: 'MSN-882', target: 'internal-api.prod.net', date: '2026-03-20', vulns: 3, status: 'Complete' },
  { id: 'MSN-881', target: 'staging.auth-service.io', date: '2026-03-18', vulns: 1, status: 'Complete' },
  { id: 'MSN-880', target: '10.0.4.122', date: '2026-03-15', vulns: 0, status: 'Failed' },
];

export default function App() {
  const [view, setView] = useState<'landing' | 'dashboard'>('landing');
  const [state, setState] = useState<AgentState>(INITIAL_STATE);
  const [targetInput, setTargetInput] = useState('');
  const [guidelinesInput, setGuidelinesInput] = useState('');
  const [scope, setScope] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<'logs' | 'results' | 'report'>('logs');
  const [history, setHistory] = useState<Mission[]>(MOCK_HISTORY);
  const logEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.logs]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (file.name.endsWith('.json')) {
        try {
          const json = JSON.parse(content);
          const targets = Array.isArray(json) ? json : json.targets || [];
          setScope(targets);
        } catch (err) {
          console.error('Failed to parse JSON scope');
        }
      } else if (file.name.endsWith('.csv')) {
        const lines = content.split('\n').map(l => l.trim()).filter(l => l);
        setScope(lines);
      }
    };
    reader.readAsText(file);
  };

  const runStep = async (currentState: AgentState) => {
    try {
      const response = await fetch('/api/swarm/step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: currentState }),
      });
      const updatedState = await response.json();
      setState(updatedState);
      return updatedState;
    } catch (error) {
      console.error('Swarm step failed:', error);
      setIsRunning(false);
      return null;
    }
  };

  const startSwarm = async (initialState?: AgentState) => {
    if (!targetInput && !initialState) return;
    
    setIsRunning(true);
    let currentState = initialState || { 
      ...INITIAL_STATE, 
      target: targetInput, 
      scope,
      guidelines: guidelinesInput,
      logs: [`[Scout] Mission initialized for target: ${targetInput}`] 
    };
    setState(currentState);

    // Use a local variable to track running state within the loop to avoid closure issues
    let currentlyRunning = true;

    while (!currentState.missionComplete && currentlyRunning) {
      const next = await runStep(currentState);
      if (!next) {
        currentlyRunning = false;
        break;
      }
      currentState = next;
      
      if (currentState.requiresHumanAuth) {
        currentlyRunning = false;
        setIsRunning(false);
        break;
      }
      
      await new Promise(r => setTimeout(r, 1500));
    }
    if (currentState.missionComplete) {
      setIsRunning(false);
      setHistory(prev => [{
        id: `MSN-${Math.floor(Math.random() * 900) + 100}`,
        target: currentState.target,
        date: new Date().toISOString().split('T')[0],
        vulns: currentState.vulnerabilities.length,
        status: 'Complete'
      }, ...prev]);
    }
  };

  const handleAuthorize = async () => {
    try {
      const response = await fetch('/api/swarm/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state }),
      });
      const updatedState = await response.json();
      setState(updatedState);
      // Resume the swarm
      startSwarm(updatedState);
    } catch (error) {
      console.error('Authorization failed:', error);
    }
  };

  const resetSwarm = () => {
    setState(INITIAL_STATE);
    setTargetInput('');
    setGuidelinesInput('');
    setScope([]);
    setIsRunning(false);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'Critical': return 'text-red-500 bg-red-500/10 border-red-500/20';
      case 'High': return 'text-orange-500 bg-orange-500/10 border-orange-500/20';
      case 'Medium': return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
      default: return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
    }
  };

  if (view === 'landing') {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col overflow-hidden">
        {/* Editorial Landing Page */}
        <nav className="p-8 flex justify-between items-center z-10">
          <div className="flex items-center gap-2">
            <Shield className="text-[#00FF00] w-6 h-6" />
            <span className="font-serif italic font-bold text-xl tracking-tight">RED TEAM SWARM</span>
          </div>
          <button 
            onClick={() => setView('dashboard')}
            className="text-xs uppercase tracking-widest border border-white/20 px-6 py-2 rounded-full hover:bg-white hover:text-black transition-all"
          >
            Access Dashboard
          </button>
        </nav>

        <main className="flex-1 flex flex-col justify-center px-8 relative">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full opacity-20 pointer-events-none">
             <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-[#00FF00]/20 via-transparent to-transparent blur-3xl" />
          </div>

          <motion.div 
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="z-10"
          >
            <h1 className="text-[18vw] leading-[0.82] font-serif italic font-black tracking-tighter uppercase mb-8">
              SWARM<br/>INTELLIGENCE
            </h1>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-12 max-w-6xl">
              <div className="space-y-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[#00FF00] font-mono">01 / Autonomous</p>
                <p className="text-lg text-white/60 leading-relaxed">
                  A multi-agent offensive security system that thinks, scans, and exploits in parallel.
                </p>
              </div>
              <div className="space-y-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[#00FF00] font-mono">02 / Real-Time</p>
                <p className="text-lg text-white/60 leading-relaxed">
                  Live mission logs and intelligence gathering from the edge of the network.
                </p>
              </div>
              <div className="space-y-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[#00FF00] font-mono">03 / Human-in-the-loop</p>
                <p className="text-lg text-white/60 leading-relaxed">
                  Advanced safety gates for active payload execution and critical triage.
                </p>
              </div>
            </div>

            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setView('dashboard')}
              className="mt-16 bg-[#00FF00] text-black px-12 py-6 rounded-full font-bold text-xl uppercase tracking-widest hover:bg-[#00CC00] transition-all flex items-center gap-4"
            >
              Initialize Mission <ChevronRight className="w-6 h-6" />
            </motion.button>
          </motion.div>
        </main>

        <footer className="p-8 flex justify-between items-center text-[10px] uppercase tracking-widest text-white/40 border-t border-white/10">
          <span>© 2026 Ghostwriter Intelligence Systems</span>
          <div className="flex gap-8">
            <span>Encrypted Connection</span>
            <span>v2.4.0-stable</span>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-[#E4E3E0] font-sans selection:bg-[#00FF00] selection:text-black flex flex-col">
      {/* Header */}
      <header className="border-b border-[#141414] p-6 flex justify-between items-center bg-[#0A0A0A] z-20">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView('landing')}>
          <div className="w-10 h-10 bg-[#00FF00] rounded-sm flex items-center justify-center">
            <Shield className="text-black w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight uppercase italic font-serif">Red Team Swarm</h1>
            <p className="text-[10px] uppercase tracking-widest text-[#8E9299] font-mono">Autonomous Offensive Intelligence</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1 bg-[#141414] rounded-full border border-[#222]">
            <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-[#00FF00] animate-pulse' : 'bg-red-500'}`} />
            <span className="text-[10px] font-mono uppercase tracking-wider">
              {isRunning ? 'Swarm Active' : 'Idle'}
            </span>
          </div>
          <button 
            onClick={() => setView('landing')}
            className="text-[10px] uppercase tracking-widest text-[#8E9299] hover:text-white transition-colors"
          >
            Exit Dashboard
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar: Mission History */}
        <aside className="w-64 border-r border-[#141414] bg-[#0A0A0A] hidden xl:flex flex-col">
          <div className="p-6 border-b border-[#141414]">
            <h2 className="text-[10px] uppercase tracking-widest text-[#8E9299] font-mono mb-4">Mission History</h2>
            <div className="space-y-2">
              {history.map((mission) => (
                <button 
                  key={mission.id}
                  className="w-full text-left p-3 rounded-sm border border-[#141414] hover:border-[#222] hover:bg-[#141414] transition-all group"
                  onClick={() => {
                    setTargetInput(mission.target);
                    resetSwarm();
                  }}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] font-mono text-[#00FF00]">{mission.id}</span>
                    <span className="text-[9px] text-[#8E9299]">{mission.date}</span>
                  </div>
                  <p className="text-xs font-bold truncate mb-1">{mission.target}</p>
                  <div className="flex items-center gap-2">
                    <span className={`text-[8px] uppercase px-1 rounded-sm ${mission.status === 'Complete' ? 'bg-[#00FF00]/10 text-[#00FF00]' : 'bg-red-500/10 text-red-500'}`}>
                      {mission.status}
                    </span>
                    <span className="text-[8px] text-[#8E9299]">{mission.vulns} Vulns</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="p-6 flex-1 flex flex-col justify-end">
             <div className="p-4 bg-[#141414] rounded-sm border border-[#222] space-y-2">
                <p className="text-[10px] uppercase text-[#8E9299]">System Load</p>
                <div className="h-1 bg-[#050505] rounded-full overflow-hidden">
                  <motion.div 
                    animate={{ width: isRunning ? '85%' : '12%' }}
                    className="h-full bg-[#00FF00]"
                  />
                </div>
                <p className="text-[9px] text-[#8E9299] font-mono">CPU: {isRunning ? '85%' : '12%'} | RAM: 4.2GB</p>
             </div>
            {/* Toolbox Section */}
            <div className="mt-8 pt-8 border-t border-[#141414]">
              <div className="flex items-center gap-2 mb-4 px-2">
                <Box className="w-4 h-4 text-[#00FF00]" />
                <h3 className="text-[10px] uppercase tracking-widest font-bold text-[#8E9299]">Kali Toolbox</h3>
              </div>
              <div className="grid grid-cols-2 gap-2 px-2">
                {[
                  { name: 'nmap', status: 'Active' },
                  { name: 'ffuf', status: 'Active' },
                  { name: 'subfinder', status: 'Active' },
                  { name: 'nuclei', status: 'Active' },
                  { name: 'sqlmap', status: 'Active' },
                  { name: 'hydra', status: 'Ready' },
                  { name: 'metasploit', status: 'Ready' },
                  { name: 'wireshark', status: 'Ready' },
                ].map((tool) => (
                  <div key={tool.name} className="bg-[#0A0A0A] border border-[#141414] p-2 rounded-sm group hover:border-[#00FF00]/30 transition-colors">
                    <div className="text-[9px] font-mono text-[#8E9299] group-hover:text-white transition-colors">{tool.name}</div>
                    <div className="flex items-center gap-1 mt-1">
                      <div className={`w-1 h-1 rounded-full ${tool.status === 'Active' ? 'bg-[#00FF00] animate-pulse' : 'bg-[#333]'}`} />
                      <span className="text-[8px] uppercase tracking-tighter text-[#444]">{tool.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>

        <main className="flex-1 p-6 overflow-y-auto">
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Controls & State */}
            <div className="lg:col-span-4 space-y-6">
              {/* Target Input */}
              <section className="bg-[#0A0A0A] border border-[#141414] p-6 rounded-sm">
                <h2 className="text-xs uppercase tracking-widest text-[#8E9299] font-mono mb-4">Mission Parameters</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] uppercase mb-2 text-[#8E9299]">Target Scope (.csv / .json)</label>
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full bg-[#141414] border border-dashed border-[#222] rounded-sm py-4 flex flex-col items-center justify-center cursor-pointer hover:border-[#00FF00] transition-colors group"
                    >
                      <input 
                        type="file" 
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        accept=".csv,.json"
                        className="hidden"
                      />
                      {scope && scope.length > 0 ? (
                        <div className="flex items-center gap-2 text-[#00FF00]">
                          <CheckCircle2 className="w-4 h-4" />
                          <span className="text-xs font-mono">{scope.length} targets loaded</span>
                        </div>
                      ) : (
                        <>
                          <Upload className="w-5 h-5 text-[#8E9299] group-hover:text-[#00FF00] mb-2" />
                          <span className="text-[10px] uppercase text-[#8E9299]">Click to upload scope</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase mb-2 text-[#8E9299]">Primary Target</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E9299]" />
                      <input 
                        type="text" 
                        placeholder="e.g. 192.168.1.1 or example.com"
                        className="w-full bg-[#141414] border border-[#222] rounded-sm py-3 pl-10 pr-4 text-sm focus:outline-none focus:border-[#00FF00] transition-colors font-mono"
                        value={targetInput}
                        onChange={(e) => setTargetInput(e.target.value)}
                        disabled={isRunning}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase mb-2 text-[#8E9299]">Program Guidelines</label>
                    <textarea 
                      placeholder="Paste rules of engagement, out-of-scope assets, or specific instructions here..."
                      className="w-full bg-[#141414] border border-[#222] rounded-sm p-3 text-xs focus:outline-none focus:border-[#00FF00] transition-colors font-mono h-32 resize-none"
                      value={guidelinesInput}
                      onChange={(e) => setGuidelinesInput(e.target.value)}
                      disabled={isRunning}
                    />
                  </div>

                  <div className="flex gap-2">
                    <button 
                      onClick={() => startSwarm()}
                      disabled={isRunning || !targetInput}
                      className="flex-1 bg-[#00FF00] text-black font-bold py-3 rounded-sm flex items-center justify-center gap-2 hover:bg-[#00CC00] transition-colors disabled:opacity-50 disabled:cursor-not-allowed uppercase text-xs"
                    >
                      {isRunning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                      {isRunning ? 'Engaging...' : 'Engage Swarm'}
                    </button>
                    <button 
                      onClick={resetSwarm}
                      className="px-4 border border-[#222] hover:bg-[#141414] transition-colors rounded-sm"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </section>

              {/* Agent Status */}
              <section className="bg-[#0A0A0A] border border-[#141414] p-6 rounded-sm">
                <h2 className="text-xs uppercase tracking-widest text-[#8E9299] font-mono mb-4">Agent Status</h2>
                <div className="space-y-3">
                  {[
                    { name: 'Scout', role: 'Architect', icon: Cpu, active: isRunning && state.nextStep === 'START' },
                    { name: 'Breacher', role: 'Operator', icon: Zap, active: isRunning && state.nextStep?.startsWith('RUN_') },
                    { name: 'Analyst', role: 'Inquisitor', icon: UserCheck, active: isRunning && state.logs && state.logs.length > 0 && state.logs[state.logs.length-1]?.includes('[Analyst]') },
                    { name: 'Ghostwriter', role: 'Reporter', icon: FileText, active: isRunning && state.nextStep === 'REPORT' },
                  ].map((agent) => (
                    <div key={agent.name} className={`flex items-center justify-between p-3 rounded-sm border ${agent.active ? 'border-[#00FF00] bg-[#00FF00]/5' : 'border-[#141414] bg-[#050505]'}`}>
                      <div className="flex items-center gap-3">
                        <agent.icon className={`w-4 h-4 ${agent.active ? 'text-[#00FF00]' : 'text-[#8E9299]'}`} />
                        <div>
                          <p className="text-xs font-bold">{agent.name}</p>
                          <p className="text-[10px] text-[#8E9299] uppercase">{agent.role}</p>
                        </div>
                      </div>
                      {agent.active && <div className="w-1.5 h-1.5 rounded-full bg-[#00FF00] animate-pulse" />}
                    </div>
                  ))}
                </div>
              </section>

              {/* Vulnerability Summary */}
              <section className="bg-[#0A0A0A] border border-[#141414] p-6 rounded-sm">
                <h2 className="text-xs uppercase tracking-widest text-[#8E9299] font-mono mb-4">Intelligence Gathered</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-[#141414] rounded-sm border border-[#222]">
                    <p className="text-[10px] uppercase text-[#8E9299] mb-1">Vulns Found</p>
                    <p className="text-2xl font-bold font-mono">{state.vulnerabilities?.length || 0}</p>
                  </div>
                  <div className="p-4 bg-[#141414] rounded-sm border border-[#222]">
                    <p className="text-[10px] uppercase text-[#8E9299] mb-1">Tools Run</p>
                    <p className="text-2xl font-bold font-mono">{state.scanResults?.length || 0}</p>
                  </div>
                </div>
              </section>
            </div>

            {/* Right Column: Main View */}
            <div className="lg:col-span-8 flex flex-col h-[calc(100vh-180px)]">
              {/* Tabs */}
              <div className="flex border-b border-[#141414] mb-6">
                {[
                  { id: 'logs', label: 'Mission Logs', icon: Terminal },
                  { id: 'results', label: 'Raw Intel', icon: Zap },
                  { id: 'report', label: 'Final Report', icon: FileText },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center gap-2 px-6 py-3 text-xs uppercase tracking-widest font-mono transition-all border-b-2 ${activeTab === tab.id ? 'border-[#00FF00] text-[#00FF00]' : 'border-transparent text-[#8E9299] hover:text-[#E4E3E0]'}`}
                  >
                    <tab.icon className="w-3 h-3" />
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Content Area */}
              <div className="flex-1 bg-[#0A0A0A] border border-[#141414] rounded-sm overflow-hidden flex flex-col">
                {activeTab === 'logs' && (
                  <div className="flex-1 overflow-y-auto p-6 font-mono text-sm space-y-2">
                    <AnimatePresence initial={false}>
                      {state.logs && state.logs.map((log, i) => (
                        <motion.div 
                          key={i}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="flex gap-3"
                        >
                          <span className="text-[#8E9299] shrink-0">[{new Date().toLocaleTimeString()}]</span>
                          <span className={log.includes('[Analyst]') ? 'text-yellow-500' : log.includes('[Breacher]') ? 'text-blue-400' : log.includes('[Ghostwriter]') ? 'text-[#00FF00]' : 'text-[#E4E3E0]'}>
                            {log}
                          </span>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                    <div ref={logEndRef} />
                  </div>
                )}

                {activeTab === 'results' && (
                  <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {!state.scanResults || state.scanResults.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-[#8E9299]">
                        <Zap className="w-12 h-12 mb-4 opacity-20" />
                        <p className="text-xs uppercase tracking-widest">No data captured yet</p>
                      </div>
                    ) : (
                      state.scanResults.map((result, i) => (
                        <div key={i} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <h3 className="text-xs font-bold uppercase tracking-widest text-[#00FF00]">{result.tool} Output</h3>
                            <span className="text-[10px] text-[#8E9299] font-mono">{result.timestamp}</span>
                          </div>
                          <pre className="p-4 bg-[#050505] border border-[#141414] rounded-sm text-xs font-mono text-[#8E9299] overflow-x-auto">
                            {result.output}
                          </pre>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {activeTab === 'report' && (
                  <div className="flex-1 overflow-y-auto p-8 space-y-8">
                    {!state.missionComplete ? (
                      <div className="h-full flex flex-col items-center justify-center text-[#8E9299]">
                        <FileText className="w-12 h-12 mb-4 opacity-20" />
                        <p className="text-xs uppercase tracking-widest">Report generating...</p>
                      </div>
                    ) : (
                      <div className="max-w-2xl mx-auto space-y-8">
                        <header className="border-b border-[#141414] pb-6">
                          <h2 className="text-3xl font-serif italic mb-2">Security Assessment Report</h2>
                          <p className="text-xs text-[#8E9299] uppercase tracking-widest">Target: {state.target} | Date: {new Date().toLocaleDateString()}</p>
                        </header>

                        <section className="space-y-4">
                          <h3 className="text-xs uppercase tracking-widest text-[#00FF00] font-mono">Executive Summary</h3>
                          <p className="text-sm leading-relaxed text-[#8E9299]">
                            "We found a hole in their fence. It's embarrassing, really. The target infrastructure exhibits fundamental configuration failures that would allow an entry-level adversary to compromise sensitive data within minutes."
                          </p>
                        </section>

                        <section className="space-y-4">
                          <h3 className="text-xs uppercase tracking-widest text-[#00FF00] font-mono">Confirmed Vulnerabilities</h3>
                          <div className="space-y-8">
                            {state.vulnerabilities && state.vulnerabilities.map((vuln) => (
                              <div key={vuln.id} className="p-8 bg-[#141414] border border-[#222] rounded-sm space-y-6">
                                <div className="flex items-center justify-between border-b border-[#222] pb-4">
                                  <h4 className="text-xl font-bold font-serif italic">{vuln.title}</h4>
                                  <span className={`text-[10px] px-2 py-0.5 rounded-full border uppercase font-mono ${getSeverityColor(vuln.severity)}`}>
                                    {vuln.severity}
                                  </span>
                                </div>

                                <div className="space-y-6 text-sm">
                                  <div>
                                    <p className="text-[#E4E3E0]"><strong className="text-[#00FF00]">Summary:</strong> {vuln.summary}</p>
                                  </div>

                                  <div>
                                    <p className="text-[#E4E3E0]"><strong className="text-[#00FF00]">Description:</strong> {vuln.description}</p>
                                  </div>

                                  <div>
                                    <p className="text-[#E4E3E0]"><strong className="text-[#00FF00]">Platform(s) Affected:</strong> {vuln.platformsAffected}</p>
                                  </div>

                                  {vuln.browsersVerified && vuln.browsersVerified.length > 0 && (
                                    <div className="space-y-2">
                                      <h5 className="text-sm font-bold text-[#00FF00]">## Browsers Verified In [If Applicable]:</h5>
                                      <ul className="list-disc list-inside space-y-1 text-[#8E9299]">
                                        {vuln.browsersVerified.map((browser, idx) => (
                                          <li key={idx}>{browser}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}

                                  <div className="space-y-2">
                                    <h5 className="text-sm font-bold text-[#00FF00]">## Steps To Reproduce:</h5>
                                    <p className="text-xs text-[#8E9299] italic">(Add details for how we can reproduce the issue)</p>
                                    <ol className="list-decimal list-inside space-y-1 text-[#8E9299]">
                                      {vuln.stepsToReproduce.map((step, idx) => (
                                        <li key={idx}>{step}</li>
                                      ))}
                                    </ol>
                                  </div>

                                  {vuln.supportingMaterial && vuln.supportingMaterial.length > 0 && (
                                    <div className="space-y-2">
                                      <h5 className="text-sm font-bold text-[#00FF00]">## Supporting Material/References:</h5>
                                      <ul className="list-disc list-inside space-y-1 text-[#8E9299]">
                                        {vuln.supportingMaterial.map((material, idx) => (
                                          <li key={idx}>{material}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}

                                  <div className="pt-4 border-t border-[#222]">
                                    <p className="text-[10px] uppercase text-[#00FF00] mb-1 font-mono">Remediation</p>
                                    <p className="text-xs italic text-[#8E9299]">{vuln.remediation}</p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </section>

                        <section className="space-y-4">
                          <h3 className="text-xs uppercase tracking-widest text-[#00FF00] font-mono">Technical Breakdown</h3>
                          <table className="w-full text-left text-xs">
                            <thead className="text-[#8E9299] border-b border-[#141414]">
                              <tr>
                                <th className="py-2 font-mono uppercase">Tool</th>
                                <th className="py-2 font-mono uppercase">Status</th>
                                <th className="py-2 font-mono uppercase">Findings</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#141414]">
                              {state.scanResults && state.scanResults.map((res, i) => (
                                <tr key={i}>
                                  <td className="py-3 font-mono">{res.tool}</td>
                                  <td className="py-3"><CheckCircle2 className="w-3 h-3 text-[#00FF00]" /></td>
                                  <td className="py-3 text-[#8E9299]">{res.output?.split('\n').length || 0} lines captured</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </section>

                        <footer className="pt-8 border-t border-[#141414] text-center">
                          <p className="text-[10px] uppercase tracking-widest text-[#8E9299]">End of Intelligence Report</p>
                        </footer>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* HITL Gate Overlay */}
      <AnimatePresence>
        {state.requiresHumanAuth && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-[#0A0A0A] border border-yellow-500/50 p-8 rounded-sm max-w-md w-full shadow-2xl shadow-yellow-500/10"
            >
              <div className="flex items-center gap-3 mb-6">
                <AlertTriangle className="text-yellow-500 w-8 h-8" />
                <h2 className="text-xl font-bold uppercase italic font-serif">Authorization Required</h2>
              </div>
              <p className="text-sm text-[#8E9299] mb-8 leading-relaxed">
                The Breacher agent is requesting permission to execute an active exploit payload. This action may be disruptive to the target environment.
              </p>
              <div className="flex gap-4">
                <button 
                  onClick={handleAuthorize}
                  className="flex-1 bg-yellow-500 text-black font-bold py-3 rounded-sm uppercase text-xs hover:bg-yellow-400 transition-colors"
                >
                  Authorize Action
                </button>
                <button 
                  onClick={resetSwarm}
                  className="flex-1 border border-[#222] text-[#8E9299] font-bold py-3 rounded-sm uppercase text-xs hover:bg-[#141414] transition-colors"
                >
                  Abort
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
