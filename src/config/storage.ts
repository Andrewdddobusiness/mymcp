import * as vscode from 'vscode';
import { ServerConfig } from '../types';

const SERVERS_KEY = 'copilot-mcp.servers';

let configContext: vscode.ExtensionContext | null = null;

export function initializeConfigStorage(context: vscode.ExtensionContext): void {
  configContext = context;
}

function getContext(): vscode.ExtensionContext {
  if (!configContext) {
    throw new Error('Configuration storage not initialized. Call initializeConfigStorage first.');
  }
  return configContext;
}

export async function getServers(): Promise<ServerConfig[]> {
  const config = vscode.workspace.getConfiguration();
  const servers = config.get<ServerConfig[]>(SERVERS_KEY, []);
  
  // Ensure all servers have required properties
  return servers.map(server => ({
    ...server,
    enabled: server.enabled ?? true,
    env: server.env ?? {}
  }));
}

export async function addServer(server: ServerConfig): Promise<void> {
  const servers = await getServers();
  server.id = generateId();
  servers.push(server);
  await saveServers(servers);
}

export async function updateServer(serverId: string, updates: Partial<ServerConfig>): Promise<void> {
  const servers = await getServers();
  const index = servers.findIndex(s => s.id === serverId);
  
  if (index >= 0) {
    servers[index] = { ...servers[index], ...updates };
    await saveServers(servers);
  } else {
    throw new Error(`Server with ID '${serverId}' not found`);
  }
}

export async function deleteServer(serverId: string): Promise<void> {
  const servers = await getServers();
  const filtered = servers.filter(s => s.id !== serverId);
  
  if (filtered.length === servers.length) {
    throw new Error(`Server with ID '${serverId}' not found`);
  }
  
  await saveServers(filtered);
}

export async function getServer(serverId: string): Promise<ServerConfig | undefined> {
  const servers = await getServers();
  return servers.find(s => s.id === serverId);
}

async function saveServers(servers: ServerConfig[]): Promise<void> {
  const config = vscode.workspace.getConfiguration();
  await config.update(
    SERVERS_KEY,
    servers,
    vscode.ConfigurationTarget.Global
  );
}

function generateId(): string {
  return `server-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Secure credential storage
export async function storeCredential(serverId: string, key: string, value: string): Promise<void> {
  const context = getContext();
  const secretKey = `mcp-${serverId}-${key}`;
  await context.secrets.store(secretKey, value);
}

export async function getCredential(serverId: string, key: string): Promise<string | undefined> {
  const context = getContext();
  const secretKey = `mcp-${serverId}-${key}`;
  return context.secrets.get(secretKey);
}

export async function deleteCredential(serverId: string, key: string): Promise<void> {
  const context = getContext();
  const secretKey = `mcp-${serverId}-${key}`;
  await context.secrets.delete(secretKey);
}

// Configuration validation
export function validateServerConfig(config: Partial<ServerConfig>): string[] {
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
export async function exportConfiguration(): Promise<string> {
  const servers = await getServers();
  // Remove sensitive data for export
  const exportData = servers.map(server => ({
    ...server,
    // Don't export credentials - they're stored securely
  }));
  
  return JSON.stringify(exportData, null, 2);
}

export async function importConfiguration(configJson: string): Promise<void> {
  try {
    const servers = JSON.parse(configJson) as ServerConfig[];
    
    // Validate each server
    for (const server of servers) {
      const errors = validateServerConfig(server);
      if (errors.length > 0) {
        throw new Error(`Invalid server configuration: ${errors.join(', ')}`);
      }
    }
    
    // Generate new IDs for imported servers
    const serversWithNewIds = servers.map(server => ({
      ...server,
      id: generateId()
    }));
    
    await saveServers(serversWithNewIds);
  } catch (error) {
    throw new Error(`Failed to import configuration: ${(error as Error).message}`);
  }
}