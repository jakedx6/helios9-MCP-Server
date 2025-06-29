import { AIConversation, supabaseService } from '../lib/api-client.js'
import { requireAuth } from '../lib/auth.js'
import { logger } from '../lib/logger.js'
import { z } from 'zod'

// Local type definitions
interface MCPTool {
  name: string
  description: string
  inputSchema: any
}

interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp?: string
}

// Input schemas for AI conversation tools
const SaveConversationSchema = z.object({
  project_id: z.string().uuid(),
  title: z.string().min(1).max(500).optional(),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string(),
    timestamp: z.string().datetime().optional(),
    metadata: z.record(z.any()).optional()
  })),
  context: z.object({
    task_id: z.string().uuid().optional(),
    document_id: z.string().uuid().optional(),
    conversation_type: z.enum(['task_discussion', 'document_review', 'project_planning', 'troubleshooting', 'general']).default('general'),
    ai_model: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
    tokens_used: z.number().positive().optional()
  }).optional(),
  metadata: z.record(z.any()).optional()
})

const GetConversationsSchema = z.object({
  project_id: z.string().uuid(),
  limit: z.number().int().positive().max(100).default(20),
  conversation_type: z.enum(['task_discussion', 'document_review', 'project_planning', 'troubleshooting', 'general']).optional(),
  related_to: z.string().uuid().optional(), // task_id or document_id
  include_messages: z.boolean().default(true)
})

const AnalyzeConversationSchema = z.object({
  conversation_id: z.string().uuid()
})

const ExtractActionItemsSchema = z.object({
  conversation_id: z.string().uuid(),
  auto_create_tasks: z.boolean().default(false)
})

const GenerateConversationSummarySchema = z.object({
  conversation_id: z.string().uuid(),
  summary_type: z.enum(['brief', 'detailed', 'action_items', 'decisions']).default('brief')
})

/**
 * Save AI conversation with context
 */
export const saveConversationTool: MCPTool = {
  name: 'save_conversation',
  description: 'Save an AI conversation with project context for future reference and analysis',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: {
        type: 'string',
        format: 'uuid',
        description: 'The project ID this conversation relates to'
      },
      title: {
        type: 'string',
        maxLength: 500,
        description: 'Optional title for the conversation (auto-generated if not provided)'
      },
      messages: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            role: {
              type: 'string',
              enum: ['user', 'assistant', 'system'],
              description: 'The role of the message sender'
            },
            content: {
              type: 'string',
              description: 'The message content'
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'When the message was sent (auto-generated if not provided)'
            },
            metadata: {
              type: 'object',
              description: 'Additional metadata for the message'
            }
          },
          required: ['role', 'content']
        },
        description: 'Array of conversation messages'
      },
      context: {
        type: 'object',
        properties: {
          task_id: {
            type: 'string',
            format: 'uuid',
            description: 'Related task ID if conversation is about a specific task'
          },
          document_id: {
            type: 'string',
            format: 'uuid',
            description: 'Related document ID if conversation is about a specific document'
          },
          conversation_type: {
            type: 'string',
            enum: ['task_discussion', 'document_review', 'project_planning', 'troubleshooting', 'general'],
            description: 'Type of conversation for better categorization'
          },
          ai_model: {
            type: 'string',
            description: 'AI model used in the conversation'
          },
          temperature: {
            type: 'number',
            minimum: 0,
            maximum: 2,
            description: 'AI temperature setting used'
          },
          tokens_used: {
            type: 'number',
            description: 'Total tokens consumed in the conversation'
          }
        },
        description: 'Context information about the conversation'
      },
      metadata: {
        type: 'object',
        description: 'Additional metadata for the conversation'
      }
    },
    required: ['project_id', 'messages']
  }
}

export const saveConversation = requireAuth(async (args: any) => {
  const { project_id, title, messages, context, metadata } = SaveConversationSchema.parse(args)
  
  logger.info('Saving AI conversation', { 
    project_id, 
    message_count: messages.length,
    conversation_type: context?.conversation_type 
  })

  // Process messages and add timestamps if missing
  const processedMessages = messages.map(msg => ({
    ...msg,
    timestamp: msg.timestamp || new Date().toISOString(),
    metadata: msg.metadata || {}
  }))

  // Generate title if not provided
  const conversationTitle = title || generateConversationTitle(processedMessages, context?.conversation_type)

  // Analyze conversation for insights
  const analysis = analyzeConversationContent(processedMessages)

  // Create conversation record
  const conversationData = {
    project_id,
    title: conversationTitle,
    messages: processedMessages,
    metadata: {
      ...metadata,
      context: context || {},
      analysis,
      created_via: 'mcp',
      message_count: processedMessages.length,
      total_tokens: context?.tokens_used || estimateTokenCount(processedMessages)
    }
  }

  // Save to database (extend the supabase service to handle conversations)
  const conversation = await saveConversationToDatabase(conversationData)

  // Extract and optionally create action items
  const actionItems = extractActionItemsFromConversation(processedMessages, context)

  logger.info('Conversation saved successfully', { 
    conversation_id: conversation.id,
    action_items_found: actionItems.length 
  })

  return {
    conversation,
    analysis,
    action_items: actionItems,
    insights: generateConversationInsights(analysis, context),
    message: `Conversation "${conversationTitle}" saved successfully`
  }
})

/**
 * Get conversations with filtering
 */
export const getConversationsTool: MCPTool = {
  name: 'get_conversations',
  description: 'Retrieve AI conversations for a project with optional filtering',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: {
        type: 'string',
        format: 'uuid',
        description: 'The project ID to get conversations for'
      },
      limit: {
        type: 'number',
        minimum: 1,
        maximum: 100,
        default: 20,
        description: 'Maximum number of conversations to return'
      },
      conversation_type: {
        type: 'string',
        enum: ['task_discussion', 'document_review', 'project_planning', 'troubleshooting', 'general'],
        description: 'Filter by conversation type'
      },
      related_to: {
        type: 'string',
        format: 'uuid',
        description: 'Filter by related task or document ID'
      },
      include_messages: {
        type: 'boolean',
        default: true,
        description: 'Whether to include full message content'
      }
    },
    required: ['project_id']
  }
}

export const getConversations = requireAuth(async (args: any) => {
  const { project_id, limit, conversation_type, related_to, include_messages } = GetConversationsSchema.parse(args)
  
  logger.info('Getting conversations', { project_id, conversation_type, related_to, limit })

  // Get conversations from database
  const conversations = await getConversationsFromDatabase({
    project_id,
    limit,
    conversation_type,
    related_to,
    include_messages
  })

  // Add analytics
  const analytics = {
    total_conversations: conversations.length,
    conversation_types: conversations.reduce((acc, conv) => {
      const type = conv.metadata?.context?.conversation_type || 'general'
      acc[type] = (acc[type] || 0) + 1
      return acc
    }, {} as Record<string, number>),
    total_messages: conversations.reduce((sum, conv) => sum + (conv.metadata?.message_count || 0), 0),
    average_length: conversations.length > 0 
      ? conversations.reduce((sum, conv) => sum + (conv.metadata?.message_count || 0), 0) / conversations.length 
      : 0,
    recent_activity: conversations.filter(conv => 
      new Date(conv.created_at).getTime() > Date.now() - (7 * 24 * 60 * 60 * 1000)
    ).length
  }

  return {
    conversations,
    analytics,
    filters_applied: { conversation_type, related_to }
  }
})

/**
 * Analyze conversation for insights
 */
export const analyzeConversationTool: MCPTool = {
  name: 'analyze_conversation',
  description: 'Analyze an AI conversation to extract insights, themes, and patterns',
  inputSchema: {
    type: 'object',
    properties: {
      conversation_id: {
        type: 'string',
        format: 'uuid',
        description: 'The conversation ID to analyze'
      }
    },
    required: ['conversation_id']
  }
}

export const analyzeConversation = requireAuth(async (args: any) => {
  const { conversation_id } = AnalyzeConversationSchema.parse(args)
  
  logger.info('Analyzing conversation', { conversation_id })

  const conversation = await getConversationFromDatabase(conversation_id)
  
  if (!conversation) {
    throw new Error('Conversation not found')
  }

  const analysis = {
    conversation_flow: analyzeConversationFlow(conversation.messages),
    content_analysis: analyzeConversationContent(conversation.messages),
    ai_performance: analyzeAIPerformance(conversation.messages),
    topic_modeling: extractTopicsAndThemes(conversation.messages),
    action_items: extractActionItemsFromConversation(conversation.messages, conversation.metadata?.context),
    decisions_made: extractDecisions(conversation.messages),
    questions_raised: extractQuestions(conversation.messages),
    knowledge_gaps: identifyKnowledgeGaps(conversation.messages),
    follow_up_suggestions: generateFollowUpSuggestions(conversation.messages, conversation.metadata?.context)
  }

  return {
    conversation_id,
    analysis,
    summary: generateAnalysisSummary(analysis),
    recommendations: generateRecommendations(analysis, conversation.metadata?.context)
  }
})

/**
 * Extract action items from conversation
 */
export const extractActionItemsTool: MCPTool = {
  name: 'extract_action_items',
  description: 'Extract actionable items from a conversation and optionally create tasks',
  inputSchema: {
    type: 'object',
    properties: {
      conversation_id: {
        type: 'string',
        format: 'uuid',
        description: 'The conversation ID to extract action items from'
      },
      auto_create_tasks: {
        type: 'boolean',
        default: false,
        description: 'Whether to automatically create tasks for action items'
      }
    },
    required: ['conversation_id']
  }
}

export const extractActionItems = requireAuth(async (args: any) => {
  const { conversation_id, auto_create_tasks } = ExtractActionItemsSchema.parse(args)
  
  logger.info('Extracting action items', { conversation_id, auto_create_tasks })

  const conversation = await getConversationFromDatabase(conversation_id)
  
  if (!conversation) {
    throw new Error('Conversation not found')
  }

  const actionItems = extractActionItemsFromConversation(
    conversation.messages, 
    conversation.metadata?.context
  )

  let createdTasks = []
  
  if (auto_create_tasks && actionItems.length > 0) {
    // Create tasks for each action item
    for (const item of actionItems) {
      try {
        const task = await supabaseService.createTask({
          project_id: conversation.project_id,
          title: item.title,
          description: `${item.description}\n\nExtracted from conversation: ${conversation.title}\n\n[Source: AI Conversation ${conversation.id}, Confidence: ${item.confidence}]`,
          priority: item.priority || 'medium',
          status: 'todo',
          due_date: null,
          assignee_id: null
        })
        createdTasks.push(task)
      } catch (error) {
        logger.error('Failed to create task from action item', { error, item })
      }
    }
  }

  return {
    conversation_id,
    action_items: actionItems,
    created_tasks: createdTasks,
    summary: {
      total_items: actionItems.length,
      high_priority: actionItems.filter(item => item.priority === 'high').length,
      tasks_created: createdTasks.length
    }
  }
})

/**
 * Generate conversation summary
 */
export const generateConversationSummaryTool: MCPTool = {
  name: 'generate_conversation_summary',
  description: 'Generate different types of summaries from a conversation',
  inputSchema: {
    type: 'object',
    properties: {
      conversation_id: {
        type: 'string',
        format: 'uuid',
        description: 'The conversation ID to summarize'
      },
      summary_type: {
        type: 'string',
        enum: ['brief', 'detailed', 'action_items', 'decisions'],
        default: 'brief',
        description: 'Type of summary to generate'
      }
    },
    required: ['conversation_id']
  }
}

export const generateConversationSummary = requireAuth(async (args: any) => {
  const { conversation_id, summary_type } = GenerateConversationSummarySchema.parse(args)
  
  logger.info('Generating conversation summary', { conversation_id, summary_type })

  const conversation = await getConversationFromDatabase(conversation_id)
  
  if (!conversation) {
    throw new Error('Conversation not found')
  }

  let summary: string

  switch (summary_type) {
    case 'brief':
      summary = generateBriefSummary(conversation.messages)
      break
    case 'detailed':
      summary = generateDetailedSummary(conversation.messages, conversation.metadata?.context)
      break
    case 'action_items':
      summary = generateActionItemsSummary(conversation.messages)
      break
    case 'decisions':
      summary = generateDecisionsSummary(conversation.messages)
      break
    default:
      summary = generateBriefSummary(conversation.messages)
  }

  const metadata = {
    conversation_id,
    summary_type,
    generated_at: new Date().toISOString(),
    message_count: conversation.messages.length,
    conversation_duration: calculateConversationDuration(conversation.messages),
    key_participants: extractParticipants(conversation.messages)
  }

  return {
    summary,
    metadata,
    word_count: summary.split(' ').length,
    reading_time: Math.ceil(summary.split(' ').length / 200) // 200 words per minute
  }
})

// Helper functions for conversation analysis
function generateConversationTitle(messages: Message[], type?: string): string {
  if (type) {
    const typeLabels: Record<string, string> = {
      task_discussion: 'Task Discussion',
      document_review: 'Document Review',
      project_planning: 'Project Planning',
      troubleshooting: 'Troubleshooting',
      general: 'General Discussion'
    }
    return `${typeLabels[type] || 'Discussion'} - ${new Date().toLocaleDateString()}`
  }

  // Extract potential title from first user message
  const firstUserMessage = messages.find(m => m.role === 'user')
  if (firstUserMessage) {
    const firstLine = firstUserMessage.content.split('\n')[0]
    if (firstLine.length > 10 && firstLine.length < 100) {
      return firstLine.length > 50 ? firstLine.substring(0, 47) + '...' : firstLine
    }
  }

  return `AI Conversation - ${new Date().toLocaleDateString()}`
}

function analyzeConversationContent(messages: Message[]): any {
  const totalMessages = messages.length
  const userMessages = messages.filter(m => m.role === 'user').length
  const assistantMessages = messages.filter(m => m.role === 'assistant').length
  
  const totalWords = messages.reduce((sum, msg) => sum + msg.content.split(' ').length, 0)
  const avgWordsPerMessage = totalWords / totalMessages
  
  // Extract common patterns
  const questions = messages.filter(msg => msg.content.includes('?')).length
  const codeBlocks = messages.filter(msg => msg.content.includes('```')).length
  const urls = messages.filter(msg => /https?:\/\//.test(msg.content)).length
  
  return {
    message_count: totalMessages,
    user_messages: userMessages,
    assistant_messages: assistantMessages,
    total_words: totalWords,
    avg_words_per_message: Math.round(avgWordsPerMessage),
    questions_asked: questions,
    code_examples: codeBlocks,
    external_links: urls,
    conversation_balance: userMessages / (assistantMessages || 1)
  }
}

function extractActionItemsFromConversation(messages: Message[], context?: any): any[] {
  const actionItems: any[] = []
  
  // Simple regex patterns for action items
  const patterns = [
    /(?:need to|should|must|will|todo|action item):?\s*(.+)/gi,
    /(?:let's|we'll|i'll|you'll)\s+(.+)/gi,
    /(?:next step|follow up|follow-up):?\s*(.+)/gi
  ]
  
  messages.forEach((message, index) => {
    patterns.forEach(pattern => {
      const matches = [...message.content.matchAll(pattern)]
      matches.forEach(match => {
        if (match[1] && match[1].length > 10 && match[1].length < 200) {
          actionItems.push({
            title: match[1].trim(),
            description: `From conversation: "${message.content.substring(0, 100)}..."`,
            source_message_index: index,
            source_role: message.role,
            priority: determinePriority(match[1]),
            confidence: calculateConfidence(match[1], message.content),
            context
          })
        }
      })
    })
  })
  
  return actionItems
}

function determinePriority(text: string): 'low' | 'medium' | 'high' | 'urgent' {
  const urgentWords = ['urgent', 'asap', 'immediately', 'critical', 'emergency']
  const highWords = ['important', 'priority', 'must', 'required', 'essential']
  
  const lowerText = text.toLowerCase()
  
  if (urgentWords.some(word => lowerText.includes(word))) return 'urgent'
  if (highWords.some(word => lowerText.includes(word))) return 'high'
  if (lowerText.includes('should') || lowerText.includes('need')) return 'medium'
  
  return 'low'
}

function calculateConfidence(text: string, context: string): number {
  let confidence = 50 // Base confidence
  
  // Increase confidence for specific patterns
  if (text.includes('will') || text.includes('must')) confidence += 20
  if (text.includes('should') || text.includes('need to')) confidence += 15
  if (context.includes('action') || context.includes('todo')) confidence += 10
  if (text.length > 50) confidence += 10 // More detailed items
  
  // Decrease confidence for vague language
  if (text.includes('maybe') || text.includes('might')) confidence -= 15
  if (text.includes('probably') || text.includes('perhaps')) confidence -= 10
  
  return Math.max(0, Math.min(100, confidence))
}

function estimateTokenCount(messages: Message[]): number {
  // Rough estimate: 1 token ≈ 4 characters
  const totalChars = messages.reduce((sum, msg) => sum + msg.content.length, 0)
  return Math.ceil(totalChars / 4)
}

// Placeholder functions for database operations (to be implemented in supabase service)
async function saveConversationToDatabase(conversationData: any): Promise<any> {
  // This would be implemented in the supabase service
  return {
    id: 'generated-uuid',
    ...conversationData,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
}

async function getConversationsFromDatabase(filters: any): Promise<any[]> {
  // This would be implemented in the supabase service
  return []
}

async function getConversationFromDatabase(id: string): Promise<any> {
  // This would be implemented in the supabase service
  return null
}

// Additional analysis functions
function analyzeConversationFlow(messages: Message[]): any {
  return {
    turn_taking: messages.reduce((acc, msg, idx) => {
      if (idx > 0 && messages[idx - 1].role !== msg.role) acc++
      return acc
    }, 0),
    longest_response: Math.max(...messages.map(m => m.content.length)),
    conversation_rhythm: 'balanced' // Would calculate based on message timing
  }
}

function analyzeAIPerformance(messages: Message[]): any {
  const aiMessages = messages.filter(m => m.role === 'assistant')
  return {
    response_count: aiMessages.length,
    avg_response_length: aiMessages.reduce((sum, msg) => sum + msg.content.length, 0) / (aiMessages.length || 1),
    helpful_responses: aiMessages.filter(msg => 
      msg.content.includes('```') || 
      msg.content.includes('example') || 
      msg.content.length > 100
    ).length
  }
}

function extractTopicsAndThemes(messages: Message[]): string[] {
  // Simple keyword extraction
  const allText = messages.map(m => m.content).join(' ').toLowerCase()
  const commonWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they']
  
  const words = allText.split(/\s+/).filter(word => 
    word.length > 3 && 
    !commonWords.includes(word) &&
    /^[a-zA-Z]+$/.test(word)
  )
  
  const wordCount = words.reduce((acc, word) => {
    acc[word] = (acc[word] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  
  return Object.entries(wordCount)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .map(([word]) => word)
}

function extractDecisions(messages: Message[]): string[] {
  const decisionPatterns = [
    /(?:decided|decision|concluded|agreed|determined):?\s*(.+)/gi,
    /(?:we will|we'll|going to)\s+(.+)/gi
  ]
  
  const decisions: string[] = []
  
  messages.forEach(message => {
    decisionPatterns.forEach(pattern => {
      const matches = [...message.content.matchAll(pattern)]
      matches.forEach(match => {
        if (match[1] && match[1].length > 10) {
          decisions.push(match[1].trim())
        }
      })
    })
  })
  
  return decisions
}

function extractQuestions(messages: Message[]): string[] {
  return messages
    .filter(msg => msg.content.includes('?'))
    .map(msg => msg.content.split('?')[0] + '?')
    .filter(q => q.length > 10 && q.length < 200)
}

function identifyKnowledgeGaps(messages: Message[]): string[] {
  const gapPatterns = [
    /(?:don't know|not sure|unclear|confused|need help):?\s*(.+)/gi,
    /(?:how to|what is|what are|where is|when is|why is)\s+(.+)/gi
  ]
  
  const gaps: string[] = []
  
  messages.forEach(message => {
    gapPatterns.forEach(pattern => {
      const matches = [...message.content.matchAll(pattern)]
      matches.forEach(match => {
        if (match[1] && match[1].length > 5) {
          gaps.push(match[1].trim())
        }
      })
    })
  })
  
  return gaps
}

function generateFollowUpSuggestions(messages: Message[], context?: any): string[] {
  const suggestions = [
    'Review and prioritize the action items identified',
    'Schedule follow-up meeting to track progress',
    'Create documentation based on decisions made',
    'Share summary with relevant team members'
  ]
  
  if (context?.task_id) {
    suggestions.push('Update the related task with conversation insights')
  }
  
  if (context?.document_id) {
    suggestions.push('Update the related document with new information')
  }
  
  return suggestions
}

function generateBriefSummary(messages: Message[]): string {
  const firstUserMsg = messages.find(m => m.role === 'user')
  const lastAssistantMsg = [...messages].reverse().find(m => m.role === 'assistant')
  
  return `Conversation started with: "${firstUserMsg?.content.substring(0, 100)}..." and concluded with AI providing guidance and next steps. ${messages.length} messages exchanged with key topics and action items identified.`
}

function generateDetailedSummary(messages: Message[], context?: any): string {
  const analysis = analyzeConversationContent(messages)
  const actionItems = extractActionItemsFromConversation(messages, context)
  const decisions = extractDecisions(messages)
  
  return `
**Conversation Summary**

- **Message Count**: ${analysis.message_count} (${analysis.user_messages} user, ${analysis.assistant_messages} AI)
- **Total Words**: ${analysis.total_words}
- **Questions Asked**: ${analysis.questions_asked}
- **Code Examples**: ${analysis.code_examples}

**Key Outcomes**:
- ${actionItems.length} action items identified
- ${decisions.length} decisions made
- ${analysis.external_links} external resources referenced

**Context**: ${context?.conversation_type || 'General discussion'} related to project activities.
`.trim()
}

function generateActionItemsSummary(messages: Message[]): string {
  const actionItems = extractActionItemsFromConversation(messages)
  
  if (actionItems.length === 0) {
    return 'No specific action items were identified in this conversation.'
  }
  
  return `**Action Items Identified (${actionItems.length})**:\n\n` +
    actionItems.map((item, idx) => `${idx + 1}. ${item.title} (${item.priority} priority)`).join('\n')
}

function generateDecisionsSummary(messages: Message[]): string {
  const decisions = extractDecisions(messages)
  
  if (decisions.length === 0) {
    return 'No explicit decisions were documented in this conversation.'
  }
  
  return `**Decisions Made (${decisions.length})**:\n\n` +
    decisions.map((decision, idx) => `${idx + 1}. ${decision}`).join('\n')
}

function calculateConversationDuration(messages: Message[]): number {
  if (messages.length < 2) return 0
  
  const firstTimestamp = messages[0].timestamp
  const lastTimestamp = messages[messages.length - 1].timestamp
  
  if (!firstTimestamp || !lastTimestamp) return 0
  
  const firstTime = new Date(firstTimestamp).getTime()
  const lastTime = new Date(lastTimestamp).getTime()
  
  return Math.round((lastTime - firstTime) / (1000 * 60)) // minutes
}

function extractParticipants(messages: Message[]): string[] {
  return [...new Set(messages.map(m => m.role))]
}

function generateAnalysisSummary(analysis: any): string {
  return `Conversation analysis complete: ${analysis.content_analysis.message_count} messages analyzed, ${analysis.action_items.length} action items found, ${analysis.decisions_made.length} decisions identified.`
}

function generateRecommendations(analysis: any, context?: any): string[] {
  const recommendations = []
  
  if (analysis.action_items.length > 0) {
    recommendations.push('Convert action items into trackable tasks')
  }
  
  if (analysis.knowledge_gaps.length > 0) {
    recommendations.push('Address identified knowledge gaps through documentation')
  }
  
  if (analysis.questions_raised.length > analysis.action_items.length) {
    recommendations.push('Many questions were raised - consider scheduling follow-up session')
  }
  
  return recommendations
}

function generateConversationInsights(analysis: any, context?: any): any {
  return {
    productivity_score: Math.round((analysis.total_words / analysis.message_count) * 0.1),
    engagement_level: analysis.conversation_balance > 0.8 ? 'high' : 'moderate',
    actionability: analysis.questions > 0 ? 'high' : 'low',
    follow_up_needed: analysis.questions > 2 || analysis.code_examples > 0
  }
}

// Export all conversation tools
export const conversationTools = {
  saveConversationTool,
  getConversationsTool,
  analyzeConversationTool,
  extractActionItemsTool,
  generateConversationSummaryTool
}

export const conversationHandlers = {
  save_conversation: saveConversation,
  get_conversations: getConversations,
  analyze_conversation: analyzeConversation,
  extract_action_items: extractActionItems,
  generate_conversation_summary: generateConversationSummary
}