import * as vscode from 'vscode';
import { MCPManager } from '../mcp/manager';
import { Logger } from '../types';

export class MCPContextProvider {
  constructor(
    private mcpManager: MCPManager,
    private logger: Logger
  ) {}

  async register(): Promise<void> {
    try {
      // Check if chat variable resolver API is available
      const chatApi = (vscode as any).chat;
      if (!chatApi) {
        this.logger.warn('VS Code Chat API not available - context providers disabled');
        return;
      }

      if (typeof chatApi.registerChatVariableResolver !== 'function') {
        this.logger.warn('Chat variable resolver API not available in this VS Code version');
        return;
      }

      // Register the main MCP context variable
      chatApi.registerChatVariableResolver(
        'mcp',
        'Access MCP tools and resources',
        this.resolveMCPVariable.bind(this)
      );

      // Register tool-specific variables
      chatApi.registerChatVariableResolver(
        'mcp-tools',
        'List all available MCP tools',
        this.resolveToolsVariable.bind(this)
      );

      // Register server status variable
      chatApi.registerChatVariableResolver(
        'mcp-servers',
        'Get MCP server connection status',
        this.resolveServersVariable.bind(this)
      );

      this.logger.info('MCP context providers registered successfully');
    } catch (error) {
      this.logger.error('Failed to register context providers', error);
      // Don't throw error - this is not critical for basic MCP functionality
    }
  }

  private async resolveMCPVariable(
    name: string,
    context: any,
    token: vscode.CancellationToken
  ): Promise<any[]> {
    try {
      // Handle different MCP variable formats
      if (name === 'tools') {
        return this.resolveToolsVariable(name, context, token);
      }

      if (name === 'servers') {
        return this.resolveServersVariable(name, context, token);
      }

      // Check if it's a tool execution request: mcp:tool_name(args)
      const toolMatch = name.match(/^(\w+)\((.*)\)$/);
      if (toolMatch) {
        return this.resolveToolExecution(toolMatch[1], toolMatch[2], context, token);
      }

      // Check if it's just a tool name: mcp:tool_name
      const toolInfo = await this.mcpManager.findTool(name);
      if (toolInfo) {
        return this.resolveToolInfo(toolInfo, context, token);
      }

      // Default: return general MCP status
      return this.resolveGeneralStatus(context, token);

    } catch (error) {
      this.logger.error('Error resolving MCP variable', { name, error });
      return [{
        level: 1, // ChatVariableLevel.Short
        value: `Error: ${(error as Error).message}`,
        description: `Failed to resolve MCP variable: ${name}`
      }];
    }
  }

  private async resolveToolsVariable(
    name: string,
    context: any,
    token: vscode.CancellationToken
  ): Promise<any[]> {
    if (token.isCancellationRequested) return [];

    const tools = await this.mcpManager.listTools();
    
    if (tools.length === 0) {
      return [{
        level: 1, // ChatVariableLevel.Short
        value: 'No MCP tools available',
        description: 'No MCP servers connected or no tools configured'
      }];
    }

    const toolsList = tools.map(({serverId, tool}) => 
      `${tool.name} (${serverId}): ${tool.description || 'No description'}`
    ).join('\n');

    return [{
      level: 3, // ChatVariableLevel.Full
      value: `Available MCP Tools:\n${toolsList}`,
      description: `${tools.length} MCP tools available`
    }];
  }

  private async resolveServersVariable(
    name: string,
    context: any,
    token: vscode.CancellationToken
  ): Promise<any[]> {
    if (token.isCancellationRequested) return [];

    const servers = await this.mcpManager.getServerStatus();
    
    if (servers.length === 0) {
      return [{
        level: 1, // ChatVariableLevel.Short
        value: 'No MCP servers configured',
        description: 'Configure MCP servers in VS Code settings'
      }];
    }

    const serverStatus = servers.map(server => 
      `${server.name}: ${server.status} (${server.toolCount || 0} tools)`
    ).join('\n');

    return [{
      level: 2, // ChatVariableLevel.Medium
      value: `MCP Server Status:\n${serverStatus}`,
      description: `${servers.length} MCP servers configured`
    }];
  }

  private async resolveToolExecution(
    toolName: string,
    argsString: string,
    context: any,
    token: vscode.CancellationToken
  ): Promise<any[]> {
    if (token.isCancellationRequested) return [];

    try {
      // Parse arguments
      const args = this.parseArguments(argsString);
      
      // Find and execute the tool
      const toolInfo = await this.mcpManager.findTool(toolName);
      if (!toolInfo) {
        return [{
          level: 1, // ChatVariableLevel.Short
          value: `Tool "${toolName}" not found`,
          description: 'Check available tools with @mcp:tools'
        }];
      }

      const result = await this.mcpManager.executeTool(
        toolInfo.serverId,
        toolName,
        args
      );

      const resultString = typeof result === 'string' 
        ? result 
        : JSON.stringify(result, null, 2);

      return [{
        level: 3, // ChatVariableLevel.Full
        value: resultString,
        description: `Result from ${toolName}`
      }];

    } catch (error) {
      return [{
        level: 1, // ChatVariableLevel.Short
        value: `Execution failed: ${(error as Error).message}`,
        description: `Error executing ${toolName}`
      }];
    }
  }

  private async resolveToolInfo(
    toolInfo: {serverId: string, tool: any},
    context: any,
    token: vscode.CancellationToken
  ): Promise<any[]> {
    if (token.isCancellationRequested) return [];

    const {serverId, tool} = toolInfo;
    let info = `Tool: ${tool.name}\nServer: ${serverId}`;
    
    if (tool.description) {
      info += `\nDescription: ${tool.description}`;
    }

    if (tool.inputSchema?.properties) {
      const params = Object.keys(tool.inputSchema.properties);
      info += `\nParameters: ${params.join(', ')}`;
    }

    return [{
      level: 2, // ChatVariableLevel.Medium
      value: info,
      description: `Information about ${tool.name}`
    }];
  }

  private async resolveGeneralStatus(
    context: any,
    token: vscode.CancellationToken
  ): Promise<any[]> {
    if (token.isCancellationRequested) return [];

    const [tools, servers] = await Promise.all([
      this.mcpManager.listTools(),
      this.mcpManager.getServerStatus()
    ]);

    const connectedServers = servers.filter(s => s.status === 'connected').length;
    const status = `MCP Bridge Status:
- ${servers.length} servers configured
- ${connectedServers} servers connected  
- ${tools.length} tools available`;

    return [{
      level: 2, // ChatVariableLevel.Medium
      value: status,
      description: 'MCP Bridge overview'
    }];
  }

  private parseArguments(argsString: string): any {
    if (!argsString.trim()) {
      return {};
    }

    try {
      // Try JSON first
      if (argsString.startsWith('{') || argsString.startsWith('[')) {
        return JSON.parse(argsString);
      }

      // Parse as key=value pairs
      const args: any = {};
      const pairs = argsString.match(/(\w+)=([^,]+)/g);
      
      if (pairs) {
        pairs.forEach(pair => {
          const [key, value] = pair.split('=');
          args[key.trim()] = this.parseValue(value.trim());
        });
      } else {
        // Single value
        return this.parseValue(argsString);
      }

      return args;
    } catch (error) {
      // Return as string if parsing fails
      return { input: argsString };
    }
  }

  private parseValue(value: string): any {
    // Remove quotes
    value = value.replace(/^["']|["']$/g, '');

    // Boolean
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;

    // Number
    if (/^\d+$/.test(value)) return parseInt(value);
    if (/^\d*\.\d+$/.test(value)) return parseFloat(value);

    // String
    return value;
  }

  // Method to provide context-aware suggestions
  async getContextSuggestions(): Promise<vscode.CompletionItem[]> {
    const suggestions: vscode.CompletionItem[] = [];

    try {
      // Add tool suggestions
      const tools = await this.mcpManager.listTools();
      for (const {tool} of tools) {
        const item = new vscode.CompletionItem(
          `@mcp:${tool.name}`,
          vscode.CompletionItemKind.Function
        );
        item.detail = tool.description || 'MCP Tool';
        item.documentation = `Execute ${tool.name} tool`;
        suggestions.push(item);
      }

      // Add built-in variables
      const builtins = [
        { name: '@mcp:tools', description: 'List all available tools' },
        { name: '@mcp:servers', description: 'Show server status' }
      ];

      for (const builtin of builtins) {
        const item = new vscode.CompletionItem(
          builtin.name,
          vscode.CompletionItemKind.Variable
        );
        item.detail = 'MCP Variable';
        item.documentation = builtin.description;
        suggestions.push(item);
      }

    } catch (error) {
      this.logger.warn('Failed to generate context suggestions', error);
    }

    return suggestions;
  }
}