# Testing: Unit Test Suite

## Ticket Description
Implement comprehensive unit tests for all core components of the Copilot-MCP bridge extension.

## Acceptance Criteria
- [ ] Test coverage > 80% for core components
- [ ] All critical paths have unit tests
- [ ] Mock implementations for VS Code APIs
- [ ] Mock implementations for MCP servers
- [ ] CI/CD integration ready

## Test Implementation

### 1. Test Setup (src/test/setup.ts)
```typescript
import * as vscode from 'vscode';
import { beforeEach, afterEach } from 'mocha';
import * as sinon from 'sinon';

export class TestContext {
  public sandbox: sinon.SinonSandbox;
  public vscodeMock: any;
  
  constructor() {
    this.sandbox = sinon.createSandbox();
    this.setupVSCodeMocks();
  }
  
  private setupVSCodeMocks() {
    this.vscodeMock = {
      ExtensionContext: {
        subscriptions: [],
        secrets: {
          get: this.sandbox.stub(),
          store: this.sandbox.stub()
        },
        globalState: {
          get: this.sandbox.stub(),
          update: this.sandbox.stub()
        }
      },
      workspace: {
        getConfiguration: this.sandbox.stub().returns({
          get: this.sandbox.stub(),
          update: this.sandbox.stub()
        })
      },
      window: {
        showInformationMessage: this.sandbox.stub(),
        showErrorMessage: this.sandbox.stub(),
        createWebviewPanel: this.sandbox.stub()
      },
      chat: {
        createChatParticipant: this.sandbox.stub(),
        registerChatVariableResolver: this.sandbox.stub()
      }
    };
  }
  
  cleanup() {
    this.sandbox.restore();
  }
}
```

### 2. MCP Client Tests (src/test/mcp/client.test.ts)
```typescript
import { expect } from 'chai';
import { MCPClient } from '../../mcp/client/mcpClient';
import { MockTransport } from '../mocks/mockTransport';

describe('MCPClient', () => {
  let client: MCPClient;
  let transport: MockTransport;
  
  beforeEach(() => {
    transport = new MockTransport();
    client = new MCPClient('test-server', {
      id: 'test-server',
      name: 'Test Server',
      transport: 'mock',
      command: 'test'
    });
    
    // Inject mock transport
    (client as any).transport = transport;
  });
  
  describe('connect', () => {
    it('should initialize protocol on connect', async () => {
      transport.setResponse('initialize', {
        capabilities: {
          tools: true,
          resources: true
        }
      });
      
      await client.connect();
      
      expect(transport.sentMessages).to.have.lengthOf(1);
      expect(transport.sentMessages[0]).to.deep.include({
        method: 'initialize',
        params: {
          protocolVersion: '1.0'
        }
      });
    });
    
    it('should discover tools after initialization', async () => {
      transport.setResponse('initialize', {
        capabilities: { tools: true }
      });
      
      transport.setResponse('tools/list', {
        tools: [
          {
            name: 'test-tool',
            description: 'A test tool',
            inputSchema: { type: 'object' }
          }
        ]
      });
      
      await client.connect();
      
      const tools = await client.listTools();
      expect(tools).to.have.lengthOf(1);
      expect(tools[0].name).to.equal('test-tool');
    });
  });
  
  describe('executeTool', () => {
    beforeEach(async () => {
      transport.setResponse('initialize', {
        capabilities: { tools: true }
      });
      transport.setResponse('tools/list', {
        tools: [{
          name: 'echo',
          description: 'Echo input',
          inputSchema: { type: 'object' }
        }]
      });
      await client.connect();
    });
    
    it('should execute tool and return result', async () => {
      transport.setResponse('tools/execute', {
        result: { message: 'Hello, world!' }
      });
      
      const result = await client.executeTool('echo', { text: 'Hello, world!' });
      
      expect(result).to.deep.equal({ message: 'Hello, world!' });
    });
    
    it('should throw error for unknown tool', async () => {
      await expect(client.executeTool('unknown', {}))
        .to.be.rejectedWith("Tool 'unknown' not found");
    });
  });
});
```

### 3. Chat Participant Tests (src/test/copilot/chatParticipant.test.ts)
```typescript
import { expect } from 'chai';
import { MCPChatParticipant } from '../../copilot/chatParticipant';
import { MockMCPManager } from '../mocks/mockMCPManager';
import { TestContext } from '../setup';

describe('MCPChatParticipant', () => {
  let participant: MCPChatParticipant;
  let mcpManager: MockMCPManager;
  let context: TestContext;
  
  beforeEach(() => {
    context = new TestContext();
    mcpManager = new MockMCPManager();
    participant = new MCPChatParticipant(
      context.vscodeMock.ExtensionContext,
      mcpManager as any
    );
  });
  
  afterEach(() => {
    context.cleanup();
  });
  
  describe('handleChatRequest', () => {
    it('should list available tools', async () => {
      mcpManager.setTools([
        {
          serverId: 'test-server',
          tool: {
            name: 'test-tool',
            description: 'Test tool'
          }
        }
      ]);
      
      const stream = new MockChatStream();
      await participant.handleChatRequest(
        { prompt: 'list tools' },
        {},
        stream,
        new MockCancellationToken()
      );
      
      expect(stream.messages).to.include('## Available MCP Tools');
      expect(stream.messages).to.include('test-tool');
    });
    
    it('should execute tool with arguments', async () => {
      mcpManager.setToolResult('echo', { message: 'Hello!' });
      
      const stream = new MockChatStream();
      await participant.handleChatRequest(
        { prompt: 'run echo with text="Hello!"' },
        {},
        stream,
        new MockCancellationToken()
      );
      
      expect(stream.messages).to.include('Hello!');
    });
  });
});
```

### 4. Mock Implementations (src/test/mocks/)
```typescript
// mockTransport.ts
export class MockTransport extends EventEmitter {
  public sentMessages: any[] = [];
  private responses = new Map<string, any>();
  
  async connect(): Promise<void> {
    // No-op
  }
  
  async send(message: any): Promise<void> {
    this.sentMessages.push(message);
    
    // Simulate async response
    setTimeout(() => {
      const response = this.responses.get(message.method);
      if (response) {
        this.emit('message', {
          id: message.id,
          result: response
        });
      }
    }, 10);
  }
  
  setResponse(method: string, response: any) {
    this.responses.set(method, response);
  }
  
  async disconnect(): Promise<void> {
    // No-op
  }
}

// mockMCPManager.ts
export class MockMCPManager {
  private tools: any[] = [];
  private toolResults = new Map<string, any>();
  
  setTools(tools: any[]) {
    this.tools = tools;
  }
  
  setToolResult(toolName: string, result: any) {
    this.toolResults.set(toolName, result);
  }
  
  async listTools() {
    return this.tools;
  }
  
  async findTool(toolName: string) {
    return this.tools.find(t => t.tool.name === toolName);
  }
  
  async executeTool(serverId: string, toolName: string, args: any) {
    return this.toolResults.get(toolName) || {};
  }
}
```

### 5. Integration Tests (src/test/integration/e2e.test.ts)
```typescript
import * as vscode from 'vscode';
import { expect } from 'chai';
import * as path from 'path';

describe('Extension Integration Tests', () => {
  let extension: vscode.Extension<any>;
  
  before(async () => {
    // Activate extension
    extension = vscode.extensions.getExtension('copilot-mcp-bridge');
    await extension?.activate();
  });
  
  it('should register chat participant', async () => {
    // Verify chat participant is registered
    const participants = await vscode.commands.executeCommand('vscode.chat.list');
    expect(participants).to.include('mcp-bridge');
  });
  
  it('should register configuration commands', async () => {
    const commands = await vscode.commands.getCommands();
    expect(commands).to.include('copilot-mcp.configure');
  });
  
  it('should handle MCP server connection', async () => {
    // Add test server configuration
    const config = vscode.workspace.getConfiguration('copilot-mcp');
    await config.update('servers', [{
      id: 'test-echo',
      name: 'Echo Server',
      transport: 'stdio',
      command: 'node',
      args: [path.join(__dirname, 'fixtures', 'echo-server.js')]
    }]);
    
    // Test tool execution
    const result = await vscode.commands.executeCommand(
      'copilot-mcp.executeTool',
      'echo',
      { message: 'test' }
    );
    
    expect(result).to.deep.equal({ echo: 'test' });
  });
});
```

## Test Configuration

### package.json test scripts
```json
{
  "scripts": {
    "test": "npm run test:unit && npm run test:integration",
    "test:unit": "mocha 'src/test/**/*.test.ts' --require ts-node/register",
    "test:integration": "node ./out/test/runTest.js",
    "test:coverage": "nyc npm run test:unit"
  }
}
```

### .mocharc.json
```json
{
  "require": ["ts-node/register", "source-map-support/register"],
  "extensions": ["ts"],
  "spec": ["src/test/**/*.test.ts"],
  "timeout": 10000,
  "reporter": "spec"
}
```

## File Structure
```
src/test/
├── setup.ts              # Test setup utilities
├── mocks/               # Mock implementations
│   ├── mockTransport.ts
│   ├── mockMCPManager.ts
│   └── mockVSCode.ts
├── unit/                # Unit tests
│   ├── mcp/
│   │   ├── client.test.ts
│   │   └── transport.test.ts
│   └── copilot/
│       └── chatParticipant.test.ts
├── integration/         # Integration tests
│   ├── e2e.test.ts
│   └── fixtures/       # Test fixtures
└── runTest.ts          # Test runner
```