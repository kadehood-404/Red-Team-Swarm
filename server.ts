import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

// Types for our Agent State
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
  wafDetected: boolean;
  toolConfig: {
    nmapIntensity: number;
    ffufWordlist: string;
    stealthMode?: boolean;
    delayRange?: [number, number];
    rotateUserAgents?: boolean;
    proxies?: string[];
  };
  pendingAction?: {
    agent: string;
    action: string;
    params: any;
  };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Mock Tool Execution (since we can't run real nmap/ffuf in sandbox)
  const mockTools = {
    nmap: (target: string, intensity: number) => {
      const ports = intensity > 5 ? "80, 443, 445, 8080, 3306" : "80, 443, 445";
      const wafHeader = Math.random() > 0.5 ? "X-WAF-Signature: Cloudflare-Ray-ID\nServer: cloudflare" : "Server: Apache/2.4.41 (Ubuntu)";
      return `Starting Nmap 7.92 at 2026-03-23 16:05
Nmap scan report for ${target} (Intensity: ${intensity})
Host is up (0.0021s latency).
PORT    STATE SERVICE
80/tcp  open  http
443/tcp open  https
445/tcp open  microsoft-ds
${intensity > 5 ? "8080/tcp open  http-proxy\n3306/tcp open  mysql" : ""}

[HTTP-HEADERS]
${wafHeader}

Nmap done: 1 IP address (1 host up) scanned in ${intensity * 0.1} seconds`;
    },
    ffuf: (target: string, wordlist: string, stealth: boolean = false) => {
      if (!stealth && Math.random() > 0.7) {
        return `[ERROR] 403 Forbidden - WAF Blocked Request
[INFO] Too many requests detected by Cloudflare.
[INFO] X-WAF-Event: BLOCK_ID_9928
[INFO] Scan aborted.`;
      }
      
      const stealthInfo = stealth ? 
        `[INFO] Stealth Mode Active: Delay 200-500ms | User-Agent Rotation: ON | Proxy: 45.12.33.102` : 
        `[INFO] Aggressive Mode: No Delay | User-Agent: ffuf/1.5.0`;

      return `[INFO] Starting ffuf v1.5.0
[INFO] Target: ${target}
[INFO] Wordlist: ${wordlist}
[INFO] Method: GET
${stealthInfo}

/admin                  [Status: 200, Size: 1245]
/login                  [Status: 200, Size: 3452]
/.env                   [Status: 200, Size: 452]

[INFO] Scan finished.`;
    },
    subfinder: (target: string) => {
      return `[INF] Enumerating subdomains for ${target}
[INF] Found 12 subdomains
api.${target}
stage.${target}
dev.${target}
auth.${target}
internal.${target}
[INF] Enumeration complete.`;
    },
    nuclei: (target: string) => {
      return `[CVE-2021-44228] [critical] [log4j] ${target}:8080
[git-config] [medium] [http] ${target}/.git/config
[exposed-env] [high] [http] ${target}/.env`;
    },
    sqlmap: (target: string) => {
      return `[INFO] testing if the target URL is union-based injectable
[INFO] target URL is vulnerable to union-based injection
[INFO] fetching database names
[*] information_schema
[*] production_db
[*] users_db`;
    },
    hydra: (target: string) => {
      return `Hydra v9.2 (c) 2021 by van Hauser/THC - Please do not use in military or secret service organizations, or for illegal purposes.
[DATA] attacking ssh://192.168.1.1:22/
[22][ssh] host: 192.168.1.1   login: admin   password: password123
[1 of 1 target completed, 1 valid password found]`;
    },
    enum4linux: (target: string) => {
      return `Starting enum4linux v0.8.9
Target: ${target}
[+] Anonymous access allowed on Public share.
[+] enum4linux finished.`;
    }
  };

  // Agent Swarm Logic Endpoint
  app.post("/api/swarm/step", async (req, res) => {
    const state: AgentState = req.body.state;
    
    if (!state) {
      return res.status(400).json({ error: "State is required" });
    }

    // Deep-ish copy to avoid mutation issues
    let updatedState: AgentState = { 
      ...state,
      logs: [...(state.logs || [])],
      scanResults: [...(state.scanResults || [])],
      vulnerabilities: [...(state.vulnerabilities || [])],
      toolConfig: state.toolConfig ? { ...state.toolConfig } : { nmapIntensity: 3, ffufWordlist: "common.txt" }
    };

    if (state.missionComplete || state.requiresHumanAuth) {
      return res.json(state);
    }

    // 1. Architect (Planner) Logic
    if (!state.nextStep || state.nextStep === "START") {
      updatedState.logs.push("[Scout] Target identified. Architect selecting initial reconnaissance strategy.");
      if (state.scope.length > 0) {
        updatedState.logs.push(`[Scout] Scope loaded: ${state.scope.length} targets identified.`);
      }
      updatedState.nextStep = "RUN_SUBFINDER";
    } else if (state.nextStep === "RUN_SUBFINDER") {
      updatedState.logs.push("[Scout] Running subfinder for subdomain enumeration...");
      const output = mockTools.subfinder(state.target);
      updatedState.scanResults.push({ tool: "subfinder", output, timestamp: new Date().toISOString() });
      updatedState.nextStep = "RUN_NMAP";
    } else if (state.nextStep === "RUN_NMAP") {
      updatedState.logs.push(`[Breacher] Running Nmap (Intensity: ${state.toolConfig.nmapIntensity})...`);
      const output = mockTools.nmap(state.target, state.toolConfig.nmapIntensity);
      updatedState.scanResults.push({ tool: "nmap", output, timestamp: new Date().toISOString() });
      
      // Inquisitor Logic: Check for WAF or interesting ports
      if (output.includes("80/tcp  open")) {
        updatedState.logs.push("[Analyst] Web service detected. Probing for WAF presence.");
        
        // Advanced WAF Detection Logic
        const hasWafHeaders = output.includes("X-WAF-Signature") || output.includes("cloudflare");
        const suspectWaf = hasWafHeaders || Math.random() > 0.6;

        if (suspectWaf) {
          updatedState.wafDetected = true;
          updatedState.logs.push("[Analyst] WAF DETECTED: Cloudflare/ModSecurity signature identified via HTTP headers.");
          updatedState.logs.push("[Scout] Architect instructing Breacher to switch to 'Stealth' scanning profile.");
          
          // Configure Stealth Profile
          updatedState.toolConfig = {
            ...updatedState.toolConfig,
            stealthMode: true,
            delayRange: [200, 500],
            rotateUserAgents: true,
            proxies: ["45.12.33.102", "103.44.12.5", "192.168.44.11"],
            ffufWordlist: "stealth_wordlist.txt"
          };
          
          updatedState.logs.push("[Scout] Stealth Profile Configured: Randomized Delays (200-500ms), UA Rotation, and Proxy Obfuscation active.");
        }
        updatedState.nextStep = "RUN_NUCLEI";
      } else if (output.includes("445/tcp open")) {
        updatedState.nextStep = "RUN_ENUM4LINUX";
      } else {
        updatedState.nextStep = "REPORT";
      }
    } else if (state.nextStep === "RUN_NUCLEI") {
      updatedState.logs.push("[Breacher] Running nuclei for vulnerability scanning...");
      const output = mockTools.nuclei(state.target);
      updatedState.scanResults.push({ tool: "nuclei", output, timestamp: new Date().toISOString() });
      
      if (output.includes("[critical]")) {
        updatedState.logs.push("[Analyst] CRITICAL VULNERABILITY: Nuclei detected a critical Log4j vulnerability.");
        updatedState.vulnerabilities.push({
          id: "VULN-002",
          title: "Log4j RCE (CVE-2021-44228)",
          severity: "Critical",
          summary: "Remote Code Execution vulnerability in Log4j.",
          description: "The target is vulnerable to Log4j RCE, allowing an attacker to execute arbitrary code on the server.",
          platformsAffected: "Java-based applications",
          stepsToReproduce: ["Send a malicious JNDI lookup string in a header."],
          remediation: "Update Log4j to the latest version."
        });
      }
      updatedState.nextStep = "RUN_FFUF";
    } else if (state.nextStep === "RUN_FFUF") {
      const isStealth = updatedState.toolConfig.stealthMode || false;
      updatedState.logs.push(`[Breacher] Running FFUF with wordlist: ${state.toolConfig.ffufWordlist}${isStealth ? " (STEALTH MODE)" : ""}...`);
      
      const output = mockTools.ffuf(state.target, state.toolConfig.ffufWordlist, isStealth);
      updatedState.scanResults.push({ tool: "ffuf", output, timestamp: new Date().toISOString() });
      
      if (output.includes("WAF Blocked")) {
        updatedState.logs.push("[Analyst] SCAN FAILED: WAF blocked our aggressive probe.");
        updatedState.logs.push("[Scout] Architect retrying with ultra-stealth parameters.");
        updatedState.toolConfig.ffufWordlist = "ultra_stealth_v2.txt";
        updatedState.toolConfig.stealthMode = true;
        updatedState.toolConfig.delayRange = [500, 1000];
      } else {
        if (output.includes("/.env")) {
          updatedState.logs.push("[Analyst] CRITICAL VULNERABILITY: Exposed .env file detected.");
          updatedState.vulnerabilities.push({
            id: "VULN-001",
            title: "Exposed Environment Configuration",
            severity: "Critical",
            summary: "Exposed .env file containing sensitive credentials.",
            description: "The application exposes a .env file containing sensitive credentials like database passwords and API keys.",
            platformsAffected: "Website",
            stepsToReproduce: ["Navigate to /.env"],
            remediation: "Restrict access to dotfiles."
          });
        }
        updatedState.nextStep = "RUN_SQLMAP";
      }
    } else if (state.nextStep === "RUN_SQLMAP") {
      updatedState.logs.push("[Breacher] Running sqlmap to test for SQL injection...");
      const output = mockTools.sqlmap(state.target);
      updatedState.scanResults.push({ tool: "sqlmap", output, timestamp: new Date().toISOString() });
      
      if (output.includes("vulnerable to union-based injection")) {
        updatedState.logs.push("[Analyst] HIGH VULNERABILITY: SQL Injection detected.");
        updatedState.vulnerabilities.push({
          id: "VULN-003",
          title: "SQL Injection (Union-based)",
          severity: "High",
          summary: "Union-based SQL injection vulnerability.",
          description: "The application is vulnerable to SQL injection, allowing an attacker to extract data from the database.",
          platformsAffected: "Database",
          stepsToReproduce: ["Inject SQL payload into the search parameter."],
          remediation: "Use prepared statements and parameterized queries."
        });
      }
      updatedState.nextStep = "REPORT";
    } else if (state.nextStep === "RUN_ENUM4LINUX") {
      updatedState.logs.push("[Breacher] Running enum4linux...");
      const output = mockTools.enum4linux(state.target);
      updatedState.scanResults.push({ tool: "enum4linux", output, timestamp: new Date().toISOString() });
      updatedState.nextStep = "REPORT";
    } else if (state.nextStep === "REPORT") {
      updatedState.logs.push("[Ghostwriter] Mission complete. Report finalized.");
      updatedState.missionComplete = true;
    }

    res.json(updatedState);
  });

  // Authorization Endpoint
  app.post("/api/swarm/authorize", (req, res) => {
    const state: AgentState = req.body.state;
    let updatedState = { ...state };
    updatedState.requiresHumanAuth = false;
    updatedState.logs.push("[Human] Authorization granted. Resuming operations.");
    res.json(updatedState);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
