import { EventEmitter } from 'events';
import { MCPMessage, MCPRequest, MCPResponse, TransportConfig, ConnectionState } from '../types/protocol';

export abstract class Transport extends EventEmitter {
  protected config: TransportConfig;
  protected state: ConnectionState = ConnectionState.Disconnected;
  private connectionTimeout: NodeJS.Timeout | null = null;

  constructor(config: TransportConfig) {
    super();
    this.config = {
      connectTimeout: 30000,
      requestTimeout: 30000,
      maxRetries: 3,
      retryDelay: 1000,
      ...config
    };
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract send(message: MCPMessage): Promise<void>;

  get connectionState(): ConnectionState {
    return this.state;
  }

  get isConnected(): boolean {
    return this.state === ConnectionState.Connected;
  }

  protected setState(state: ConnectionState): void {
    if (this.state !== state) {
      const oldState = this.state;
      this.state = state;
      this.emit('stateChanged', { from: oldState, to: state });
    }
  }

  protected async connectWithTimeout(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.connectionTimeout = setTimeout(() => {
        reject(new Error(`Connection timeout after ${this.config.connectTimeout}ms`));
      }, this.config.connectTimeout);

      this.performConnect()
        .then(() => {
          if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
          }
          resolve();
        })
        .catch((error) => {
          if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
          }
          reject(error);
        });
    });
  }

  protected abstract performConnect(): Promise<void>;

  protected handleMessage(data: string | Buffer): void {
    try {
      const text = typeof data === 'string' ? data : data.toString('utf8');
      const lines = text.split('\n').filter(line => line.trim());

      for (const line of lines) {
        try {
          const message = JSON.parse(line) as MCPMessage;
          this.validateMessage(message);
          this.emit('message', message);

          // Emit specific event types
          if (message.method && !message.id) {
            this.emit('notification', message);
          } else if (message.method && message.id) {
            this.emit('request', message as MCPRequest);
          } else if (message.id && (message.result !== undefined || message.error !== undefined)) {
            const response = message as MCPResponse;
            this.emit('response', response);
            // Also handle pending requests
            this.handleResponse(response);
          }
        } catch (parseError) {
          console.error(`[${this.config.id || 'transport'}] JSON parse error:`, parseError, 'Raw message:', data);
          this.emit('error', new Error(`Invalid JSON message: ${(parseError as Error).message}`));
        }
      }
    } catch (error) {
      console.error(`[${this.config.id || 'transport'}] Message handling error:`, error);
      this.emit('error', new Error(`Failed to handle message: ${(error as Error).message}`));
    }
  }

  protected validateMessage(message: any): void {
    if (!message || typeof message !== 'object') {
      throw new Error('Message must be an object');
    }

    if (message.jsonrpc !== '2.0') {
      throw new Error('Message must have jsonrpc: "2.0"');
    }

    // Validate request
    if (message.method && message.id) {
      if (typeof message.method !== 'string') {
        throw new Error('Request method must be a string');
      }
      if (typeof message.id !== 'string' && typeof message.id !== 'number') {
        throw new Error('Request ID must be a string or number');
      }
    }

    // Validate response
    if (message.id && (message.result !== undefined || message.error !== undefined)) {
      if (typeof message.id !== 'string' && typeof message.id !== 'number') {
        throw new Error('Response ID must be a string or number');
      }
      if (message.error) {
        if (typeof message.error.code !== 'number' || typeof message.error.message !== 'string') {
          throw new Error('Error must have numeric code and string message');
        }
      }
    }

    // Validate notification
    if (message.method && !message.id) {
      if (typeof message.method !== 'string') {
        throw new Error('Notification method must be a string');
      }
    }
  }

  protected handleError(error: Error): void {
    this.setState(ConnectionState.Error);
    this.emit('error', error);
  }

  protected handleConnect(): void {
    this.setState(ConnectionState.Connected);
    this.emit('connect');
  }

  protected handleDisconnect(): void {
    this.setState(ConnectionState.Disconnected);
    this.emit('disconnect');
  }

  // Utility method to send JSON-RPC message
  protected async sendJson(message: MCPMessage): Promise<void> {
    const json = JSON.stringify(message) + '\n';
    await this.sendRaw(json);
  }

  protected abstract sendRaw(data: string): Promise<void>;

  // Request/response correlation
  private pendingRequests = new Map<string | number, {
    resolve: (response: MCPResponse) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>();

  async sendRequest(request: MCPRequest): Promise<MCPResponse> {
    if (!this.isConnected) {
      throw new Error('Transport not connected');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(request.id!);
        reject(new Error(`Request timeout after ${this.config.requestTimeout}ms`));
      }, this.config.requestTimeout);

      this.pendingRequests.set(request.id!, {
        resolve,
        reject,
        timeout
      });

      this.send(request).catch(error => {
        this.pendingRequests.delete(request.id!);
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  // Handle incoming responses
  protected handleResponse(response: MCPResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (pending) {
      this.pendingRequests.delete(response.id);
      clearTimeout(pending.timeout);

      if (response.error) {
        pending.reject(new Error(`${response.error.message} (${response.error.code})`));
      } else {
        pending.resolve(response);
      }
    }
  }

  // Cleanup
  dispose(): void {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
    }

    // Clear pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Transport disposed'));
    }
    this.pendingRequests.clear();

    this.removeAllListeners();
  }

  // Helper methods for subclasses
  protected createError(code: number, message: string, data?: any): MCPResponse {
    return {
      jsonrpc: '2.0',
      id: 0, // Will be overridden by specific context
      error: { code, message, data }
    };
  }

  protected createResponse(id: string | number, result: any): MCPResponse {
    return {
      jsonrpc: '2.0',
      id,
      result
    };
  }

  protected createRequest(id: string | number, method: string, params?: any): MCPRequest {
    return {
      jsonrpc: '2.0',
      id,
      method,
      params
    };
  }

  protected createNotification(method: string, params?: any): MCPMessage {
    return {
      jsonrpc: '2.0',
      method,
      params
    };
  }
}