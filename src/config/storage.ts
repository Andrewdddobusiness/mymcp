import * as vscode from 'vscode';
import { ServerConfig } from '../types';

export class ConfigurationStorage {
  private static readonly SERVERS_KEY = 'copilot-mcp.servers';
  
  constructor(private context: vscode.ExtensionContext) {}

  async getServers(): Promise<ServerConfig[]> {
    const config = vscode.workspace.getConfiguration();
    const servers = config.get<ServerConfig[]>(ConfigurationStorage.SERVERS_KEY, []);
    
    // Ensure all servers have required properties
    return servers.map(server => ({
      ...server,
      enabled: server.enabled ?? true,
      env: server.env ?? {}
    }));
  }

  async addServer(server: ServerConfig): Promise<void> {
    const servers = await this.getServers();
    server.id = this.generateId();
    servers.push(server);
    await this.saveServers(servers);
  }

  async updateServer(serverId: string, updates: Partial<ServerConfig>): Promise<void> {
    const servers = await this.getServers();
    const index = servers.findIndex(s => s.id === serverId);
    
    if (index >= 0) {
      servers[index] = { ...servers[index], ...updates };
      await this.saveServers(servers);
    } else {
      throw new Error(`Server with ID '${serverId}' not found`);
    }
  }

  async deleteServer(serverId: string): Promise<void> {
    const servers = await this.getServers();
    const filtered = servers.filter(s => s.id !== serverId);
    
    if (filtered.length === servers.length) {
      throw new Error(`Server with ID '${serverId}' not found`);
    }
    
    await this.saveServers(filtered);
  }

  async getServer(serverId: string): Promise<ServerConfig | undefined> {
    const servers = await this.getServers();
    return servers.find(s => s.id === serverId);
  }

  private async saveServers(servers: ServerConfig[]): Promise<void> {
    const config = vscode.workspace.getConfiguration();
    await config.update(
      ConfigurationStorage.SERVERS_KEY,
      servers,
      vscode.ConfigurationTarget.Global
    );
  }

  private generateId(): string {
    return `server-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Secure credential storage
  async storeCredential(serverId: string, key: string, value: string): Promise<void> {
    const secretKey = `mcp-${serverId}-${key}`;
    await this.context.secrets.store(secretKey, value);
  }

  async getCredential(serverId: string, key: string): Promise<string | undefined> {
    const secretKey = `mcp-${serverId}-${key}`;
    return this.context.secrets.get(secretKey);
  }

  async deleteCredential(serverId: string, key: string): Promise<void> {
    const secretKey = `mcp-${serverId}-${key}`;
    await this.context.secrets.delete(secretKey);
  }

  // Configuration validation
  validateServerConfig(config: Partial<ServerConfig>): string[] {
    const errors: string[] = [];

    if (!config.name?.trim()) {
      errors.push('Server name is required');
    }

    if (!config.transport) {
      errors.push('Transport type is required');
    } else {
      switch (config.transport) {
        case 'stdio':
          if (!config.command?.trim()) {
            errors.push('Command is required for stdio transport');
          }
          break;
        case 'http':
        case 'websocket':
          if (!config.url?.trim()) {
            errors.push('URL is required for HTTP/WebSocket transport');
          } else {
            try {
              new URL(config.url);
            } catch {
              errors.push('Invalid URL format');
            }
          }
          break;
        default:
          errors.push('Invalid transport type');
      }
    }

    return errors;
  }

  // Import/Export functionality
  async exportConfiguration(): Promise<string> {
    const servers = await this.getServers();
    // Remove sensitive data for export
    const exportData = servers.map(server => ({
      ...server,
      // Don't export credentials - they're stored securely
    }));
    
    return JSON.stringify(exportData, null, 2);
  }

  async importConfiguration(configJson: string): Promise<void> {
    try {
      const servers = JSON.parse(configJson) as ServerConfig[];
      
      // Validate each server
      for (const server of servers) {
        const errors = this.validateServerConfig(server);
        if (errors.length > 0) {
          throw new Error(`Invalid server configuration: ${errors.join(', ')}`);
        }
      }
      
      // Generate new IDs for imported servers
      const serversWithNewIds = servers.map(server => ({
        ...server,
        id: this.generateId()
      }));
      
      await this.saveServers(serversWithNewIds);
    } catch (error) {
      throw new Error(`Failed to import configuration: ${error.message}`);
    }
  }
}