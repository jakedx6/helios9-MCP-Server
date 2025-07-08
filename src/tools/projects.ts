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

// Input schemas for project tools
const ListProjectsSchema = z.object({
  status: z.enum(['active', 'completed', 'archived']).optional(),
  search: z.string().optional(),
  limit: z.number().int().positive().max(100).default(20)
})

const GetProjectSchema = z.object({
  project_id: z.string().uuid()
})

const CreateProjectSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  status: z.enum(['active', 'completed', 'archived']).default('active')
  // Removed priority, metadata as they don't exist in the database schema
})

const UpdateProjectSchema = z.object({
  project_id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  status: z.enum(['active', 'completed', 'archived']).optional(),
  // Removed priority, metadata as they don't exist in the database schema
})

/**
 * List all projects
 */
export const listProjectsTool: MCPTool = {
  name: 'list_projects',
  description: 'List all projects with optional filtering by status',
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['active', 'completed', 'archived'],
        description: 'Filter projects by status'
      },
      search: {
        type: 'string',
        description: 'Search projects by name or description'
      },
      limit: {
        type: 'number',
        minimum: 1,
        maximum: 100,
        default: 20,
        description: 'Maximum number of projects to return'
      }
    }
  }
}

export const listProjects = requireAuth(async (args: any) => {
  const { status, search, limit } = ListProjectsSchema.parse(args)
  
  logger.info('Listing projects', { status, search, limit })
  
  const projects = await supabaseService.getProjects(
    { status, search },
    { limit },
    { field: 'updated_at', order: 'desc' }
  )
  
  return {
    projects,
    total: projects.length,
    filters_applied: { status, search }
  }
})

/**
 * Get project details
 */
export const getProjectTool: MCPTool = {
  name: 'get_project',
  description: 'Get detailed information about a specific project including tasks and documents',
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

export const getProject = requireAuth(async (args: any) => {
  const { project_id } = GetProjectSchema.parse(args)
  
  logger.info('Getting project details', { project_id })
  
  // Get basic project details (this calls /api/mcp/projects/${projectId})
  const project = await supabaseService.getProject(project_id)
  
  return {
    project
  }
})

/**
 * Create new project
 */
export const createProjectTool: MCPTool = {
  name: 'create_project',
  description: 'Create a new project with specified details',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        minLength: 1,
        maxLength: 255,
        description: 'The name of the project'
      },
      description: {
        type: 'string',
        description: 'Optional description of the project'
      },
      status: {
        type: 'string',
        enum: ['active', 'completed', 'archived'],
        default: 'active',
        description: 'Initial status of the project'
      },
      // Removed priority, metadata as they don't exist in the database schema
    },
    required: ['name']
  }
}

export const createProject = requireAuth(async (args: any) => {
  const projectData = CreateProjectSchema.parse(args)
  
  logger.info('Creating new project', { name: projectData.name })
  
  const project = await supabaseService.createProject({
    name: projectData.name,
    description: projectData.description || null,
    status: projectData.status
    // Removed metadata as it doesn't exist in the database schema
  })
  
  logger.info('Project created successfully', { project_id: project.id, name: project.name })
  
  return {
    project,
    message: `Project "${project.name}" created successfully`
  }
})

/**
 * Update existing project
 */
export const updateProjectTool: MCPTool = {
  name: 'update_project',
  description: 'Update an existing project with new information',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: {
        type: 'string',
        format: 'uuid',
        description: 'The unique identifier of the project to update'
      },
      name: {
        type: 'string',
        minLength: 1,
        maxLength: 255,
        description: 'New name for the project'
      },
      description: {
        type: 'string',
        description: 'New description for the project'
      },
      status: {
        type: 'string',
        enum: ['active', 'completed', 'archived'],
        description: 'New status for the project'
      },
      // Removed priority, metadata as they don't exist in the database schema
    },
    required: ['project_id']
  }
}

export const updateProject = requireAuth(async (args: any) => {
  const { project_id, ...updates } = UpdateProjectSchema.parse(args)
  
  logger.info('Updating project', { project_id, updates })
  
  const project = await supabaseService.updateProject(project_id, updates)
  
  logger.info('Project updated successfully', { project_id: project.id })
  
  return {
    project,
    message: `Project "${project.name}" updated successfully`
  }
})

/**
 * Get project context for AI agents
 */
export const getProjectContextTool: MCPTool = {
  name: 'get_project_context',
  description: 'Get comprehensive project context including statistics, recent activity, and team information for AI understanding',
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

export const getProjectContext = requireAuth(async (args: any) => {
  const { project_id } = GetProjectSchema.parse(args)
  
  logger.info('Getting project context for AI', { project_id })
  
  const context = await supabaseService.getProjectContext(project_id)
  
  // Add AI-friendly summary
  const aiSummary = {
    project_overview: `${context.project.name}: ${context.project.description || 'No description provided'}`,
    current_status: context.project.status,
    activity_level: context.statistics.total_documents + context.statistics.total_tasks > 10 ? 'high' : 'moderate',
    documentation_maturity: context.statistics.total_documents > 5 ? 'mature' : 'developing',
    task_distribution: context.statistics.task_status,
    recent_changes: context.recent_documents.length + context.recent_tasks.length,
    ai_recommendations: generateAIRecommendations(context)
  }
  
  return {
    ...context,
    ai_summary: aiSummary
  }
})

/**
 * Generate AI recommendations based on project context
 */
function generateAIRecommendations(context: any): string[] {
  const recommendations: string[] = []
  
  if (context.statistics.total_documents === 0) {
    recommendations.push('Consider creating project documentation to help team members understand the project goals and requirements')
  }
  
  if (context.statistics.total_tasks === 0) {
    recommendations.push('Break down the project into specific tasks to track progress and assign work')
  }
  
  const todoTasks = context.statistics.task_status.todo || 0
  const inProgressTasks = context.statistics.task_status.in_progress || 0
  
  if (inProgressTasks > todoTasks * 2) {
    recommendations.push('Consider focusing on completing in-progress tasks before starting new ones')
  }
  
  if (!context.statistics.document_types.other) {
    recommendations.push('Add a README document to provide project overview and setup instructions')
  }
  
  if (context.recent_documents.length === 0 && context.recent_tasks.length === 0) {
    recommendations.push('Project appears inactive - consider reviewing and updating project status')
  }
  
  return recommendations
}

/**
 * Archive/unarchive project
 */
export const archiveProjectTool: MCPTool = {
  name: 'archive_project',
  description: 'Archive or unarchive a project',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: {
        type: 'string',
        description: 'ID of the project to archive/unarchive'
      },
      archive: {
        type: 'boolean',
        default: true,
        description: 'True to archive, false to unarchive'
      },
      reason: {
        type: 'string',
        description: 'Reason for archiving/unarchiving'
      }
    },
    required: ['project_id']
  }
}

const ArchiveProjectSchema = z.object({
  project_id: z.string().min(1),
  archive: z.boolean().default(true),
  reason: z.string().optional()
})

export const archiveProject = requireAuth(async (args: any) => {
  const { project_id, archive, reason } = ArchiveProjectSchema.parse(args)
  
  logger.info(`${archive ? 'Archiving' : 'Unarchiving'} project`, { project_id, reason })

  const updates: any = {
    status: archive ? 'archived' : 'active',
    updated_at: new Date().toISOString()
  }

  // metadata field doesn't exist in the database schema

  const result = await supabaseService.updateProject(project_id, updates)
  
  if (archive) {
    // Mark all associated tasks as done when archiving project
    await supabaseService.updateTasksByProject(project_id, { 
      status: 'done',
      updated_at: new Date().toISOString()
    })
  }

  return {
    success: true,
    action: archive ? 'archived' : 'unarchived',
    project: result,
    affected_tasks: archive ? 'All project tasks archived' : 'Tasks remain as-is'
  }
})

/**
 * Duplicate project with options
 */
export const duplicateProjectTool: MCPTool = {
  name: 'duplicate_project',
  description: 'Create a copy of an existing project with customizable options',
  inputSchema: {
    type: 'object',
    properties: {
      source_project_id: {
        type: 'string',
        description: 'ID of the project to duplicate'
      },
      new_name: {
        type: 'string',
        description: 'Name for the new project'
      },
      include_tasks: {
        type: 'boolean',
        default: true,
        description: 'Whether to copy tasks'
      },
      include_documents: {
        type: 'boolean',
        default: true,
        description: 'Whether to copy documents'
      },
      reset_dates: {
        type: 'boolean',
        default: true,
        description: 'Whether to reset all dates to current'
      },
      new_owner_id: {
        type: 'string',
        description: 'New owner for the duplicated project (optional)'
      }
    },
    required: ['source_project_id', 'new_name']
  }
}

const DuplicateProjectSchema = z.object({
  source_project_id: z.string().min(1),
  new_name: z.string().min(1).max(200),
  include_tasks: z.boolean().default(true),
  include_documents: z.boolean().default(true),
  reset_dates: z.boolean().default(true),
  new_owner_id: z.string().optional()
})

export const duplicateProject = requireAuth(async (args: any) => {
  const { source_project_id, new_name, include_tasks, include_documents, reset_dates, new_owner_id } = DuplicateProjectSchema.parse(args)
  
  logger.info('Duplicating project', { source_project_id, new_name, include_tasks, include_documents })

  // Get source project
  const sourceProject = await supabaseService.getProject(source_project_id)
  if (!sourceProject) {
    throw new Error('Source project not found')
  }

  const now = new Date().toISOString()
  
  // Create new project
  const newProject = await supabaseService.createProject({
    name: new_name,
    description: `Copy of ${sourceProject.name}${sourceProject.description ? `: ${sourceProject.description}` : ''}`,
    status: 'active'
    // Removed owner_id, priority, visibility, metadata as they don't exist in the database schema
  })

  const duplicateResults = {
    new_project: newProject,
    tasks_copied: 0,
    documents_copied: 0
  }

  // Copy tasks if requested
  if (include_tasks) {
    const sourceTasks = await supabaseService.getTasks({ project_id: source_project_id })
    
    for (const task of sourceTasks) {
      const newTask = {
        title: task.title,
        description: task.description,
        project_id: newProject.id,
        initiative_id: null,
        status: 'todo' as const, // Reset all tasks to todo
        priority: task.priority,
        due_date: reset_dates ? null : task.due_date,
        assignee_id: task.assignee_id
        // Removed started_at, completed_at as they don't exist in the database schema
      }
      
      await supabaseService.createTask(newTask)
      duplicateResults.tasks_copied++
    }
  }

  // Copy documents if requested
  if (include_documents) {
    const sourceDocuments = await supabaseService.getDocuments({ project_id: source_project_id })
    
    for (const doc of sourceDocuments) {
      const newDoc = {
        project_id: newProject.id,
        title: `${doc.title} (Copy)`,
        content: doc.content,
        document_type: doc.document_type
        // Removed metadata as it doesn't exist in the database schema
      }
      
      await supabaseService.createDocument(newDoc)
      duplicateResults.documents_copied++
    }
  }

  return duplicateResults
})

/**
 * Get project timeline and milestones
 */
export const getProjectTimelineTool: MCPTool = {
  name: 'get_project_timeline',
  description: 'Get project timeline with milestones and key events',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: {
        type: 'string',
        description: 'ID of the project'
      },
      include_completed: {
        type: 'boolean',
        default: true,
        description: 'Whether to include completed items'
      },
      time_range: {
        type: 'string',
        enum: ['all', 'past_month', 'next_month', 'current_quarter'],
        default: 'all',
        description: 'Time range filter'
      }
    },
    required: ['project_id']
  }
}

const GetProjectTimelineSchema = z.object({
  project_id: z.string().min(1),
  include_completed: z.boolean().default(true),
  time_range: z.enum(['all', 'past_month', 'next_month', 'current_quarter']).default('all')
})

export const getProjectTimeline = requireAuth(async (args: any) => {
  const { project_id, include_completed, time_range } = GetProjectTimelineSchema.parse(args)
  
  logger.info('Getting project timeline', { project_id, time_range })

  const project = await supabaseService.getProject(project_id)
  if (!project) {
    throw new Error('Project not found')
  }

  // Get tasks and documents with dates
  const tasks = await supabaseService.getTasks({ project_id })
  const documents = await supabaseService.getDocuments({ project_id })

  // Create timeline events
  const timelineEvents = []

  // Add project creation
  timelineEvents.push({
    date: project.created_at,
    type: 'project_created',
    title: 'Project Created',
    description: `Project "${project.name}" was created`,
    metadata: { project_id }
  })

  // Add task events
  tasks.forEach(task => {
    if (task.created_at) {
      timelineEvents.push({
        date: task.created_at,
        type: 'task_created',
        title: `Task Created: ${task.title}`,
        description: task.description,
        metadata: { task_id: task.id, status: task.status }
      })
    }

    // started_at property doesn't exist in the database schema

    // completed_at property doesn't exist in the database schema

    if (task.due_date) {
      timelineEvents.push({
        date: task.due_date,
        type: 'task_due',
        title: `Task Due: ${task.title}`,
        description: task.status === 'done' ? 'Completed on time' : 'Due date',
        metadata: { task_id: task.id, is_overdue: new Date(task.due_date) < new Date() && task.status !== 'done' }
      })
    }
  })

  // Add document events
  documents.forEach(doc => {
    timelineEvents.push({
      date: doc.created_at,
      type: 'document_created',
      title: `Document Created: ${doc.title}`,
      metadata: { document_id: doc.id, document_type: doc.document_type }
    })

    if (doc.updated_at !== doc.created_at) {
      timelineEvents.push({
        date: doc.updated_at,
        type: 'document_updated',
        title: `Document Updated: ${doc.title}`,
        metadata: { document_id: doc.id }
      })
    }
  })

  // Filter by time range
  const filteredEvents = filterTimelineByRange(timelineEvents, time_range)

  // Sort by date
  filteredEvents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  // Identify milestones (significant events)
  const milestones = identifyMilestones(filteredEvents, tasks)

  return {
    project: {
      id: project.id,
      name: project.name,
      status: project.status
    },
    timeline: filteredEvents,
    milestones,
    summary: {
      total_events: filteredEvents.length,
      tasks_created: filteredEvents.filter(e => e.type === 'task_created').length,
      tasks_completed: filteredEvents.filter(e => e.type === 'task_completed').length,
      documents_created: filteredEvents.filter(e => e.type === 'document_created').length,
      overdue_tasks: filteredEvents.filter(e => e.type === 'task_due' && e.metadata?.is_overdue).length
    }
  }
})

/**
 * Bulk update project settings
 */
export const bulkUpdateProjectsTool: MCPTool = {
  name: 'bulk_update_projects',
  description: 'Update multiple projects at once with common settings',
  inputSchema: {
    type: 'object',
    properties: {
      project_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of project IDs to update'
      },
      updates: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['active', 'completed', 'archived'] }
          // Removed priority, visibility, owner_id as they don't exist in the database schema
        },
        description: 'Updates to apply to all projects'
      },
      reason: {
        type: 'string',
        description: 'Reason for bulk update'
      }
    },
    required: ['project_ids', 'updates']
  }
}

const BulkUpdateProjectsSchema = z.object({
  project_ids: z.array(z.string().min(1)).min(1),
  updates: z.object({
    status: z.enum(['active', 'completed', 'archived']).optional()
    // Removed priority, visibility, owner_id as they don't exist in the database schema
  }),
  reason: z.string().optional()
})

export const bulkUpdateProjects = requireAuth(async (args: any) => {
  const { project_ids, updates, reason } = BulkUpdateProjectsSchema.parse(args)
  
  logger.info('Bulk updating projects', { project_count: project_ids.length, updates, reason })

  const results = []
  const now = new Date().toISOString()

  for (const project_id of project_ids) {
    try {
      const updateData = {
        ...updates,
        updated_at: now,
        // metadata field doesn't exist in the database schema
      }

      const result = await supabaseService.updateProject(project_id, updateData)
      results.push({
        project_id,
        success: true,
        project: result
      })
    } catch (error) {
      logger.error(`Failed to update project ${project_id}:`, error)
      results.push({
        project_id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  const successCount = results.filter(r => r.success).length
  const failureCount = results.filter(r => !r.success).length

  return {
    summary: {
      total_projects: project_ids.length,
      successful_updates: successCount,
      failed_updates: failureCount,
      success_rate: (successCount / project_ids.length) * 100
    },
    results,
    applied_updates: updates
  }
})

// Helper functions
function filterTimelineByRange(events: any[], timeRange: string): any[] {
  if (timeRange === 'all') return events

  const now = new Date()
  let startDate: Date
  let endDate: Date = now

  switch (timeRange) {
    case 'past_month':
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
      break
    case 'next_month':
      startDate = now
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate())
      break
    case 'current_quarter':
      const quarter = Math.floor(now.getMonth() / 3)
      startDate = new Date(now.getFullYear(), quarter * 3, 1)
      endDate = new Date(now.getFullYear(), quarter * 3 + 3, 0)
      break
    default:
      return events
  }

  return events.filter(event => {
    const eventDate = new Date(event.date)
    return eventDate >= startDate && eventDate <= endDate
  })
}

function identifyMilestones(events: any[], tasks: any[]): any[] {
  const milestones = []

  // Project start
  const projectCreated = events.find(e => e.type === 'project_created')
  if (projectCreated) {
    milestones.push({
      ...projectCreated,
      milestone_type: 'project_start',
      significance: 'high'
    })
  }

  // Major task completions (high priority or many dependencies)
  const taskCompletions = events.filter(e => e.type === 'task_completed')
  const highPriorityCompletions = taskCompletions.filter(event => {
    const task = tasks.find(t => t.id === event.metadata?.task_id)
    return task?.priority === 'high' || task?.priority === 'urgent'
  })

  milestones.push(...highPriorityCompletions.map(event => ({
    ...event,
    milestone_type: 'major_completion',
    significance: 'medium'
  })))

  // Overdue tasks (red flags)
  const overdueTasks = events.filter(e => e.type === 'task_due' && e.metadata?.is_overdue)
  milestones.push(...overdueTasks.map(event => ({
    ...event,
    milestone_type: 'overdue_alert',
    significance: 'high'
  })))

  return milestones.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}

// Export all project tools
export const projectTools = {
  listProjectsTool,
  getProjectTool,
  createProjectTool,
  updateProjectTool,
  getProjectContextTool,
  archiveProjectTool,
  duplicateProjectTool,
  getProjectTimelineTool,
  bulkUpdateProjectsTool
}

export const projectHandlers = {
  list_projects: listProjects,
  get_project: getProject,
  create_project: createProject,
  update_project: updateProject,
  get_project_context: getProjectContext,
  archive_project: archiveProject,
  duplicate_project: duplicateProject,
  get_project_timeline: getProjectTimeline,
  bulk_update_projects: bulkUpdateProjects
}