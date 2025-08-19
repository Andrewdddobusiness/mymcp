// Core extension types
export interface ExtensionContext {
  subscriptions: { dispose(): any }[];
  secrets: {
    get(key: string): Promise<string | undefined>;
    store(key: string, value: string): Promise<void>;
  };
  globalState: {
    get<T>(key: string): T | undefined;
    update(key: string, value: any): Promise<void>;
  };
  extensionPath: string;
  extensionUri: any;
}

// MCP Protocol types
export interface MCPMessage {
  jsonrpc: '2.0';
  id?: string | number;
  method?: string;
  params?: any;
  result?: any;
  error?: MCPError;
}

export interface MCPError {
  code: number;
  message: string;
  data?: any;
}

export interface MCPRequest extends MCPMessage {
  method: string;
  params?: any;
}

export interface MCPResponse extends MCPMessage {
  result?: any;
  error?: MCPError;
}

export interface MCPCapabilities {
  tools?: boolean;
  resources?: boolean;
  prompts?: boolean;
}

export interface MCPServerInfo {
  name: string;
  version: string;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  outputSchema?: JSONSchema;
}

export interface MCPResource {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

export interface JSONSchema {
  type: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  description?: string;
}

// Server configuration types
export interface ServerConfig {
  id: string;
  name: string;
  transport: 'stdio' | 'http' | 'websocket';
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  authType?: 'none' | 'basic' | 'bearer' | 'custom';
  enabled?: boolean;
}

// Chat integration types
export interface ParsedCommand {
  type: 'list-tools' | 'execute-tool' | 'list-servers' | 'general';
  tool?: string;
  args?: any;
  rawQuery: string;
}

export interface ToolExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  duration?: number;
}

// UI types
export interface WebviewMessage {
  command: string;
  payload?: any;
}

export interface ServerListItem {
  id: string;
  name: string;
  transport: string;
  status: 'connected' | 'disconnected' | 'error' | 'connecting';
  lastConnected?: Date;
  toolCount?: number;
}

// Event types
export interface MCPEvent {
  type: 'server-connected' | 'server-disconnected' | 'tools-updated' | 'error';
  serverId: string;
  data?: any;
  timestamp: Date;
}

// Logger types
export interface Logger {
  info(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  error(message: string, meta?: any): void;
  debug(message: string, meta?: any): void;
}

// Configuration types
export interface ExtensionConfig {
  servers: ServerConfig[];
  enableTelemetry: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  connectionTimeout: number;
  maxRetries: number;
}

// Transport types
export interface TransportConfig extends ServerConfig {
  timeout?: number;
  retryCount?: number;
  headers?: Record<string, string>;
}

export interface ConnectionPool {
  getConnection(serverId: string): Promise<MCPClient>;
  releaseConnection(serverId: string): Promise<void>;
  size(): number;
  clear(): Promise<void>;
}

// Forward declarations for circular dependencies
export interface MCPClient {
  readonly serverId: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  listTools(): Promise<MCPTool[]>;
  executeTool(name: string, args: any): Promise<any>;
  listResources(): Promise<MCPResource[]>;
  getResource(uri: string): Promise<any>;
  on(event: string, handler: Function): void;
  off(event: string, handler: Function): void;
}

export interface Transport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(message: MCPMessage): Promise<void>;
  on(event: string, handler: Function): void;
  off(event: string, handler: Function): void;
}