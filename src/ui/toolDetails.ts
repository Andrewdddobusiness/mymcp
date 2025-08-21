import * as vscode from 'vscode';
import { MCPTool, JSONSchema } from '../mcp/types/protocol';
import { info as logInfo, error as logError } from '../utils/logger';

// Show tool details in a webview
export async function showToolDetails(toolData: { serverId: string; tool: MCPTool }): Promise<void> {
  const { serverId, tool } = toolData;
  
  logInfo(`Showing details for tool: ${tool.name} from server: ${serverId}`);

  // Create and show webview panel
  const panel = vscode.window.createWebviewPanel(
    'mcpToolDetails',
    `MCP Tool: ${tool.name}`,
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true
    }
  );

  // Set webview content
  panel.webview.html = generateToolDetailsHTML(serverId, tool);

  // Handle webview messages (for future interactivity)
  panel.webview.onDidReceiveMessage(
    message => {
      switch (message.command) {
        case 'copyJson':
          vscode.env.clipboard.writeText(message.data);
          vscode.window.showInformationMessage('JSON copied to clipboard');
          break;
      }
    }
  );
}

// Show tool details in a quick pick (alternative lighter view)
export async function showToolDetailsQuickPick(toolData: { serverId: string; tool: MCPTool }): Promise<void> {
  const { serverId, tool } = toolData;

  const items: vscode.QuickPickItem[] = [
    {
      label: `$(symbol-method) ${tool.name}`,
      description: 'Tool Name',
      detail: tool.description
    },
    {
      label: `$(server) ${serverId}`,
      description: 'Server ID',
      detail: 'The MCP server providing this tool'
    },
    {
      label: '$(code) Input Schema',
      description: 'View input parameters',
      detail: formatSchemaPreview(tool.inputSchema)
    }
  ];

  if (tool.outputSchema) {
    items.push({
      label: '$(output) Output Schema',
      description: 'View output format',
      detail: formatSchemaPreview(tool.outputSchema)
    });
  }

  items.push(
    {
      label: '$(copy) Copy Input Schema',
      description: 'Copy to clipboard',
      detail: 'Copy the JSON schema for input parameters'
    },
    {
      label: '$(json) View Raw JSON',
      description: 'Show complete tool definition',
      detail: 'View all tool metadata in JSON format'
    }
  );

  const selected = await vscode.window.showQuickPick(items, {
    title: `MCP Tool Details: ${tool.name}`,
    placeHolder: 'Select an option to view details'
  });

  if (!selected) {
    return;
  }

  // Handle selection
  switch (selected.label) {
    case '$(code) Input Schema':
      await showSchemaDocument(tool.inputSchema, `${tool.name} - Input Schema`);
      break;
    case '$(output) Output Schema':
      if (tool.outputSchema) {
        await showSchemaDocument(tool.outputSchema, `${tool.name} - Output Schema`);
      }
      break;
    case '$(copy) Copy Input Schema':
      await vscode.env.clipboard.writeText(JSON.stringify(tool.inputSchema, null, 2));
      vscode.window.showInformationMessage('Input schema copied to clipboard');
      break;
    case '$(json) View Raw JSON':
      await showToolJSON(serverId, tool);
      break;
  }
}

// Generate HTML content for tool details webview
function generateToolDetailsHTML(serverId: string, tool: MCPTool): string {
  const inputSchemaJson = JSON.stringify(tool.inputSchema, null, 2);
  const outputSchemaJson = tool.outputSchema ? JSON.stringify(tool.outputSchema, null, 2) : null;
  const toolJson = JSON.stringify({ serverId, tool }, null, 2);

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MCP Tool Details</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        .header {
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 16px;
            margin-bottom: 24px;
        }
        .tool-name {
            font-size: 24px;
            font-weight: 600;
            color: var(--vscode-symbolIcon-functionForeground);
            margin-bottom: 8px;
        }
        .server-info {
            color: var(--vscode-descriptionForeground);
            font-size: 14px;
        }
        .description {
            margin: 16px 0;
            padding: 12px;
            background-color: var(--vscode-textBlockQuote-background);
            border-left: 4px solid var(--vscode-textBlockQuote-border);
        }
        .section {
            margin: 24px 0;
        }
        .section-title {
            font-size: 18px;
            font-weight: 500;
            margin-bottom: 12px;
            color: var(--vscode-symbolIcon-classForeground);
        }
        .schema-container {
            position: relative;
        }
        .schema-code {
            background-color: var(--vscode-textCodeBlock-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 16px;
            font-family: var(--vscode-editor-font-family);
            font-size: 13px;
            overflow-x: auto;
            white-space: pre;
        }
        .copy-button {
            position: absolute;
            top: 8px;
            right: 8px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            padding: 6px 12px;
            cursor: pointer;
            font-size: 12px;
        }
        .copy-button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .parameters {
            margin: 12px 0;
        }
        .parameter {
            margin: 8px 0;
            padding: 8px 12px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 4px;
        }
        .parameter-name {
            font-weight: 500;
            color: var(--vscode-symbolIcon-variableForeground);
        }
        .parameter-type {
            color: var(--vscode-symbolIcon-typeParameterForeground);
            font-size: 12px;
        }
        .parameter-description {
            color: var(--vscode-descriptionForeground);
            margin-top: 4px;
        }
        .required {
            color: var(--vscode-errorForeground);
            font-size: 11px;
            font-weight: 600;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="tool-name">${escapeHtml(tool.name)}</div>
        <div class="server-info">Server: ${escapeHtml(serverId)}</div>
    </div>

    ${tool.description ? `<div class="description">${escapeHtml(tool.description)}</div>` : ''}

    <div class="section">
        <div class="section-title">Input Parameters</div>
        ${generateParametersList(tool.inputSchema)}
        <div class="schema-container">
            <button class="copy-button" onclick="copyToClipboard('inputSchema')">Copy Schema</button>
            <div class="schema-code" id="inputSchema">${escapeHtml(inputSchemaJson)}</div>
        </div>
    </div>

    ${outputSchemaJson ? `
    <div class="section">
        <div class="section-title">Output Schema</div>
        <div class="schema-container">
            <button class="copy-button" onclick="copyToClipboard('outputSchema')">Copy Schema</button>
            <div class="schema-code" id="outputSchema">${escapeHtml(outputSchemaJson)}</div>
        </div>
    </div>
    ` : ''}

    <div class="section">
        <div class="section-title">Complete Tool Definition</div>
        <div class="schema-container">
            <button class="copy-button" onclick="copyToClipboard('toolJson')">Copy JSON</button>
            <div class="schema-code" id="toolJson">${escapeHtml(toolJson)}</div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        function copyToClipboard(elementId) {
            const element = document.getElementById(elementId);
            const text = element.textContent;
            vscode.postMessage({
                command: 'copyJson',
                data: text
            });
        }
    </script>
</body>
</html>`;
}

// Generate parameters list from JSON schema
function generateParametersList(schema: JSONSchema): string {
  if (!schema.properties) {
    return '<div class="parameter">No parameters</div>';
  }

  const required = schema.required || [];
  let html = '<div class="parameters">';

  for (const [paramName, paramSchema] of Object.entries(schema.properties)) {
    const isRequired = required.includes(paramName);
    html += `
      <div class="parameter">
        <div class="parameter-name">
          ${escapeHtml(paramName)}
          ${isRequired ? '<span class="required"> (required)</span>' : ''}
        </div>
        <div class="parameter-type">Type: ${escapeHtml(paramSchema.type || 'any')}</div>
        ${paramSchema.description ? `<div class="parameter-description">${escapeHtml(paramSchema.description)}</div>` : ''}
      </div>
    `;
  }

  html += '</div>';
  return html;
}

// Show schema in a new document
async function showSchemaDocument(schema: JSONSchema, title: string): Promise<void> {
  const document = await vscode.workspace.openTextDocument({
    content: JSON.stringify(schema, null, 2),
    language: 'json'
  });
  
  await vscode.window.showTextDocument(document, {
    preview: true,
    viewColumn: vscode.ViewColumn.Beside
  });
}

// Show complete tool JSON in a document
async function showToolJSON(serverId: string, tool: MCPTool): Promise<void> {
  const toolData = { serverId, tool };
  const document = await vscode.workspace.openTextDocument({
    content: JSON.stringify(toolData, null, 2),
    language: 'json'
  });
  
  await vscode.window.showTextDocument(document, {
    preview: true,
    viewColumn: vscode.ViewColumn.Beside
  });
}

// Format schema for preview in quick pick
function formatSchemaPreview(schema: JSONSchema): string {
  if (!schema.properties) {
    return `Type: ${schema.type || 'any'}`;
  }

  const paramCount = Object.keys(schema.properties).length;
  const required = schema.required || [];
  
  return `${paramCount} parameter${paramCount !== 1 ? 's' : ''}, ${required.length} required`;
}

// Escape HTML to prevent XSS
function escapeHtml(text: string): string {
  const map: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  
  return text.replace(/[&<>"']/g, m => map[m]);
}