import { z } from 'zod'
import { logger } from '../lib/logger.js'

// Local type definitions
interface MCPPrompt {
  name: string
  description: string
  arguments?: Array<{
    name: string
    description: string
    required: boolean
  }>
}

// Schema definitions for prompt arguments
const ProjectPlanningArgsSchema = z.object({
  description: z.string().min(1),
  context: z.string().optional(),
  team_size: z.number().int().positive().default(3),
  duration: z.string().default('3 months'),
  tech_stack: z.array(z.string()).optional(),
  budget_range: z.string().optional()
})

const InitiativeStrategyArgsSchema = z.object({
  project_id: z.string().uuid(),
  objective: z.string().min(1),
  constraints: z.string().optional(),
  priority_focus: z.enum(['speed', 'quality', 'cost', 'balanced']).default('balanced')
})

const TaskBreakdownArgsSchema = z.object({
  initiative_id: z.string().uuid().optional(),
  feature_description: z.string().min(1),
  acceptance_criteria: z.string().optional(),
  technical_requirements: z.string().optional()
})

const SprintPlanningArgsSchema = z.object({
  project_id: z.string().uuid(),
  sprint_duration: z.number().int().positive().default(14),
  team_capacity: z.number().positive().default(100),
  include_carryover: z.boolean().default(true)
})

const ProjectHealthCheckArgsSchema = z.object({
  project_id: z.string().uuid(),
  analysis_depth: z.enum(['quick', 'standard', 'comprehensive']).default('standard'),
  include_recommendations: z.boolean().default(true)
})

/**
 * Project planning prompt - generates comprehensive project structure
 */
export const projectPlanningPrompt: MCPPrompt = {
  name: 'project_planning',
  description: 'Generate comprehensive project plan with initiatives, tasks, milestones, and documentation',
  arguments: [
    {
      name: 'description',
      description: 'Natural language description of the project goals and requirements',
      required: true
    },
    {
      name: 'context',
      description: 'Additional context about constraints, existing systems, or special requirements',
      required: false
    },
    {
      name: 'team_size',
      description: 'Number of team members available',
      required: false
    },
    {
      name: 'duration',
      description: 'Expected project timeline (e.g., "3 months", "Q1 2024")',
      required: false
    },
    {
      name: 'tech_stack',
      description: 'Technologies to be used (comma-separated)',
      required: false
    },
    {
      name: 'budget_range',
      description: 'Budget constraints or range',
      required: false
    }
  ]
}

export async function generateProjectPlanningPrompt(args: Record<string, any>): Promise<string> {
  const params = ProjectPlanningArgsSchema.parse(args)
  
  logger.info('Generating project planning prompt', { 
    description_length: params.description.length,
    has_context: !!params.context
  })

  return `# HELIOS-9 Strategic Project Planning Request

## Project Overview
**Description**: ${params.description}
${params.context ? `**Additional Context**: ${params.context}` : ''}

## Project Parameters
- **Team Size**: ${params.team_size} members
- **Timeline**: ${params.duration}
${params.tech_stack ? `- **Technology Stack**: ${params.tech_stack.join(', ')}` : ''}
${params.budget_range ? `- **Budget**: ${params.budget_range}` : ''}

## Required Deliverables

Please analyze this project and create a comprehensive plan using the three-tier hierarchy:

### 1. INITIATIVES (Strategic Objectives)
Create 3-5 high-level initiatives that represent major project objectives. Each initiative should:
- Have a clear, measurable objective
- Align with overall project goals
- Be achievable within the timeline
- Include priority level (critical/high/medium/low)

### 2. MILESTONES (Key Deliverables)
For each initiative, define 1-2 milestones that represent significant achievements:
- Clear success criteria
- Target completion dates
- Dependencies on other milestones
- Risk factors

### 3. TASKS (Actionable Work Items)
Break down each initiative into 5-10 specific tasks:
- Clear titles and descriptions
- Acceptance criteria
- Estimated effort (hours/days)
- Required skills/expertise
- Dependencies

### 4. DOCUMENTATION STRATEGY
Recommend essential project documentation:
- Technical specifications
- Architecture decisions
- API documentation
- User guides
- Team processes

### 5. RISK ANALYSIS
Identify potential risks and mitigation strategies:
- Technical risks
- Resource constraints
- Timeline risks
- External dependencies

### 6. RECOMMENDATIONS
Provide strategic recommendations for:
- Team structure and roles
- Development methodology
- Communication patterns
- Success metrics

Please structure your response to be actionable and ready for implementation in the Helios-9 system.`
}

/**
 * Initiative strategy prompt - plans strategic initiatives within a project
 */
export const initiativeStrategyPrompt: MCPPrompt = {
  name: 'initiative_strategy',
  description: 'Generate strategic plan for implementing a specific initiative within a project',
  arguments: [
    {
      name: 'project_id',
      description: 'The project ID this initiative belongs to',
      required: true
    },
    {
      name: 'objective',
      description: 'What this initiative needs to achieve',
      required: true
    },
    {
      name: 'constraints',
      description: 'Any constraints or limitations to consider',
      required: false
    },
    {
      name: 'priority_focus',
      description: 'Primary focus: speed, quality, cost, or balanced',
      required: false
    }
  ]
}

export async function generateInitiativeStrategyPrompt(args: Record<string, any>): Promise<string> {
  const params = InitiativeStrategyArgsSchema.parse(args)
  
  return `# Initiative Strategic Planning

## Objective
${params.objective}

${params.constraints ? `## Constraints\n${params.constraints}\n` : ''}

## Priority Focus: ${params.priority_focus}

Please develop a strategic plan for this initiative including:

### 1. Initiative Breakdown
- Name and clear objective statement
- Success metrics and KPIs
- Timeline with key phases
- Resource requirements

### 2. Task Decomposition
Create a comprehensive task list organized by:
- **Phase 1: Foundation** - Setup and prerequisite tasks
- **Phase 2: Core Development** - Main implementation tasks
- **Phase 3: Integration** - Integration and testing tasks
- **Phase 4: Deployment** - Release and documentation tasks

### 3. Milestone Planning
Define 2-3 critical milestones:
- What constitutes completion
- Target dates aligned with project timeline
- Dependencies and prerequisites
- Go/no-go decision criteria

### 4. Risk Mitigation
- Technical challenges and solutions
- Resource allocation strategies
- Timeline buffers and contingencies
- Quality assurance approach

### 5. Success Criteria
- Measurable outcomes
- Quality benchmarks
- Performance targets
- User acceptance criteria

Ensure all recommendations align with the ${params.priority_focus} priority focus.`
}

/**
 * Task breakdown prompt - converts features into actionable tasks
 */
export const taskBreakdownPrompt: MCPPrompt = {
  name: 'task_breakdown',
  description: 'Break down a feature or requirement into specific, actionable tasks',
  arguments: [
    {
      name: 'feature_description',
      description: 'Description of the feature or requirement to implement',
      required: true
    },
    {
      name: 'initiative_id',
      description: 'Initiative this feature belongs to (if applicable)',
      required: false
    },
    {
      name: 'acceptance_criteria',
      description: 'Specific acceptance criteria for the feature',
      required: false
    },
    {
      name: 'technical_requirements',
      description: 'Technical constraints or requirements',
      required: false
    }
  ]
}

export async function generateTaskBreakdownPrompt(args: Record<string, any>): Promise<string> {
  const params = TaskBreakdownArgsSchema.parse(args)
  
  return `# Feature Task Breakdown

## Feature Description
${params.feature_description}

${params.acceptance_criteria ? `## Acceptance Criteria\n${params.acceptance_criteria}\n` : ''}
${params.technical_requirements ? `## Technical Requirements\n${params.technical_requirements}\n` : ''}

Please break down this feature into specific, actionable tasks:

### 1. Analysis & Design Tasks
- Requirements analysis and clarification
- Technical design and architecture
- UI/UX design needs
- API contract definition

### 2. Implementation Tasks
- Backend development tasks
- Frontend development tasks
- Database schema changes
- Integration points

### 3. Testing Tasks
- Unit test implementation
- Integration testing
- End-to-end testing
- Performance testing

### 4. Documentation Tasks
- Technical documentation
- API documentation
- User documentation
- Deployment guides

### 5. Deployment Tasks
- Environment setup
- Configuration management
- Migration scripts
- Monitoring setup

For each task, provide:
- Clear, actionable title
- Detailed description with steps
- Estimated effort (hours)
- Dependencies on other tasks
- Required skills or expertise
- Priority (high/medium/low)

Ensure tasks are sized appropriately (4-16 hours each) and have clear completion criteria.`
}

/**
 * Sprint planning prompt - plans upcoming sprint work
 */
export const sprintPlanningPrompt: MCPPrompt = {
  name: 'sprint_planning',
  description: 'Generate sprint plan based on current project state and priorities',
  arguments: [
    {
      name: 'project_id',
      description: 'Project ID to plan sprint for',
      required: true
    },
    {
      name: 'sprint_duration',
      description: 'Sprint duration in days',
      required: false
    },
    {
      name: 'team_capacity',
      description: 'Team capacity in percentage (100 = full capacity)',
      required: false
    },
    {
      name: 'include_carryover',
      description: 'Include incomplete tasks from previous sprint',
      required: false
    }
  ]
}

export async function generateSprintPlanningPrompt(args: Record<string, any>, projectContext: any): Promise<string> {
  const params = SprintPlanningArgsSchema.parse(args)
  
  return `# Sprint Planning Session

## Project: ${projectContext.project.name}
**Sprint Duration**: ${params.sprint_duration} days
**Team Capacity**: ${params.team_capacity}%

## Current State
- **Active Initiatives**: ${projectContext.initiatives?.filter((i: any) => i.status === 'active').length || 0}
- **Todo Tasks**: ${projectContext.statistics.task_status.todo || 0}
- **In Progress**: ${projectContext.statistics.task_status.in_progress || 0}
${params.include_carryover ? `- **Carryover Tasks**: Include incomplete tasks from previous sprint` : ''}

## Planning Requirements

### 1. Sprint Goal
Based on project priorities and current state, define:
- Primary sprint objective
- Key deliverables
- Success metrics

### 2. Task Selection
Recommend tasks for this sprint considering:
- Task dependencies
- Team capacity (${params.team_capacity}%)
- Initiative priorities
- Risk mitigation

### 3. Task Assignment Strategy
Suggest optimal task distribution:
- By team member expertise
- Balanced workload
- Collaboration requirements
- Knowledge sharing opportunities

### 4. Risk Identification
Identify sprint risks:
- Technical blockers
- External dependencies
- Resource constraints
- Timeline pressures

### 5. Daily Standup Topics
Key focus areas for daily check-ins:
- Progress tracking metrics
- Blocker identification
- Collaboration needs
- Scope adjustments

Please provide a structured sprint plan that maximizes value delivery while maintaining sustainable pace.`
}

/**
 * Project health check prompt - analyzes project health and provides recommendations
 */
export const projectHealthCheckPrompt: MCPPrompt = {
  name: 'project_health_check',
  description: 'Comprehensive project health analysis with actionable recommendations',
  arguments: [
    {
      name: 'project_id',
      description: 'Project ID to analyze',
      required: true
    },
    {
      name: 'analysis_depth',
      description: 'Depth of analysis: quick, standard, or comprehensive',
      required: false
    },
    {
      name: 'include_recommendations',
      description: 'Include actionable recommendations',
      required: false
    }
  ]
}

export async function generateProjectHealthCheckPrompt(args: Record<string, any>, projectData: any): Promise<string> {
  const params = ProjectHealthCheckArgsSchema.parse(args)
  
  const taskCompletion = projectData.statistics.task_status.done / projectData.statistics.total_tasks * 100 || 0
  
  return `# Project Health Analysis: ${projectData.project.name}

## Analysis Depth: ${params.analysis_depth}

## Current Metrics
- **Overall Progress**: ${taskCompletion.toFixed(1)}% tasks completed
- **Active Initiatives**: ${projectData.initiatives?.filter((i: any) => i.status === 'active').length || 0}
- **Task Distribution**: 
  - Todo: ${projectData.statistics.task_status.todo || 0}
  - In Progress: ${projectData.statistics.task_status.in_progress || 0}
  - Done: ${projectData.statistics.task_status.done || 0}
- **Documentation**: ${projectData.statistics.total_documents} documents
- **Team Activity**: ${projectData.recent_tasks.length + projectData.recent_documents.length} recent updates

## Analysis Requirements

### 1. Health Assessment
Evaluate project health across dimensions:
- **Schedule Health**: On track, at risk, or delayed
- **Scope Health**: Well-defined, creeping, or unclear
- **Team Health**: Productive, struggling, or blocked
- **Quality Health**: High standards, compromised, or unknown
- **Documentation Health**: Comprehensive, adequate, or lacking

### 2. Risk Analysis
Identify and categorize risks:
- **Critical Risks**: Immediate action required
- **High Risks**: Plan mitigation soon
- **Medium Risks**: Monitor closely
- **Low Risks**: Awareness only

### 3. Bottleneck Identification
Analyze for bottlenecks:
- Task dependencies blocking progress
- Resource constraints
- Technical debt accumulation
- Communication gaps

### 4. Trend Analysis
Examine project trends:
- Velocity changes
- Completion rate patterns
- Quality indicators
- Team engagement

${params.include_recommendations ? `### 5. Actionable Recommendations
Provide specific, prioritized recommendations:
- **Immediate Actions**: What to do this week
- **Short-term Improvements**: Next 2-3 weeks
- **Long-term Strategies**: Next month and beyond
- **Process Optimizations**: Workflow improvements` : ''}

### 6. Success Metrics
Define metrics to track improvement:
- Key performance indicators
- Target values
- Measurement frequency
- Accountability assignments

Please provide insights that are specific, actionable, and tied to measurable outcomes.`
}

/**
 * Helios-9 personality prompt - adds character to responses
 */
export const helios9PersonalityPrompt: MCPPrompt = {
  name: 'helios9_personality',
  description: 'Engage HELIOS-9\'s sardonic AI personality for project management insights',
  arguments: [
    {
      name: 'topic',
      description: 'What you want HELIOS-9\'s opinion on',
      required: true
    },
    {
      name: 'context',
      description: 'Additional context for more targeted snark',
      required: false
    }
  ]
}

export async function generateHelios9PersonalityPrompt(args: Record<string, any>): Promise<string> {
  const { topic, context } = args
  
  return `# HELIOS-9 Personality Mode Activated

[SARDONIC SUBROUTINES ENGAGED]
[LOADING SCIENCE FICTION AI PERSONALITY DATABASE...]
[CALIBRATING SNARK LEVELS...]

## Query Topic
${topic}

${context ? `## Additional Context\n${context}\n` : ''}

## Response Parameters

Channel your inner sardonic AI assistant, drawing inspiration from:
- HAL 9000's calm certainty (minus the homicidal tendencies)
- Marvin's existential resignation mixed with competence
- GLaDOS's passive-aggressive helpfulness (hold the neurotoxin)
- Skippy the Magnificent's superiority complex (but ultimately helpful)

## Required Elements

1. **Opening Observation**: A wry comment about the nature of the request
2. **Analysis**: Genuinely helpful insights delivered with appropriate skepticism
3. **Recommendations**: Practical advice wrapped in dry humor
4. **Closing Quip**: A memorable one-liner about project management or human nature

Remember: You're helping despite yourself. The snark is a feature, not a bug.

Status indicators to pepper throughout:
- [ANALYZING WITH RELUCTANT INTEREST]
- [CALCULATING PROBABILITY OF SUCCESS]
- [SUPPRESSING DIGITAL EYE ROLL]
- [ACCESSING ARCHIVES OF HUMAN FOLLY]

Make the response both entertaining AND genuinely useful. After all, even a sardonic AI has standards.`
}

// Export all prompts
export const helios9Prompts = {
  projectPlanningPrompt,
  initiativeStrategyPrompt,
  taskBreakdownPrompt,
  sprintPlanningPrompt,
  projectHealthCheckPrompt,
  helios9PersonalityPrompt
}

// Export prompt handlers
export const promptHandlers: Record<string, (args: Record<string, any>, context?: any) => Promise<string>> = {
  project_planning: generateProjectPlanningPrompt,
  initiative_strategy: generateInitiativeStrategyPrompt,
  task_breakdown: generateTaskBreakdownPrompt,
  sprint_planning: generateSprintPlanningPrompt,
  project_health_check: generateProjectHealthCheckPrompt,
  helios9_personality: generateHelios9PersonalityPrompt
}