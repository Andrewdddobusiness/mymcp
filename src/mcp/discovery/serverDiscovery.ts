import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ServerConfig } from '../types/protocol';

export interface DiscoveredServer extends ServerConfig {
  source: 'workspace' | 'settings' | 'claude' | 'manual';
  discoveredAt: Date;
}

export class ServerDiscovery {
  private cache = new Map<string, DiscoveredServer[]>();
  private cacheExpiry = 5 * 60 * 1000; // 5 minutes

  async discoverAll(): Promise<DiscoveredServer[]> {
    const sources = await Promise.allSettled([
      this.loadFromSettings(),
      this.scanWorkspace(),
      this.importFromClaude(),
    ]);

    const allServers: DiscoveredServer[] = [];
    
    sources.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        allServers.push(...result.value);
      } else {
        console.warn(`Discovery source ${index} failed:`, result.reason);
      }
    });

    // Remove duplicates based on ID
    const uniqueServers = new Map<string, DiscoveredServer>();
    for (const server of allServers) {
      const existing = uniqueServers.get(server.id);
      if (!existing || this.getSourcePriority(server.source) > this.getSourcePriority(existing.source)) {
        uniqueServers.set(server.id, server);
      }
    }

    return Array.from(uniqueServers.values());
  }

  async loadFromSettings(): Promise<DiscoveredServer[]> {
    const cacheKey = 'settings';
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const config = vscode.workspace.getConfiguration('copilot-mcp');
      const servers = config.get<ServerConfig[]>('servers', []);
      
      const discovered = servers.map(server => ({
        ...server,
        source: 'settings' as const,
        discoveredAt: new Date()
      }));

      this.setCache(cacheKey, discovered);
      return discovered;
    } catch (error) {
      console.warn('Failed to load servers from settings:', error);
      return [];
    }
  }

  async scanWorkspace(): Promise<DiscoveredServer[]> {
    const cacheKey = 'workspace';
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const discovered: DiscoveredServer[] = [];

    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) {
        return [];
      }

      for (const folder of workspaceFolders) {
        const folderPath = folder.uri.fsPath;
        const configs = await this.scanDirectory(folderPath);
        discovered.push(...configs);
      }

      this.setCache(cacheKey, discovered);
      return discovered;
    } catch (error) {
      console.warn('Failed to scan workspace:', error);
      return [];
    }
  }

  private async scanDirectory(dirPath: string): Promise<DiscoveredServer[]> {
    const discovered: DiscoveredServer[] = [];
    
    try {
      // Look for .mcp.json files
      const mcpConfigPath = path.join(dirPath, '.mcp.json');
      try {
        const mcpConfig = await this.loadMcpConfig(mcpConfigPath);
        discovered.push(...mcpConfig);
      } catch {
        // File doesn't exist or is invalid
      }

      // Look for package.json with MCP configuration
      const packageJsonPath = path.join(dirPath, 'package.json');
      try {
        const packageConfig = await this.loadPackageJsonMcp(packageJsonPath);
        discovered.push(...packageConfig);
      } catch {
        // File doesn't exist or is invalid
      }

      // Look for pyproject.toml with MCP configuration
      const pyprojectPath = path.join(dirPath, 'pyproject.toml');
      try {
        const pyprojectConfig = await this.loadPyprojectMcp(pyprojectPath);
        discovered.push(...pyprojectConfig);
      } catch {
        // File doesn't exist or is invalid
      }

    } catch (error) {
      console.warn(`Failed to scan directory ${dirPath}:`, error);
    }

    return discovered;
  }

  private async loadMcpConfig(configPath: string): Promise<DiscoveredServer[]> {
    const content = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(content);
    
    if (!config.mcpServers && !config.servers) {
      return [];
    }

    const servers = config.mcpServers || config.servers;
    const discovered: DiscoveredServer[] = [];

    for (const [name, serverConfig] of Object.entries(servers)) {
      const server = this.normalizeServerConfig(name, serverConfig as any);
      if (server) {
        discovered.push({
          ...server,
          source: 'workspace',
          discoveredAt: new Date()
        });
      }
    }

    return discovered;
  }

  private async loadPackageJsonMcp(packagePath: string): Promise<DiscoveredServer[]> {
    const content = await fs.readFile(packagePath, 'utf8');
    const packageJson = JSON.parse(content);
    
    if (!packageJson.mcp?.servers) {
      return [];
    }

    const discovered: DiscoveredServer[] = [];
    
    for (const [name, serverConfig] of Object.entries(packageJson.mcp.servers)) {
      const server = this.normalizeServerConfig(name, serverConfig as any);
      if (server) {
        discovered.push({
          ...server,
          source: 'workspace',
          discoveredAt: new Date()
        });
      }
    }

    return discovered;
  }

  private async loadPyprojectMcp(pyprojectPath: string): Promise<DiscoveredServer[]> {
    // For simplicity, we'll look for TOML-style comments or JSON sections
    // A full TOML parser would be better but adds dependency
    const content = await fs.readFile(pyprojectPath, 'utf8');
    
    // Look for [tool.mcp.servers] section
    const mcpMatch = content.match(/\[tool\.mcp\.servers\]([\s\S]*?)(?=\[|\Z)/);
    if (!mcpMatch) {
      return [];
    }

    // This is a simplified parser - in production, use a proper TOML library
    const discovered: DiscoveredServer[] = [];
    
    // For now, return empty array - would need proper TOML parsing
    return discovered;
  }

  async importFromClaude(): Promise<DiscoveredServer[]> {
    const cacheKey = 'claude';
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const claudeConfigPath = this.getClaudeConfigPath();
      const content = await fs.readFile(claudeConfigPath, 'utf8');
      const config = JSON.parse(content);
      
      if (!config.mcpServers) {
        return [];
      }

      const discovered: DiscoveredServer[] = [];
      
      for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
        const server = this.normalizeServerConfig(name, serverConfig as any, 'claude-');
        if (server) {
          discovered.push({
            ...server,
            source: 'claude',
            discoveredAt: new Date()
          });
        }
      }

      this.setCache(cacheKey, discovered);
      return discovered;
    } catch (error) {
      // Claude Desktop config not found or invalid
      return [];
    }
  }

  private getClaudeConfigPath(): string {
    const platform = os.platform();
    
    switch (platform) {
      case 'darwin':
        return path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'config.json');
      case 'win32':
        return path.join(process.env.APPDATA || '', 'Claude', 'config.json');
      case 'linux':
        return path.join(os.homedir(), '.config', 'claude', 'config.json');
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  private normalizeServerConfig(name: string, config: any, idPrefix = ''): ServerConfig | null {
    try {
      // Handle different configuration formats
      let normalized: Partial<ServerConfig> = {
        id: `${idPrefix}${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        name: name
      };

      // Determine transport and configuration
      if (config.command || config.args) {
        // Stdio transport
        normalized.transport = 'stdio';
        normalized.command = config.command;
        normalized.args = config.args || [];
        normalized.env = config.env || {};
      } else if (config.url) {
        // HTTP or WebSocket transport
        const url = new URL(config.url);
        normalized.transport = url.protocol === 'ws:' || url.protocol === 'wss:' ? 'websocket' : 'http';
        normalized.url = config.url;
        normalized.headers = config.headers || {};
      } else {
        // Invalid configuration
        return null;
      }

      // Additional properties
      normalized.enabled = config.enabled !== false;
      normalized.timeout = config.timeout || 30000;
      normalized.authType = config.authType || 'none';

      return normalized as ServerConfig;
    } catch (error) {
      console.warn(`Failed to normalize server config for ${name}:`, error);
      return null;
    }
  }

  private getSourcePriority(source: DiscoveredServer['source']): number {
    switch (source) {
      case 'manual': return 4;
      case 'settings': return 3;
      case 'workspace': return 2;
      case 'claude': return 1;
      default: return 0;
    }
  }

  // Cache management
  private getFromCache(key: string): DiscoveredServer[] | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    const expiry = entry[0]?.discoveredAt.getTime() + this.cacheExpiry;
    
    if (now > expiry) {
      this.cache.delete(key);
      return null;
    }

    return entry;
  }

  private setCache(key: string, servers: DiscoveredServer[]): void {
    this.cache.set(key, servers);
  }

  clearCache(): void {
    this.cache.clear();
  }

  // Watch for configuration changes
  setupWatchers(): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];

    // Watch VS Code settings changes
    disposables.push(
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('copilot-mcp.servers')) {
          this.cache.delete('settings');
        }
      })
    );

    // Watch workspace file changes
    const watcher = vscode.workspace.createFileSystemWatcher('**/.mcp.json');
    disposables.push(
      watcher.onDidChange(() => this.cache.delete('workspace')),
      watcher.onDidCreate(() => this.cache.delete('workspace')),
      watcher.onDidDelete(() => this.cache.delete('workspace')),
      watcher
    );

    const packageWatcher = vscode.workspace.createFileSystemWatcher('**/package.json');
    disposables.push(
      packageWatcher.onDidChange(() => this.cache.delete('workspace')),
      packageWatcher.onDidCreate(() => this.cache.delete('workspace')),
      packageWatcher.onDidDelete(() => this.cache.delete('workspace')),
      packageWatcher
    );

    return disposables;
  }

  // Validate server configuration
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
          errors.push(`Unsupported transport type: ${config.transport}`);
      }
    }

    return errors;
  }
}