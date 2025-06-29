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

// Constants
const HELIOS_VERSION = '1.0.0'
const MCP_PROTOCOL_VERSION = '2024-11-05'

// Load environment variables
dotenv.config()

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
    ]

    this.allHandlers = {
      ...projectHandlers,
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
        ],
      }
    })

    // Read resources
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params
      
      logger.info('Resource read requested', { uri })

      try {
        const content = await this.handleResourceRead(uri)
        
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
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
    // Parse URI and route to appropriate handler
    if (uri === 'helios9://projects') {
      return await this.allHandlers.list_projects({})
    }
    
    const projectContextMatch = uri.match(/^helios9:\/\/project\/([^\/]+)\/context$/)
    if (projectContextMatch) {
      return await this.allHandlers.get_project_context({ project_id: projectContextMatch[1] })
    }
    
    throw new Error(`Unknown resource URI: ${uri}`)
  }

  private async handlePromptRequest(name: string, args: Record<string, any>): Promise<string> {
    switch (name) {
      case 'project_kickoff':
        return this.generateProjectKickoffPrompt(args)
      
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

  public async start() {
    // Setup authentication if API key is provided
    const apiKey = process.env.MCP_API_KEY
    const accessToken = process.env.SUPABASE_ACCESS_TOKEN
    
    if (apiKey) {
      try {
        await authManager.authenticate('api_key', apiKey)
        logger.info('Authenticated with API key')
      } catch (error) {
        logger.error('API key authentication failed:', error)
        process.exit(1)
      }
    } else if (accessToken) {
      try {
        await authManager.authenticate('token', accessToken)
        logger.info('Authenticated with access token')
      } catch (error) {
        logger.error('Token authentication failed:', error)
        process.exit(1)
      }
    } else {
      logger.warn('No authentication provided - some operations may fail')
    }

    // Start the server
    const transport = new StdioServerTransport()
    await this.server.connect(transport)
    
    logger.info('Helios-9 MCP Server started and ready for connections')
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
  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down gracefully')
    await server.stop()
    process.exit(0)
  })
  
  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down gracefully')
    await server.stop()
    process.exit(0)
  })
  
  // Start the server
  try {
    await server.start()
  } catch (error) {
    logger.error('Failed to start server:', error)
    process.exit(1)
  }
}

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error('Unhandled error in main:', error)
    process.exit(1)
  })
}

export { HeliosMCPServer }