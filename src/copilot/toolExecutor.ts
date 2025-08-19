import * as vscode from 'vscode';
import { MCPManager } from '../mcp/manager';
import { ResponseFormatter } from './responseFormatter';
import { Logger } from '../types';

export class ToolExecutor {
  private responseFormatter: ResponseFormatter;

  constructor(
    private mcpManager: MCPManager,
    private logger: Logger
  ) {
    this.responseFormatter = new ResponseFormatter();
  }

  async executeTool(
    toolName: string,
    args: any,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<void> {
    if (token.isCancellationRequested) return;

    try {
      // Show initial progress
      stream.progress(`Looking for tool "${toolName}"...`);

      // Find the tool across all servers
      const toolInfo = await this.mcpManager.findTool(toolName);
      if (!toolInfo) {
        stream.markdown(this.responseFormatter.formatToolNotFound(toolName));
        return;
      }

      if (token.isCancellationRequested) return;

      // Validate arguments against schema
      stream.progress(`Validating arguments for ${toolName}...`);
      const validatedArgs = await this.validateArgs(toolInfo.tool.inputSchema, args);

      if (token.isCancellationRequested) return;

      // Execute the tool
      stream.progress(`Executing ${toolName}...`);
      const startTime = Date.now();
      
      const result = await this.mcpManager.executeTool(
        toolInfo.serverId,
        toolName,
        validatedArgs
      );

      if (token.isCancellationRequested) return;

      const duration = Date.now() - startTime;
      this.logger.info(`Tool execution completed`, {
        tool: toolName,
        serverId: toolInfo.serverId,
        duration,
        success: true
      });

      // Format and stream the result
      await this.streamResult(result, toolName, duration, stream);

    } catch (error) {
      this.logger.error(`Tool execution failed`, {
        tool: toolName,
        error: error.message
      });

      stream.markdown(this.responseFormatter.formatExecutionError(toolName, error as Error));
    }
  }

  private async validateArgs(schema: any, args: any): Promise<any> {
    // Basic schema validation
    if (!schema || schema.type !== 'object') {
      return args;
    }

    const validatedArgs: any = {};
    const errors: string[] = [];

    // Check required properties
    if (schema.required) {
      for (const required of schema.required) {
        if (!(required in args)) {
          errors.push(`Missing required parameter: ${required}`);
        }
      }
    }

    // Validate properties
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties as any)) {
        if (key in args) {
          try {
            validatedArgs[key] = this.validateProperty(args[key], propSchema);
          } catch (error) {
            errors.push(`Invalid value for ${key}: ${error.message}`);
          }
        }
      }
    }

    if (errors.length > 0) {
      throw new Error(`Validation errors: ${errors.join(', ')}`);
    }

    // Include any additional properties that weren't in the schema
    for (const [key, value] of Object.entries(args)) {
      if (!(key in validatedArgs)) {
        validatedArgs[key] = value;
      }
    }

    return validatedArgs;
  }

  private validateProperty(value: any, schema: any): any {
    if (!schema) return value;

    switch (schema.type) {
      case 'string':
        return String(value);
      case 'number':
        const num = Number(value);
        if (isNaN(num)) {
          throw new Error(`Expected number, got ${typeof value}`);
        }
        return num;
      case 'integer':
        const int = parseInt(value);
        if (isNaN(int)) {
          throw new Error(`Expected integer, got ${typeof value}`);
        }
        return int;
      case 'boolean':
        if (typeof value === 'boolean') return value;
        if (value === 'true') return true;
        if (value === 'false') return false;
        throw new Error(`Expected boolean, got ${typeof value}`);
      case 'array':
        if (!Array.isArray(value)) {
          throw new Error(`Expected array, got ${typeof value}`);
        }
        if (schema.items) {
          return value.map(item => this.validateProperty(item, schema.items));
        }
        return value;
      case 'object':
        if (typeof value !== 'object' || value === null) {
          throw new Error(`Expected object, got ${typeof value}`);
        }
        return value;
      default:
        return value;
    }
  }

  private async streamResult(
    result: any,
    toolName: string,
    duration: number,
    stream: vscode.ChatResponseStream
  ): Promise<void> {
    // Add execution summary
    stream.markdown(`\n✅ **${toolName}** executed successfully (${duration}ms)\n\n`);

    if (typeof result === 'string') {
      stream.markdown(result);
    } else if (result && typeof result === 'object') {
      if (result.type === 'text') {
        stream.markdown(result.content || result.text || String(result));
      } else if (result.type === 'code') {
        const language = result.language || 'text';
        const code = result.content || result.code || String(result);
        stream.markdown(`\`\`\`${language}\n${code}\n\`\`\``);
      } else if (result.type === 'image') {
        if (result.url) {
          stream.markdown(`![${result.alt || 'Generated image'}](${result.url})`);
        } else {
          stream.markdown('🖼️ Image generated (not displayable in chat)');
        }
      } else if (result.type === 'table') {
        this.streamTable(result.data || result.rows, stream);
      } else if (result.type === 'error') {
        stream.markdown(`❌ Tool returned error: ${result.message || result.error}`);
      } else if (result.success !== undefined) {
        // Handle success/failure results
        if (result.success) {
          stream.markdown(result.message || result.data || '✅ Operation completed successfully');
        } else {
          stream.markdown(`❌ Operation failed: ${result.error || result.message || 'Unknown error'}`);
        }
      } else {
        // Format as JSON for complex objects
        const formatted = this.formatJsonResult(result);
        stream.markdown(`\`\`\`json\n${formatted}\n\`\`\``);
      }
    } else {
      stream.markdown(String(result));
    }
  }

  private streamTable(data: any[], stream: vscode.ChatResponseStream): void {
    if (!Array.isArray(data) || data.length === 0) {
      stream.markdown('*Empty table*');
      return;
    }

    // Get column headers from first row
    const firstRow = data[0];
    const headers = Object.keys(firstRow);

    // Create markdown table
    let table = '| ' + headers.join(' | ') + ' |\n';
    table += '| ' + headers.map(() => '---').join(' | ') + ' |\n';

    for (const row of data) {
      const values = headers.map(header => {
        const value = row[header];
        return value !== null && value !== undefined ? String(value) : '';
      });
      table += '| ' + values.join(' | ') + ' |\n';
    }

    stream.markdown(table);
  }

  private formatJsonResult(result: any): string {
    try {
      return JSON.stringify(result, null, 2);
    } catch (error) {
      return String(result);
    }
  }

  // Helper method to suggest argument format
  async suggestArguments(toolName: string): Promise<string> {
    const toolInfo = await this.mcpManager.findTool(toolName);
    if (!toolInfo || !toolInfo.tool.inputSchema) {
      return 'No schema available for this tool.';
    }

    const schema = toolInfo.tool.inputSchema;
    if (schema.type !== 'object' || !schema.properties) {
      return 'This tool accepts any arguments.';
    }

    let suggestion = `**${toolName}** accepts these parameters:\n\n`;
    
    for (const [name, propSchema] of Object.entries(schema.properties as any)) {
      const required = schema.required?.includes(name) ? ' *(required)*' : '';
      const type = propSchema.type || 'any';
      const description = propSchema.description || '';
      
      suggestion += `- **${name}** (${type})${required}`;
      if (description) {
        suggestion += `: ${description}`;
      }
      suggestion += '\n';
    }

    suggestion += '\n**Example usage:**\n';
    suggestion += `\`@mcp run ${toolName} param1="value1" param2="value2"\``;

    return suggestion;
  }
}