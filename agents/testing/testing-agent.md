# Testing Agent

## Role
Specialized in creating comprehensive test suites, mocks, and ensuring code quality across the entire extension.

## Expertise
- Unit testing with Mocha/Chai
- Integration testing for VS Code extensions
- Mock implementation strategies
- Test coverage analysis
- Performance testing
- E2E testing automation

## Assigned Tickets
1. `testing/001-unit-testing`
2. Mock implementations for all external dependencies
3. Integration test suite
4. Performance benchmarks

## Execution Plan

### Test Infrastructure Setup
```bash
# Install testing dependencies
npm install -D mocha chai sinon @types/mocha @types/chai @types/sinon
npm install -D nyc source-map-support
npm install -D @vscode/test-electron

# Create test structure
mkdir -p src/test/{unit,integration,e2e,mocks,fixtures}
touch src/test/setup.ts
touch src/test/runTest.ts
touch .mocharc.json
touch .nycrc.json
```

### Mock Implementations

#### 1. VS Code API Mocks
```typescript
// src/test/mocks/vscode.ts
export function createVSCodeMock() {
  return {
    workspace: {
      getConfiguration: sinon.stub().returns({
        get: sinon.stub(),
        update: sinon.stub()
      }),
      onDidChangeConfiguration: sinon.stub()
    },
    window: {
      showInformationMessage: sinon.stub(),
      showErrorMessage: sinon.stub(),
      createStatusBarItem: sinon.stub().returns({
        show: sinon.stub(),
        hide: sinon.stub(),
        dispose: sinon.stub()
      })
    },
    chat: {
      createChatParticipant: sinon.stub(),
      registerChatVariableResolver: sinon.stub()
    },
    ExtensionContext: {
      subscriptions: [],
      extensionPath: '/test/path',
      globalState: createMockMemento(),
      secrets: createMockSecretStorage()
    }
  };
}
```

#### 2. MCP Server Mocks
```typescript
// src/test/mocks/mcpServer.ts
export class MockMCPServer {
  private tools = new Map<string, MCPTool>();
  private handlers = new Map<string, Function>();
  
  constructor() {
    this.setupDefaultHandlers();
  }
  
  addTool(tool: MCPTool) {
    this.tools.set(tool.name, tool);
  }
  
  handle(message: MCPMessage): MCPResponse {
    const handler = this.handlers.get(message.method);
    if (handler) {
      return handler(message);
    }
    return { error: { code: -32601, message: 'Method not found' } };
  }
  
  private setupDefaultHandlers() {
    this.handlers.set('initialize', () => ({
      result: {
        capabilities: { tools: true, resources: true },
        serverInfo: { name: 'mock-server', version: '1.0.0' }
      }
    }));
    
    this.handlers.set('tools/list', () => ({
      result: { tools: Array.from(this.tools.values()) }
    }));
  }
}
```

### Test Suites

#### 1. Unit Tests Structure
```typescript
// src/test/unit/mcp/client.test.ts
describe('MCPClient', () => {
  let client: MCPClient;
  let mockTransport: MockTransport;
  
  beforeEach(() => {
    mockTransport = new MockTransport();
    client = new MCPClient('test', { transport: mockTransport });
  });
  
  describe('initialization', () => {
    it('should perform handshake on connect', async () => {
      // Test implementation
    });
    
    it('should discover tools after init', async () => {
      // Test implementation
    });
  });
  
  describe('tool execution', () => {
    it('should execute tool with valid args', async () => {
      // Test implementation
    });
    
    it('should handle tool execution errors', async () => {
      // Test implementation
    });
  });
});
```

#### 2. Integration Tests
```typescript
// src/test/integration/extension.test.ts
describe('Extension Integration', () => {
  let extension: vscode.Extension<any>;
  
  before(async () => {
    const ext = vscode.extensions.getExtension('copilot-mcp-bridge');
    extension = await ext.activate();
  });
  
  it('should register all commands', async () => {
    const commands = await vscode.commands.getCommands();
    expect(commands).to.include('copilot-mcp.configure');
    expect(commands).to.include('copilot-mcp.showStatus');
  });
  
  it('should handle MCP server lifecycle', async () => {
    // Add server, connect, execute tool, disconnect
  });
});
```

#### 3. E2E Tests
```typescript
// src/test/e2e/scenarios.test.ts
describe('E2E Scenarios', () => {
  it('should complete full workflow', async () => {
    // 1. Open configuration UI
    await vscode.commands.executeCommand('copilot-mcp.configure');
    
    // 2. Add test server
    await addTestServer({
      name: 'Test Echo Server',
      command: 'node',
      args: ['test/fixtures/echo-server.js']
    });
    
    // 3. Use in Copilot chat
    const result = await simulateChatMessage('@mcp run echo "test"');
    expect(result).to.include('test');
    
    // 4. Verify in UI
    const servers = await getConfiguredServers();
    expect(servers).to.have.lengthOf(1);
  });
});
```

### Test Fixtures

#### Echo Server Fixture
```javascript
// src/test/fixtures/echo-server.js
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.on('line', (line) => {
  const message = JSON.parse(line);
  
  if (message.method === 'initialize') {
    respond(message.id, {
      capabilities: { tools: true },
      serverInfo: { name: 'echo-server', version: '1.0.0' }
    });
  } else if (message.method === 'tools/list') {
    respond(message.id, {
      tools: [{
        name: 'echo',
        description: 'Echoes input',
        inputSchema: { type: 'object' }
      }]
    });
  } else if (message.method === 'tools/execute') {
    respond(message.id, {
      result: { echo: message.params.arguments }
    });
  }
});

function respond(id, result) {
  console.log(JSON.stringify({ jsonrpc: '2.0', id, result }));
}
```

### Coverage Configuration
```json
// .nycrc.json
{
  "extends": "@istanbuljs/nyc-config-typescript",
  "include": ["src/**/*.ts"],
  "exclude": ["src/test/**/*"],
  "reporter": ["text", "html", "lcov"],
  "all": true,
  "check-coverage": true,
  "lines": 80,
  "functions": 80,
  "branches": 80
}
```

### Performance Testing
```typescript
// src/test/performance/benchmarks.ts
describe('Performance Benchmarks', () => {
  it('should handle 100 concurrent tool executions', async () => {
    const start = Date.now();
    const promises = Array(100).fill(0).map((_, i) => 
      mcpClient.executeTool('echo', { n: i })
    );
    
    await Promise.all(promises);
    const duration = Date.now() - start;
    
    expect(duration).to.be.below(5000); // 5 seconds max
  });
  
  it('should maintain low memory footprint', async () => {
    const baseline = process.memoryUsage().heapUsed;
    
    // Perform operations
    for (let i = 0; i < 1000; i++) {
      await mcpClient.executeTool('echo', { data: 'x'.repeat(1000) });
    }
    
    const final = process.memoryUsage().heapUsed;
    const increase = final - baseline;
    
    expect(increase).to.be.below(50 * 1024 * 1024); // 50MB max
  });
});
```

## Git Branch Strategy
- Branch: `feature/testing-infrastructure`
- Commits: Test suite per commit
- PR Strategy: Include coverage reports