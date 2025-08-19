# Implementation: Copilot Chat Participant

## Ticket Description
Implement the GitHub Copilot chat participant that will handle MCP-related queries and integrate MCP tools into the Copilot experience.

## Acceptance Criteria
- [ ] Chat participant registered with Copilot
- [ ] Command parsing implemented
- [ ] MCP tool execution integrated
- [ ] Response formatting completed
- [ ] Error handling implemented

## Implementation Details

### 1. Chat Participant Registration (src/copilot/chatParticipant.ts)
```typescript
import * as vscode from 'vscode';
import { MCPManager } from '../mcp/manager';

export class MCPChatParticipant {
  private static readonly PARTICIPANT_ID = 'mcp-bridge';
  
  constructor(
    private context: vscode.ExtensionContext,
    private mcpManager: MCPManager
  ) {}
  
  async register(): Promise<void> {
    const participant = vscode.chat.createChatParticipant(
      MCPChatParticipant.PARTICIPANT_ID,
      this.handleChatRequest.bind(this)
    );
    
    participant.iconPath = vscode.Uri.joinPath(
      this.context.extensionUri, 
      'resources', 
      'mcp-icon.png'
    );
    
    this.context.subscriptions.push(participant);
  }
  
  private async handleChatRequest(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<void> {
    try {
      // Parse the request
      const command = this.parseCommand(request.prompt);
      
      // Execute appropriate action
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
        default:
          await this.handleGeneralQuery(request, context, stream, token);
      }
    } catch (error) {
      stream.markdown(`❌ Error: ${error.message}`);
    }
  }
}
```

### 2. Command Parser (src/copilot/commandParser.ts)
```typescript
export interface ParsedCommand {
  type: 'list-tools' | 'execute-tool' | 'list-servers' | 'general';
  tool?: string;
  args?: any;
  rawQuery: string;
}

export class CommandParser {
  private static readonly COMMAND_PATTERNS = {
    LIST_TOOLS: /^(list|show|what are the) (tools|commands|functions)/i,
    EXECUTE_TOOL: /^(run|execute|use|call) (\w+)(?:\s+with\s+(.+))?/i,
    LIST_SERVERS: /^(list|show) (servers|connections)/i,
  };
  
  static parse(prompt: string): ParsedCommand {
    // Check for tool execution
    const toolMatch = prompt.match(this.COMMAND_PATTERNS.EXECUTE_TOOL);
    if (toolMatch) {
      return {
        type: 'execute-tool',
        tool: toolMatch[2],
        args: this.parseArgs(toolMatch[3]),
        rawQuery: prompt
      };
    }
    
    // Check for list tools
    if (this.COMMAND_PATTERNS.LIST_TOOLS.test(prompt)) {
      return { type: 'list-tools', rawQuery: prompt };
    }
    
    // Check for list servers
    if (this.COMMAND_PATTERNS.LIST_SERVERS.test(prompt)) {
      return { type: 'list-servers', rawQuery: prompt };
    }
    
    return { type: 'general', rawQuery: prompt };
  }
  
  private static parseArgs(argsString?: string): any {
    if (!argsString) return {};
    
    try {
      // Try to parse as JSON first
      return JSON.parse(argsString);
    } catch {
      // Parse as key=value pairs
      const args: any = {};
      const pairs = argsString.match(/(\w+)=(['"]?)([^'"]+)\2/g);
      if (pairs) {
        pairs.forEach(pair => {
          const [key, value] = pair.split('=');
          args[key] = value.replace(/['"]/g, '');
        });
      }
      return args;
    }
  }
}
```

### 3. Tool Execution Handler (src/copilot/toolExecutor.ts)
```typescript
export class ToolExecutor {
  constructor(private mcpManager: MCPManager) {}
  
  async executeTool(
    toolName: string,
    args: any,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<void> {
    // Find the tool across all servers
    const toolInfo = await this.mcpManager.findTool(toolName);
    if (!toolInfo) {
      stream.markdown(`❌ Tool "${toolName}" not found`);
      return;
    }
    
    // Show execution progress
    stream.progress(`Executing ${toolName}...`);
    
    try {
      // Validate arguments
      const validatedArgs = await this.validateArgs(
        toolInfo.tool.inputSchema,
        args
      );
      
      // Execute the tool
      const result = await this.mcpManager.executeTool(
        toolInfo.serverId,
        toolName,
        validatedArgs
      );
      
      // Format and stream the result
      await this.streamResult(result, stream);
      
    } catch (error) {
      stream.markdown(`\n❌ Execution failed: ${error.message}`);
    }
  }
  
  private async streamResult(
    result: any,
    stream: vscode.ChatResponseStream
  ): Promise<void> {
    if (typeof result === 'string') {
      stream.markdown(result);
    } else if (result.type === 'code') {
      stream.markdown(`\`\`\`${result.language || ''}\n${result.content}\n\`\`\``);
    } else if (result.type === 'table') {
      this.streamTable(result.data, stream);
    } else {
      stream.markdown(`\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``);
    }
  }
}
```

### 4. Context Variables Provider (src/copilot/contextProvider.ts)
```typescript
export class MCPContextProvider {
  constructor(private mcpManager: MCPManager) {}
  
  async register(): Promise<void> {
    vscode.chat.registerChatVariableResolver(
      'mcp',
      'Tools and resources from MCP servers',
      this.resolveVariable.bind(this)
    );
  }
  
  private async resolveVariable(
    name: string,
    context: vscode.ChatVariableContext,
    token: vscode.CancellationToken
  ): Promise<vscode.ChatVariableValue[]> {
    // Handle special variables
    if (name === 'tools') {
      return this.getAllTools();
    }
    
    // Check if it's a tool result
    const toolMatch = name.match(/^(\w+)\((.*)\)$/);
    if (toolMatch) {
      const [, toolName, args] = toolMatch;
      const result = await this.mcpManager.executeTool(
        await this.findServer(toolName),
        toolName,
        JSON.parse(args || '{}')
      );
      
      return [{
        level: vscode.ChatVariableLevel.Full,
        value: JSON.stringify(result),
        description: `Result of ${toolName}`
      }];
    }
    
    return [];
  }
}
```

### 5. Response Formatting (src/copilot/responseFormatter.ts)
```typescript
export class ResponseFormatter {
  static formatToolList(tools: MCPTool[]): string {
    const grouped = this.groupByServer(tools);
    let markdown = '## Available MCP Tools\n\n';
    
    for (const [server, serverTools] of Object.entries(grouped)) {
      markdown += `### ${server}\n\n`;
      for (const tool of serverTools) {
        markdown += `- **${tool.name}**: ${tool.description}\n`;
        if (tool.inputSchema.properties) {
          markdown += `  - Parameters: ${Object.keys(tool.inputSchema.properties).join(', ')}\n`;
        }
      }
      markdown += '\n';
    }
    
    return markdown;
  }
  
  static formatError(error: Error): string {
    return `❌ **Error**: ${error.message}\n\n` +
           `\`\`\`\n${error.stack || 'No stack trace available'}\n\`\`\``;
  }
  
  static formatProgress(message: string): string {
    return `⏳ ${message}`;
  }
}
```

## File Structure
```
src/copilot/
├── chatParticipant.ts   # Main chat participant
├── commandParser.ts     # Command parsing logic
├── toolExecutor.ts      # Tool execution handler
├── contextProvider.ts   # Context variable provider
├── responseFormatter.ts # Response formatting
└── types.ts            # Copilot-specific types
```