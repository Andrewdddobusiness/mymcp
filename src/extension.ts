import * as vscode from 'vscode';
import { MCPManager } from './mcp/manager';
import { CopilotIntegration } from './copilot/integration';
import * as configStorage from './config/storage';
import * as statusBar from './ui/statusBar';
import * as mcpTreeView from './ui/mcpTreeView';
import { showToolDetails } from './ui/toolDetails';
import * as logger from './utils/logger';

let mcpManager: MCPManager;
let copilotIntegration: CopilotIntegration;

async function showServerDetails(server: any): Promise<void> {
  logger.info(`=== ENTERING showServerDetails ===`);
  logger.info(`Server parameter: ${JSON.stringify(server, null, 2)}`);
  
  try {
    logger.info(`Step 1: Starting showServerDetails for server: ${server?.name} (ID: ${server?.id})`);
    
    if (!server) {
      throw new Error('Server parameter is null or undefined');
    }

    // Start with a simple menu first - don't get tools yet
    logger.info(`Step 2: Creating simple menu items`);
    
    const items: vscode.QuickPickItem[] = [
      {
        label: `$(server) Server Info`,
        description: `${server.name || 'Unknown'} - ${server.status || 'Unknown status'}`,
        detail: `ID: ${server.id || 'Unknown'} | Transport: ${server.transport || 'Unknown'}`
      },
      {
        label: `$(clock) Connection Info`,
        description: server.lastConnected ? new Date(server.lastConnected).toLocaleString() : 'Never connected',
        detail: 'Last successful connection time'
      },
      {
        label: `$(tools) Show Tools`,
        description: `${server.toolCount || 0} tools available`,
        detail: 'Fetch and display all tools from this server'
      },
      {
        label: `$(refresh) Test Connection`,
        description: 'Test server connectivity',
        detail: 'Attempt to ping the server'
      },
      {
        label: `$(json) Raw Data`,
        description: 'View complete server information',
        detail: 'Show all server metadata in JSON format'
      }
    ];

    logger.info(`Step 3: Created ${items.length} menu items`);

    logger.info(`Step 4: Showing QuickPick with title: "Server Details: ${server.name}"`);
    
    const selected = await vscode.window.showQuickPick(items, {
      title: `Server Details: ${server.name || 'Unknown Server'}`,
      placeHolder: 'Select an option to continue'
    });

    logger.info(`Step 5: QuickPick result: ${selected ? selected.label : 'User cancelled'}`);

    if (!selected) {
      logger.info('User cancelled server details menu');
      return;
    }

    logger.info(`Step 6: Processing selection: ${selected.label}`);

    // Handle selection with simple responses first
    if (selected.label.includes('Show Tools')) {
      logger.info('User wants to see tools - fetching...');
      vscode.window.showInformationMessage('Fetching tools... (this may take a moment)');
      
      try {
        const allTools = await mcpManager.listTools();
        logger.info(`Found ${allTools.length} total tools across all servers`);
        const serverTools = allTools.filter(t => t.serverId === server.id);
        logger.info(`Found ${serverTools.length} tools for server ${server.id}`);
        
        if (serverTools.length > 0) {
          await showServerTools(server, serverTools);
        } else {
          vscode.window.showInformationMessage(`No tools found for ${server.name}`);
        }
      } catch (toolError) {
        logger.error('Error fetching tools:', toolError);
        vscode.window.showErrorMessage(`Failed to fetch tools: ${toolError}`);
      }
      
    } else if (selected.label.includes('Test Connection')) {
      logger.info('User wants to test connection');
      await testServerConnection(server);
      
    } else if (selected.label.includes('Raw Data')) {
      logger.info('User wants to see raw data');
      await showServerJSON(server);
      
    } else if (selected.label.includes('Server Info')) {
      logger.info('User selected server info');
      vscode.window.showInformationMessage(`Server: ${server.name}\nStatus: ${server.status}\nTransport: ${server.transport}\nTools: ${server.toolCount || 0}`);
      
    } else if (selected.label.includes('Connection Info')) {
      logger.info('User selected connection info');
      const lastConnected = server.lastConnected ? new Date(server.lastConnected).toLocaleString() : 'Never';
      vscode.window.showInformationMessage(`Last Connected: ${lastConnected}`);
      
    } else {
      logger.warn(`Unhandled menu selection: ${selected.label}`);
      vscode.window.showWarningMessage(`Feature "${selected.label}" not implemented yet`);
    }

    logger.info(`=== EXITING showServerDetails SUCCESSFULLY ===`);
    
  } catch (error) {
    logger.error(`=== ERROR IN showServerDetails ===`);
    logger.error('Error details:', error);
    logger.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
    vscode.window.showErrorMessage(`Error showing server details: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function showServerTools(server: any, tools: Array<{serverId: string, tool: any}>): Promise<void> {
  interface ToolQuickPickItem extends vscode.QuickPickItem {
    toolData: { serverId: string; tool: any };
  }

  const toolItems: ToolQuickPickItem[] = tools.map(t => ({
    label: `$(symbol-method) ${t.tool.name}`,
    description: t.tool.description.length > 60 ? t.tool.description.substring(0, 57) + '...' : t.tool.description,
    detail: `Click to view detailed schema information`,
    toolData: { serverId: server.id, tool: t.tool }
  }));

  const selected = await vscode.window.showQuickPick(toolItems, {
    title: `Tools from ${server.name}`,
    placeHolder: 'Select a tool to view details'
  });

  if (selected && selected.toolData) {
    logger.info(`User selected tool: ${selected.toolData.tool.name}`);
    await showToolDetails(selected.toolData);
  }
}

async function testServerConnection(server: any): Promise<void> {
  try {
    vscode.window.showInformationMessage('Testing connection...', { modal: false });
    const isHealthy = await mcpManager.testConnection(server.id);
    
    if (isHealthy) {
      vscode.window.showInformationMessage(`✅ ${server.name}: Connection test passed`);
    } else {
      vscode.window.showWarningMessage(`⚠️ ${server.name}: Connection test failed`);
    }
  } catch (error) {
    logger.error(`Connection test failed for ${server.name}`, error);
    vscode.window.showErrorMessage(`❌ ${server.name}: Connection test error - ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function showServerJSON(server: any): Promise<void> {
  const document = await vscode.workspace.openTextDocument({
    content: JSON.stringify(server, null, 2),
    language: 'json'
  });
  
  await vscode.window.showTextDocument(document, {
    preview: true,
    viewColumn: vscode.ViewColumn.Beside
  });
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  logger.info('Copilot MCP Bridge is activating...');

  try {
    // Initialize core components
    configStorage.initializeConfigStorage(context);
    mcpManager = new MCPManager(context, logger);
    statusBar.initializeStatusBar(context);
    copilotIntegration = new CopilotIntegration(context, mcpManager, logger);

    // Register commands
    registerCommands(context);

    // Initialize components
    await mcpManager.initialize();
    
    // Initialize tree view
    mcpTreeView.initializeTreeView(context, mcpManager);
    
    // Register Copilot integration (non-blocking)
    try {
      await copilotIntegration.register();
    } catch (error) {
      logger.warn('Copilot integration failed, continuing with basic MCP functionality', error);
    }
    
    statusBar.show(context);

    // Set up configuration change listener
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration(async (e) => {
        if (e.affectsConfiguration('copilot-mcp.servers')) {
          logger.info('Server configuration changed, reloading...');
          await mcpManager.reloadServers();
          mcpTreeView.refreshTreeView();
        }
      })
    );

    logger.info('Copilot MCP Bridge activated successfully');
  } catch (error) {
    logger.error('Failed to activate extension', error);
    vscode.window.showErrorMessage(
      `Failed to activate Copilot MCP Bridge: ${(error as Error).message}`
    );
    // Don't throw error - let VS Code continue loading the extension with basic functionality
    logger.warn('Extension loaded with limited functionality');
  }
}

export async function deactivate(): Promise<void> {
  logger.info('Copilot MCP Bridge is deactivating...');

  try {
    if (mcpManager) {
      await mcpManager.dispose();
    }
    statusBar.dispose();
    mcpTreeView.dispose();
    
    logger.info('Copilot MCP Bridge deactivated successfully');
  } catch (error) {
    logger.error('Error during deactivation', error);
  } finally {
    logger.dispose();
  }
}

function registerCommands(context: vscode.ExtensionContext): void {
  // Configure MCP servers
  context.subscriptions.push(
    vscode.commands.registerCommand('copilot-mcp.configure', async () => {
      try {
        await vscode.commands.executeCommand('workbench.action.openSettings', 'copilot-mcp.servers');
      } catch (error) {
        logger.error('Failed to open configuration', error);
        vscode.window.showErrorMessage('Failed to open MCP configuration');
      }
    })
  );

  // Show MCP status
  context.subscriptions.push(
    vscode.commands.registerCommand('copilot-mcp.showStatus', async () => {
      try {
        logger.info('=== SHOW STATUS COMMAND CALLED ===');
        const servers = await mcpManager.getServerStatus();
        logger.info(`Got ${servers.length} servers from mcpManager.getServerStatus()`);
        
        if (servers.length === 0) {
          vscode.window.showInformationMessage('No MCP servers configured');
          return;
        }

        // Create a Map to store server data by index
        const serverMap = new Map<number, any>();
        
        const items: vscode.QuickPickItem[] = servers.map((server, index) => {
          serverMap.set(index, server);
          logger.info(`Creating quick pick item for server ${index}: ${server.name}`);
          return {
            label: server.name,
            description: server.status,
            detail: `${server.toolCount || 0} tools available`
          };
        });
        
        logger.info(`Created ${items.length} quick pick items`);
        
        const selected = await vscode.window.showQuickPick(items, {
          title: 'MCP Server Status',
          placeHolder: 'Select a server to view details'
        });

        if (selected) {
          logger.info(`User selected item: ${selected.label}`);
          // Find the server by matching the label
          const serverIndex = items.findIndex(item => item.label === selected.label);
          if (serverIndex >= 0) {
            const serverData = serverMap.get(serverIndex);
            if (serverData) {
              logger.info(`Found server data: ${serverData.name}, calling showServerDetails`);
              await showServerDetails(serverData);
            } else {
              logger.error(`No server data found for index ${serverIndex}`);
            }
          } else {
            logger.error(`Could not find server for label: ${selected.label}`);
          }
        } else {
          logger.info('User cancelled server selection');
        }
      } catch (error) {
        logger.error('Failed to show status', error);
        vscode.window.showErrorMessage('Failed to retrieve MCP status');
      }
    })
  );

  // Refresh connections
  context.subscriptions.push(
    vscode.commands.registerCommand('copilot-mcp.refresh', async () => {
      try {
        await mcpManager.reloadServers();
        mcpTreeView.refreshTreeView();
        vscode.window.showInformationMessage('MCP connections refreshed');
      } catch (error) {
        logger.error('Failed to refresh connections', error);
        vscode.window.showErrorMessage('Failed to refresh MCP connections');
      }
    })
  );

  // Refresh tree view
  context.subscriptions.push(
    vscode.commands.registerCommand('copilot-mcp.refreshTreeView', async () => {
      try {
        mcpTreeView.refreshTreeView();
      } catch (error) {
        logger.error('Failed to refresh tree view', error);
        vscode.window.showErrorMessage('Failed to refresh MCP tree view');
      }
    })
  );

  // Show tool details
  context.subscriptions.push(
    vscode.commands.registerCommand('copilot-mcp.showToolDetails', async (toolData: { serverId: string; tool: any }) => {
      try {
        await showToolDetails(toolData);
      } catch (error) {
        logger.error('Failed to show tool details', error);
        vscode.window.showErrorMessage('Failed to show tool details');
      }
    })
  );

  // Debug command to test status bar update
  context.subscriptions.push(
    vscode.commands.registerCommand('copilot-mcp.debugStatusBar', async () => {
      try {
        logger.info('=== DEBUG STATUS BAR ===');
        const serverStatus = await mcpManager.getServerStatus();
        logger.info(`Server status from getServerStatus(): ${JSON.stringify(serverStatus, null, 2)}`);
        
        const stats = mcpManager.getStatistics();
        logger.info(`Statistics: ${JSON.stringify(stats, null, 2)}`);
        
        // Force status bar update
        statusBar.updateConnectionCount(context, stats.connectedCount);
        logger.info(`Forced status bar update with count: ${stats.connectedCount}`);
        
        vscode.window.showInformationMessage(`Debug: ${stats.connectedCount} servers should be shown in status bar`);
      } catch (error) {
        logger.error('Debug command failed', error);
        vscode.window.showErrorMessage('Debug command failed');
      }
    })
  );

  // Debug command to test server details directly
  context.subscriptions.push(
    vscode.commands.registerCommand('copilot-mcp.debugServerDetails', async () => {
      try {
        logger.info('=== DEBUG SERVER DETAILS ===');
        const servers = await mcpManager.getServerStatus();
        logger.info(`Found ${servers.length} servers`);
        
        if (servers.length > 0) {
          const firstServer = servers[0];
          logger.info(`Testing server details for: ${JSON.stringify(firstServer, null, 2)}`);
          await showServerDetails(firstServer);
        } else {
          vscode.window.showErrorMessage('No servers found to test');
        }
      } catch (error) {
        logger.error('Debug server details failed', error);
        vscode.window.showErrorMessage('Debug server details failed');
      }
    })
  );

  // Execute tool command (for testing)
  context.subscriptions.push(
    vscode.commands.registerCommand('copilot-mcp.executeTool', async (toolName: string, args: any) => {
      try {
        const toolInfo = await mcpManager.findTool(toolName);
        if (!toolInfo) {
          throw new Error(`Tool '${toolName}' not found`);
        }
        
        const result = await mcpManager.executeTool(toolInfo.serverId, toolName, args);
        return result;
      } catch (error) {
        logger.error('Failed to execute tool', { toolName, error });
        throw error;
      }
    })
  );

  logger.info('Commands registered successfully');
}