import { logger } from '../lib/logger.js'
import { z } from 'zod'

// Local type definitions
interface MCPTool {
  name: string
  description: string
  inputSchema: any
}

/**
 * Debug tool to check environment and configuration
 */
export const debugEnvironmentTool: MCPTool = {
  name: 'debug_environment',
  description: 'Debug tool to check MCP server environment and configuration',
  inputSchema: {
    type: 'object',
    properties: {}
  }
}

export const debugEnvironment = async (args: any) => {
  logger.info('Debug environment called')
  
  const envInfo = {
    HELIOS_API_URL: process.env.HELIOS_API_URL || 'NOT SET',
    HELIOS_API_KEY_PREFIX: process.env.HELIOS_API_KEY ? 
      process.env.HELIOS_API_KEY.substring(0, 20) + '...' : 'NOT SET',
    HELIOS_API_KEY_LENGTH: process.env.HELIOS_API_KEY?.length || 0,
    NODE_ENV: process.env.NODE_ENV || 'NOT SET',
    CWD: process.cwd(),
    NODE_VERSION: process.version,
  }
  
  // Try a direct API call
  let apiTestResult = 'Not tested'
  if (process.env.HELIOS_API_URL && process.env.HELIOS_API_KEY) {
    try {
      const response = await fetch(`${process.env.HELIOS_API_URL}/api/mcp/projects?limit=1`, {
        headers: {
          'Authorization': `Bearer ${process.env.HELIOS_API_KEY}`,
          'Content-Type': 'application/json'
        }
      })
      apiTestResult = `${response.status} ${response.statusText}`
      if (response.ok) {
        const data = await response.json()
        apiTestResult += ` - ${data.projects?.length || 0} projects found`
      }
    } catch (error) {
      apiTestResult = `Error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
  
  return {
    environment: envInfo,
    apiTest: apiTestResult,
    timestamp: new Date().toISOString()
  }
}

// Export tools and handlers
export const debugTools = {
  debugEnvironmentTool
}

export const debugHandlers = {
  debug_environment: debugEnvironment
}