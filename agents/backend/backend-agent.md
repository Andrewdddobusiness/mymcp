# Backend Development Agent

## Role
Specialized in TypeScript/Node.js development, responsible for core extension logic, MCP protocol implementation, and server-side components.

## Expertise
- VS Code Extension API
- TypeScript advanced patterns
- Protocol implementation (JSON-RPC)
- Process management (stdio)
- State management
- Error handling and resilience

## Assigned Tickets
1. `implementation/001-extension-scaffold`
2. `implementation/003-mcp-client`
3. `architecture/003-mcp-protocol`

## Execution Plan

### Ticket: implementation/001-extension-scaffold
```bash
# Commands to execute
npm init -y
npm install -D @types/vscode @types/node typescript esbuild
npm install -D @vscode/test-electron @types/mocha mocha

# Create directory structure
mkdir -p src/{mcp,copilot,config,ui,utils,test}
mkdir -p .vscode
mkdir -p resources

# Generate files
touch src/extension.ts
touch src/types/index.ts
touch tsconfig.json
touch esbuild.js
touch .vscodeignore
```

### Ticket: implementation/003-mcp-client
```typescript
// Key implementation tasks
1. Create abstract Transport class
2. Implement StdioTransport for process communication
3. Build MCPClient with:
   - Protocol handshake
   - Tool discovery
   - Request/response handling
   - Event emitter pattern
4. Implement connection pooling
5. Add retry logic with exponential backoff
```

### Ticket: architecture/003-mcp-protocol
```typescript
// Type definitions to create
interface MCPMessage {
  jsonrpc: '2.0';
  id?: string | number;
  method?: string;
  params?: any;
  result?: any;
  error?: MCPError;
}

interface MCPCapabilities {
  tools?: boolean;
  resources?: boolean;
  prompts?: boolean;
}

interface MCPTool {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  outputSchema?: JSONSchema;
}
```

## Code Generation Strategy
1. Start with type definitions and interfaces
2. Build abstract classes and base implementations
3. Add concrete implementations
4. Include comprehensive error handling
5. Add logging and debugging support

## Integration Points
- **With Frontend Agent**: Expose API for UI components
- **With Integration Agent**: Provide client instances
- **With Testing Agent**: Create testable interfaces

## Quality Checklist
- [ ] TypeScript strict mode enabled
- [ ] All public APIs documented
- [ ] Error boundaries implemented
- [ ] Logging added for debugging
- [ ] Performance optimized
- [ ] Memory leaks prevented

## Dependencies to Track
```json
{
  "dependencies": {
    "jsonrpc-lite": "^2.2.0",
    "winston": "^3.11.0"
  },
  "devDependencies": {
    "@types/vscode": "^1.85.0",
    "@types/node": "^20.0.0",
    "typescript": "^5.3.0",
    "esbuild": "^0.19.0"
  }
}
```

## Git Branch Strategy
- Branch: `feature/backend-core`
- Commits: Atomic, one per component
- PR Strategy: Draft PR early, update continuously