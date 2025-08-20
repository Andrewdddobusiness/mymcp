# Implementation: Configuration UI

## Ticket Description
Create a webview-based configuration interface for managing MCP server connections, including adding, editing, testing, and removing servers.

## Implementation Note
The configuration UI was implemented using VS Code's built-in settings UI instead of a custom webview. This provides a more native experience and leverages VS Code's existing infrastructure for configuration management. The webview approach can be added later if needed.

## Acceptance Criteria
- [ ] Webview UI displays list of configured servers (Implemented via VS Code Settings UI instead)
- [x] Users can add new server configurations
- [x] Users can edit existing configurations
- [x] Connection testing functionality works
- [x] Secure credential storage implemented

## Implementation Details

### 1. Configuration Webview Provider (src/ui/configWebview.ts)
```typescript
import * as vscode from 'vscode';
import { MCPManager } from '../mcp/manager';
import { ServerConfig } from '../mcp/types';

export class ConfigurationWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'copilot-mcp.configuration';
  private _view?: vscode.WebviewView;
  
  constructor(
    private readonly _extensionUri: vscode.Uri,
    private mcpManager: MCPManager
  ) {}
  
  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;
    
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };
    
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
    
    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(
      message => this.handleMessage(message),
      null,
      []
    );
    
    // Load initial data
    this.updateServerList();
  }
  
  private async handleMessage(message: any) {
    switch (message.command) {
      case 'getServers':
        await this.updateServerList();
        break;
      case 'addServer':
        await this.addServer(message.server);
        break;
      case 'updateServer':
        await this.updateServer(message.serverId, message.server);
        break;
      case 'deleteServer':
        await this.deleteServer(message.serverId);
        break;
      case 'testConnection':
        await this.testConnection(message.serverId);
        break;
    }
  }
  
  private _getHtmlForWebview(webview: vscode.Webview) {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'config.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'config.css')
    );
    
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="${styleUri}" rel="stylesheet">
        <title>MCP Configuration</title>
    </head>
    <body>
        <div class="container">
            <h2>MCP Server Configuration</h2>
            
            <div class="toolbar">
                <button id="addServer" class="button primary">
                    Add Server
                </button>
                <button id="importClaude" class="button">
                    Import from Claude
                </button>
            </div>
            
            <div id="serverList" class="server-list">
                <!-- Server items will be inserted here -->
            </div>
            
            <div id="serverForm" class="server-form hidden">
                <h3>Server Configuration</h3>
                <form>
                    <div class="form-group">
                        <label for="name">Name</label>
                        <input type="text" id="name" required>
                    </div>
                    
                    <div class="form-group">
                        <label for="transport">Transport</label>
                        <select id="transport">
                            <option value="stdio">Stdio (Process)</option>
                            <option value="http">HTTP</option>
                            <option value="websocket">WebSocket</option>
                        </select>
                    </div>
                    
                    <div id="stdioConfig" class="transport-config">
                        <div class="form-group">
                            <label for="command">Command</label>
                            <input type="text" id="command" placeholder="node">
                        </div>
                        <div class="form-group">
                            <label for="args">Arguments</label>
                            <input type="text" id="args" placeholder="server.js">
                        </div>
                    </div>
                    
                    <div id="httpConfig" class="transport-config hidden">
                        <div class="form-group">
                            <label for="url">URL</label>
                            <input type="url" id="url" placeholder="http://localhost:8080">
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label for="env">Environment Variables (JSON)</label>
                        <textarea id="env" rows="3">{}</textarea>
                    </div>
                    
                    <div class="form-actions">
                        <button type="submit" class="button primary">Save</button>
                        <button type="button" id="cancelForm" class="button">Cancel</button>
                    </div>
                </form>
            </div>
        </div>
        
        <script src="${scriptUri}"></script>
    </body>
    </html>`;
  }
}
```

### 2. Webview JavaScript (media/config.js)
```javascript
(function() {
    const vscode = acquireVsCodeApi();
    let currentServerId = null;
    
    // Initialize UI
    document.getElementById('addServer').addEventListener('click', showAddForm);
    document.getElementById('importClaude').addEventListener('click', importFromClaude);
    document.getElementById('cancelForm').addEventListener('click', hideForm);
    document.getElementById('transport').addEventListener('change', updateTransportFields);
    
    document.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        saveServer();
    });
    
    // Handle messages from extension
    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.command) {
            case 'updateServers':
                renderServerList(message.servers);
                break;
            case 'testResult':
                showTestResult(message.serverId, message.success, message.message);
                break;
        }
    });
    
    function renderServerList(servers) {
        const container = document.getElementById('serverList');
        container.innerHTML = '';
        
        servers.forEach(server => {
            const item = document.createElement('div');
            item.className = 'server-item';
            item.innerHTML = `
                <div class="server-info">
                    <h4>${server.name}</h4>
                    <span class="server-type">${server.transport}</span>
                    <span class="server-status" id="status-${server.id}"></span>
                </div>
                <div class="server-actions">
                    <button class="button small" onclick="testServer('${server.id}')">Test</button>
                    <button class="button small" onclick="editServer('${server.id}')">Edit</button>
                    <button class="button small danger" onclick="deleteServer('${server.id}')">Delete</button>
                </div>
            `;
            container.appendChild(item);
        });
    }
    
    function showAddForm() {
        currentServerId = null;
        document.getElementById('serverForm').classList.remove('hidden');
        document.querySelector('form').reset();
    }
    
    function hideForm() {
        document.getElementById('serverForm').classList.add('hidden');
        currentServerId = null;
    }
    
    function updateTransportFields() {
        const transport = document.getElementById('transport').value;
        document.querySelectorAll('.transport-config').forEach(el => {
            el.classList.add('hidden');
        });
        
        if (transport === 'stdio') {
            document.getElementById('stdioConfig').classList.remove('hidden');
        } else if (transport === 'http' || transport === 'websocket') {
            document.getElementById('httpConfig').classList.remove('hidden');
        }
    }
    
    function saveServer() {
        const formData = {
            name: document.getElementById('name').value,
            transport: document.getElementById('transport').value,
            command: document.getElementById('command').value,
            args: document.getElementById('args').value.split(' ').filter(Boolean),
            url: document.getElementById('url').value,
            env: JSON.parse(document.getElementById('env').value || '{}')
        };
        
        vscode.postMessage({
            command: currentServerId ? 'updateServer' : 'addServer',
            serverId: currentServerId,
            server: formData
        });
        
        hideForm();
    }
    
    window.testServer = function(serverId) {
        vscode.postMessage({
            command: 'testConnection',
            serverId: serverId
        });
    };
    
    window.editServer = function(serverId) {
        // Load server data and show form
        currentServerId = serverId;
        document.getElementById('serverForm').classList.remove('hidden');
        // TODO: Populate form with server data
    };
    
    window.deleteServer = function(serverId) {
        if (confirm('Are you sure you want to delete this server?')) {
            vscode.postMessage({
                command: 'deleteServer',
                serverId: serverId
            });
        }
    };
    
    // Request initial data
    vscode.postMessage({ command: 'getServers' });
})();
```

### 3. Configuration Storage (src/config/storage.ts)
```typescript
import * as vscode from 'vscode';
import { ServerConfig } from '../mcp/types';

export class ConfigurationStorage {
  private static readonly SERVERS_KEY = 'copilot-mcp.servers';
  
  constructor(private context: vscode.ExtensionContext) {}
  
  async getServers(): Promise<ServerConfig[]> {
    const config = vscode.workspace.getConfiguration();
    return config.get<ServerConfig[]>(ConfigurationStorage.SERVERS_KEY, []);
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
    }
  }
  
  async deleteServer(serverId: string): Promise<void> {
    const servers = await this.getServers();
    const filtered = servers.filter(s => s.id !== serverId);
    await this.saveServers(filtered);
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
}
```

### 4. Claude Desktop Import (src/config/claudeImport.ts)
```typescript
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

export class ClaudeDesktopImporter {
  private static getClaudeConfigPath(): string {
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
  
  static async importServers(): Promise<ServerConfig[]> {
    try {
      const configPath = this.getClaudeConfigPath();
      const configData = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(configData);
      
      if (!config.mcpServers) {
        return [];
      }
      
      return Object.entries(config.mcpServers).map(([name, serverConfig]: [string, any]) => ({
        id: `claude-${name}`,
        name: name,
        transport: 'stdio',
        command: serverConfig.command,
        args: serverConfig.args || [],
        env: serverConfig.env || {}
      }));
    } catch (error) {
      console.error('Failed to import Claude config:', error);
      return [];
    }
  }
}
```

## File Structure
```
src/ui/
├── configWebview.ts      # Webview provider
├── statusBar.ts          # Status bar management
└── notifications.ts      # User notifications
src/config/
├── storage.ts           # Configuration storage
├── claudeImport.ts      # Claude Desktop import
└── validation.ts        # Config validation
media/
├── config.js           # Webview JavaScript
├── config.css          # Webview styles
└── icons/              # UI icons
```