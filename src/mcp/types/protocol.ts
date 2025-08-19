// MCP Protocol Types - Model Context Protocol v1.0

export interface MCPMessage {
  jsonrpc: '2.0';
  id?: string | number;
  method?: string;
  params?: any;
  result?: any;
  error?: MCPError;
}

export interface MCPRequest extends MCPMessage {
  method: string;
  params?: any;
}

export interface MCPResponse extends MCPMessage {
  id: string | number;
  result?: any;
  error?: MCPError;
}

export interface MCPNotification extends MCPMessage {
  method: string;
  params?: any;
}

export interface MCPError {
  code: number;
  message: string;
  data?: any;
}

// Standard JSON-RPC error codes
export enum MCPErrorCode {
  ParseError = -32700,
  InvalidRequest = -32600,
  MethodNotFound = -32601,
  InvalidParams = -32602,
  InternalError = -32603,
  // MCP specific error codes
  ServerError = -32000,
  TransportError = -32001,
  TimeoutError = -32002,
  AuthenticationError = -32003,
  AuthorizationError = -32004,
  ResourceNotFound = -32005,
  ResourceBusy = -32006,
  ToolExecutionError = -32007
}

export interface MCPCapabilities {
  tools?: {
    list?: boolean;
    execute?: boolean;
  };
  resources?: {
    list?: boolean;
    get?: boolean;
    watch?: boolean;
  };
  prompts?: {
    list?: boolean;
    get?: boolean;
  };
  logging?: {
    level?: 'debug' | 'info' | 'warning' | 'error';
  };
}

export interface MCPServerInfo {
  name: string;
  version: string;
  protocolVersion?: string;
  capabilities?: MCPCapabilities;
}

export interface MCPClientInfo {
  name: string;
  version: string;
  protocolVersion?: string;
  capabilities?: MCPCapabilities;
}

// Tool-related types
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  outputSchema?: JSONSchema;
}

export interface MCPToolCall {
  name: string;
  arguments?: any;
}

export interface MCPToolResult {
  type?: 'text' | 'image' | 'resource' | 'error';
  content?: string;
  text?: string;
  data?: any;
  mimeType?: string;
  annotations?: MCPAnnotation[];
}

export interface MCPAnnotation {
  type: string;
  text?: string;
  priority?: 'low' | 'medium' | 'high';
}

// Resource-related types
export interface MCPResource {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
  annotations?: MCPAnnotation[];
}

export interface MCPResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string; // base64 encoded binary data
}

export interface MCPResourceTemplate {
  uriTemplate: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

// Prompt-related types
export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: MCPPromptArgument[];
}

export interface MCPPromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

export interface MCPPromptMessage {
  role: 'user' | 'assistant' | 'system';
  content: {
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
    annotations?: MCPAnnotation[];
  };
}

export interface MCPPromptResult {
  description?: string;
  messages: MCPPromptMessage[];
}

// JSON Schema types
export interface JSONSchema {
  $schema?: string;
  $id?: string;
  title?: string;
  description?: string;
  type?: 'null' | 'boolean' | 'object' | 'array' | 'number' | 'string' | 'integer';
  enum?: any[];
  const?: any;
  multipleOf?: number;
  maximum?: number;
  exclusiveMaximum?: number;
  minimum?: number;
  exclusiveMinimum?: number;
  maxLength?: number;
  minLength?: number;
  pattern?: string;
  additionalItems?: boolean | JSONSchema;
  items?: JSONSchema | JSONSchema[];
  maxItems?: number;
  minItems?: number;
  uniqueItems?: boolean;
  contains?: JSONSchema;
  additionalProperties?: boolean | JSONSchema;
  definitions?: { [key: string]: JSONSchema };
  properties?: { [key: string]: JSONSchema };
  patternProperties?: { [key: string]: JSONSchema };
  dependencies?: { [key: string]: JSONSchema | string[] };
  propertyNames?: JSONSchema;
  if?: JSONSchema;
  then?: JSONSchema;
  else?: JSONSchema;
  allOf?: JSONSchema[];
  anyOf?: JSONSchema[];
  oneOf?: JSONSchema[];
  not?: JSONSchema;
  format?: string;
  required?: string[];
  maxProperties?: number;
  minProperties?: number;
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
  timeout?: number;
  retryCount?: number;
  headers?: Record<string, string>;
}

// Transport configuration
export interface TransportConfig extends ServerConfig {
  connectTimeout?: number;
  requestTimeout?: number;
  keepAlive?: boolean;
  maxRetries?: number;
  retryDelay?: number;
}

// Connection state
export enum ConnectionState {
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Connected = 'connected',
  Error = 'error',
  Reconnecting = 'reconnecting'
}

export interface ConnectionInfo {
  serverId: string;
  state: ConnectionState;
  lastConnected?: Date;
  lastError?: string;
  retryCount: number;
  capabilities?: MCPCapabilities;
  serverInfo?: MCPServerInfo;
}

// Method names (MCP specification)
export const MCPMethods = {
  // Initialization
  Initialize: 'initialize',
  Initialized: 'initialized',
  
  // Tool methods
  ToolsList: 'tools/list',
  ToolsExecute: 'tools/execute',
  
  // Resource methods
  ResourcesList: 'resources/list',
  ResourcesGet: 'resources/get',
  ResourcesWatch: 'resources/watch',
  ResourcesUnwatch: 'resources/unwatch',
  
  // Prompt methods
  PromptsList: 'prompts/list',
  PromptsGet: 'prompts/get',
  
  // Logging
  LoggingSetLevel: 'logging/setLevel',
  
  // Notifications
  Ping: 'ping',
  LogMessage: 'notifications/log',
  ResourceUpdated: 'notifications/resources/updated',
  ToolProgress: 'notifications/tools/progress'
} as const;

// Request/Response types for specific methods
export interface InitializeRequest {
  protocolVersion: string;
  clientInfo: MCPClientInfo;
  capabilities: MCPCapabilities;
}

export interface InitializeResponse {
  protocolVersion: string;
  serverInfo: MCPServerInfo;
  capabilities: MCPCapabilities;
}

export interface ToolsListResponse {
  tools: MCPTool[];
}

export interface ToolsExecuteRequest {
  name: string;
  arguments?: any;
}

export interface ToolsExecuteResponse {
  content: MCPToolResult[];
  isError?: boolean;
}

export interface ResourcesListResponse {
  resources: MCPResource[];
}

export interface ResourcesGetRequest {
  uri: string;
}

export interface ResourcesGetResponse {
  contents: MCPResourceContent[];
}

export interface PromptsListResponse {
  prompts: MCPPrompt[];
}

export interface PromptsGetRequest {
  name: string;
  arguments?: Record<string, string>;
}

export interface PromptsGetResponse {
  description?: string;
  messages: MCPPromptMessage[];
}

// Utility types
export type MCPMethodHandler = (request: MCPRequest) => Promise<any>;
export type MCPNotificationHandler = (notification: MCPNotification) => Promise<void>;

export interface MCPEventMap {
  'message': MCPMessage;
  'request': MCPRequest;
  'response': MCPResponse;
  'notification': MCPNotification;
  'error': MCPError;
  'connect': void;
  'disconnect': void;
  'reconnect': void;
}