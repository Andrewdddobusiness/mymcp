import { Transport } from './base';
import { MCPMessage, TransportConfig, ConnectionState, MCPErrorCode } from '../types/protocol';

export class HttpTransport extends Transport {
  private baseUrl: string;
  private headers: Record<string, string>;
  private abortController?: AbortController;

  constructor(config: TransportConfig) {
    super(config);
    
    if (!config.url) {
      throw new Error('HTTP transport requires a URL');
    }

    this.baseUrl = config.url.replace(/\/$/, ''); // Remove trailing slash
    this.headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...config.headers
    };

    // Add authentication headers if configured
    this.setupAuthentication();
  }

  private setupAuthentication(): void {
    switch (this.config.authType) {
      case 'basic':
        // Basic auth should be provided in headers
        break;
      case 'bearer':
        // Bearer token should be provided in headers
        break;
      case 'custom':
        // Custom auth headers should be provided in config.headers
        break;
      default:
        // No authentication
        break;
    }
  }

  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    this.setState(ConnectionState.Connecting);
    await this.connectWithTimeout();
  }

  protected async performConnect(): Promise<void> {
    try {
      // Test connectivity with a ping or health check
      await this.testConnection();
      this.handleConnect();
    } catch (error) {
      this.handleError(new Error(`HTTP connection failed: ${error.message}`));
      throw error;
    }
  }

  private async testConnection(): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.connectTimeout);

    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        headers: this.headers,
        signal: controller.signal
      });

      if (!response.ok && response.status !== 404) {
        // 404 is acceptable if server doesn't have health endpoint
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Connection timeout');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async disconnect(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = undefined;
    }

    this.setState(ConnectionState.Disconnected);
    this.handleDisconnect();
  }

  async send(message: MCPMessage): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Transport not connected');
    }

    try {
      const response = await this.sendHttpRequest(message);
      
      // Handle response if it's a request (not a notification)
      if (message.id !== undefined) {
        this.handleMessage(JSON.stringify(response));
      }
    } catch (error) {
      this.handleError(new Error(`HTTP send failed: ${error.message}`));
      throw error;
    }
  }

  protected async sendRaw(data: string): Promise<void> {
    // For HTTP transport, sendRaw is not typically used
    // Instead, we send structured requests
    throw new Error('HTTP transport does not support raw message sending');
  }

  private async sendHttpRequest(message: MCPMessage): Promise<any> {
    this.abortController = new AbortController();
    const timeout = setTimeout(() => {
      this.abortController?.abort();
    }, this.config.requestTimeout);

    try {
      const response = await fetch(`${this.baseUrl}/rpc`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(message),
        signal: this.abortController.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        throw new Error(`Invalid content type: ${contentType}`);
      }

      const responseData = await response.json();
      this.validateMessage(responseData);
      
      return responseData;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      this.abortController = undefined;
    }
  }

  // HTTP-specific method for batch requests
  async sendBatch(messages: MCPMessage[]): Promise<any[]> {
    if (!this.isConnected) {
      throw new Error('Transport not connected');
    }

    if (messages.length === 0) {
      return [];
    }

    this.abortController = new AbortController();
    const timeout = setTimeout(() => {
      this.abortController?.abort();
    }, this.config.requestTimeout);

    try {
      const response = await fetch(`${this.baseUrl}/rpc`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(messages),
        signal: this.abortController.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        throw new Error(`Invalid content type: ${contentType}`);
      }

      const responseData = await response.json();
      
      // Validate batch response
      if (!Array.isArray(responseData)) {
        throw new Error('Batch response must be an array');
      }

      responseData.forEach(this.validateMessage.bind(this));
      
      return responseData;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Batch request timeout');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      this.abortController = undefined;
    }
  }

  // Server-Sent Events support for real-time updates
  async subscribeToEvents(): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Transport not connected');
    }

    try {
      const eventSource = new EventSource(`${this.baseUrl}/events`, {
        // Note: EventSource doesn't support custom headers in browsers
        // For Node.js, we'd need a different implementation
      });

      eventSource.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleMessage(JSON.stringify(message));
        } catch (error) {
          this.emit('error', new Error(`Invalid SSE message: ${error.message}`));
        }
      };

      eventSource.onerror = (error) => {
        this.emit('error', new Error('SSE connection error'));
      };

      // Store reference for cleanup
      (this as any).eventSource = eventSource;
    } catch (error) {
      throw new Error(`Failed to subscribe to events: ${error.message}`);
    }
  }

  // Get connection info
  getConnectionInfo(): {
    url: string;
    connected: boolean;
    lastRequestTime?: Date;
  } {
    return {
      url: this.baseUrl,
      connected: this.isConnected,
      lastRequestTime: (this as any).lastRequestTime
    };
  }

  // Test server capabilities
  async testServerCapabilities(): Promise<{
    rpc: boolean;
    batch: boolean;
    events: boolean;
    health: boolean;
  }> {
    const capabilities = {
      rpc: false,
      batch: false,
      events: false,
      health: false
    };

    try {
      // Test RPC endpoint
      const rpcResponse = await fetch(`${this.baseUrl}/rpc`, {
        method: 'OPTIONS',
        headers: this.headers
      });
      capabilities.rpc = rpcResponse.ok || rpcResponse.status === 405; // Method not allowed is OK

      // Test health endpoint
      const healthResponse = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        headers: this.headers
      });
      capabilities.health = healthResponse.ok;

      // Test events endpoint
      const eventsResponse = await fetch(`${this.baseUrl}/events`, {
        method: 'HEAD',
        headers: this.headers
      });
      capabilities.events = eventsResponse.ok;

      // Batch support is assumed if RPC works (part of JSON-RPC spec)
      capabilities.batch = capabilities.rpc;

    } catch (error) {
      // Capabilities remain false
    }

    return capabilities;
  }

  dispose(): void {
    if ((this as any).eventSource) {
      (this as any).eventSource.close();
      delete (this as any).eventSource;
    }

    this.disconnect().catch(() => {
      // Ignore errors during disposal
    });
    
    super.dispose();
  }
}