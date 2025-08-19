import { ParsedCommand } from '../types';

export class CommandParser {
  private static readonly COMMAND_PATTERNS = {
    LIST_TOOLS: /^(list|show|what are the|get) (tools|commands|functions|available)/i,
    EXECUTE_TOOL: /^(run|execute|use|call|invoke)\s+(\w+)(?:\s+with\s+(.+))?/i,
    LIST_SERVERS: /^(list|show|check|get) (servers|connections|status)/i,
    HELP: /^(help|how|what can|usage|commands)/i,
  };

  parse(prompt: string): ParsedCommand {
    const trimmedPrompt = prompt.trim();

    // Check for tool execution first (most specific)
    const toolMatch = trimmedPrompt.match(CommandParser.COMMAND_PATTERNS.EXECUTE_TOOL);
    if (toolMatch) {
      return {
        type: 'execute-tool',
        tool: toolMatch[2],
        args: this.parseArgs(toolMatch[3]),
        rawQuery: prompt
      };
    }

    // Check for list tools
    if (CommandParser.COMMAND_PATTERNS.LIST_TOOLS.test(trimmedPrompt)) {
      return { type: 'list-tools', rawQuery: prompt };
    }

    // Check for list servers
    if (CommandParser.COMMAND_PATTERNS.LIST_SERVERS.test(trimmedPrompt)) {
      return { type: 'list-servers', rawQuery: prompt };
    }

    // Check for help
    if (CommandParser.COMMAND_PATTERNS.HELP.test(trimmedPrompt)) {
      return { type: 'help', rawQuery: prompt };
    }

    // Default to general query
    return { type: 'general', rawQuery: prompt };
  }

  private parseArgs(argsString?: string): any {
    if (!argsString) {
      return {};
    }

    try {
      // Try to parse as JSON first
      if (argsString.startsWith('{') || argsString.startsWith('[')) {
        return JSON.parse(argsString);
      }

      // Parse as key=value pairs
      const args: any = {};
      
      // Handle quoted values: key="value with spaces"
      const quotedPairs = argsString.match(/(\w+)=["']([^"']+)["']/g);
      if (quotedPairs) {
        quotedPairs.forEach(pair => {
          const [key, value] = pair.split('=');
          args[key] = value.replace(/^["']|["']$/g, '');
        });
        
        // Remove processed pairs
        quotedPairs.forEach(pair => {
          argsString = argsString.replace(pair, '');
        });
      }

      // Handle unquoted pairs: key=value
      const unquotedPairs = argsString.match(/(\w+)=([^\s]+)/g);
      if (unquotedPairs) {
        unquotedPairs.forEach(pair => {
          const [key, value] = pair.split('=');
          if (!args[key]) { // Don't override quoted values
            args[key] = this.parseValue(value);
          }
        });
      }

      // If no key=value pairs found, treat as positional arguments
      if (Object.keys(args).length === 0) {
        const tokens = this.tokenize(argsString);
        if (tokens.length === 1) {
          // Single argument - try to determine type
          return this.parseValue(tokens[0]);
        } else if (tokens.length > 1) {
          // Multiple arguments - return as array
          return tokens.map(token => this.parseValue(token));
        }
      }

      return args;
    } catch (error) {
      // If parsing fails, return the raw string
      return { input: argsString };
    }
  }

  private tokenize(input: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';

    for (let i = 0; i < input.length; i++) {
      const char = input[i];

      if ((char === '"' || char === "'") && !inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (char === quoteChar && inQuotes) {
        inQuotes = false;
        quoteChar = '';
      } else if (char === ' ' && !inQuotes) {
        if (current.trim()) {
          tokens.push(current.trim());
          current = '';
        }
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      tokens.push(current.trim());
    }

    return tokens;
  }

  private parseValue(value: string): any {
    if (!value) return value;

    // Boolean values
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;

    // Null/undefined
    if (value.toLowerCase() === 'null') return null;
    if (value.toLowerCase() === 'undefined') return undefined;

    // Numbers
    if (/^-?\d+$/.test(value)) {
      return parseInt(value, 10);
    }
    if (/^-?\d*\.\d+$/.test(value)) {
      return parseFloat(value);
    }

    // Arrays (comma-separated)
    if (value.includes(',') && !value.includes('=')) {
      return value.split(',').map(item => this.parseValue(item.trim()));
    }

    // Default to string
    return value;
  }

  // Helper method to extract tool name from natural language
  extractToolName(prompt: string): string | null {
    // Look for patterns like "use the weather tool" or "run file_search"
    const patterns = [
      /(?:run|use|execute|call)\s+(?:the\s+)?(\w+)(?:\s+tool)?/i,
      /(\w+)\s+tool/i,
      /with\s+(\w+)/i
    ];

    for (const pattern of patterns) {
      const match = prompt.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  // Helper method to detect intent from context
  detectIntent(prompt: string, availableTools: string[]): ParsedCommand {
    const lowerPrompt = prompt.toLowerCase();

    // Check if prompt mentions any available tools
    for (const tool of availableTools) {
      if (lowerPrompt.includes(tool.toLowerCase())) {
        return {
          type: 'execute-tool',
          tool: tool,
          args: {},
          rawQuery: prompt
        };
      }
    }

    // Use standard parsing
    return this.parse(prompt);
  }
}