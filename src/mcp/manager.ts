import * as vscode from 'vscode';
import { MCPClient } from './client/mcpClient';
import { MCPConnectionPool } from './client/connectionPool';
import { ServerDiscovery, DiscoveredServer } from './discovery/serverDiscovery';
import { MCPTool, ServerConfig, ConnectionState } from './types/protocol';
import { Logger, ServerListItem } from '../types';

export class MCPManager {
  private pool = new MCPConnectionPool();
  private discovery = new ServerDiscovery();
  private servers = new Map<string, ServerConfig>();
  private discoveryWatchers: vscode.Disposable[] = [];
  private statusCheckInterval?: NodeJS.Timeout;

  constructor(
    private context: vscode.ExtensionContext,
    private logger: Logger
  ) {
    this.setupEventHandlers();
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing MCP Manager...');

    try {
      // Set up discovery watchers
      this.discoveryWatchers = this.discovery.setupWatchers();
      this.context.subscriptions.push(...this.discoveryWatchers);

      // Load server configurations
      await this.loadServers();

      // Start periodic status checks
      this.startStatusChecks();

      this.logger.info(`MCP Manager initialized with ${this.servers.size} servers`);
    } catch (error) {
      this.logger.error('Failed to initialize MCP Manager', error);
      throw error;
    }
  }

  private setupEventHandlers(): void {
    // Pool event handlers
    this.pool.on('connectionCreated', ({ serverId, client }) => {
      this.logger.info(`MCP connection created: ${serverId}`);
    });

    this.pool.on('connectionLost', ({ serverId }) => {
      this.logger.warn(`MCP connection lost: ${serverId}`);
    });

    this.pool.on('connectionError', ({ serverId, error }) => {
      this.logger.error(`MCP connection error: ${serverId}`, error);
    });

    this.pool.on('connectionInitialized', ({ serverId, info }) => {
      this.logger.info(`MCP server initialized: ${serverId}`, info);
    });
  }

  async reloadServers(): Promise<void> {
    this.logger.info('Reloading MCP servers...');
    
    try {
      // Clear discovery cache
      this.discovery.clearCache();
      
      // Disconnect all current connections
      await this.pool.disconnectAll();
      
      // Reload server configurations
      await this.loadServers();
      
      this.logger.info(`Reloaded ${this.servers.size} MCP servers`);
    } catch (error) {
      this.logger.error('Failed to reload servers', error);
      throw error;
    }
  }

  private async loadServers(): Promise<void> {
    try {
      const discoveredServers = await this.discovery.discoverAll();
      
      this.servers.clear();
      
      for (const server of discoveredServers) {
        if (server.enabled !== false) {
          this.servers.set(server.id, server);
          this.logger.debug(`Loaded server: ${server.name} (${server.source})`);
        }
      }

      this.logger.info(`Loaded ${this.servers.size} enabled MCP servers`);
    } catch (error) {
      this.logger.error('Failed to load servers', error);
      throw error;
    }
  }

  async getServerStatus(): Promise<ServerListItem[]> {
    const statusList: ServerListItem[] = [];
    
    for (const [serverId, config] of this.servers) {
      const poolStatus = this.pool.getConnectionStatus(serverId);
      
      let status: ServerListItem['status'];
      let toolCount: number | undefined;
      let lastConnected: Date | undefined;

      if (poolStatus) {
        status = poolStatus.connected ? 'connected' : 'disconnected';
        lastConnected = poolStatus.lastUsed;
        
        // Try to get tool count
        try {
          const client = await this.pool.getConnection(serverId, config);
          const tools = await client.listTools();
          toolCount = tools.length;
          await this.pool.releaseConnection(serverId);
        } catch {
          status = 'error';
        }
      } else {
        status = 'disconnected';
      }

      statusList.push({
        id: serverId,
        name: config.name,
        transport: config.transport,
        status,
        lastConnected,
        toolCount
      });
    }

    return statusList;
  }

  async listTools(): Promise<Array<{serverId: string, tool: MCPTool}>> {
    const allTools: Array<{serverId: string, tool: MCPTool}> = [];
    
    const connectionPromises = Array.from(this.servers.entries()).map(async ([serverId, config]) => {
      try {
        const client = await this.pool.getConnection(serverId, config);
        const tools = await client.listTools();
        
        for (const tool of tools) {
          allTools.push({ serverId, tool });
        }
        
        await this.pool.releaseConnection(serverId);
      } catch (error) {
        this.logger.warn(`Failed to list tools for ${serverId}`, error);
      }
    });

    await Promise.allSettled(connectionPromises);
    
    this.logger.debug(`Listed ${allTools.length} tools from ${this.servers.size} servers`);
    return allTools;
  }

  async findTool(toolName: string): Promise<{serverId: string, tool: MCPTool} | null> {
    for (const [serverId, config] of this.servers) {
      try {
        const client = await this.pool.getConnection(serverId, config);
        const tools = await client.listTools();
        
        const tool = tools.find(t => t.name === toolName);
        if (tool) {
          await this.pool.releaseConnection(serverId);
          return { serverId, tool };
        }
        
        await this.pool.releaseConnection(serverId);
      } catch (error) {
        this.logger.debug(`Error searching for tool ${toolName} in ${serverId}:`, error);
      }
    }
    
    return null;
  }

  async executeTool(serverId: string, toolName: string, args: any): Promise<any> {
    const config = this.servers.get(serverId);
    if (!config) {
      throw new Error(`Server '${serverId}' not found`);
    }

    this.logger.info(`Executing tool: ${serverId}/${toolName}`, { args });
    
    try {
      const client = await this.pool.getConnection(serverId, config);
      const result = await client.executeTool(toolName, args);
      await this.pool.releaseConnection(serverId);
      
      this.logger.info(`Tool execution completed: ${serverId}/${toolName}`);
      return result;
    } catch (error) {
      this.logger.error(`Tool execution failed: ${serverId}/${toolName}`, error);
      throw error;
    }
  }

  // Resource management
  async listResources(serverId?: string): Promise<Array<{serverId: string, resource: any}>> {
    const allResources: Array<{serverId: string, resource: any}> = [];
    
    const serversToCheck = serverId 
      ? [[serverId, this.servers.get(serverId)!]].filter(([, config]) => config)
      : Array.from(this.servers.entries());

    for (const [id, config] of serversToCheck) {
      try {
        const client = await this.pool.getConnection(id, config);
        const resources = await client.listResources();
        
        for (const resource of resources) {
          allResources.push({ serverId: id, resource });
        }
        
        await this.pool.releaseConnection(id);
      } catch (error) {
        this.logger.warn(`Failed to list resources for ${id}`, error);
      }
    }

    return allResources;
  }

  async getResource(serverId: string, uri: string): Promise<any> {
    const config = this.servers.get(serverId);
    if (!config) {
      throw new Error(`Server '${serverId}' not found`);
    }

    try {
      const client = await this.pool.getConnection(serverId, config);
      const resource = await client.getResource(uri);
      await this.pool.releaseConnection(serverId);
      
      return resource;
    } catch (error) {
      this.logger.error(`Failed to get resource: ${serverId}/${uri}`, error);
      throw error;
    }
  }

  // Server management
  async addServer(config: ServerConfig): Promise<void> {
    // Validate configuration
    const errors = this.discovery.validateServerConfig(config);
    if (errors.length > 0) {
      throw new Error(`Invalid server configuration: ${errors.join(', ')}`);
    }

    // Generate ID if not provided
    if (!config.id) {
      config.id = `server-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    // Add to VS Code settings
    const currentServers = await this.discovery.loadFromSettings();
    const updatedServers = [...currentServers.map(s => ({ ...s, source: undefined, discoveredAt: undefined })), config];
    
    const vsConfig = vscode.workspace.getConfiguration('copilot-mcp');
    await vsConfig.update('servers', updatedServers, vscode.ConfigurationTarget.Global);

    // Reload servers
    await this.loadServers();
    
    this.logger.info(`Added MCP server: ${config.name}`);
  }

  async removeServer(serverId: string): Promise<void> {
    // Disconnect if connected
    await this.pool.disconnect(serverId);
    
    // Remove from settings
    const currentServers = await this.discovery.loadFromSettings();
    const updatedServers = currentServers
      .filter(s => s.id !== serverId)
      .map(s => ({ ...s, source: undefined, discoveredAt: undefined }));
    
    const vsConfig = vscode.workspace.getConfiguration('copilot-mcp');
    await vsConfig.update('servers', updatedServers, vscode.ConfigurationTarget.Global);

    // Reload servers
    await this.loadServers();
    
    this.logger.info(`Removed MCP server: ${serverId}`);
  }

  async testConnection(serverId: string): Promise<boolean> {
    const config = this.servers.get(serverId);
    if (!config) {
      throw new Error(`Server '${serverId}' not found`);
    }

    try {
      const client = await this.pool.getConnection(serverId, config);
      const healthy = await client.ping();
      await this.pool.releaseConnection(serverId);
      
      this.logger.info(`Connection test for ${serverId}: ${healthy ? 'passed' : 'failed'}`);
      return healthy;
    } catch (error) {
      this.logger.warn(`Connection test failed for ${serverId}`, error);
      return false;
    }
  }

  // Health monitoring
  private startStatusChecks(): void {
    // Check server health every 5 minutes
    this.statusCheckInterval = setInterval(async () => {
      try {
        const results = await this.pool.healthCheck();
        let healthyCount = 0;
        let totalCount = 0;
        
        for (const [serverId, healthy] of results) {
          totalCount++;
          if (healthy) {
            healthyCount++;
          } else {
            this.logger.warn(`Server ${serverId} failed health check`);
          }
        }
        
        this.logger.debug(`Health check: ${healthyCount}/${totalCount} servers healthy`);
      } catch (error) {
        this.logger.error('Health check failed', error);
      }
    }, 5 * 60 * 1000);
  }

  // Statistics and monitoring
  getStatistics(): {
    serverCount: number;
    connectedCount: number;
    poolStats: any;
    discoveredSources: string[];
  } {
    const poolStats = this.pool.getStatistics();
    const allStatuses = this.pool.getAllConnectionStatuses();
    const connectedCount = Array.from(allStatuses.values())
      .filter(status => status.connected).length;

    return {
      serverCount: this.servers.size,
      connectedCount,
      poolStats,
      discoveredSources: ['settings', 'workspace', 'claude']
    };
  }

  async dispose(): Promise<void> {
    this.logger.info('Disposing MCP Manager...');
    
    // Stop status checks
    if (this.statusCheckInterval) {
      clearInterval(this.statusCheckInterval);
    }

    // Dispose discovery watchers
    this.discoveryWatchers.forEach(disposable => disposable.dispose());
    
    // Disconnect all connections
    await this.pool.disconnectAll();
    
    // Dispose pool
    this.pool.dispose();
    
    this.logger.info('MCP Manager disposed');
  }
}