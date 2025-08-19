import { EventEmitter } from 'events';
import { Transport } from '../transport/base';
import { StdioTransport } from '../transport/stdio';
import { HttpTransport } from '../transport/http';
import { WebSocketTransport } from '../transport/websocket';
import {
  MCPMessage,
  MCPRequest,
  MCPResponse,
  MCPCapabilities,
  MCPServerInfo,
  MCPTool,
  MCPResource,
  ServerConfig,
  ConnectionState,
  MCPMethods,
  InitializeRequest,
  InitializeResponse,
  ToolsListResponse,
  ToolsExecuteRequest,
  ToolsExecuteResponse,
  ResourcesListResponse,
  ResourcesGetRequest,
  ResourcesGetResponse,
  MCPErrorCode
} from '../types/protocol';

export class MCPClient extends EventEmitter {
  private transport: Transport;
  private initialized = false;
  private capabilities: MCPCapabilities = {};
  private serverInfo?: MCPServerInfo;
  private tools = new Map<string, MCPTool>();
  private resources = new Map<string, MCPResource>();
  private requestId = 0;
  private initializationPromise?: Promise<void>;

  constructor(
    public readonly serverId: string,
    private config: ServerConfig
  ) {
    super();
    this.transport = this.createTransport();
    this.setupTransportEvents();
  }

  private createTransport(): Transport {
    switch (this.config.transport) {
      case 'stdio':
        return new StdioTransport(this.config);
      case 'http':
        return new HttpTransport(this.config);
      case 'websocket':
        return new WebSocketTransport(this.config);
      default:
        throw new Error(`Unsupported transport: ${this.config.transport}`);
    }
  }

  private setupTransportEvents(): void {
    this.transport.on('connect', () => {
      this.emit('connect');
    });

    this.transport.on('disconnect', () => {
      this.initialized = false;
      this.capabilities = {};
      this.serverInfo = undefined;
      this.tools.clear();
      this.resources.clear();
      this.emit('disconnect');
    });

    this.transport.on('error', (error) => {
      this.emit('error', error);
    });

    this.transport.on('message', (message: MCPMessage) => {
      this.handleMessage(message);
    });

    this.transport.on('notification', (notification: MCPMessage) => {
      this.handleNotification(notification);
    });

    this.transport.on('stateChanged', (state) => {
      this.emit('stateChanged', state);
    });
  }

  async connect(): Promise<void> {
    if (this.transport.isConnected && this.initialized) {
      return;
    }

    // Connect transport
    await this.transport.connect();

    // Initialize MCP protocol
    if (!this.initializationPromise) {
      this.initializationPromise = this.initialize();
    }

    await this.initializationPromise;
  }

  private async initialize(): Promise<void> {
    const request: InitializeRequest = {
      protocolVersion: '1.0',
      clientInfo: {
        name: 'copilot-mcp-bridge',
        version: '0.1.0'
      },
      capabilities: {
        tools: { list: true, execute: true },
        resources: { list: true, get: true },
        prompts: { list: true, get: true }
      }
    };

    const response = await this.sendRequest<InitializeResponse>(MCPMethods.Initialize, request);

    this.capabilities = response.capabilities;
    this.serverInfo = response.serverInfo;
    this.initialized = true;

    // Send initialized notification
    await this.sendNotification(MCPMethods.Initialized);

    // Discover available tools and resources
    await this.discoverCapabilities();

    this.emit('initialized', {
      serverInfo: this.serverInfo,
      capabilities: this.capabilities
    });
  }

  private async discoverCapabilities(): Promise<void> {
    const promises: Promise<void>[] = [];

    // Discover tools
    if (this.capabilities.tools?.list) {
      promises.push(this.discoverTools());
    }

    // Discover resources
    if (this.capabilities.resources?.list) {
      promises.push(this.discoverResources());
    }

    await Promise.all(promises);
  }

  private async discoverTools(): Promise<void> {
    try {
      const response = await this.sendRequest<ToolsListResponse>(MCPMethods.ToolsList);
      
      this.tools.clear();
      for (const tool of response.tools) {
        this.tools.set(tool.name, tool);
      }

      this.emit('toolsUpdated', Array.from(this.tools.values()));
    } catch (error) {
      this.emit('error', new Error(`Failed to discover tools: ${error.message}`));
    }
  }

  private async discoverResources(): Promise<void> {
    try {
      const response = await this.sendRequest<ResourcesListResponse>(MCPMethods.ResourcesList);
      
      this.resources.clear();
      for (const resource of response.resources) {
        this.resources.set(resource.uri, resource);
      }

      this.emit('resourcesUpdated', Array.from(this.resources.values()));
    } catch (error) {
      this.emit('error', new Error(`Failed to discover resources: ${error.message}`));
    }
  }

  async disconnect(): Promise<void> {
    this.initializationPromise = undefined;
    await this.transport.disconnect();
  }

  get isConnected(): boolean {
    return this.transport.isConnected && this.initialized;
  }

  get connectionState(): ConnectionState {
    return this.transport.connectionState;
  }

  get serverCapabilities(): MCPCapabilities {
    return { ...this.capabilities };
  }

  get serverInformation(): MCPServerInfo | undefined {
    return this.serverInfo ? { ...this.serverInfo } : undefined;
  }

  // Tool methods
  async listTools(): Promise<MCPTool[]> {
    if (!this.capabilities.tools?.list) {
      throw new Error('Server does not support tool listing');
    }

    // Return cached tools if available
    if (this.tools.size > 0) {
      return Array.from(this.tools.values());
    }

    // Fetch fresh tool list
    await this.discoverTools();
    return Array.from(this.tools.values());
  }

  async executeTool(name: string, args?: any): Promise<any> {
    if (!this.capabilities.tools?.execute) {
      throw new Error('Server does not support tool execution');
    }

    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool '${name}' not found`);
    }

    const request: ToolsExecuteRequest = {
      name,
      arguments: args
    };

    const response = await this.sendRequest<ToolsExecuteResponse>(MCPMethods.ToolsExecute, request);

    if (response.isError) {
      throw new Error(`Tool execution failed: ${JSON.stringify(response.content)}`);
    }

    return response.content;
  }

  // Resource methods
  async listResources(): Promise<MCPResource[]> {
    if (!this.capabilities.resources?.list) {
      throw new Error('Server does not support resource listing');
    }

    // Return cached resources if available
    if (this.resources.size > 0) {
      return Array.from(this.resources.values());
    }

    // Fetch fresh resource list
    await this.discoverResources();
    return Array.from(this.resources.values());
  }

  async getResource(uri: string): Promise<any> {
    if (!this.capabilities.resources?.get) {
      throw new Error('Server does not support resource retrieval');
    }

    const request: ResourcesGetRequest = { uri };
    const response = await this.sendRequest<ResourcesGetResponse>(MCPMethods.ResourcesGet, request);

    return response.contents;
  }

  // Low-level messaging
  private async sendRequest<T = any>(method: string, params?: any): Promise<T> {
    if (!this.transport.isConnected) {
      throw new Error('Transport not connected');
    }

    const id = this.generateRequestId();
    const request: MCPRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    const response = await this.transport.sendRequest(request);

    if (response.error) {
      throw new Error(`${response.error.message} (${response.error.code})`);
    }

    return response.result;
  }

  private async sendNotification(method: string, params?: any): Promise<void> {
    if (!this.transport.isConnected) {
      throw new Error('Transport not connected');
    }

    const notification: MCPMessage = {
      jsonrpc: '2.0',
      method,
      params
    };

    await this.transport.send(notification);
  }

  private generateRequestId(): string {
    return `${this.serverId}-${++this.requestId}`;
  }

  private handleMessage(message: MCPMessage): void {
    // Transport handles request/response correlation
    // We just need to handle any additional message types here
    this.emit('message', message);
  }

  private handleNotification(notification: MCPMessage): void {
    switch (notification.method) {
      case MCPMethods.LogMessage:
        this.emit('log', notification.params);
        break;
      case MCPMethods.ResourceUpdated:
        // Refresh resource cache
        this.discoverResources().catch(error => {
          this.emit('error', new Error(`Failed to refresh resources: ${error.message}`));
        });
        break;
      case MCPMethods.ToolProgress:
        this.emit('toolProgress', notification.params);
        break;
      default:
        this.emit('notification', notification);
    }
  }

  // Health check
  async ping(): Promise<boolean> {
    try {
      await this.sendRequest(MCPMethods.Ping);
      return true;
    } catch (error) {
      return false;
    }
  }

  // Get detailed status
  getStatus(): {
    serverId: string;
    connected: boolean;
    initialized: boolean;
    serverInfo?: MCPServerInfo;
    capabilities: MCPCapabilities;
    toolCount: number;
    resourceCount: number;
    transport: string;
  } {
    return {
      serverId: this.serverId,
      connected: this.transport.isConnected,
      initialized: this.initialized,
      serverInfo: this.serverInfo,
      capabilities: this.capabilities,
      toolCount: this.tools.size,
      resourceCount: this.resources.size,
      transport: this.config.transport
    };
  }

  // Refresh capabilities
  async refresh(): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Client not connected');
    }

    await this.discoverCapabilities();
  }

  dispose(): void {
    this.disconnect().catch(() => {
      // Ignore errors during disposal
    });
    
    this.transport.dispose();
    this.removeAllListeners();
  }
}