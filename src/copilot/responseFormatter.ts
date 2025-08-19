import { MCPTool, ServerListItem } from '../types';

export class ResponseFormatter {
  formatToolList(tools: Array<{serverId: string, tool: MCPTool}>): string {
    if (tools.length === 0) {
      return '🔧 **No MCP tools available**\n\n' +
             'Make sure you have MCP servers configured and connected.\n' +
             'Use `@mcp servers` to check server status.';
    }

    const grouped = this.groupToolsByServer(tools);
    let markdown = '🔧 **Available MCP Tools**\n\n';

    for (const [serverId, serverTools] of Object.entries(grouped)) {
      markdown += `### 🔌 ${serverId}\n\n`;
      
      for (const {tool} of serverTools) {
        markdown += `**${tool.name}**`;
        if (tool.description) {
          markdown += ` - ${tool.description}`;
        }
        markdown += '\n';

        // Show parameter info if available
        if (tool.inputSchema?.properties) {
          const params = Object.keys(tool.inputSchema.properties);
          if (params.length > 0) {
            markdown += `  *Parameters: ${params.join(', ')}*\n`;
          }
        }
        markdown += '\n';
      }
    }

    markdown += '\n💡 **Usage:** `@mcp run <tool-name> [arguments]`\n';
    markdown += 'Example: `@mcp run weather city="San Francisco"`';

    return markdown;
  }

  formatServerList(servers: ServerListItem[]): string {
    if (servers.length === 0) {
      return '🔌 **No MCP servers configured**\n\n' +
             'Configure servers in VS Code settings under "Copilot MCP: Servers"';
    }

    let markdown = '🔌 **MCP Server Status**\n\n';

    for (const server of servers) {
      const statusIcon = this.getStatusIcon(server.status);
      markdown += `${statusIcon} **${server.name}** (${server.transport})\n`;
      markdown += `   Status: ${server.status}\n`;
      
      if (server.toolCount !== undefined) {
        markdown += `   Tools: ${server.toolCount}\n`;
      }
      
      if (server.lastConnected) {
        markdown += `   Last connected: ${server.lastConnected.toLocaleString()}\n`;
      }
      
      markdown += '\n';
    }

    return markdown;
  }

  formatToolNotFound(toolName: string): string {
    return `❌ **Tool "${toolName}" not found**\n\n` +
           'Available options:\n' +
           '• Use `@mcp list tools` to see all available tools\n' +
           '• Check if the MCP server is connected with `@mcp servers`\n' +
           '• Verify the tool name spelling';
  }

  formatExecutionError(toolName: string, error: Error): string {
    return `❌ **Failed to execute "${toolName}"**\n\n` +
           `**Error:** ${error.message}\n\n` +
           '**Possible solutions:**\n' +
           '• Check if all required parameters are provided\n' +
           '• Verify parameter types and format\n' +
           '• Ensure the MCP server is connected\n' +
           `• Use \`@mcp run ${toolName} help\` for parameter information`;
  }

  formatError(error: Error): string {
    return `❌ **Error:** ${error.message}\n\n` +
           'Please try again or contact support if the issue persists.';
  }

  formatHelp(): string {
    return `🤖 **MCP Bridge Help**\n\n` +
           '**Available Commands:**\n\n' +
           '• `@mcp list tools` - Show all available MCP tools\n' +
           '• `@mcp run <tool> [args]` - Execute a specific tool\n' +
           '• `@mcp servers` - Show MCP server connection status\n' +
           '• `@mcp help` - Show this help message\n\n' +
           '**Tool Execution Examples:**\n\n' +
           '• `@mcp run weather city="New York"`\n' +
           '• `@mcp run file_search pattern="*.js"`\n' +
           '• `@mcp run database_query sql="SELECT * FROM users"`\n\n' +
           '**Argument Formats:**\n\n' +
           '• Key-value pairs: `key="value" number=42 flag=true`\n' +
           '• JSON object: `{"key": "value", "number": 42}`\n' +
           '• Simple values: `"simple string"` or `42`\n\n' +
           '**Tips:**\n\n' +
           '• Use quotes around values with spaces\n' +
           '• Boolean values: `true`, `false`\n' +
           '• Arrays: `[1, 2, 3]` or `item1,item2,item3`\n' +
           '• Check tool parameters with `@mcp list tools`';
  }

  private groupToolsByServer(tools: Array<{serverId: string, tool: MCPTool}>): Record<string, Array<{serverId: string, tool: MCPTool}>> {
    const grouped: Record<string, Array<{serverId: string, tool: MCPTool}>> = {};
    
    for (const toolInfo of tools) {
      if (!grouped[toolInfo.serverId]) {
        grouped[toolInfo.serverId] = [];
      }
      grouped[toolInfo.serverId].push(toolInfo);
    }
    
    return grouped;
  }

  private getStatusIcon(status: string): string {
    switch (status) {
      case 'connected':
        return '🟢';
      case 'connecting':
        return '🟡';
      case 'disconnected':
        return '🔴';
      case 'error':
        return '❌';
      default:
        return '⚪';
    }
  }

  // Format different types of tool results
  formatToolResult(result: any, toolName: string): string {
    if (!result) {
      return `✅ **${toolName}** completed successfully (no output)`;
    }

    if (typeof result === 'string') {
      return result;
    }

    if (typeof result === 'object') {
      // Handle common result formats
      if (result.type === 'success' || result.success === true) {
        const message = result.message || result.data || 'Operation completed successfully';
        return `✅ **${toolName}:** ${message}`;
      }

      if (result.type === 'error' || result.success === false) {
        const message = result.message || result.error || 'Operation failed';
        return `❌ **${toolName}:** ${message}`;
      }

      // Format as structured data
      return this.formatStructuredData(result);
    }

    return String(result);
  }

  private formatStructuredData(data: any): string {
    try {
      // Handle arrays
      if (Array.isArray(data)) {
        if (data.length === 0) {
          return '*Empty list*';
        }

        // If array of objects with consistent structure, format as table
        if (data.every(item => typeof item === 'object' && item !== null)) {
          return this.formatAsTable(data);
        }

        // Otherwise format as list
        return data.map((item, index) => `${index + 1}. ${this.formatStructuredData(item)}`).join('\n');
      }

      // Handle objects
      if (typeof data === 'object' && data !== null) {
        const entries = Object.entries(data);
        if (entries.length === 0) {
          return '*Empty object*';
        }

        return entries.map(([key, value]) => {
          const formattedValue = typeof value === 'object' 
            ? this.formatStructuredData(value)
            : String(value);
          return `**${key}:** ${formattedValue}`;
        }).join('\n');
      }

      return String(data);
    } catch (error) {
      return `*Error formatting data: ${error.message}*`;
    }
  }

  private formatAsTable(data: any[]): string {
    if (data.length === 0) return '*Empty table*';

    const firstItem = data[0];
    const headers = Object.keys(firstItem);

    let table = '| ' + headers.join(' | ') + ' |\n';
    table += '| ' + headers.map(() => '---').join(' | ') + ' |\n';

    for (const item of data) {
      const row = headers.map(header => {
        const value = item[header];
        return value !== null && value !== undefined ? String(value) : '';
      });
      table += '| ' + row.join(' | ') + ' |\n';
    }

    return table;
  }
}