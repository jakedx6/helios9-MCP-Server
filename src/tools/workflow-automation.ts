import { z } from 'zod'
// Local type definitions
interface MCPTool {
  name: string
  description: string
  inputSchema: any
}
import { supabaseService } from '../lib/api-client.js'
import { requireAuth } from '../lib/auth.js'
import { logger } from '../lib/logger.js'

/**
 * Create workflow automation rule
 */
export const createWorkflowRuleTool: MCPTool = {
  name: 'create_workflow_rule',
  description: 'Create an automation rule that triggers actions based on events',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Name of the automation rule'
      },
      description: {
        type: 'string',
        description: 'Description of what this rule does'
      },
      trigger: {
        type: 'object',
        properties: {
          event_type: {
            type: 'string',
            enum: ['task_status_changed', 'task_created', 'task_overdue', 'project_status_changed', 'document_created', 'document_updated'],
            description: 'Type of event that triggers this rule'
          },
          conditions: {
            type: 'object',
            description: 'Conditions that must be met for trigger to fire'
          }
        },
        required: ['event_type']
      },
      actions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            action_type: {
              type: 'string',
              enum: ['create_task', 'update_task', 'send_notification', 'assign_task', 'move_task', 'create_document'],
              description: 'Type of action to perform'
            },
            parameters: {
              type: 'object',
              description: 'Parameters for the action'
            }
          },
          required: ['action_type', 'parameters']
        },
        description: 'Actions to perform when rule is triggered'
      },
      project_id: {
        type: 'string',
        description: 'Project this rule applies to (optional for global rules)'
      },
      enabled: {
        type: 'boolean',
        default: true,
        description: 'Whether this rule is active'
      }
    },
    required: ['name', 'trigger', 'actions']
  }
}

const CreateWorkflowRuleSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  trigger: z.object({
    event_type: z.enum(['task_status_changed', 'task_created', 'task_overdue', 'project_status_changed', 'document_created', 'document_updated']),
    conditions: z.record(z.any()).optional()
  }),
  actions: z.array(z.object({
    action_type: z.enum(['create_task', 'update_task', 'send_notification', 'assign_task', 'move_task', 'create_document']),
    parameters: z.record(z.any())
  })).min(1),
  project_id: z.string().optional(),
  enabled: z.boolean().default(true)
})

export const createWorkflowRule = requireAuth(async (args: any) => {
  const { name, description, trigger, actions, project_id, enabled } = CreateWorkflowRuleSchema.parse(args)
  
  logger.info('Creating workflow rule', { name, trigger: trigger.event_type, actions: actions.length })

  const rule = await supabaseService.createWorkflowRule({
    name,
    description,
    trigger,
    actions,
    project_id,
    enabled,
    created_at: new Date().toISOString()
  })

  return {
    rule,
    message: `Workflow rule "${name}" created successfully`
  }
})

/**
 * List workflow rules
 */
export const listWorkflowRulesTool: MCPTool = {
  name: 'list_workflow_rules',
  description: 'List all automation rules for a project or globally',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: {
        type: 'string',
        description: 'Project ID to filter rules (optional)'
      },
      enabled_only: {
        type: 'boolean',
        default: true,
        description: 'Only return enabled rules'
      }
    }
  }
}

const ListWorkflowRulesSchema = z.object({
  project_id: z.string().optional(),
  enabled_only: z.boolean().default(true)
})

export const listWorkflowRules = requireAuth(async (args: any) => {
  const { project_id, enabled_only } = ListWorkflowRulesSchema.parse(args)
  
  logger.info('Listing workflow rules', { project_id, enabled_only })

  const rules = await supabaseService.getWorkflowRules({
    project_id,
    enabled: enabled_only ? true : undefined
  })

  return {
    rules,
    total_rules: rules.length,
    active_rules: rules.filter(r => r.enabled).length
  }
})

/**
 * Execute workflow rule manually
 */
export const executeWorkflowRuleTool: MCPTool = {
  name: 'execute_workflow_rule',
  description: 'Manually execute a workflow rule for testing',
  inputSchema: {
    type: 'object',
    properties: {
      rule_id: {
        type: 'string',
        description: 'ID of the rule to execute'
      },
      test_data: {
        type: 'object',
        description: 'Test data to simulate the trigger event'
      },
      dry_run: {
        type: 'boolean',
        default: false,
        description: 'If true, only simulate execution without performing actions'
      }
    },
    required: ['rule_id']
  }
}

const ExecuteWorkflowRuleSchema = z.object({
  rule_id: z.string().min(1),
  test_data: z.record(z.any()).optional(),
  dry_run: z.boolean().default(false)
})

export const executeWorkflowRule = requireAuth(async (args: any) => {
  const { rule_id, test_data, dry_run } = ExecuteWorkflowRuleSchema.parse(args)
  
  logger.info('Executing workflow rule', { rule_id, dry_run })

  const rule = await supabaseService.getWorkflowRule(rule_id)
  if (!rule) {
    throw new Error('Workflow rule not found')
  }

  if (!rule.enabled && !dry_run) {
    throw new Error('Cannot execute disabled rule (use dry_run for testing)')
  }

  const executionResults = []
  
  for (const action of rule.actions) {
    try {
      const result = await executeAction(action, test_data, dry_run)
      executionResults.push({
        action_type: action.action_type,
        success: true,
        result,
        dry_run
      })
    } catch (error) {
      logger.error(`Failed to execute action ${action.action_type}:`, error)
      executionResults.push({
        action_type: action.action_type,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        dry_run
      })
    }
  }

  // Log execution if not dry run
  if (!dry_run) {
    await supabaseService.logWorkflowExecution({
      rule_id,
      trigger_data: test_data,
      execution_results: executionResults,
      executed_at: new Date().toISOString()
    })
  }

  return {
    rule_name: rule.name,
    executed_actions: executionResults.length,
    successful_actions: executionResults.filter(r => r.success).length,
    failed_actions: executionResults.filter(r => !r.success).length,
    results: executionResults,
    dry_run
  }
})

/**
 * Create trigger-based automation
 */
export const createTriggerAutomationTool: MCPTool = {
  name: 'create_trigger_automation',
  description: 'Create automated workflows triggered by specific events',
  inputSchema: {
    type: 'object',
    properties: {
      automation_name: {
        type: 'string',
        description: 'Name of the automation'
      },
      trigger_events: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['task_completed', 'task_blocked', 'deadline_approaching', 'project_milestone', 'team_member_assigned']
        },
        description: 'Events that trigger this automation'
      },
      conditions: {
        type: 'object',
        properties: {
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
          project_id: { type: 'string' },
          assignee_id: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } }
        },
        description: 'Conditions that must be met'
      },
      automated_actions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { 
              type: 'string', 
              enum: ['create_follow_up_task', 'notify_team', 'update_project_status', 'assign_reviewer', 'schedule_meeting'] 
            },
            config: { type: 'object' }
          },
          required: ['type', 'config']
        },
        description: 'Actions to perform automatically'
      },
      project_scope: {
        type: 'string',
        enum: ['single_project', 'all_projects', 'specific_projects'],
        default: 'single_project',
        description: 'Scope of automation'
      }
    },
    required: ['automation_name', 'trigger_events', 'automated_actions']
  }
}

const CreateTriggerAutomationSchema = z.object({
  automation_name: z.string().min(1).max(200),
  trigger_events: z.array(z.enum(['task_completed', 'task_blocked', 'deadline_approaching', 'project_milestone', 'team_member_assigned'])).min(1),
  conditions: z.object({
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    project_id: z.string().optional(),
    assignee_id: z.string().optional(),
    tags: z.array(z.string()).optional()
  }).optional(),
  automated_actions: z.array(z.object({
    type: z.enum(['create_follow_up_task', 'notify_team', 'update_project_status', 'assign_reviewer', 'schedule_meeting']),
    config: z.record(z.any())
  })).min(1),
  project_scope: z.enum(['single_project', 'all_projects', 'specific_projects']).default('single_project')
})

export const createTriggerAutomation = requireAuth(async (args: any) => {
  const { automation_name, trigger_events, conditions, automated_actions, project_scope } = CreateTriggerAutomationSchema.parse(args)
  
  logger.info('Creating trigger automation', { automation_name, trigger_events, actions_count: automated_actions.length })

  const automation = await supabaseService.createTriggerAutomation({
    name: automation_name,
    trigger_events,
    conditions: conditions || {},
    actions: automated_actions,
    scope: project_scope,
    enabled: true,
    created_at: new Date().toISOString()
  })

  return {
    automation,
    trigger_count: trigger_events.length,
    action_count: automated_actions.length,
    scope: project_scope,
    message: `Automation "${automation_name}" created and enabled`
  }
})

/**
 * Get automation analytics
 */
export const getAutomationAnalyticsTool: MCPTool = {
  name: 'get_automation_analytics',
  description: 'Get analytics and performance data for workflow automations',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: {
        type: 'string',
        description: 'Project ID to filter analytics (optional)'
      },
      time_range: {
        type: 'string',
        enum: ['day', 'week', 'month', 'quarter'],
        default: 'week',
        description: 'Time range for analytics'
      },
      include_inactive: {
        type: 'boolean',
        default: false,
        description: 'Include disabled automations in analytics'
      }
    }
  }
}

const GetAutomationAnalyticsSchema = z.object({
  project_id: z.string().optional(),
  time_range: z.enum(['day', 'week', 'month', 'quarter']).default('week'),
  include_inactive: z.boolean().default(false)
})

export const getAutomationAnalytics = requireAuth(async (args: any) => {
  const { project_id, time_range, include_inactive } = GetAutomationAnalyticsSchema.parse(args)
  
  logger.info('Getting automation analytics', { project_id, time_range })

  const [rules, executions] = await Promise.all([
    supabaseService.getWorkflowRules({ 
      project_id, 
      enabled: include_inactive ? undefined : true 
    }),
    supabaseService.getWorkflowExecutions({ 
      project_id, 
      time_range 
    })
  ])

  // Calculate analytics
  const analytics = calculateAutomationAnalytics(rules, executions, time_range)

  return {
    summary: {
      total_rules: rules.length,
      active_rules: rules.filter(r => r.enabled).length,
      total_executions: executions.length,
      successful_executions: executions.filter(e => e.success).length,
      time_range
    },
    performance: analytics.performance,
    top_performers: analytics.topPerformers,
    failure_analysis: analytics.failureAnalysis,
    recommendations: analytics.recommendations
  }
})

// Helper functions
async function executeAction(action: any, testData: any, dryRun: boolean): Promise<any> {
  if (dryRun) {
    return { simulated: true, action_type: action.action_type, parameters: action.parameters }
  }

  switch (action.action_type) {
    case 'create_task':
      return await supabaseService.createTask({
        title: action.parameters.title,
        description: action.parameters.description,
        project_id: action.parameters.project_id || testData?.project_id,
        initiative_id: null,
        priority: action.parameters.priority || 'medium',
        assignee_id: action.parameters.assignee_id,
        status: 'todo',
        due_date: null
      })

    case 'update_task':
      return await supabaseService.updateTask(
        action.parameters.task_id || testData?.task_id,
        action.parameters.updates
      )

    case 'send_notification':
      // Would integrate with notification service
      return { 
        notification_sent: true, 
        recipient: action.parameters.recipient,
        message: action.parameters.message 
      }

    case 'assign_task':
      return await supabaseService.updateTask(
        action.parameters.task_id || testData?.task_id,
        { assignee_id: action.parameters.assignee_id }
      )

    case 'move_task':
      return await supabaseService.updateTask(
        action.parameters.task_id || testData?.task_id,
        { status: action.parameters.new_status }
      )

    case 'create_document':
      return await supabaseService.createDocument({
        title: action.parameters.title,
        content: action.parameters.content,
        project_id: action.parameters.project_id || testData?.project_id,
        document_type: action.parameters.document_type || 'note'
      })

    default:
      throw new Error(`Unknown action type: ${action.action_type}`)
  }
}

function calculateAutomationAnalytics(rules: any[], executions: any[], timeRange: string): any {
  const now = new Date()
  const timeRangeMs = getTimeRangeMs(timeRange)
  const recentExecutions = executions.filter(e => 
    new Date(e.executed_at).getTime() > now.getTime() - timeRangeMs
  )

  // Performance metrics
  const performance = {
    total_executions: recentExecutions.length,
    success_rate: recentExecutions.length > 0 ? 
      (recentExecutions.filter(e => e.success).length / recentExecutions.length) * 100 : 0,
    average_execution_time: calculateAverageExecutionTime(recentExecutions),
    executions_per_day: recentExecutions.length / getDaysInRange(timeRange)
  }

  // Top performing rules
  const rulePerformance = new Map()
  recentExecutions.forEach(exec => {
    const ruleId = exec.rule_id
    if (!rulePerformance.has(ruleId)) {
      rulePerformance.set(ruleId, { executions: 0, successes: 0 })
    }
    const stats = rulePerformance.get(ruleId)
    stats.executions++
    if (exec.success) stats.successes++
  })

  const topPerformers = Array.from(rulePerformance.entries())
    .map(([ruleId, stats]) => ({
      rule_id: ruleId,
      rule_name: rules.find(r => r.id === ruleId)?.name || 'Unknown',
      executions: stats.executions,
      success_rate: (stats.successes / stats.executions) * 100
    }))
    .sort((a, b) => b.executions - a.executions)
    .slice(0, 5)

  // Failure analysis
  const failures = recentExecutions.filter(e => !e.success)
  const failureReasons = new Map()
  failures.forEach(f => {
    const reason = f.error_message || 'Unknown error'
    failureReasons.set(reason, (failureReasons.get(reason) || 0) + 1)
  })

  const failureAnalysis = {
    total_failures: failures.length,
    failure_rate: recentExecutions.length > 0 ? (failures.length / recentExecutions.length) * 100 : 0,
    common_failures: Array.from(failureReasons.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
  }

  // Recommendations
  const recommendations = generateAutomationRecommendations(performance, failureAnalysis, rules)

  return {
    performance,
    topPerformers,
    failureAnalysis,
    recommendations
  }
}

function getTimeRangeMs(timeRange: string): number {
  const day = 24 * 60 * 60 * 1000
  switch (timeRange) {
    case 'day': return day
    case 'week': return 7 * day
    case 'month': return 30 * day
    case 'quarter': return 90 * day
    default: return 7 * day
  }
}

function getDaysInRange(timeRange: string): number {
  switch (timeRange) {
    case 'day': return 1
    case 'week': return 7
    case 'month': return 30
    case 'quarter': return 90
    default: return 7
  }
}

function calculateAverageExecutionTime(executions: any[]): number {
  if (executions.length === 0) return 0
  
  const totalTime = executions.reduce((sum, exec) => {
    const duration = exec.execution_duration || 1000 // Default 1 second
    return sum + duration
  }, 0)
  
  return Math.round(totalTime / executions.length)
}

function generateAutomationRecommendations(performance: any, failureAnalysis: any, rules: any[]): string[] {
  const recommendations = []

  if (performance.success_rate < 90) {
    recommendations.push('Consider reviewing failed automations to improve reliability')
  }

  if (performance.executions_per_day < 1) {
    recommendations.push('Low automation usage - consider creating more trigger-based rules')
  }

  if (failureAnalysis.failure_rate > 10) {
    recommendations.push('High failure rate detected - review automation conditions and actions')
  }

  if (rules.filter(r => r.enabled).length < 3) {
    recommendations.push('Create more automation rules to improve workflow efficiency')
  }

  if (performance.average_execution_time > 5000) {
    recommendations.push('Long execution times detected - optimize automation actions')
  }

  return recommendations
}

// Export all workflow automation tools
export const workflowAutomationTools = {
  createWorkflowRuleTool,
  listWorkflowRulesTool,
  executeWorkflowRuleTool,
  createTriggerAutomationTool,
  getAutomationAnalyticsTool
}

export const workflowAutomationHandlers = {
  create_workflow_rule: createWorkflowRule,
  list_workflow_rules: listWorkflowRules,
  execute_workflow_rule: executeWorkflowRule,
  create_trigger_automation: createTriggerAutomation,
  get_automation_analytics: getAutomationAnalytics
}