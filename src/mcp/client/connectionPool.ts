import { EventEmitter } from 'events';
import { MCPClient } from './mcpClient';
import { ServerConfig, ConnectionState } from '../types/protocol';

export interface PooledConnection {
  client: MCPClient;
  lastUsed: Date;
  inUse: boolean;
  useCount: number;
}

export class MCPConnectionPool extends EventEmitter {
  private connections = new Map<string, PooledConnection>();
  private connecting = new Map<string, Promise<MCPClient>>();
  private disposed = false;

  constructor(
    private maxConnections = 10,
    private connectionTimeout = 30000,
    private idleTimeout = 300000, // 5 minutes
    private maxUseCount = 1000
  ) {
    super();
    this.startIdleCleanup();
  }

  async getConnection(serverId: string, config: ServerConfig): Promise<MCPClient> {
    if (this.disposed) {
      throw new Error('Connection pool is disposed');
    }

    // Check if already connected
    const existing = this.connections.get(serverId);
    if (existing && existing.client.isConnected) {
      existing.lastUsed = new Date();
      existing.inUse = true;
      existing.useCount++;
      
      // Check if connection needs renewal
      if (existing.useCount > this.maxUseCount) {
        // Don't renew immediately, but mark for renewal
        setImmediate(() => this.renewConnection(serverId, config));
      }
      
      return existing.client;
    }

    // Check if connection in progress
    const connecting = this.connecting.get(serverId);
    if (connecting) {
      return connecting;
    }

    // Create new connection
    const connectionPromise = this.createConnection(serverId, config);
    this.connecting.set(serverId, connectionPromise);

    try {
      const client = await connectionPromise;
      this.connecting.delete(serverId);
      
      // Store in pool
      this.connections.set(serverId, {
        client,
        lastUsed: new Date(),
        inUse: true,
        useCount: 1
      });

      // Enforce connection limit
      await this.enforceLimit();
      
      this.emit('connectionCreated', { serverId, client });
      return client;
    } catch (error) {
      this.connecting.delete(serverId);
      this.emit('connectionFailed', { serverId, error });
      throw error;
    }
  }

  private async createConnection(serverId: string, config: ServerConfig): Promise<MCPClient> {
    const client = new MCPClient(serverId, config);
    
    // Set up event handlers
    client.on('disconnect', () => {
      this.handleClientDisconnect(serverId);
    });
    
    client.on('error', (error) => {
      this.emit('connectionError', { serverId, error });
    });

    client.on('initialized', (info) => {
      this.emit('connectionInitialized', { serverId, info });
    });

    // Connect with timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Connection timeout')), this.connectionTimeout);
    });

    await Promise.race([client.connect(), timeoutPromise]);
    
    return client;
  }

  private handleClientDisconnect(serverId: string): void {
    const connection = this.connections.get(serverId);
    if (connection) {
      this.connections.delete(serverId);
      this.emit('connectionLost', { serverId });
    }
  }

  private async enforceLimit(): Promise<void> {
    if (this.connections.size <= this.maxConnections) {
      return;
    }

    // Find least recently used connection that's not in use
    const candidates = Array.from(this.connections.entries())
      .filter(([, conn]) => !conn.inUse)
      .sort(([, a], [, b]) => a.lastUsed.getTime() - b.lastUsed.getTime());

    if (candidates.length > 0) {
      const [serverId] = candidates[0];
      await this.disconnect(serverId);
    }
  }

  async releaseConnection(serverId: string): Promise<void> {
    const connection = this.connections.get(serverId);
    if (connection) {
      connection.inUse = false;
      connection.lastUsed = new Date();
    }
  }

  async disconnect(serverId: string): Promise<void> {
    const connection = this.connections.get(serverId);
    if (connection) {
      this.connections.delete(serverId);
      try {
        await connection.client.disconnect();
      } catch (error) {
        // Ignore disconnect errors
      }
      connection.client.dispose();
      this.emit('connectionClosed', { serverId });
    }
  }

  async disconnectAll(): Promise<void> {
    const promises = Array.from(this.connections.keys()).map(serverId => 
      this.disconnect(serverId)
    );
    
    await Promise.allSettled(promises);
    this.connections.clear();
  }

  // Get connection status
  getConnectionStatus(serverId: string): {
    connected: boolean;
    lastUsed?: Date;
    inUse: boolean;
    useCount: number;
    connectionState?: ConnectionState;
  } | null {
    const connection = this.connections.get(serverId);
    if (!connection) {
      return null;
    }

    return {
      connected: connection.client.isConnected,
      lastUsed: connection.lastUsed,
      inUse: connection.inUse,
      useCount: connection.useCount,
      connectionState: connection.client.connectionState
    };
  }

  // Get all connection statuses
  getAllConnectionStatuses(): Map<string, {
    connected: boolean;
    lastUsed: Date;
    inUse: boolean;
    useCount: number;
    connectionState: ConnectionState;
  }> {
    const statuses = new Map();
    
    for (const [serverId, connection] of this.connections) {
      statuses.set(serverId, {
        connected: connection.client.isConnected,
        lastUsed: connection.lastUsed,
        inUse: connection.inUse,
        useCount: connection.useCount,
        connectionState: connection.client.connectionState
      });
    }
    
    return statuses;
  }

  // Force reconnection
  async reconnect(serverId: string, config: ServerConfig): Promise<MCPClient> {
    await this.disconnect(serverId);
    return this.getConnection(serverId, config);
  }

  private async renewConnection(serverId: string, config: ServerConfig): Promise<void> {
    try {
      const connection = this.connections.get(serverId);
      if (connection && !connection.inUse) {
        // Create new connection
        const newClient = await this.createConnection(`${serverId}-renewed`, config);
        
        // Replace old connection
        await connection.client.disconnect();
        connection.client.dispose();
        
        this.connections.set(serverId, {
          client: newClient,
          lastUsed: new Date(),
          inUse: false,
          useCount: 0
        });
        
        this.emit('connectionRenewed', { serverId });
      }
    } catch (error) {
      this.emit('renewalFailed', { serverId, error });
    }
  }

  // Idle cleanup
  private startIdleCleanup(): void {
    const cleanup = () => {
      if (this.disposed) return;
      
      const now = new Date();
      const toDisconnect: string[] = [];
      
      for (const [serverId, connection] of this.connections) {
        const idleTime = now.getTime() - connection.lastUsed.getTime();
        
        if (!connection.inUse && idleTime > this.idleTimeout) {
          toDisconnect.push(serverId);
        }
      }
      
      // Disconnect idle connections
      toDisconnect.forEach(serverId => {
        this.disconnect(serverId).catch(error => {
          this.emit('cleanupError', { serverId, error });
        });
      });
      
      // Schedule next cleanup
      setTimeout(cleanup, this.idleTimeout / 4);
    };
    
    setTimeout(cleanup, this.idleTimeout / 4);
  }

  // Health check all connections
  async healthCheck(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    
    const promises = Array.from(this.connections.entries()).map(async ([serverId, connection]) => {
      try {
        const healthy = await connection.client.ping();
        results.set(serverId, healthy);
        
        if (!healthy) {
          // Connection is unhealthy, remove it
          await this.disconnect(serverId);
        }
      } catch (error) {
        results.set(serverId, false);
        await this.disconnect(serverId);
      }
    });
    
    await Promise.allSettled(promises);
    return results;
  }

  // Pool statistics
  getStatistics(): {
    totalConnections: number;
    activeConnections: number;
    inUseConnections: number;
    pendingConnections: number;
    maxConnections: number;
    connectionTimeout: number;
    idleTimeout: number;
  } {
    const activeConnections = Array.from(this.connections.values())
      .filter(conn => conn.client.isConnected).length;
    
    const inUseConnections = Array.from(this.connections.values())
      .filter(conn => conn.inUse).length;

    return {
      totalConnections: this.connections.size,
      activeConnections,
      inUseConnections,
      pendingConnections: this.connecting.size,
      maxConnections: this.maxConnections,
      connectionTimeout: this.connectionTimeout,
      idleTimeout: this.idleTimeout
    };
  }

  // Configuration
  configure(options: {
    maxConnections?: number;
    connectionTimeout?: number;
    idleTimeout?: number;
    maxUseCount?: number;
  }): void {
    if (options.maxConnections !== undefined) {
      this.maxConnections = options.maxConnections;
    }
    if (options.connectionTimeout !== undefined) {
      this.connectionTimeout = options.connectionTimeout;
    }
    if (options.idleTimeout !== undefined) {
      this.idleTimeout = options.idleTimeout;
    }
    if (options.maxUseCount !== undefined) {
      this.maxUseCount = options.maxUseCount;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.disconnectAll().catch(() => {
      // Ignore errors during disposal
    });
    this.removeAllListeners();
  }
}