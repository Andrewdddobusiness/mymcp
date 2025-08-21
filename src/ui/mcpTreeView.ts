import * as vscode from 'vscode';
import { MCPManager } from '../mcp/manager';
import { MCPTool } from '../mcp/types/protocol';
import { ServerListItem } from '../types';
import { info as logInfo, warn as logWarn, error as logError } from '../utils/logger';

// Tree item types
type TreeItemType = 'server' | 'tool' | 'toolsFolder';

interface TreeItem {
  type: TreeItemType;
  id: string;
  label: string;
  description?: string;
  tooltip?: string;
  icon?: string;
  parent?: string;
  children?: TreeItem[];
  data?: any;
}

// Tree data provider state
let treeDataProvider: MCPTreeDataProvider | null = null;
let treeView: vscode.TreeView<TreeItem> | null = null;

export class MCPTreeDataProvider implements vscode.TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private servers: ServerListItem[] = [];
  private serverTools: Map<string, MCPTool[]> = new Map();

  constructor(private mcpManager: MCPManager) {}

  refresh(): void {
    logInfo('Refreshing MCP tree view');
    this._onDidChangeTreeData.fire();
  }

  async loadServerData(): Promise<void> {
    try {
      // Get server status
      this.servers = await this.mcpManager.getServerStatus();
      
      // Load tools for each connected server
      this.serverTools.clear();
      const allTools = await this.mcpManager.listTools();
      
      // Group tools by server
      for (const { serverId, tool } of allTools) {
        if (!this.serverTools.has(serverId)) {
          this.serverTools.set(serverId, []);
        }
        this.serverTools.get(serverId)!.push(tool);
      }

      logInfo(`Loaded data for ${this.servers.length} servers with tools`);
    } catch (error) {
      logError('Failed to load server data for tree view', error);
    }
  }

  getTreeItem(element: TreeItem): vscode.TreeItem {
    const treeItem = new vscode.TreeItem(element.label);
    
    treeItem.id = element.id;
    treeItem.description = element.description;
    treeItem.tooltip = element.tooltip;

    switch (element.type) {
      case 'server':
        const server = this.servers.find(s => s.id === element.id);
        if (server) {
          treeItem.collapsibleState = server.status === 'connected' 
            ? vscode.TreeItemCollapsibleState.Collapsed 
            : vscode.TreeItemCollapsibleState.None;
          
          // Set icon based on connection status
          switch (server.status) {
            case 'connected':
              treeItem.iconPath = new vscode.ThemeIcon('plug', new vscode.ThemeColor('charts.green'));
              break;
            case 'connecting':
              treeItem.iconPath = new vscode.ThemeIcon('sync~spin', new vscode.ThemeColor('charts.yellow'));
              break;
            case 'error':
              treeItem.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'));
              break;
            default:
              treeItem.iconPath = new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('charts.gray'));
          }
          
          // Set context value for command availability
          treeItem.contextValue = `mcpServer-${server.status}`;
        }
        break;

      case 'toolsFolder':
        treeItem.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
        treeItem.iconPath = new vscode.ThemeIcon('tools');
        treeItem.contextValue = 'mcpToolsFolder';
        break;

      case 'tool':
        treeItem.collapsibleState = vscode.TreeItemCollapsibleState.None;
        treeItem.iconPath = new vscode.ThemeIcon('symbol-method');
        treeItem.contextValue = 'mcpTool';
        
        // Allow clicking on tools to show details
        treeItem.command = {
          command: 'copilot-mcp.showToolDetails',
          title: 'Show Tool Details',
          arguments: [element.data]
        };
        break;
    }

    return treeItem;
  }

  async getChildren(element?: TreeItem): Promise<TreeItem[]> {
    if (!element) {
      // Root level - return servers
      await this.loadServerData();
      return this.servers.map(server => ({
        type: 'server' as TreeItemType,
        id: server.id,
        label: server.name,
        description: `${server.transport} - ${server.status}`,
        tooltip: `Server: ${server.name}\nTransport: ${server.transport}\nStatus: ${server.status}\nTools: ${server.toolCount || 0}`,
        data: server
      }));
    }

    if (element.type === 'server') {
      // Server level - return tools folder if server is connected and has tools
      const server = this.servers.find(s => s.id === element.id);
      const tools = this.serverTools.get(element.id) || [];
      
      if (server?.status === 'connected' && tools.length > 0) {
        return [{
          type: 'toolsFolder' as TreeItemType,
          id: `${element.id}-tools`,
          label: `Tools (${tools.length})`,
          description: `${tools.length} available`,
          tooltip: `${tools.length} tools available from ${server.name}`,
          parent: element.id,
          data: { serverId: element.id, tools }
        }];
      }
      return [];
    }

    if (element.type === 'toolsFolder') {
      // Tools folder level - return individual tools
      const tools = this.serverTools.get(element.parent!) || [];
      return tools.map(tool => ({
        type: 'tool' as TreeItemType,
        id: `${element.parent}-tool-${tool.name}`,
        label: tool.name,
        description: tool.description.length > 50 
          ? tool.description.substring(0, 47) + '...'
          : tool.description,
        tooltip: `Tool: ${tool.name}\nDescription: ${tool.description}\nClick to see details`,
        parent: element.id,
        data: { serverId: element.parent, tool }
      }));
    }

    return [];
  }
}

// Initialize tree view
export function initializeTreeView(context: vscode.ExtensionContext, mcpManager: MCPManager): void {
  logInfo('Initializing MCP tree view');
  
  try {
    treeDataProvider = new MCPTreeDataProvider(mcpManager);
    
    treeView = vscode.window.createTreeView('mcpExplorer', {
      treeDataProvider,
      canSelectMany: false
    });

    // Register tree view for disposal
    context.subscriptions.push(treeView);

    logInfo('MCP tree view initialized successfully');
  } catch (error) {
    logError('Failed to initialize MCP tree view', error);
    throw error;
  }
}

// Refresh the tree view
export function refreshTreeView(): void {
  if (treeDataProvider) {
    treeDataProvider.refresh();
  } else {
    logWarn('Cannot refresh tree view - not initialized');
  }
}

// Get current tree view instance
export function getTreeView(): vscode.TreeView<TreeItem> | null {
  return treeView;
}

// Dispose tree view
export function dispose(): void {
  if (treeView) {
    treeView.dispose();
    treeView = null;
  }
  treeDataProvider = null;
  logInfo('MCP tree view disposed');
}