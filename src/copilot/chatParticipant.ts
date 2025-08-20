import * as vscode from 'vscode';
import { MCPManager } from '../mcp/manager';
import { CommandParser } from './commandParser';
import { ToolExecutor } from './toolExecutor';
import { ResponseFormatter } from './responseFormatter';
import { Logger } from '../types';

export class MCPChatParticipant {
  private static readonly PARTICIPANT_ID = 'mcp-bridge';
  private commandParser: CommandParser;
  private toolExecutor: ToolExecutor;
  private responseFormatter: ResponseFormatter;

  constructor(
    private context: vscode.ExtensionContext,
    private mcpManager: MCPManager,
    private logger: Logger
  ) {
    this.commandParser = new CommandParser();
    this.toolExecutor = new ToolExecutor(mcpManager, logger);
    this.responseFormatter = new ResponseFormatter();
  }

  async register(): Promise<void> {
    try {
      // Check if chat participant API is available
      const chatApi = (vscode.chat as any);
      if (!chatApi || !chatApi.createChatParticipant) {
        this.logger.warn('Chat participant API not available in this VS Code version');
        return;
      }

      const participant = chatApi.createChatParticipant(
        MCPChatParticipant.PARTICIPANT_ID,
        this.handleChatRequest.bind(this)
      );

      participant.iconPath = vscode.Uri.joinPath(
        this.context.extensionUri,
        'resources',
        'mcp-icon.png'
      );

      participant.followupProvider = {
        provideFollowups: async (result, context, token) => {
          return this.provideFollowups(result, context, token);
        }
      };

      this.context.subscriptions.push(participant);
      this.logger.info('MCP chat participant registered successfully');
    } catch (error) {
      this.logger.error('Failed to register chat participant', error);
      throw error;
    }
  }

  private async handleChatRequest(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<void> {
    try {
      this.logger.debug('Handling chat request', { prompt: request.prompt });

      // Parse the user's request
      const command = this.commandParser.parse(request.prompt);
      
      // Handle different command types
      switch (command.type) {
        case 'list-tools':
          await this.handleListTools(stream, token);
          break;
        case 'execute-tool':
          await this.handleExecuteTool(command, stream, token);
          break;
        case 'list-servers':
          await this.handleListServers(stream, token);
          break;
        case 'help':
          await this.handleHelp(stream, token);
          break;
        default:
          await this.handleGeneralQuery(request, context, stream, token);
      }
    } catch (error) {
      this.logger.error('Error handling chat request', error);
      stream.markdown(this.responseFormatter.formatError(error as Error));
    }
  }

  private async handleListTools(
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<void> {
    if (token.isCancellationRequested) return;

    stream.progress('Discovering available tools...');
    
    const tools = await this.mcpManager.listTools();
    const markdown = this.responseFormatter.formatToolList(tools);
    
    stream.markdown(markdown);
  }

  private async handleExecuteTool(
    command: any,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<void> {
    if (token.isCancellationRequested) return;

    await this.toolExecutor.executeTool(
      command.tool,
      command.args || {},
      stream,
      token
    );
  }

  private async handleListServers(
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<void> {
    if (token.isCancellationRequested) return;

    stream.progress('Checking server status...');
    
    const servers = await this.mcpManager.getServerStatus();
    const markdown = this.responseFormatter.formatServerList(servers);
    
    stream.markdown(markdown);
  }

  private async handleHelp(
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<void> {
    if (token.isCancellationRequested) return;

    const helpText = this.responseFormatter.formatHelp();
    stream.markdown(helpText);
  }

  private async handleGeneralQuery(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<void> {
    if (token.isCancellationRequested) return;

    // For general queries, try to find relevant tools or provide guidance
    stream.markdown(
      "I can help you interact with MCP servers. Try:\n\n" +
      "- `@mcp list tools` - Show available tools\n" +
      "- `@mcp run <tool-name>` - Execute a specific tool\n" +
      "- `@mcp servers` - Show server status\n" +
      "- `@mcp help` - Show detailed help\n\n" +
      "What would you like to do?"
    );
  }

  private async provideFollowups(
    result: vscode.ChatResult,
    context: vscode.ChatContext,
    token: vscode.CancellationToken
  ): Promise<vscode.ChatFollowup[]> {
    const followups: vscode.ChatFollowup[] = [
      {
        prompt: '@mcp list tools',
        label: '🔧 List available tools',
        command: 'copilot-mcp.listTools'
      },
      {
        prompt: '@mcp servers',
        label: '🔌 Show server status',
        command: 'copilot-mcp.showStatus'
      }
    ];

    // Add dynamic followups based on available tools
    try {
      const tools = await this.mcpManager.listTools();
      const popularTools = tools.slice(0, 3); // Show top 3 tools
      
      for (const toolInfo of popularTools) {
        followups.push({
          prompt: `@mcp run ${toolInfo.tool.name}`,
          label: `⚡ Run ${toolInfo.tool.name}`,
          command: 'copilot-mcp.executeTool'
        });
      }
    } catch (error) {
      this.logger.warn('Failed to generate dynamic followups', error);
    }

    return followups;
  }
}