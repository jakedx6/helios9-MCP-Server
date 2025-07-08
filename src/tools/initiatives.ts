// Local type definitions
interface MCPTool {
  name: string
  description: string
  inputSchema: any
}

import { supabaseService } from '../lib/api-client.js'
import { requireAuth } from '../lib/auth.js'
import { logger } from '../lib/logger.js'
import { z } from 'zod'

// Input schemas for initiative tools
const ListInitiativesSchema = z.object({
  project_id: z.string().uuid().optional(),
  status: z.enum(['planning', 'active', 'on_hold', 'completed', 'cancelled']).optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  search: z.string().optional(),
  limit: z.number().int().positive().max(100).default(20)
})

const GetInitiativeSchema = z.object({
  initiative_id: z.string().uuid()
})

const CreateInitiativeSchema = z.object({
  name: z.string().min(1).max(255),
  objective: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(['planning', 'active', 'on_hold', 'completed', 'cancelled']).default('planning'),
  priority: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
  project_ids: z.array(z.string().uuid()),
  owner_id: z.string().uuid(),
  start_date: z.string().datetime().optional(),
  target_date: z.string().datetime().optional()
})

const UpdateInitiativeSchema = z.object({
  initiative_id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  objective: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(['planning', 'active', 'on_hold', 'completed', 'cancelled']).optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  project_ids: z.array(z.string().uuid()).optional(),
  owner_id: z.string().uuid().optional(),
  start_date: z.string().datetime().optional(),
  target_date: z.string().datetime().optional()
})

/**
 * List all initiatives
 */
export const listInitiativesTool: MCPTool = {
  name: 'list_initiatives',
  description: 'List all initiatives with optional filtering',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: {
        type: 'string',
        format: 'uuid',
        description: 'Filter by project'
      },
      status: {
        type: 'string',
        enum: ['planning', 'active', 'on_hold', 'completed', 'cancelled'],
        description: 'Filter by status'
      },
      priority: {
        type: 'string',
        enum: ['critical', 'high', 'medium', 'low'],
        description: 'Filter by priority'
      },
      search: {
        type: 'string',
        description: 'Search initiatives by name or objective'
      },
      limit: {
        type: 'number',
        minimum: 1,
        maximum: 100,
        default: 20,
        description: 'Maximum number of initiatives to return'
      }
    }
  }
}

export const listInitiatives = requireAuth(async (args: any) => {
  const { project_id, status, priority, search, limit } = ListInitiativesSchema.parse(args)
  
  logger.info('Listing initiatives', { project_id, status, priority, search, limit })
  
  const initiatives = await supabaseService.getInitiatives(
    { project_id, status, priority, search },
    { limit },
    { field: 'updated_at', order: 'desc' }
  )
  
  // Enrich with counts (would be done server-side in production)
  const enrichedInitiatives = await Promise.all(initiatives.map(async (initiative) => {
    // Get counts for tasks, milestones, and documents
    const tasks = await supabaseService.getTasks({ 
      project_id: initiative.project_ids[0] // For now, just count from first project
    })
    
    const initiativeTasks = tasks.filter(t => t.initiative_id === initiative.id)
    
    return {
      ...initiative,
      task_count: initiativeTasks.length,
      milestone_count: 0, // Placeholder until milestone API is available
      document_count: 0, // Placeholder until initiative-document association API is available
      owner: null // Placeholder until profile lookup is available
    }
  }))
  
  return {
    initiatives: enrichedInitiatives,
    total: enrichedInitiatives.length,
    filters_applied: { project_id, status, priority, search }
  }
})

/**
 * Get initiative details
 */
export const getInitiativeTool: MCPTool = {
  name: 'get_initiative',
  description: 'Get detailed information about a specific initiative',
  inputSchema: {
    type: 'object',
    properties: {
      initiative_id: {
        type: 'string',
        format: 'uuid',
        description: 'The unique identifier of the initiative'
      }
    },
    required: ['initiative_id']
  }
}

export const getInitiative = requireAuth(async (args: any) => {
  const { initiative_id } = GetInitiativeSchema.parse(args)
  
  logger.info('Getting initiative details', { initiative_id })
  
  const initiative = await supabaseService.getInitiative(initiative_id)
  
  // Get related data
  const allTasks = await Promise.all(
    initiative.project_ids.map(projectId => 
      supabaseService.getTasks({ project_id: projectId })
    )
  )
  
  const tasks = allTasks.flat().filter(t => t.initiative_id === initiative_id)
  const milestones: any[] = [] // Placeholder for milestones
  const documents: any[] = [] // Placeholder for documents
  
  // Calculate statistics
  const statistics = {
    total_tasks: tasks.length,
    completed_tasks: tasks.filter(t => t.status === 'done').length,
    total_milestones: milestones.length,
    completed_milestones: milestones.filter(m => m.status === 'completed').length,
    total_documents: documents.length
  }
  
  const completion_percentage = statistics.total_tasks > 0 
    ? Math.round((statistics.completed_tasks / statistics.total_tasks) * 100)
    : 0
  
  return {
    initiative: {
      ...initiative,
      completion_percentage,
      tasks,
      milestones,
      documents,
      statistics,
      owner: null // Placeholder for owner details
    }
  }
})

/**
 * Create new initiative
 */
export const createInitiativeTool: MCPTool = {
  name: 'create_initiative',
  description: 'Create a new initiative',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        minLength: 1,
        maxLength: 255,
        description: 'The name of the initiative'
      },
      objective: {
        type: 'string',
        minLength: 1,
        description: 'The strategic objective of the initiative'
      },
      description: {
        type: 'string',
        description: 'Optional detailed description'
      },
      status: {
        type: 'string',
        enum: ['planning', 'active', 'on_hold', 'completed', 'cancelled'],
        default: 'planning',
        description: 'Initial status of the initiative'
      },
      priority: {
        type: 'string',
        enum: ['critical', 'high', 'medium', 'low'],
        default: 'medium',
        description: 'Priority level'
      },
      project_ids: {
        type: 'array',
        items: {
          type: 'string',
          format: 'uuid'
        },
        description: 'Array of associated project IDs'
      },
      owner_id: {
        type: 'string',
        format: 'uuid',
        description: 'ID of the initiative owner'
      },
      start_date: {
        type: 'string',
        format: 'date-time',
        description: 'Optional start date'
      },
      target_date: {
        type: 'string',
        format: 'date-time',
        description: 'Optional target completion date'
      }
    },
    required: ['name', 'objective', 'project_ids', 'owner_id']
  }
}

export const createInitiative = requireAuth(async (args: any) => {
  const initiativeData = CreateInitiativeSchema.parse(args)
  
  logger.info('Creating new initiative', { name: initiativeData.name })
  
  const initiative = await supabaseService.createInitiative({
    name: initiativeData.name,
    objective: initiativeData.objective,
    description: initiativeData.description || null,
    status: initiativeData.status,
    priority: initiativeData.priority,
    project_ids: initiativeData.project_ids,
    owner_id: initiativeData.owner_id,
    start_date: initiativeData.start_date || null,
    target_date: initiativeData.target_date || null
  })
  
  logger.info('Initiative created successfully', { initiative_id: initiative.id, name: initiative.name })
  
  return {
    initiative,
    message: `Initiative "${initiative.name}" created successfully`
  }
})

/**
 * Update existing initiative
 */
export const updateInitiativeTool: MCPTool = {
  name: 'update_initiative',
  description: 'Update initiative details',
  inputSchema: {
    type: 'object',
    properties: {
      initiative_id: {
        type: 'string',
        format: 'uuid',
        description: 'The unique identifier of the initiative to update'
      },
      name: {
        type: 'string',
        minLength: 1,
        maxLength: 255,
        description: 'New name for the initiative'
      },
      objective: {
        type: 'string',
        minLength: 1,
        description: 'New objective'
      },
      description: {
        type: 'string',
        description: 'New description'
      },
      status: {
        type: 'string',
        enum: ['planning', 'active', 'on_hold', 'completed', 'cancelled'],
        description: 'New status'
      },
      priority: {
        type: 'string',
        enum: ['critical', 'high', 'medium', 'low'],
        description: 'New priority'
      },
      project_ids: {
        type: 'array',
        items: {
          type: 'string',
          format: 'uuid'
        },
        description: 'New array of project IDs'
      },
      owner_id: {
        type: 'string',
        format: 'uuid',
        description: 'New owner ID'
      },
      start_date: {
        type: 'string',
        format: 'date-time',
        description: 'New start date'
      },
      target_date: {
        type: 'string',
        format: 'date-time',
        description: 'New target date'
      }
    },
    required: ['initiative_id']
  }
}

export const updateInitiative = requireAuth(async (args: any) => {
  const { initiative_id, ...updates } = UpdateInitiativeSchema.parse(args)
  
  logger.info('Updating initiative', { initiative_id, updates })
  
  const initiative = await supabaseService.updateInitiative(initiative_id, updates)
  
  logger.info('Initiative updated successfully', { initiative_id: initiative.id })
  
  return {
    initiative,
    message: `Initiative "${initiative.name}" updated successfully`
  }
})

/**
 * Get initiative context for AI agents
 */
export const getInitiativeContextTool: MCPTool = {
  name: 'get_initiative_context',
  description: 'Get rich context about an initiative for AI understanding',
  inputSchema: {
    type: 'object',
    properties: {
      initiative_id: {
        type: 'string',
        format: 'uuid',
        description: 'The unique identifier of the initiative'
      }
    },
    required: ['initiative_id']
  }
}

export const getInitiativeContext = requireAuth(async (args: any) => {
  const { initiative_id } = GetInitiativeSchema.parse(args)
  
  logger.info('Getting initiative context for AI', { initiative_id })
  
  const context = await supabaseService.getInitiativeContext(initiative_id)
  
  return { context }
})

/**
 * Get initiative insights
 */
export const getInitiativeInsightsTool: MCPTool = {
  name: 'get_initiative_insights',
  description: 'Get AI-powered insights and recommendations for an initiative',
  inputSchema: {
    type: 'object',
    properties: {
      initiative_id: {
        type: 'string',
        format: 'uuid',
        description: 'The unique identifier of the initiative'
      }
    },
    required: ['initiative_id']
  }
}

export const getInitiativeInsights = requireAuth(async (args: any) => {
  const { initiative_id } = GetInitiativeSchema.parse(args)
  
  logger.info('Getting initiative insights', { initiative_id })
  
  const insights = await supabaseService.getInitiativeInsights(initiative_id)
  
  return { insights }
})

/**
 * Search workspace
 */
export const searchWorkspaceTool: MCPTool = {
  name: 'search_workspace',
  description: 'Search across all entity types with initiative awareness',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        minLength: 2,
        description: 'The search query to use'
      },
      filters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['project', 'initiative', 'task', 'document', 'milestone']
          },
          project_id: {
            type: 'string',
            format: 'uuid'
          },
          initiative_id: {
            type: 'string',
            format: 'uuid'
          },
          status: {
            type: 'string'
          }
        }
      },
      limit: {
        type: 'number',
        minimum: 1,
        maximum: 100,
        default: 20
      }
    },
    required: ['query']
  }
}

const SearchWorkspaceSchema = z.object({
  query: z.string().min(2),
  filters: z.object({
    type: z.enum(['project', 'initiative', 'task', 'document', 'milestone']).optional(),
    project_id: z.string().uuid().optional(),
    initiative_id: z.string().uuid().optional(),
    status: z.string().optional()
  }).optional(),
  limit: z.number().int().positive().max(100).default(20)
})

export const searchWorkspace = requireAuth(async (args: any) => {
  const { query, filters, limit } = SearchWorkspaceSchema.parse(args)
  
  logger.info('Searching workspace', { query, filters, limit })
  
  const results = await supabaseService.searchWorkspace(query, filters, limit)
  
  return results
})

/**
 * Get enhanced project context (includes initiatives)
 */
export const getEnhancedProjectContextTool: MCPTool = {
  name: 'get_enhanced_project_context',
  description: 'Get project context including all initiatives',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: {
        type: 'string',
        format: 'uuid',
        description: 'The unique identifier of the project'
      }
    },
    required: ['project_id']
  }
}

export const getEnhancedProjectContext = requireAuth(async (args: any) => {
  const { project_id } = z.object({ project_id: z.string().uuid() }).parse(args)
  
  logger.info('Getting enhanced project context', { project_id })
  
  const context = await supabaseService.getEnhancedProjectContext(project_id)
  
  return { context }
})

/**
 * Get workspace context
 */
export const getWorkspaceContextTool: MCPTool = {
  name: 'get_workspace_context',
  description: 'Get complete workspace hierarchy and insights',
  inputSchema: {
    type: 'object',
    properties: {}
  }
}

export const getWorkspaceContext = requireAuth(async (args: any) => {
  logger.info('Getting workspace context')
  
  const context = await supabaseService.getWorkspaceContext()
  
  return { context }
})

// Export all initiative tools
export const initiativeTools = {
  listInitiativesTool,
  getInitiativeTool,
  createInitiativeTool,
  updateInitiativeTool,
  getInitiativeContextTool,
  getInitiativeInsightsTool,
  searchWorkspaceTool,
  getEnhancedProjectContextTool,
  getWorkspaceContextTool
}

export const initiativeHandlers = {
  list_initiatives: listInitiatives,
  get_initiative: getInitiative,
  create_initiative: createInitiative,
  update_initiative: updateInitiative,
  get_initiative_context: getInitiativeContext,
  get_initiative_insights: getInitiativeInsights,
  search_workspace: searchWorkspace,
  get_enhanced_project_context: getEnhancedProjectContext,
  get_workspace_context: getWorkspaceContext
}