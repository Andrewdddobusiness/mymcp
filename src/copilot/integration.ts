import * as vscode from 'vscode';
import { MCPManager } from '../mcp/manager';
import { MCPChatParticipant } from './chatParticipant';
import { MCPContextProvider } from './contextProvider';
import { Logger } from '../types';

export class CopilotIntegration {
  private chatParticipant: MCPChatParticipant;
  private contextProvider: MCPContextProvider;

  constructor(
    private context: vscode.ExtensionContext,
    private mcpManager: MCPManager,
    private logger: Logger
  ) {
    this.chatParticipant = new MCPChatParticipant(context, mcpManager, logger);
    this.contextProvider = new MCPContextProvider(mcpManager, logger);
  }

  async register(): Promise<void> {
    try {
      this.logger.info('Registering Copilot integration components...');

      // Check if chat APIs are available
      if (!(vscode.chat as any)) {
        this.logger.warn('VS Code Chat API not available - Copilot chat features disabled');
        // Still register commands for MCP management
        this.registerAdditionalCommands();
        this.setupEventHandlers();
        return;
      }

      // Register chat participant
      await this.chatParticipant.register();

      // Register context providers
      await this.contextProvider.register();

      // Register additional command handlers
      this.registerAdditionalCommands();

      // Set up integration event handlers
      this.setupEventHandlers();

      this.logger.info('Copilot integration registered successfully');
    } catch (error) {
      this.logger.error('Failed to register Copilot integration', error);
      throw error;
    }
  }

  private registerAdditionalCommands(): void {
    // Command to suggest tool usage
    this.context.subscriptions.push(
      vscode.commands.registerCommand('copilot-mcp.suggestTool', async (toolName?: string) => {
        try {
          if (!toolName) {
            // Show quick pick of available tools
            const tools = await this.mcpManager.listTools();
            const items = tools.map(({serverId, tool}) => ({
              label: tool.name,
              description: tool.description || '',
              detail: `Server: ${serverId}`,
              tool: tool
            }));

            const selected = await vscode.window.showQuickPick(items, {
              title: 'Select MCP Tool',
              placeHolder: 'Choose a tool to get usage information'
            });

            if (selected) {
              toolName = selected.tool.name;
            } else {
              return;
            }
          }

          const toolInfo = await this.mcpManager.findTool(toolName);
          if (!toolInfo) {
            vscode.window.showErrorMessage(`Tool "${toolName}" not found`);
            return;
          }

          // Generate usage suggestion
          const suggestion = this.generateToolUsageSuggestion(toolInfo.tool);
          
          // Insert into active chat or show as information
          const chatInput = vscode.window.activeTextEditor;
          if (chatInput) {
            // Try to insert into chat if possible
            await vscode.commands.executeCommand('vscode.open', vscode.Uri.parse('vscode://vscode.chat'));
            // Note: Actual chat insertion would depend on VS Code Chat API
          } else {
            vscode.window.showInformationMessage(suggestion);
          }

        } catch (error) {
          this.logger.error('Failed to suggest tool usage', error);
          vscode.window.showErrorMessage('Failed to generate tool suggestion');
        }
      })
    );

    // Command to open MCP chat
    this.context.subscriptions.push(
      vscode.commands.registerCommand('copilot-mcp.openChat', async () => {
        try {
          // Open VS Code Chat with MCP participant active
          await vscode.commands.executeCommand('workbench.action.chat.open');
          // The user would then type @mcp to access our participant
        } catch (error) {
          this.logger.error('Failed to open chat', error);
          vscode.window.showErrorMessage('Failed to open chat interface');
        }
      })
    );

    // Command to test MCP integration
    this.context.subscriptions.push(
      vscode.commands.registerCommand('copilot-mcp.testIntegration', async () => {
        try {
          const tools = await this.mcpManager.listTools();
          const servers = await this.mcpManager.getServerStatus();
          
          const summary = `MCP Integration Test:
- ${servers.length} servers configured
- ${servers.filter(s => s.status === 'connected').length} servers connected
- ${tools.length} tools available
- Chat participant: ${this.chatParticipant ? '✓' : '✗'}
- Context provider: ${this.contextProvider ? '✓' : '✗'}`;

          vscode.window.showInformationMessage(summary, { modal: true });
        } catch (error) {
          this.logger.error('Integration test failed', error);
          vscode.window.showErrorMessage(`Integration test failed: ${error.message}`);
        }
      })
    );
  }

  private setupEventHandlers(): void {
    // Listen for MCP events and update integration state
    // Note: This would be implemented once MCPManager has proper event emitting

    // Handle configuration changes
    this.context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration(async (e) => {
        if (e.affectsConfiguration('copilot-mcp')) {
          this.logger.info('Configuration changed, updating Copilot integration...');
          // Refresh context providers with new configuration
          try {
            // Re-register context providers if needed
            await this.contextProvider.register();
          } catch (error) {
            this.logger.warn('Failed to update context providers after config change', error);
          }
        }
      })
    );

    // Handle extension context changes
    this.context.subscriptions.push(
      vscode.extensions.onDidChange(() => {
        // Check if GitHub Copilot extension state changed
        const copilotExtension = vscode.extensions.getExtension('github.copilot');
        if (copilotExtension) {
          this.logger.debug('GitHub Copilot extension state changed', {
            active: copilotExtension.isActive
          });
        }
      })
    );
  }

  private generateToolUsageSuggestion(tool: any): string {
    let suggestion = `Use the ${tool.name} tool:\n\n`;
    suggestion += `@mcp run ${tool.name}`;

    if (tool.inputSchema?.properties) {
      const params = Object.entries(tool.inputSchema.properties).map(([name, schema]: [string, any]) => {
        const required = tool.inputSchema.required?.includes(name);
        const type = schema.type || 'string';
        return `${name}="${type === 'string' ? 'value' : type === 'number' ? '123' : 'true'}"${required ? ' (required)' : ''}`;
      });

      if (params.length > 0) {
        suggestion += ` ${params.join(' ')}`;
      }
    }

    if (tool.description) {
      suggestion += `\n\nDescription: ${tool.description}`;
    }

    return suggestion;
  }

  // Method to check Copilot availability
  async checkCopilotAvailability(): Promise<boolean> {
    try {
      const copilotExtension = vscode.extensions.getExtension('github.copilot');
      if (!copilotExtension) {
        this.logger.warn('GitHub Copilot extension not found');
        return false;
      }

      if (!copilotExtension.isActive) {
        this.logger.warn('GitHub Copilot extension not active');
        return false;
      }

      // Check if chat API is available
      if (!vscode.chat) {
        this.logger.warn('VS Code Chat API not available');
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error('Error checking Copilot availability', error);
      return false;
    }
  }

  // Method to provide integration status
  async getIntegrationStatus(): Promise<{
    copilotAvailable: boolean;
    chatParticipantRegistered: boolean;
    contextProvidersRegistered: boolean;
    toolCount: number;
    serverCount: number;
  }> {
    const copilotAvailable = await this.checkCopilotAvailability();
    const tools = await this.mcpManager.listTools();
    const servers = await this.mcpManager.getServerStatus();

    return {
      copilotAvailable,
      chatParticipantRegistered: !!this.chatParticipant,
      contextProvidersRegistered: !!this.contextProvider,
      toolCount: tools.length,
      serverCount: servers.length
    };
  }

  // Cleanup method
  dispose(): void {
    // Cleanup is handled by VS Code extension context subscriptions
    this.logger.info('Copilot integration disposed');
  }
}