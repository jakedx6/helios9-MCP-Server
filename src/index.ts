#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import dotenv from 'dotenv'
import { logger } from './lib/logger.js'
import { authManager } from './lib/auth.js'
import { projectTools, projectHandlers } from './tools/projects.js'
import { taskTools, taskHandlers } from './tools/tasks.js'
import { documentTools, documentHandlers } from './tools/documents.js'
import { conversationTools, conversationHandlers } from './tools/ai-conversations.js'
import { contextAggregationTools, contextAggregationHandlers } from './tools/context-aggregation.js'
import { workflowAutomationTools, workflowAutomationHandlers } from './tools/workflow-automation.js'
import { intelligentSearchTools, intelligentSearchHandlers } from './tools/intelligent-search.js'
import { analyticsInsightsTools, analyticsInsightsHandlers } from './tools/analytics-insights.js'
import { initiativeTools, initiativeHandlers } from './tools/initiatives.js'
import { helios9Prompts, promptHandlers } from './prompts/helios9-prompts.js'
import { debugTools, debugHandlers } from './tools/debug.js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// Get version from package.json
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const packageJson = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'))

// Constants
const HELIOS_VERSION = packageJson.version
const MCP_PROTOCOL_VERSION = '2024-11-05'

// Load environment variables (only if .env file exists)
// MCP clients pass env vars directly, so .env is optional
dotenv.config()

// Parse CLI arguments
function parseArgs() {
  const args = process.argv.slice(2)
  const options: { apiKey?: string; apiUrl?: string } = {}
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--api-key' && i + 1 < args.length) {
      options.apiKey = args[++i]
    } else if (args[i] === '--api-url' && i + 1 < args.length) {
      options.apiUrl = args[++i]
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Helios-9 MCP Server v${HELIOS_VERSION}

Usage: npx helios9-mcp-server@latest --api-key YOUR_KEY [options]

Options:
  --api-key <key>    Helios-9 API key (required)
  --api-url <url>    Helios-9 API URL (optional, defaults to production)
  --help, -h         Show this help message

Environment variables:
  HELIOS_API_KEY     Alternative to --api-key
  HELIOS_API_URL     Alternative to --api-url

Example:
  npx -y helios9-mcp-server@latest --api-key hel9_your_api_key_here
`)
      process.exit(0)
    }
  }
  
  return options
}

// Parse CLI arguments
const cliOptions = parseArgs()

// Override environment variables with CLI arguments if provided
if (cliOptions.apiKey) {
  process.env.HELIOS_API_KEY = cliOptions.apiKey
}
if (cliOptions.apiUrl) {
  process.env.HELIOS_API_URL = cliOptions.apiUrl
}

// Debug: Log environment variable status
const hasHeliosUrl = !!process.env.HELIOS_API_URL
const hasHeliosKey = !!process.env.HELIOS_API_KEY
logger.info('Environment variables status', { 
  HELIOS_API_URL: hasHeliosUrl ? 'Set' : 'Missing',
  HELIOS_API_KEY: hasHeliosKey ? 'Set' : 'Missing',
  NODE_ENV: process.env.NODE_ENV || 'not set'
})

class HeliosMCPServer {
  private server: Server
  private readonly allTools: any[]
  private readonly allHandlers: Record<string, Function>

  constructor() {
    // Initialize server
    this.server = new Server(
      {
        name: 'helios9-mcp',
        version: HELIOS_VERSION,
      },
      {
        capabilities: {
          tools: {
            listChanged: false, // Tools don't change dynamically
          },
          resources: {
            subscribe: false,
            listChanged: false,
          },
          prompts: {
            listChanged: false,
          },
        },
      }
    )

    // Combine all tools and handlers
    this.allTools = [
      ...Object.values(projectTools),
      ...Object.values(taskTools),
      ...Object.values(documentTools),
      ...Object.values(conversationTools),
      ...Object.values(contextAggregationTools),
      ...Object.values(workflowAutomationTools),
      ...Object.values(intelligentSearchTools),
      ...Object.values(analyticsInsightsTools),
      ...Object.values(initiativeTools),
      ...Object.values(debugTools),
    ]

    this.allHandlers = {
      ...projectHandlers,
      ...taskHandlers,
      ...documentHandlers,
      ...conversationHandlers,
      ...contextAggregationHandlers,
      ...workflowAutomationHandlers,
      ...intelligentSearchHandlers,
      ...analyticsInsightsHandlers,
      ...initiativeHandlers,
      ...debugHandlers,
    }

    this.setupHandlers()
    logger.info('Helios-9 MCP Server initialized', { 
      version: HELIOS_VERSION,
      protocol_version: MCP_PROTOCOL_VERSION,
      tools_count: this.allTools.length
    })
  }

  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      logger.debug('Listing available tools')
      return {
        tools: this.allTools.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      }
    })

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params
      
      logger.info('Tool call received', { tool: name, args: Object.keys(args || {}) })

      try {
        // Ensure authenticated before any API calls
        await authManager.ensureAuthenticated()
        // Check if tool exists
        if (!this.allHandlers[name]) {
          throw new Error(`Unknown tool: ${name}`)
        }

        // Call the tool handler
        const result = await this.allHandlers[name](args || {})
        
        logger.info('Tool call completed successfully', { tool: name })
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.error('Tool call failed', { tool: name, error: errorMessage })
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: error instanceof Error ? error.message : String(error),
                tool: name,
                timestamp: new Date().toISOString(),
              }, null, 2),
            },
          ],
          isError: true,
        }
      }
    })

    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      logger.debug('Listing available resources')
      
      return {
        resources: [
          // Project Resources
          {
            uri: 'helios9://projects',
            name: 'All Projects',
            description: 'List of all user projects',
            mimeType: 'application/json',
          },
          {
            uri: 'helios9://project/{project_id}/context',
            name: 'Project Context',
            description: 'Comprehensive project context for AI agents',
            mimeType: 'application/json',
          },
          {
            uri: 'helios9://project/{project_id}/health',
            name: 'Project Health',
            description: 'Project health analysis and recommendations',
            mimeType: 'application/json',
          },
          {
            uri: 'helios9://project/{project_id}/timeline',
            name: 'Project Timeline',
            description: 'Project timeline with milestones and events',
            mimeType: 'application/json',
          },
          
          // Initiative Resources
          {
            uri: 'helios9://initiatives',
            name: 'All Initiatives',
            description: 'List of all initiatives across projects',
            mimeType: 'application/json',
          },
          {
            uri: 'helios9://initiatives?project_id={project_id}',
            name: 'Project Initiatives',
            description: 'List initiatives for a specific project',
            mimeType: 'application/json',
          },
          {
            uri: 'helios9://initiative/{initiative_id}',
            name: 'Initiative Details',
            description: 'Detailed information about a specific initiative',
            mimeType: 'application/json',
          },
          {
            uri: 'helios9://initiative/{initiative_id}/context',
            name: 'Initiative Context',
            description: 'Comprehensive initiative context with insights',
            mimeType: 'application/json',
          },
          
          // Task Resources
          {
            uri: 'helios9://tasks',
            name: 'All Tasks',
            description: 'List of all tasks across projects',
            mimeType: 'application/json',
          },
          {
            uri: 'helios9://tasks?project_id={project_id}',
            name: 'Project Tasks',
            description: 'List tasks for a specific project',
            mimeType: 'application/json',
          },
          {
            uri: 'helios9://tasks?initiative_id={initiative_id}',
            name: 'Initiative Tasks',
            description: 'List tasks for a specific initiative',
            mimeType: 'application/json',
          },
          {
            uri: 'helios9://task/{task_id}',
            name: 'Task Details',
            description: 'Detailed information about a specific task',
            mimeType: 'application/json',
          },
          
          // Document Resources
          {
            uri: 'helios9://documents',
            name: 'All Documents',
            description: 'List of all user documents',
            mimeType: 'application/json',
          },
          {
            uri: 'helios9://documents?project_id={project_id}',
            name: 'Project Documents',
            description: 'List documents for a specific project',
            mimeType: 'application/json',
          },
          {
            uri: 'helios9://document/{document_id}',
            name: 'Document Content',
            description: 'Full document content with metadata',
            mimeType: 'text/markdown',
          },
          
          // Workspace Resources
          {
            uri: 'helios9://workspace/overview',
            name: 'Workspace Overview',
            description: 'Comprehensive workspace overview with analytics',
            mimeType: 'application/json',
          },
          {
            uri: 'helios9://workspace/analytics',
            name: 'Workspace Analytics',
            description: 'Detailed workspace analytics and insights',
            mimeType: 'application/json',
          },
          
          // Search Resources
          {
            uri: 'helios9://search?q={query}',
            name: 'Universal Search',
            description: 'Search across all projects, tasks, and documents',
            mimeType: 'application/json',
          },
          {
            uri: 'helios9://search/semantic?q={query}',
            name: 'Semantic Search',
            description: 'AI-powered semantic search across content',
            mimeType: 'application/json',
          },
          
          // Conversation Resources
          {
            uri: 'helios9://conversations?project_id={project_id}',
            name: 'Project Conversations',
            description: 'List AI conversations for a project',
            mimeType: 'application/json',
          },
          {
            uri: 'helios9://conversation/{conversation_id}',
            name: 'Conversation Details',
            description: 'Specific conversation with analysis',
            mimeType: 'application/json',
          },
          
          // Workflow Resources
          {
            uri: 'helios9://workflows',
            name: 'Workflow Rules',
            description: 'List all workflow automation rules',
            mimeType: 'application/json',
          },
          {
            uri: 'helios9://workflow/{workflow_id}',
            name: 'Workflow Details',
            description: 'Specific workflow rule configuration',
            mimeType: 'application/json',
          },
        ],
      }
    })

    // Read resources
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params
      
      logger.info('Resource read requested', { uri })

      try {
        // Ensure authenticated before any API calls
        await authManager.ensureAuthenticated()
        const content = await this.handleResourceRead(uri)
        
        // Determine mime type based on the URI
        let mimeType = 'application/json'
        if (uri.includes('/document/') && !uri.includes('/documents')) {
          mimeType = 'text/markdown'
        }
        
        return {
          contents: [
            {
              uri,
              mimeType,
              text: typeof content === 'string' ? content : JSON.stringify(content, null, 2),
            },
          ],
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.error('Resource read failed', { uri, error: errorMessage })
        throw error
      }
    })

    // List available prompts
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      logger.debug('Listing available prompts')
      
      return {
        prompts: [
          // Original prompts
          {
            name: 'project_kickoff',
            description: 'Generate project structure from natural language description',
            arguments: [
              {
                name: 'description',
                description: 'Natural language description of the project',
                required: true,
              },
              {
                name: 'team_size',
                description: 'Number of team members',
                required: false,
              },
              {
                name: 'duration',
                description: 'Expected project duration',
                required: false,
              },
            ],
          },
          {
            name: 'daily_standup',
            description: 'Generate standup report from project activity',
            arguments: [
              {
                name: 'project_id',
                description: 'Project ID to generate standup for',
                required: true,
              },
              {
                name: 'date',
                description: 'Date for the standup (ISO format)',
                required: false,
              },
            ],
          },
          {
            name: 'document_review',
            description: 'Generate comprehensive document review with suggestions',
            arguments: [
              {
                name: 'document_id',
                description: 'Document ID to review',
                required: true,
              },
              {
                name: 'review_type',
                description: 'Type of review: technical, editorial, or comprehensive',
                required: false,
              },
            ],
          },
          // New Helios-9 prompts
          ...Object.values(helios9Prompts).map(prompt => ({
            name: prompt.name,
            description: prompt.description,
            arguments: prompt.arguments || []
          }))
        ],
      }
    })

    // Handle prompt requests
    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params
      
      logger.info('Prompt requested', { prompt: name, args })

      try {
        const prompt = await this.handlePromptRequest(name, args || {})
        
        return {
          description: `Generated ${name} prompt`,
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: prompt,
              },
            },
          ],
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.error('Prompt generation failed', { prompt: name, error: errorMessage })
        throw error
      }
    })
  }

  private async handleResourceRead(uri: string): Promise<any> {
    // Parse URI and extract query parameters
    const url = new URL(uri.replace('helios9://', 'http://helios9/'))
    const path = url.pathname
    const params: Record<string, string> = {}
    url.searchParams.forEach((value, key) => {
      params[key] = value
    })

    // Project Resources
    if (path === '/projects') {
      return await this.allHandlers.list_projects({})
    }
    
    const projectContextMatch = path.match(/^\/project\/([^\/]+)\/context$/)
    if (projectContextMatch) {
      return await this.allHandlers.get_project_context({ project_id: projectContextMatch[1] })
    }
    
    const projectHealthMatch = path.match(/^\/project\/([^\/]+)\/health$/)
    if (projectHealthMatch) {
      return await this.allHandlers.get_project_insights({ 
        project_id: projectHealthMatch[1],
        insight_types: ['progress', 'bottlenecks', 'team_performance', 'documentation_health'],
        include_recommendations: true
      })
    }
    
    const projectTimelineMatch = path.match(/^\/project\/([^\/]+)\/timeline$/)
    if (projectTimelineMatch) {
      return await this.allHandlers.get_project_timeline({ 
        project_id: projectTimelineMatch[1],
        include_completed: true,
        time_range: 'all'
      })
    }
    
    // Initiative Resources
    if (path === '/initiatives') {
      return await this.allHandlers.list_initiatives(params.project_id ? { project_id: params.project_id } : {})
    }
    
    const initiativeMatch = path.match(/^\/initiative\/([^\/]+)$/)
    if (initiativeMatch) {
      return await this.allHandlers.get_initiative({ initiative_id: initiativeMatch[1] })
    }
    
    const initiativeContextMatch = path.match(/^\/initiative\/([^\/]+)\/context$/)
    if (initiativeContextMatch) {
      return await this.allHandlers.get_initiative_context({ initiative_id: initiativeContextMatch[1] })
    }
    
    // Task Resources
    if (path === '/tasks') {
      const filters: any = {}
      if (params.project_id) filters.project_id = params.project_id
      if (params.initiative_id) filters.initiative_id = params.initiative_id
      return await this.allHandlers.list_tasks(filters)
    }
    
    const taskMatch = path.match(/^\/task\/([^\/]+)$/)
    if (taskMatch) {
      return await this.allHandlers.get_task({ task_id: taskMatch[1] })
    }
    
    // Document Resources
    if (path === '/documents') {
      return await this.allHandlers.list_documents(params.project_id ? { project_id: params.project_id } : {})
    }
    
    const documentMatch = path.match(/^\/document\/([^\/]+)$/)
    if (documentMatch) {
      const doc = await this.allHandlers.get_document_context({ document_id: documentMatch[1] })
      // Return markdown content for document resources
      return doc.document.content
    }
    
    // Workspace Resources
    if (path === '/workspace/overview') {
      return await this.allHandlers.get_workspace_overview({
        include_analytics: true,
        time_range: 'week'
      })
    }
    
    if (path === '/workspace/analytics') {
      return await this.allHandlers.get_project_analytics({
        time_range: 'month',
        include_predictions: true,
        benchmark_comparison: true
      })
    }
    
    // Search Resources
    if (path === '/search' && params.q) {
      return await this.allHandlers.universal_search({
        query: params.q,
        search_types: ['projects', 'tasks', 'documents', 'conversations'],
        limit: 20
      })
    }
    
    if (path === '/search/semantic' && params.q) {
      return await this.allHandlers.semantic_search({
        query: params.q,
        context_type: 'general',
        include_explanations: true,
        max_results: 10
      })
    }
    
    // Conversation Resources
    if (path === '/conversations' && params.project_id) {
      return await this.allHandlers.get_conversations({
        project_id: params.project_id,
        include_messages: false,
        limit: 20
      })
    }
    
    const conversationMatch = path.match(/^\/conversation\/([^\/]+)$/)
    if (conversationMatch) {
      return await this.allHandlers.analyze_conversation({ conversation_id: conversationMatch[1] })
    }
    
    // Workflow Resources
    if (path === '/workflows') {
      return await this.allHandlers.list_workflow_rules({
        enabled_only: true
      })
    }
    
    const workflowMatch = path.match(/^\/workflow\/([^\/]+)$/)
    if (workflowMatch) {
      // Since we don't have a get_workflow_rule handler, we'll list and filter
      const rules = await this.allHandlers.list_workflow_rules({})
      return rules.rules.find((r: any) => r.id === workflowMatch[1]) || { error: 'Workflow not found' }
    }
    
    throw new Error(`Unknown resource URI: ${uri}`)
  }

  private async handlePromptRequest(name: string, args: Record<string, any>): Promise<string> {
    // Check if it's one of the new Helios-9 prompts
    if (promptHandlers[name]) {
      // Some prompts need additional context data
      if (name === 'sprint_planning' || name === 'project_health_check') {
        const projectId = args.project_id
        if (!projectId) {
          throw new Error(`${name} prompt requires project_id`)
        }
        
        // Get project context for these prompts
        const projectContext = await this.allHandlers.get_project_context({ project_id: projectId })
        
        if (name === 'sprint_planning') {
          return promptHandlers[name](args, projectContext)
        } else if (name === 'project_health_check') {
          return promptHandlers[name](args, projectContext)
        }
      }
      
      // Other prompts don't need additional context
      return promptHandlers[name](args)
    }
    
    // Original prompts
    switch (name) {
      case 'project_kickoff':
        return this.generateProjectKickoffPrompt(args)
      
      case 'daily_standup':
        return this.generateDailyStandupPrompt(args)
      
      case 'document_review':
        return this.generateDocumentReviewPrompt(args)
      
      default:
        throw new Error(`Unknown prompt: ${name}`)
    }
  }

  private async generateProjectKickoffPrompt(args: Record<string, any>): Promise<string> {
    const { description, team_size = 3, duration = '2-3 months' } = args
    
    return `# Project Kickoff Planning

Based on this project description: "${description}"

Please help me create a comprehensive project plan including:

## 1. Project Structure
- Break down the project into logical phases and milestones
- Identify key deliverables and dependencies
- Suggest appropriate project timeline given ${duration} duration

## 2. Team Organization
- Define roles and responsibilities for ${team_size} team members
- Suggest task assignments and collaboration patterns
- Identify skills and expertise needed

## 3. Documentation Strategy
- Recommend essential documents to create (README, specs, etc.)
- Suggest documentation templates and standards
- Plan knowledge sharing and onboarding materials

## 4. Initial Tasks
- Create a prioritized backlog of initial tasks
- Define acceptance criteria and definition of done
- Set up project tracking and communication tools

Please provide specific, actionable recommendations that I can implement immediately.`
  }

  private async generateDailyStandupPrompt(args: Record<string, any>): Promise<string> {
    const { project_id, date = new Date().toISOString() } = args
    
    // Get project context
    const context = await this.allHandlers.get_project_context({ project_id })
    
    return `# Daily Standup Report - ${new Date(date).toLocaleDateString()}

## Project: ${context.project.name}

### Recent Activity Summary
${context.recent_tasks.map((task: any) => `- ${task.title} (${task.status})`).join('\n')}

### Current Sprint Status
- **Total Tasks**: ${context.statistics.total_tasks}
- **In Progress**: ${context.statistics.task_status.in_progress || 0}
- **Completed**: ${context.statistics.task_status.done || 0}
- **Blocked**: ${context.statistics.task_status.blocked || 0}

### Documentation Updates
${context.recent_documents.map((doc: any) => `- ${doc.title} (${doc.document_type})`).join('\n')}

Based on this activity, please help generate:

1. **What was completed yesterday?**
2. **What's planned for today?**
3. **Are there any blockers or impediments?**
4. **What support or resources are needed?**

Please format the response as a structured standup report that can be shared with the team.`
  }

  private async generateDocumentReviewPrompt(args: Record<string, any>): Promise<string> {
    const { document_id, review_type = 'comprehensive' } = args
    
    // Get document context
    const context = await this.allHandlers.get_document_context({ document_id })
    
    return `# Document Review Request

## Document Information
- **Title**: ${context.document.title}
- **Type**: ${context.document.document_type}
- **Length**: ${context.content_analysis.word_count} words
- **AI Readiness**: ${context.content_analysis.ai_readiness_score}%

## Review Type: ${review_type}

Please provide a ${review_type} review of this document focusing on:

### Content Quality
- Clarity and coherence of information
- Completeness and accuracy
- Structure and organization
- Target audience appropriateness

### Technical Aspects
- Formatting and markdown usage
- Code examples and technical accuracy
- Links and references validation
- AI metadata and frontmatter

### Improvement Recommendations
- Specific suggestions for enhancement
- Missing sections or information
- Better organization or structure
- AI integration opportunities

### Action Items
- Prioritized list of improvements
- Estimated effort for each change
- Dependencies or requirements

Please provide detailed feedback with specific examples and actionable recommendations.`
  }

  public async start() {
    // Check for API key but don't authenticate yet
    const apiKey = process.env.HELIOS_API_KEY
    
    if (!apiKey) {
      logger.error('HELIOS_API_KEY environment variable is required')
      // Start server anyway to provide better error messages to MCP clients
    }

    // Create the transport
    const transport = new StdioServerTransport()
    
    // Connect the transport - this sets up stdio listeners and keeps the process alive
    await this.server.connect(transport)
    
    logger.info('Helios-9 MCP Server started and ready for connections')
    
    // Try to authenticate in the background (non-blocking)
    if (apiKey) {
      authManager.authenticate('api_key', apiKey)
        .then(() => {
          logger.info('Authenticated with Helios-9 API')
        })
        .catch((error) => {
          logger.error('API authentication failed:', error)
          logger.error('The server is running but API calls will fail until authentication is fixed')
        })
    }
  }

  public async stop() {
    logger.info('Shutting down Helios-9 MCP Server')
    await this.server.close()
  }
}

// Main execution
async function main() {
  const server = new HeliosMCPServer()
  
  // Handle graceful shutdown
  const shutdown = async () => {
    await server.stop()
    process.exit(0)
  }
  
  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down gracefully')
    await shutdown()
  })
  
  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down gracefully')
    await shutdown()
  })
  
  // The stdio transport will handle stdin lifecycle
  // We don't need to manually handle stdin close as the transport manages it
  
  // Start the server
  try {
    await server.start()
    // The server is now running and will handle messages
    // The process will stay alive due to the open stdin stream
  } catch (error) {
    logger.error('Failed to start server:', error)
    process.exit(1)
  }
}

// Run if this is the main module
// Always run main when executed directly (handles symlinks, npx, etc.)
main().catch((error) => {
  logger.error('Unhandled error in main:', error)
  process.exit(1)
})

export { HeliosMCPServer }