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

// Input schemas for task tools
const ListTasksSchema = z.object({
  project_id: z.string().uuid().optional(),
  initiative_id: z.string().uuid().optional(),
  status: z.enum(['todo', 'in_progress', 'done']).optional(),
  assignee_id: z.string().uuid().optional(),
  search: z.string().optional(),
  limit: z.number().int().positive().max(100).default(20)
})

const GetTaskSchema = z.object({
  task_id: z.string().uuid()
})

const CreateTaskSchema = z.object({
  project_id: z.string().uuid(),
  initiative_id: z.string().uuid().optional(),
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  due_date: z.string().datetime().optional(),
  assignee_id: z.string().uuid().optional()
  // Removed metadata as it doesn't exist in the database schema
})

const UpdateTaskSchema = z.object({
  task_id: z.string().uuid(),
  title: z.string().min(1).max(500).optional(),
  description: z.string().optional(),
  status: z.enum(['todo', 'in_progress', 'done']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  due_date: z.string().datetime().optional(),
  assignee_id: z.string().uuid().optional(),
  initiative_id: z.string().uuid().optional()
  // Removed metadata as it doesn't exist in the database schema
})

const GetTaskContextSchema = z.object({
  task_id: z.string().uuid()
})

/**
 * List tasks with filtering
 */
export const listTasksTool: MCPTool = {
  name: 'list_tasks',
  description: 'List tasks with optional filtering by project, initiative, status, or assignee',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: {
        type: 'string',
        format: 'uuid',
        description: 'Filter tasks by project ID'
      },
      initiative_id: {
        type: 'string',
        format: 'uuid',
        description: 'Filter tasks by initiative ID'
      },
      status: {
        type: 'string',
        enum: ['todo', 'in_progress', 'done'],
        description: 'Filter tasks by status'
      },
      assignee_id: {
        type: 'string',
        format: 'uuid',
        description: 'Filter tasks by assignee'
      },
      search: {
        type: 'string',
        description: 'Search tasks by title or description'
      },
      limit: {
        type: 'number',
        minimum: 1,
        maximum: 100,
        default: 20,
        description: 'Maximum number of tasks to return'
      }
    }
  }
}

export const listTasks = requireAuth(async (args: any) => {
  const { project_id, initiative_id, status, assignee_id, search, limit } = ListTasksSchema.parse(args)
  
  logger.info('Listing tasks', { project_id, initiative_id, status, assignee_id, search, limit })
  
  let tasks = await supabaseService.getTasks(
    { project_id, status, assignee_id, search },
    { limit },
    { field: 'updated_at', order: 'desc' }
  )
  
  // Filter by initiative_id if provided (since API doesn't support it directly yet)
  if (initiative_id) {
    tasks = tasks.filter(task => task.initiative_id === initiative_id)
  }
  
  return {
    tasks,
    total: tasks.length,
    filters_applied: { project_id, initiative_id, status, assignee_id, search }
  }
})

/**
 * Create new task
 */
export const createTaskTool: MCPTool = {
  name: 'create_task',
  description: 'Create a new task in a project',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: {
        type: 'string',
        format: 'uuid',
        description: 'The project ID where the task will be created'
      },
      initiative_id: {
        type: 'string',
        format: 'uuid',
        description: 'Optional initiative ID to associate the task with'
      },
      title: {
        type: 'string',
        minLength: 1,
        maxLength: 500,
        description: 'The title of the task'
      },
      description: {
        type: 'string',
        description: 'Optional detailed description of the task'
      },
      priority: {
        type: 'string',
        enum: ['low', 'medium', 'high'],
        default: 'medium',
        description: 'Priority level of the task'
      },
      due_date: {
        type: 'string',
        format: 'date-time',
        description: 'Optional due date for the task (ISO 8601 format)'
      },
      assignee_id: {
        type: 'string',
        format: 'uuid',
        description: 'Optional user ID to assign the task to'
      },
      // Removed metadata as it doesn't exist in the database schema
    },
    required: ['project_id', 'title']
  }
}

export const createTask = requireAuth(async (args: any) => {
  const taskData = CreateTaskSchema.parse(args)
  
  logger.info('Creating new task', { 
    project_id: taskData.project_id, 
    initiative_id: taskData.initiative_id,
    title: taskData.title 
  })
  
  const task = await supabaseService.createTask({
    project_id: taskData.project_id,
    initiative_id: taskData.initiative_id || null,
    title: taskData.title,
    description: taskData.description || null,
    priority: taskData.priority,
    due_date: taskData.due_date || null,
    assignee_id: taskData.assignee_id || null,
    status: 'todo'
    // Removed metadata as it doesn't exist in the database schema
  })
  
  logger.info('Task created successfully', { task_id: task.id, title: task.title })
  
  return {
    task,
    message: `Task "${task.title}" created successfully`
  }
})

/**
 * Update existing task
 */
export const updateTaskTool: MCPTool = {
  name: 'update_task',
  description: 'Update an existing task with new information',
  inputSchema: {
    type: 'object',
    properties: {
      task_id: {
        type: 'string',
        format: 'uuid',
        description: 'The unique identifier of the task to update'
      },
      title: {
        type: 'string',
        minLength: 1,
        maxLength: 500,
        description: 'New title for the task'
      },
      description: {
        type: 'string',
        description: 'New description for the task'
      },
      status: {
        type: 'string',
        enum: ['todo', 'in_progress', 'done'],
        description: 'New status for the task'
      },
      priority: {
        type: 'string',
        enum: ['low', 'medium', 'high'],
        description: 'New priority for the task'
      },
      due_date: {
        type: 'string',
        format: 'date-time',
        description: 'New due date for the task (ISO 8601 format)'
      },
      assignee_id: {
        type: 'string',
        format: 'uuid',
        description: 'New assignee for the task'
      },
      initiative_id: {
        type: 'string',
        format: 'uuid',
        description: 'New initiative ID to associate the task with'
      },
      // Removed metadata as it doesn't exist in the database schema
    },
    required: ['task_id']
  }
}

export const updateTask = requireAuth(async (args: any) => {
  const { task_id, ...updates } = UpdateTaskSchema.parse(args)
  
  logger.info('Updating task', { task_id, updates })
  
  // Handle status change logic
  // completed_at property removed as it doesn't exist in the database schema
  
  const task = await supabaseService.updateTask(task_id, updates)
  
  logger.info('Task updated successfully', { task_id: task.id })
  
  return {
    task,
    message: `Task "${task.title}" updated successfully`
  }
})

/**
 * Get task context including related documents and conversations
 */
export const getTaskContextTool: MCPTool = {
  name: 'get_task_context',
  description: 'Get comprehensive task context including related documents and AI conversations',
  inputSchema: {
    type: 'object',
    properties: {
      task_id: {
        type: 'string',
        format: 'uuid',
        description: 'The unique identifier of the task'
      }
    },
    required: ['task_id']
  }
}

export const getTaskContext = requireAuth(async (args: any) => {
  const { task_id } = GetTaskContextSchema.parse(args)
  
  logger.info('Getting task context', { task_id })
  
  // Get the task first to get project info
  const task = await supabaseService.getTask(task_id)
  
  // Get related documents from the same project
  const relatedDocuments = await supabaseService.getDocuments(
    { project_id: task.project_id },
    { limit: 10 },
    { field: 'updated_at', order: 'desc' }
  )
  
  // Get AI-friendly task analysis
  const taskAnalysis = {
    completion_status: calculateCompletionStatus(task),
    time_estimates: estimateTimeRequirements(task),
    dependencies: findTaskDependencies(task),
    suggested_actions: generateTaskSuggestions(task),
    related_documentation: relatedDocuments.filter(doc => 
      doc.content.toLowerCase().includes(task.title.toLowerCase()) ||
      (task.description && doc.content.toLowerCase().includes(task.description.toLowerCase()))
    )
  }
  
  return {
    task,
    related_documents: relatedDocuments,
    task_analysis: taskAnalysis,
    ai_suggestions: generateTaskAISuggestions(task, taskAnalysis)
  }
})


// Helper functions for task analysis
function calculateCompletionStatus(task: any): string {
  if (task.status === 'done') return 'done'
  if (task.status === 'todo') return 'todo' // blocked status doesn't exist in schema
  if (task.due_date && new Date(task.due_date) < new Date()) return 'overdue'
  if (task.status === 'in_progress') return 'active'
  return 'todo'
}

function estimateTimeRequirements(task: any): object {
  // Simple estimation based on description length and complexity
  const descriptionLength = task.description?.length || 0
  const priority = task.priority
  
  let estimatedHours = 2 // Base estimate
  
  if (descriptionLength > 500) estimatedHours += 2
  if (priority === 'high' || priority === 'urgent') estimatedHours += 1
  
  return {
    estimated_hours: estimatedHours,
    confidence: 'low', // Would be higher with historical data
    factors_considered: ['description_length', 'priority']
  }
}

function findTaskDependencies(task: any): string[] {
  // In a real implementation, you'd analyze task relationships
  // For now, return empty array
  return []
}

function generateTaskSuggestions(task: any): string[] {
  const suggestions: string[] = []
  
  if (!task.description) {
    suggestions.push('Add a detailed description to help with task execution')
  }
  
  if (!task.due_date) {
    suggestions.push('Set a due date to improve planning and prioritization')
  }
  
  if (!task.assignee_id) {
    suggestions.push('Assign the task to a team member for accountability')
  }
  
  if (task.status === 'todo' && task.priority === 'high') {
    suggestions.push('Consider moving this high-priority task to in_progress')
  }
  
  return suggestions
}

function generateTaskAISuggestions(task: any, analysis: any): string[] {
  const suggestions: string[] = []
  
  if (analysis.completion_status === 'overdue') {
    suggestions.push('This task is overdue. Consider reassessing the scope or extending the deadline.')
  }
  
  if (analysis.estimated_hours > 8) {
    suggestions.push('This task seems complex. Consider breaking it into smaller subtasks.')
  }
  
  if (analysis.related_documentation.length === 0) {
    suggestions.push('No related documentation found. Consider creating supporting documents.')
  }
  
  return suggestions
}

function identifyBottlenecks(taskBoard: any): string[] {
  const bottlenecks: string[] = []
  
  if (taskBoard.in_progress.length > taskBoard.todo.length * 2) {
    bottlenecks.push('Too many tasks in progress - consider focusing on completion')
  }
  
  if (taskBoard.blocked.length > 0) {
    bottlenecks.push(`${taskBoard.blocked.length} blocked task(s) need attention`)
  }
  
  return bottlenecks
}

function calculateFlowMetrics(taskBoard: any): object {
  const total = Object.values(taskBoard).flat().length
  
  return {
    wip_limit_suggestion: Math.max(3, Math.floor(total * 0.3)),
    throughput_potential: taskBoard.done.length > taskBoard.in_progress.length ? 'good' : 'concerning',
    cycle_time_estimate: 'unavailable' // Would calculate with historical data
  }
}


// Removed task tools export from here - will be at end of file

/**
 * Get task by ID
 */
export const getTaskTool: MCPTool = {
  name: 'get_task',
  description: 'Get a task by ID with full details',
  inputSchema: {
    type: 'object',
    properties: {
      task_id: {
        type: 'string',
        format: 'uuid',
        description: 'The unique identifier of the task'
      }
    },
    required: ['task_id']
  }
}

export const getTask = requireAuth(async (args: any) => {
  const { task_id } = GetTaskSchema.parse(args)
  
  logger.info('Getting task', { task_id })
  
  try {
    // Use the direct getTask method instead of searching
    const task = await supabaseService.getTask(task_id)
    
    logger.info('Task retrieved successfully', { task_id, title: task.title })
    
    return {
      task,
      message: `Task "${task.title}" retrieved successfully`
    }
  } catch (error: any) {
    logger.error('Failed to get task', { 
      task_id, 
      error: error.message,
      errorCode: error.code,
      statusCode: error.statusCode,
      fullError: error
    })
    
    // Handle NotFoundError specifically
    if (error.code === 'NOT_FOUND' || error.statusCode === 404) {
      throw new Error(`Task with ID ${task_id} not found`)
    }
    
    // Re-throw other errors
    throw error
  }
})

/**
 * Add task dependency
 */
export const addTaskDependencyTool: MCPTool = {
  name: 'add_task_dependency',
  description: 'Add a dependency relationship between tasks',
  inputSchema: {
    type: 'object',
    properties: {
      task_id: {
        type: 'string',
        description: 'ID of the dependent task'
      },
      depends_on_task_id: {
        type: 'string',
        description: 'ID of the task this task depends on'
      },
      dependency_type: {
        type: 'string',
        enum: ['blocks', 'subtask', 'related'],
        default: 'blocks',
        description: 'Type of dependency relationship'
      }
    },
    required: ['task_id', 'depends_on_task_id']
  }
}

const AddTaskDependencySchema = z.object({
  task_id: z.string().min(1),
  depends_on_task_id: z.string().min(1),
  dependency_type: z.enum(['blocks', 'subtask', 'related']).default('blocks')
})

export const addTaskDependency = requireAuth(async (args: any) => {
  const { task_id, depends_on_task_id, dependency_type } = AddTaskDependencySchema.parse(args)
  
  logger.info('Adding task dependency', { task_id, depends_on_task_id, dependency_type })

  // Validate tasks exist
  const [task, dependsOnTask] = await Promise.all([
    supabaseService.getTask(task_id),
    supabaseService.getTask(depends_on_task_id)
  ])

  if (!task || !dependsOnTask) {
    throw new Error('One or both tasks not found')
  }

  // Check for circular dependencies
  const hasCircularDependency = await checkCircularDependency(task_id, depends_on_task_id)
  if (hasCircularDependency) {
    throw new Error('Cannot create dependency: would create circular dependency')
  }

  // Create dependency record
  const dependency = await supabaseService.createTaskDependency({
    task_id,
    depends_on_task_id,
    dependency_type,
    created_at: new Date().toISOString()
  })

  // Note: blocked status doesn't exist in database schema
  // In a real implementation, you might use metadata or a separate blocking system

  return {
    dependency,
    task: await supabaseService.getTask(task_id),
    depends_on_task: dependsOnTask,
    message: `Dependency created: "${task.title}" ${dependency_type} "${dependsOnTask.title}"`
  }
})

/**
 * Get task dependencies
 */
export const getTaskDependenciesTool: MCPTool = {
  name: 'get_task_dependencies',
  description: 'Get all dependencies for a task or project',
  inputSchema: {
    type: 'object',
    properties: {
      task_id: {
        type: 'string',
        description: 'ID of the task (optional if project_id provided)'
      },
      project_id: {
        type: 'string',
        description: 'ID of the project (optional if task_id provided)'
      },
      include_transitive: {
        type: 'boolean',
        default: false,
        description: 'Include transitive dependencies'
      }
    }
  }
}

const GetTaskDependenciesSchema = z.object({
  task_id: z.string().optional(),
  project_id: z.string().optional(),
  include_transitive: z.boolean().default(false)
}).refine(data => data.task_id || data.project_id, {
  message: "Either task_id or project_id must be provided"
})

export const getTaskDependencies = requireAuth(async (args: any) => {
  const { task_id, project_id, include_transitive } = GetTaskDependenciesSchema.parse(args)
  
  logger.info('Getting task dependencies', { task_id, project_id, include_transitive })

  let dependencies
  if (task_id) {
    dependencies = await supabaseService.getTaskDependencies(task_id)
  } else {
    dependencies = await supabaseService.getProjectDependencies(project_id!)
  }

  // Build dependency graph
  const dependencyGraph = buildDependencyGraph(dependencies)
  
  // Calculate critical path if project-level
  let criticalPath = null
  if (project_id) {
    const projectTasks = await supabaseService.getTasks({ project_id })
    criticalPath = calculateCriticalPath(projectTasks, dependencies)
  }

  return {
    dependencies,
    dependency_graph: dependencyGraph,
    critical_path: criticalPath,
    blocked_tasks: dependencies.filter(d => d.dependency_type === 'blocks' && d.depends_on_task?.status !== 'done'),
    analysis: analyzeDependencies(dependencies)
  }
})

/**
 * Create task workflow
 */
export const createTaskWorkflowTool: MCPTool = {
  name: 'create_task_workflow',
  description: 'Create a workflow with multiple connected tasks',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: {
        type: 'string',
        description: 'ID of the project'
      },
      workflow_name: {
        type: 'string',
        description: 'Name of the workflow'
      },
      tasks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            assignee_id: { type: 'string' },
            priority: { type: 'string', enum: ['low', 'medium', 'high'] },
            estimated_hours: { type: 'number' },
            depends_on: { 
              type: 'array',
              items: { type: 'number' },
              description: 'Array of task indices this task depends on'
            }
          },
          required: ['title']
        },
        description: 'Array of tasks to create in the workflow'
      },
      auto_start: {
        type: 'boolean',
        default: false,
        description: 'Whether to automatically start the first tasks'
      }
    },
    required: ['project_id', 'workflow_name', 'tasks']
  }
}

const CreateTaskWorkflowSchema = z.object({
  project_id: z.string().min(1),
  workflow_name: z.string().min(1),
  tasks: z.array(z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    assignee_id: z.string().optional(),
    priority: z.enum(['low', 'medium', 'high']).default('medium'),
    estimated_hours: z.number().positive().optional(),
    depends_on: z.array(z.number()).default([])
  })).min(1),
  auto_start: z.boolean().default(false)
})

export const createTaskWorkflow = requireAuth(async (args: any) => {
  const { project_id, workflow_name, tasks, auto_start } = CreateTaskWorkflowSchema.parse(args)
  
  logger.info('Creating task workflow', { project_id, workflow_name, task_count: tasks.length })

  const createdTasks = []
  const taskMap = new Map() // Map task index to created task ID
  
  // Create all tasks first
  for (let i = 0; i < tasks.length; i++) {
    const taskData = tasks[i]
    const task = await supabaseService.createTask({
      title: taskData.title,
      description: taskData.description || null,
      project_id,
      initiative_id: null,
      status: 'todo',
      priority: taskData.priority,
      assignee_id: taskData.assignee_id || null,
      due_date: null
      // Removed metadata as it doesn't exist in the database schema
    })
    
    createdTasks.push(task)
    taskMap.set(i, task.id)
  }

  // Create dependencies
  const dependencies = []
  for (let i = 0; i < tasks.length; i++) {
    const taskData = tasks[i]
    const currentTaskId = taskMap.get(i)!
    
    for (const dependsOnIndex of taskData.depends_on) {
      if (dependsOnIndex < i) { // Only allow dependencies on previous tasks
        const dependsOnTaskId = taskMap.get(dependsOnIndex)!
        const dependency = await supabaseService.createTaskDependency({
          task_id: currentTaskId,
          depends_on_task_id: dependsOnTaskId,
          dependency_type: 'blocks'
        })
        dependencies.push(dependency)
      }
    }
  }

  // Auto-start first tasks if requested
  if (auto_start) {
    const firstTasks = createdTasks.filter((_, index) => tasks[index].depends_on.length === 0)
    for (const task of firstTasks) {
      await supabaseService.updateTask(task.id, {
        status: 'todo',
        updated_at: new Date().toISOString()
      })
    }
  }

  return {
    workflow_name,
    tasks_created: createdTasks.length,
    dependencies_created: dependencies.length,
    tasks: createdTasks,
    dependencies,
    ready_tasks: auto_start ? createdTasks.filter((_, i) => tasks[i].depends_on.length === 0).length : 0
  }
})

/**
 * Bulk update tasks
 */
export const bulkUpdateTasksTool: MCPTool = {
  name: 'bulk_update_tasks',
  description: 'Update multiple tasks at once',
  inputSchema: {
    type: 'object',
    properties: {
      task_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of task IDs to update'
      },
      updates: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['todo', 'in_progress', 'done'] },
          priority: { type: 'string', enum: ['low', 'medium', 'high'] },
          assignee_id: { type: 'string' },
          due_date: { type: 'string', format: 'date-time' }
        },
        description: 'Updates to apply to all tasks'
      },
      cascade_dependencies: {
        type: 'boolean',
        default: false,
        description: 'Whether to update dependent tasks automatically'
      }
    },
    required: ['task_ids', 'updates']
  }
}

const BulkUpdateTasksSchema = z.object({
  task_ids: z.array(z.string().min(1)).min(1),
  updates: z.object({
    status: z.enum(['todo', 'in_progress', 'done']).optional(),
    priority: z.enum(['low', 'medium', 'high']).optional(),
    assignee_id: z.string().optional(),
    due_date: z.string().datetime().optional()
  }),
  cascade_dependencies: z.boolean().default(false)
})

export const bulkUpdateTasks = requireAuth(async (args: any) => {
  const { task_ids, updates, cascade_dependencies } = BulkUpdateTasksSchema.parse(args)
  
  logger.info('Bulk updating tasks', { task_count: task_ids.length, updates, cascade_dependencies })

  const results = []
  const now = new Date().toISOString()

  for (const task_id of task_ids) {
    try {
      const updateData = {
        ...updates,
        updated_at: now
      }

      // Handle status change cascading
      if (updates.status === 'done' && cascade_dependencies) {
        await handleTaskCompletion(task_id)
      }

      const result = await supabaseService.updateTask(task_id, updateData)
      results.push({
        task_id,
        success: true,
        task: result
      })
    } catch (error) {
      logger.error(`Failed to update task ${task_id}:`, error)
      results.push({
        task_id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  return {
    summary: {
      total_tasks: task_ids.length,
      successful_updates: results.filter(r => r.success).length,
      failed_updates: results.filter(r => !r.success).length
    },
    results,
    applied_updates: updates
  }
})

/**
 * Get task workflow status
 */
export const getTaskWorkflowStatusTool: MCPTool = {
  name: 'get_task_workflow_status',
  description: 'Get status and progress of a task workflow',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: {
        type: 'string',
        description: 'ID of the project'
      },
      workflow_name: {
        type: 'string',
        description: 'Name of the workflow'
      }
    },
    required: ['project_id', 'workflow_name']
  }
}

const GetTaskWorkflowStatusSchema = z.object({
  project_id: z.string().min(1),
  workflow_name: z.string().min(1)
})

export const getTaskWorkflowStatus = requireAuth(async (args: any) => {
  const { project_id, workflow_name } = GetTaskWorkflowStatusSchema.parse(args)
  
  logger.info('Getting workflow status', { project_id, workflow_name })

  // Get workflow tasks (metadata_filter not available)
  const tasks = await supabaseService.getTasks({
    project_id
    // metadata_filter not available as metadata doesn't exist in database schema
  })

  if (tasks.length === 0) {
    throw new Error(`Workflow "${workflow_name}" not found`)
  }

  // Calculate progress
  const totalTasks = tasks.length
  const completedTasks = tasks.filter(t => t.status === 'done').length
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress').length
  const todoTasks = tasks.filter(t => t.status === 'todo').length

  // Get dependencies for this workflow
  const dependencies = await supabaseService.getProjectDependencies(project_id)
  const workflowDependencies = dependencies.filter(d => 
    tasks.some(t => t.id === d.task_id) && tasks.some(t => t.id === d.depends_on_task_id)
  )

  // Calculate critical path
  const criticalPath = calculateCriticalPath(tasks, workflowDependencies)
  
  // Identify bottlenecks
  const bottlenecks = identifyWorkflowBottlenecks(tasks, workflowDependencies)

  return {
    workflow_name,
    progress: {
      total_tasks: totalTasks,
      completed_tasks: completedTasks,
      in_progress_tasks: inProgressTasks,
      todo_tasks: todoTasks,
      completion_percentage: Math.round((completedTasks / totalTasks) * 100)
    },
    critical_path: criticalPath,
    bottlenecks,
    next_actions: getNextWorkflowActions(tasks, workflowDependencies),
    estimated_completion: estimateWorkflowCompletion(tasks, workflowDependencies)
  }
})

// Helper functions
async function checkCircularDependency(taskId: string, dependsOnTaskId: string): Promise<boolean> {
  // Implement circular dependency check
  const visited = new Set()
  const recursionStack = new Set()
  
  async function hasCycle(currentTaskId: string): Promise<boolean> {
    if (recursionStack.has(currentTaskId)) return true
    if (visited.has(currentTaskId)) return false
    
    visited.add(currentTaskId)
    recursionStack.add(currentTaskId)
    
    const dependencies = await supabaseService.getTaskDependencies(currentTaskId)
    for (const dep of dependencies) {
      if (await hasCycle(dep.depends_on_task_id)) return true
    }
    
    recursionStack.delete(currentTaskId)
    return false
  }
  
  return await hasCycle(dependsOnTaskId)
}

function buildDependencyGraph(dependencies: any[]): any {
  const graph: { [key: string]: string[] } = {}
  
  dependencies.forEach(dep => {
    if (!graph[dep.depends_on_task_id]) graph[dep.depends_on_task_id] = []
    graph[dep.depends_on_task_id].push(dep.task_id)
  })
  
  return graph
}

function calculateCriticalPath(tasks: any[], dependencies: any[]): any {
  // Simplified critical path calculation
  const taskMap = new Map(tasks.map(t => [t.id, t]))
  const graph = buildDependencyGraph(dependencies)
  
  // Calculate earliest start times
  const earliestStart: { [key: string]: number } = {}
  const duration: { [key: string]: number } = {}
  
  tasks.forEach(task => {
    duration[task.id] = task.estimated_hours || 8 // Default 1 day
    earliestStart[task.id] = 0
  })
  
  // Topological sort and calculate earliest times
  const sorted = topologicalSort(tasks, dependencies)
  sorted.forEach(taskId => {
    const deps = dependencies.filter(d => d.task_id === taskId)
    if (deps.length > 0) {
      earliestStart[taskId] = Math.max(...deps.map(d => 
        earliestStart[d.depends_on_task_id] + duration[d.depends_on_task_id]
      ))
    }
  })
  
  // Find critical path (longest path)
  const criticalTasks = sorted.filter(taskId => {
    const task = taskMap.get(taskId)
    return task && (task.priority === 'high' || task.priority === 'urgent')
  })
  
  return {
    path: criticalTasks,
    total_duration: Math.max(...Object.values(earliestStart).map((start, i) => 
      start + Object.values(duration)[i]
    )),
    bottleneck_tasks: criticalTasks.slice(0, 3)
  }
}

function topologicalSort(tasks: any[], dependencies: any[]): string[] {
  const inDegree: { [key: string]: number } = {}
  const graph: { [key: string]: string[] } = {}
  
  // Initialize
  tasks.forEach(task => {
    inDegree[task.id] = 0
    graph[task.id] = []
  })
  
  // Build graph and count in-degrees
  dependencies.forEach(dep => {
    graph[dep.depends_on_task_id].push(dep.task_id)
    inDegree[dep.task_id]++
  })
  
  // Kahn's algorithm
  const queue = tasks.filter(task => inDegree[task.id] === 0).map(t => t.id)
  const result = []
  
  while (queue.length > 0) {
    const current = queue.shift()!
    result.push(current)
    
    graph[current].forEach(neighbor => {
      inDegree[neighbor]--
      if (inDegree[neighbor] === 0) {
        queue.push(neighbor)
      }
    })
  }
  
  return result
}

function analyzeDependencies(dependencies: any[]): any {
  return {
    total_dependencies: dependencies.length,
    blocking_dependencies: dependencies.filter(d => d.dependency_type === 'blocks').length,
    subtask_relationships: dependencies.filter(d => d.dependency_type === 'subtask').length,
    related_links: dependencies.filter(d => d.dependency_type === 'related').length,
    complexity_score: Math.min(dependencies.length * 0.1, 1) // 0-1 scale
  }
}

async function handleTaskCompletion(taskId: string): Promise<void> {
  // Get dependent tasks
  const dependencies = await supabaseService.getTaskDependencies(taskId)
  const dependentTasks = dependencies.filter(d => d.depends_on_task_id === taskId)
  
  // Update dependent tasks that are no longer blocked
  for (const dep of dependentTasks) {
    const otherDeps = await supabaseService.getTaskDependencies(dep.task_id)
    const stillBlocked = otherDeps.some(d => 
      d.depends_on_task_id !== taskId && 
      d.dependency_type === 'blocks' && 
      d.depends_on_task?.status !== 'done'
    )
    
    if (!stillBlocked && dep.task?.status === 'blocked') {
      await supabaseService.updateTask(dep.task_id, {
        status: 'todo',
        updated_at: new Date().toISOString()
      })
    }
  }
}

function identifyWorkflowBottlenecks(tasks: any[], dependencies: any[]): any[] {
  const bottlenecks = []
  
  // Tasks with many dependencies
  const dependencyCounts = new Map()
  dependencies.forEach(dep => {
    dependencyCounts.set(dep.task_id, (dependencyCounts.get(dep.task_id) || 0) + 1)
  })
  
  // High-dependency tasks
  const highDependencyTasks = tasks.filter(task => 
    (dependencyCounts.get(task.id) || 0) > 2
  )
  
  bottlenecks.push(...highDependencyTasks.map(task => ({
    task_id: task.id,
    title: task.title,
    type: 'high_dependencies',
    dependency_count: dependencyCounts.get(task.id) || 0
  })))
  
  // Overdue tasks that block others
  const overdueBlockers = tasks.filter(task => 
    task.due_date && 
    new Date(task.due_date) < new Date() && 
    task.status !== 'done' &&
    dependencies.some(d => d.depends_on_task_id === task.id)
  )
  
  bottlenecks.push(...overdueBlockers.map(task => ({
    task_id: task.id,
    title: task.title,
    type: 'overdue_blocker',
    days_overdue: Math.ceil((Date.now() - new Date(task.due_date!).getTime()) / (1000 * 60 * 60 * 24))
  })))
  
  return bottlenecks
}

function getNextWorkflowActions(tasks: any[], dependencies: any[]): string[] {
  const actions = []
  
  // Todo tasks
  const todoTasks = tasks.filter(t => t.status === 'todo')
  if (todoTasks.length > 0) {
    actions.push(`Start ${todoTasks.length} todo task(s): ${todoTasks.map(t => t.title).join(', ')}`)
  }
  
  // Blocked tasks that could be unblocked
  const blockedTasks = tasks.filter(t => t.status === 'blocked')
  if (blockedTasks.length > 0) {
    actions.push(`Review ${blockedTasks.length} blocked task(s) for potential unblocking`)
  }
  
  // Overdue tasks
  const overdueTasks = tasks.filter(t => 
    t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done'
  )
  if (overdueTasks.length > 0) {
    actions.push(`Address ${overdueTasks.length} overdue task(s) immediately`)
  }
  
  return actions
}

function estimateWorkflowCompletion(tasks: any[], dependencies: any[]): any {
  const remainingTasks = tasks.filter(t => t.status !== 'done')
  const totalEstimatedHours = remainingTasks.reduce((sum, task) => 
    sum + (task.estimated_hours || 8), 0
  )
  
  // Assume 8 hours per day, 5 days per week
  const estimatedDays = Math.ceil(totalEstimatedHours / 8)
  const estimatedDate = new Date()
  estimatedDate.setDate(estimatedDate.getDate() + estimatedDays)
  
  return {
    remaining_tasks: remainingTasks.length,
    estimated_hours: totalEstimatedHours,
    estimated_days: estimatedDays,
    estimated_completion_date: estimatedDate.toISOString().split('T')[0],
    confidence: remainingTasks.every(t => t.estimated_hours) ? 'high' : 'medium'
  }
}

// Export all task tools
export const taskTools = {
  listTasksTool,
  createTaskTool,
  getTaskTool,
  updateTaskTool,
  addTaskDependencyTool,
  getTaskDependenciesTool,
  createTaskWorkflowTool,
  bulkUpdateTasksTool,
  getTaskWorkflowStatusTool
}

export const taskHandlers = {
  list_tasks: listTasks,
  create_task: createTask,
  get_task: getTask,
  update_task: updateTask,
  add_task_dependency: addTaskDependency,
  get_task_dependencies: getTaskDependencies,
  create_task_workflow: createTaskWorkflow,
  bulk_update_tasks: bulkUpdateTasks,
  get_task_workflow_status: getTaskWorkflowStatus
}