import * as vscode from 'vscode';
import { MCPManager } from './mcp/manager';
import { CopilotIntegration } from './copilot/integration';
import * as configStorage from './config/storage';
import * as statusBar from './ui/statusBar';
import * as logger from './utils/logger';

let mcpManager: MCPManager;
let copilotIntegration: CopilotIntegration;

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
    await copilotIntegration.register();
    statusBar.show(context);

    // Set up configuration change listener
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration(async (e) => {
        if (e.affectsConfiguration('copilot-mcp.servers')) {
          logger.info('Server configuration changed, reloading...');
          await mcpManager.reloadServers();
        }
      })
    );

    logger.info('Copilot MCP Bridge activated successfully');
  } catch (error) {
    logger.error('Failed to activate extension', error);
    vscode.window.showErrorMessage(
      `Failed to activate Copilot MCP Bridge: ${error.message}`
    );
    throw error;
  }
}

export async function deactivate(): Promise<void> {
  logger.info('Copilot MCP Bridge is deactivating...');

  try {
    if (mcpManager) {
      await mcpManager.dispose();
    }
    statusBar.dispose();
    
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
        const servers = await mcpManager.getServerStatus();
        const items = servers.map(server => ({
          label: server.name,
          description: server.status,
          detail: `${server.toolCount || 0} tools available`
        }));
        
        if (items.length === 0) {
          vscode.window.showInformationMessage('No MCP servers configured');
          return;
        }
        
        await vscode.window.showQuickPick(items, {
          title: 'MCP Server Status',
          placeHolder: 'Select a server to view details'
        });
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
        vscode.window.showInformationMessage('MCP connections refreshed');
      } catch (error) {
        logger.error('Failed to refresh connections', error);
        vscode.window.showErrorMessage('Failed to refresh MCP connections');
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