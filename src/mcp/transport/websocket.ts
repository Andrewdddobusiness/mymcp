import WebSocket from 'ws';
import { Transport } from './base';
import { MCPMessage, TransportConfig, ConnectionState } from '../types/protocol';

export class WebSocketTransport extends Transport {
  private ws?: WebSocket;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private pingInterval?: NodeJS.Timeout;
  private pongTimeout?: NodeJS.Timeout;

  constructor(config: TransportConfig) {
    super(config);
    
    if (!config.url) {
      throw new Error('WebSocket transport requires a URL');
    }

    this.maxReconnectAttempts = config.maxRetries || 5;
    this.reconnectDelay = config.retryDelay || 1000;
  }

  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    this.setState(ConnectionState.Connecting);
    await this.connectWithTimeout();
  }

  protected async performConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const wsUrl = this.config.url!;
        const headers: any = {};

        // Add authentication headers if configured
        if (this.config.headers) {
          Object.assign(headers, this.config.headers);
        }

        this.setupAuthentication(headers);

        // Create WebSocket connection
        this.ws = new WebSocket(wsUrl, {
          headers,
          handshakeTimeout: this.config.connectTimeout
        });

        this.ws.on('open', () => {
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          this.handleConnect();
          resolve();
        });

        this.ws.on('message', (data) => {
          this.handleMessage(data);
        });

        this.ws.on('close', (code, reason) => {
          this.stopHeartbeat();
          const reasonText = reason.toString();
          
          if (this.state === ConnectionState.Connected) {
            // Unexpected disconnect - attempt reconnection
            this.handleUnexpectedDisconnect(code, reasonText);
          } else {
            this.handleDisconnect();
          }
        });

        this.ws.on('error', (error) => {
          this.stopHeartbeat();
          this.handleError(new Error(`WebSocket error: ${error.message}`));
          reject(error);
        });

        this.ws.on('pong', () => {
          // Clear pong timeout - connection is alive
          if (this.pongTimeout) {
            clearTimeout(this.pongTimeout);
            this.pongTimeout = undefined;
          }
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  private setupAuthentication(headers: any): void {
    switch (this.config.authType) {
      case 'basic':
        // Basic auth would typically be in the URL or headers
        break;
      case 'bearer':
        if (this.config.headers?.['Authorization']) {
          headers['Authorization'] = this.config.headers['Authorization'];
        }
        break;
      case 'custom':
        // Custom headers are already included
        break;
    }
  }

  private startHeartbeat(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    // Send ping every 30 seconds
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
        
        // Set pong timeout
        this.pongTimeout = setTimeout(() => {
          // No pong received - connection is likely dead
          this.handleError(new Error('WebSocket ping timeout'));
          this.ws?.terminate();
        }, 5000);
      }
    }, 30000);
  }

  private stopHeartbeat(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = undefined;
    }
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = undefined;
    }
  }

  private async handleUnexpectedDisconnect(code: number, reason: string): void {
    this.setState(ConnectionState.Disconnected);
    
    // Emit disconnect event
    this.emit('disconnect', { code, reason });

    // Attempt reconnection if enabled
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.setState(ConnectionState.Reconnecting);
      this.reconnectAttempts++;
      
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff
      
      setTimeout(async () => {
        try {
          await this.connect();
          this.emit('reconnect', { attempts: this.reconnectAttempts });
        } catch (error) {
          // Reconnection failed - will try again if under limit
          if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.handleError(new Error(`Failed to reconnect after ${this.maxReconnectAttempts} attempts`));
          }
        }
      }, delay);
    } else {
      this.handleError(new Error(`Connection lost and reconnection failed after ${this.maxReconnectAttempts} attempts`));
    }
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      this.stopHeartbeat();
      
      // Graceful close
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close(1000, 'Normal closure');
        
        // Wait for close event or timeout
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, 5000);
          
          this.ws!.once('close', () => {
            clearTimeout(timeout);
            resolve();
          });
        });
      }
      
      this.ws = undefined;
    }
    
    this.setState(ConnectionState.Disconnected);
    this.handleDisconnect();
  }

  async send(message: MCPMessage): Promise<void> {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    await this.sendJson(message);
  }

  protected async sendRaw(data: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      this.ws.send(data, (error) => {
        if (error) {
          reject(new Error(`Failed to send WebSocket message: ${error.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  // Get WebSocket connection info
  getConnectionInfo(): {
    url?: string;
    readyState?: number;
    protocol?: string;
    extensions?: string;
    reconnectAttempts: number;
  } {
    return {
      url: this.ws?.url,
      readyState: this.ws?.readyState,
      protocol: this.ws?.protocol,
      extensions: this.ws?.extensions,
      reconnectAttempts: this.reconnectAttempts
    };
  }

  // Get ready state as string
  getReadyStateString(): string {
    if (!this.ws) return 'CLOSED';
    
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING: return 'CONNECTING';
      case WebSocket.OPEN: return 'OPEN';
      case WebSocket.CLOSING: return 'CLOSING';
      case WebSocket.CLOSED: return 'CLOSED';
      default: return 'UNKNOWN';
    }
  }

  // Force reconnection
  async forceReconnect(): Promise<void> {
    if (this.ws) {
      this.ws.terminate();
    }
    
    this.reconnectAttempts = 0;
    await this.connect();
  }

  // Send ping manually
  ping(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.ping();
    }
  }

  // Enable/disable auto-reconnection
  setAutoReconnect(enabled: boolean, maxAttempts?: number): void {
    if (enabled) {
      this.maxReconnectAttempts = maxAttempts || 5;
    } else {
      this.maxReconnectAttempts = 0;
    }
  }

  dispose(): void {
    this.stopHeartbeat();
    
    if (this.ws) {
      this.ws.removeAllListeners();
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.terminate();
      }
      this.ws = undefined;
    }
    
    super.dispose();
  }
}