# Implementation: MCP Client Core

## Ticket Description
Implement the core MCP client that handles protocol communication, server lifecycle management, and tool execution.

## Acceptance Criteria
- [ ] MCP client can connect to stdio-based servers
- [ ] Protocol handshake and initialization working
- [ ] Tool discovery and execution implemented
- [ ] Error handling and reconnection logic in place
- [ ] Connection pooling implemented

## Implementation Details

### 1. MCP Client Base (src/mcp/client/mcpClient.ts)
```typescript
import { ChildProcess, spawn } from 'child_process';
import { EventEmitter } from 'events';
import { Transport } from '../transport/base';
import { StdioTransport } from '../transport/stdio';
import { HttpTransport } from '../transport/http';
import { MCPTool, ServerConfig, MCPCapabilities } from '../types';

export class MCPClient extends EventEmitter {
  private transport: Transport;
  private initialized = false;
  private capabilities: MCPCapabilities;
  private tools = new Map<string, MCPTool>();
  private requestId = 0;
  
  constructor(
    public readonly serverId: string,
    private config: ServerConfig
  ) {
    super();
    this.transport = this.createTransport();
  }
  
  private createTransport(): Transport {
    switch (this.config.transport) {
      case 'stdio':
        return new StdioTransport(this.config);
      case 'http':
        return new HttpTransport(this.config);
      default:
        throw new Error(`Unsupported transport: ${this.config.transport}`);
    }
  }
  
  async connect(): Promise<void> {
    await this.transport.connect();
    
    // Set up event handlers
    this.transport.on('message', this.handleMessage.bind(this));
    this.transport.on('error', this.handleError.bind(this));
    this.transport.on('close', this.handleClose.bind(this));
    
    // Initialize protocol
    await this.initialize();
  }
  
  private async initialize(): Promise<void> {
    const response = await this.sendRequest('initialize', {
      protocolVersion: '1.0',
      clientInfo: {
        name: 'copilot-mcp-bridge',
        version: '0.0.1'
      },
      capabilities: {
        tools: true,
        resources: true,
        prompts: true
      }
    });
    
    this.capabilities = response.capabilities;
    this.initialized = true;
    
    // Discover available tools
    if (this.capabilities.tools) {
      await this.discoverTools();
    }
  }
  
  private async discoverTools(): Promise<void> {
    const response = await this.sendRequest('tools/list');
    this.tools.clear();
    
    for (const tool of response.tools) {
      this.tools.set(tool.name, tool);
    }
    
    this.emit('tools-updated', Array.from(this.tools.values()));
  }
  
  async executeTool(name: string, args: any): Promise<any> {
    if (!this.tools.has(name)) {
      throw new Error(`Tool '${name}' not found`);
    }
    
    const response = await this.sendRequest('tools/execute', {
      name,
      arguments: args
    });
    
    if (response.error) {
      throw new Error(response.error.message);
    }
    
    return response.result;
  }
  
  private async sendRequest(method: string, params?: any): Promise<any> {
    const id = `${++this.requestId}`;
    const request = { jsonrpc: '2.0', id, method, params };
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Request timeout: ${method}`));
      }, 30000);
      
      const handler = (response: any) => {
        if (response.id === id) {
          clearTimeout(timeout);
          this.transport.off('message', handler);
          
          if (response.error) {
            reject(new Error(response.error.message));
          } else {
            resolve(response.result);
          }
        }
      };
      
      this.transport.on('message', handler);
      this.transport.send(request);
    });
  }
  
  async disconnect(): Promise<void> {
    if (this.transport) {
      await this.transport.disconnect();
    }
  }
}
```

### 2. Stdio Transport (src/mcp/transport/stdio.ts)
```typescript
import { ChildProcess, spawn } from 'child_process';
import { Transport } from './base';
import * as readline from 'readline';

export class StdioTransport extends Transport {
  private process?: ChildProcess;
  private rl?: readline.Interface;
  
  async connect(): Promise<void> {
    const { command, args = [], env = {} } = this.config;
    
    this.process = spawn(command, args, {
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    this.rl = readline.createInterface({
      input: this.process.stdout!,
      crlfDelay: Infinity
    });
    
    // Handle incoming messages
    this.rl.on('line', (line) => {
      try {
        const message = JSON.parse(line);
        this.emit('message', message);
      } catch (error) {
        this.emit('error', new Error(`Invalid JSON: ${line}`));
      }
    });
    
    // Handle errors
    this.process.stderr!.on('data', (data) => {
      this.emit('error', new Error(`Server error: ${data.toString()}`));
    });
    
    this.process.on('error', (error) => {
      this.emit('error', error);
    });
    
    this.process.on('close', (code) => {
      this.emit('close', code);
    });
  }
  
  async send(message: any): Promise<void> {
    if (!this.process || !this.process.stdin) {
      throw new Error('Transport not connected');
    }
    
    const json = JSON.stringify(message) + '\n';
    this.process.stdin.write(json);
  }
  
  async disconnect(): Promise<void> {
    if (this.rl) {
      this.rl.close();
    }
    
    if (this.process) {
      this.process.kill();
      // Wait for process to exit
      await new Promise(resolve => {
        this.process!.once('close', resolve);
        setTimeout(resolve, 1000); // Timeout after 1s
      });
    }
  }
}
```

### 3. Connection Pool (src/mcp/client/connectionPool.ts)
```typescript
export class MCPConnectionPool {
  private connections = new Map<string, MCPClient>();
  private connecting = new Map<string, Promise<MCPClient>>();
  
  constructor(
    private maxConnections = 10,
    private connectionTimeout = 30000
  ) {}
  
  async getConnection(serverId: string, config: ServerConfig): Promise<MCPClient> {
    // Check if already connected
    const existing = this.connections.get(serverId);
    if (existing) {
      return existing;
    }
    
    // Check if connection in progress
    const connecting = this.connecting.get(serverId);
    if (connecting) {
      return connecting;
    }
    
    // Create new connection
    const connectionPromise = this.createConnection(serverId, config);
    this.connecting.set(serverId, connectionPromise);
    
    try {
      const client = await connectionPromise;
      this.connections.set(serverId, client);
      this.connecting.delete(serverId);
      
      // Enforce connection limit
      await this.enforceLimit();
      
      return client;
    } catch (error) {
      this.connecting.delete(serverId);
      throw error;
    }
  }
  
  private async createConnection(
    serverId: string,
    config: ServerConfig
  ): Promise<MCPClient> {
    const client = new MCPClient(serverId, config);
    
    // Set up auto-reconnect
    client.on('close', () => {
      this.connections.delete(serverId);
      // Optionally implement auto-reconnect logic here
    });
    
    // Connect with timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Connection timeout')), this.connectionTimeout);
    });
    
    await Promise.race([client.connect(), timeoutPromise]);
    
    return client;
  }
  
  private async enforceLimit(): Promise<void> {
    if (this.connections.size > this.maxConnections) {
      // Find least recently used connection
      const lru = Array.from(this.connections.entries())
        .sort(([, a], [, b]) => a.lastUsed - b.lastUsed)[0];
      
      if (lru) {
        await this.disconnect(lru[0]);
      }
    }
  }
  
  async disconnect(serverId: string): Promise<void> {
    const client = this.connections.get(serverId);
    if (client) {
      await client.disconnect();
      this.connections.delete(serverId);
    }
  }
  
  async disconnectAll(): Promise<void> {
    const promises = Array.from(this.connections.values())
      .map(client => client.disconnect());
    
    await Promise.all(promises);
    this.connections.clear();
  }
}
```

### 4. Server Manager (src/mcp/manager.ts)
```typescript
import * as vscode from 'vscode';
import { MCPConnectionPool } from './client/connectionPool';
import { ServerDiscovery } from './discovery/serverDiscovery';
import { MCPTool, ServerConfig } from './types';

export class MCPManager {
  private pool = new MCPConnectionPool();
  private discovery = new ServerDiscovery();
  private servers = new Map<string, ServerConfig>();
  
  constructor(private context: vscode.ExtensionContext) {}
  
  async initialize(): Promise<void> {
    // Load server configurations
    await this.loadServers();
    
    // Watch for configuration changes
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('copilot-mcp.servers')) {
        this.loadServers();
      }
    });
  }
  
  private async loadServers(): Promise<void> {
    // Load from settings
    const fromSettings = await this.discovery.loadFromSettings();
    
    // Load from workspace
    const fromWorkspace = await this.discovery.scanWorkspace();
    
    // Merge configurations
    this.servers.clear();
    [...fromSettings, ...fromWorkspace].forEach(config => {
      this.servers.set(config.id, config);
    });
  }
  
  async listTools(): Promise<Array<{serverId: string, tool: MCPTool}>> {
    const allTools: Array<{serverId: string, tool: MCPTool}> = [];
    
    for (const [serverId, config] of this.servers) {
      try {
        const client = await this.pool.getConnection(serverId, config);
        const tools = await client.listTools();
        
        tools.forEach(tool => {
          allTools.push({ serverId, tool });
        });
      } catch (error) {
        console.error(`Failed to list tools for ${serverId}:`, error);
      }
    }
    
    return allTools;
  }
  
  async findTool(toolName: string): Promise<{serverId: string, tool: MCPTool} | null> {
    const allTools = await this.listTools();
    return allTools.find(({tool}) => tool.name === toolName) || null;
  }
  
  async executeTool(serverId: string, toolName: string, args: any): Promise<any> {
    const config = this.servers.get(serverId);
    if (!config) {
      throw new Error(`Server '${serverId}' not found`);
    }
    
    const client = await this.pool.getConnection(serverId, config);
    return client.executeTool(toolName, args);
  }
  
  async dispose(): Promise<void> {
    await this.pool.disconnectAll();
  }
}
```

## File Structure
```
src/mcp/
├── client/
│   ├── mcpClient.ts      # Core MCP client
│   ├── connectionPool.ts # Connection pooling
│   └── reconnect.ts      # Reconnection logic
├── transport/
│   ├── base.ts          # Transport interface
│   ├── stdio.ts         # Stdio transport
│   └── http.ts          # HTTP transport
├── discovery/
│   └── serverDiscovery.ts # Server discovery
├── manager.ts           # High-level manager
└── types.ts            # Type definitions
```