# Architecture: MCP Protocol Implementation

## Ticket Description
Design the MCP (Model Context Protocol) client implementation for connecting to various MCP servers from the VS Code extension.

## Acceptance Criteria
- [ ] MCP protocol client fully specified
- [ ] Transport layer abstraction designed
- [ ] Server discovery mechanism defined
- [ ] Error handling and retry logic documented
- [ ] Connection pooling strategy defined

## MCP Client Architecture

### 1. Protocol Types
```typescript
interface MCPServer {
    name: string;
    version: string;
    transport: 'stdio' | 'http' | 'websocket';
    capabilities: MCPCapabilities;
}

interface MCPTool {
    name: string;
    description: string;
    inputSchema: JSONSchema;
    outputSchema?: JSONSchema;
}

interface MCPRequest {
    id: string;
    method: string;
    params?: any;
}

interface MCPResponse {
    id: string;
    result?: any;
    error?: MCPError;
}
```

### 2. Transport Abstraction
```typescript
abstract class MCPTransport {
    abstract connect(): Promise<void>;
    abstract disconnect(): Promise<void>;
    abstract send(request: MCPRequest): Promise<MCPResponse>;
    abstract on(event: string, handler: Function): void;
}

class StdioTransport extends MCPTransport {
    // Communicate via stdin/stdout with spawned process
}

class HttpTransport extends MCPTransport {
    // REST API communication
}

class WebSocketTransport extends MCPTransport {
    // WebSocket communication for real-time updates
}
```

### 3. Server Discovery
```typescript
interface ServerConfig {
    command?: string;        // For stdio servers
    args?: string[];        // Command arguments
    url?: string;           // For HTTP/WebSocket servers
    env?: Record<string, string>;
    authType?: 'none' | 'basic' | 'bearer' | 'custom';
}

class ServerDiscovery {
    // Scan for .mcp.json files
    async scanWorkspace(): Promise<ServerConfig[]>;
    
    // Load from VS Code settings
    async loadFromSettings(): Promise<ServerConfig[]>;
    
    // Import from Claude Desktop config
    async importFromClaude(): Promise<ServerConfig[]>;
}
```

### 4. Connection Management
```typescript
class MCPConnectionPool {
    private connections: Map<string, MCPClient>;
    private maxConnections: number = 10;
    
    async getConnection(serverId: string): Promise<MCPClient>;
    async releaseConnection(serverId: string): Promise<void>;
    async terminateAll(): Promise<void>;
}
```

### 5. Client Implementation
```typescript
class MCPClient {
    private transport: MCPTransport;
    private capabilities: MCPCapabilities;
    private tools: Map<string, MCPTool>;
    
    constructor(config: ServerConfig) {
        this.transport = this.createTransport(config);
    }
    
    async initialize(): Promise<void> {
        // Handshake and capability negotiation
    }
    
    async listTools(): Promise<MCPTool[]>;
    async executeTool(name: string, args: any): Promise<any>;
    async getResource(uri: string): Promise<any>;
    async listResources(): Promise<MCPResource[]>;
}
```

## File Structure
```
src/mcp/
├── types/
│   ├── protocol.ts      # MCP protocol types
│   ├── tools.ts         # Tool-specific types
│   └── resources.ts     # Resource types
├── transport/
│   ├── base.ts          # Abstract transport
│   ├── stdio.ts         # Stdio transport
│   ├── http.ts          # HTTP transport
│   └── websocket.ts     # WebSocket transport
├── client/
│   ├── client.ts        # Main MCP client
│   ├── pool.ts          # Connection pooling
│   └── discovery.ts     # Server discovery
├── handlers/
│   ├── tools.ts         # Tool execution
│   ├── resources.ts     # Resource handling
│   └── prompts.ts       # Prompt handling
└── utils/
    ├── validation.ts    # Schema validation
    └── serialization.ts # JSON-RPC serialization
```

## Error Handling
1. **Connection Errors**: Retry with exponential backoff
2. **Protocol Errors**: Log and notify user
3. **Timeout Errors**: Configurable timeout with cancellation
4. **Validation Errors**: Clear error messages with schema details
5. **Server Crashes**: Automatic restart with circuit breaker

## Security Considerations
- Validate all server responses against schemas
- Sandbox stdio process execution
- Implement request rate limiting
- Log all tool executions
- Require explicit user permission for sensitive tools