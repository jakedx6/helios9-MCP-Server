import { apiClient } from './api-client.js'
import { logger } from './logger.js'
import { UnauthorizedError } from './api-client.js'

export interface AuthContext {
  userId: string
  tenantId: string | null
  profile: any
  authenticated: boolean
}

export class AuthManager {
  private static instance: AuthManager
  private authContext: AuthContext | null = null

  private constructor() {}

  static getInstance(): AuthManager {
    if (!AuthManager.instance) {
      AuthManager.instance = new AuthManager()
    }
    return AuthManager.instance
  }

  /**
   * Authenticate with various methods
   */
  async authenticate(method: 'token' | 'api_key', credentials: string): Promise<AuthContext> {
    try {
      switch (method) {
        case 'token':
          return await this.authenticateWithToken(credentials)
        case 'api_key':
          return await this.authenticateWithApiKey(credentials)
        default:
          throw new UnauthorizedError('Invalid authentication method')
      }
    } catch (error) {
      logger.error('Authentication failed:', error)
      throw error
    }
  }

  /**
   * Authenticate with user session token (legacy - not used with API)
   */
  private async authenticateWithToken(accessToken: string): Promise<AuthContext> {
    throw new UnauthorizedError('Token authentication not supported in API mode. Use API key authentication.')
  }

  /**
   * Authenticate with API key via Helios-9 API
   */
  private async authenticateWithApiKey(apiKey: string): Promise<AuthContext> {
    // Set the API key in the client
    process.env.HELIOS_API_KEY = apiKey
    
    // For MCP API keys (hel9_*), we skip the auth/validate endpoint
    // since MCP endpoints handle their own authentication
    if (apiKey.startsWith('hel9_')) {
      logger.info('MCP API key detected, using MCP authentication mode')
      
      // Create a context that will be populated from API responses
      this.authContext = {
        userId: 'mcp-pending', // Will be updated from first API response
        tenantId: null,
        profile: {
          id: 'mcp-pending',
          email: 'mcp@helios9.app',
          full_name: 'MCP Service Account',
          avatar_url: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          username: 'mcp-service',
          tenant_id: null
        } as any,
        authenticated: true
      }
      
      logger.info('MCP authentication context created')
      return this.authContext!
    }
    
    // For other API keys, validate normally
    const profile = await apiClient.authenticate()
    
    this.authContext = {
      userId: profile.id,
      tenantId: profile.tenant_id || null,
      profile,
      authenticated: true
    }

    logger.info(`Service authenticated via API key for user: ${profile.email}`)
    return this.authContext!
  }

  /**
   * Get current auth context
   */
  getAuthContext(): AuthContext {
    if (!this.authContext || !this.authContext.authenticated) {
      throw new UnauthorizedError('No authenticated session')
    }
    return this.authContext
  }

  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean {
    return this.authContext?.authenticated ?? false
  }
  
  /**
   * Ensure authenticated before API calls
   */
  async ensureAuthenticated(): Promise<AuthContext> {
    if (this.isAuthenticated()) {
      return this.authContext!
    }
    
    // Try to authenticate with API key if available
    const apiKey = process.env.HELIOS_API_KEY
    if (!apiKey) {
      throw new UnauthorizedError('HELIOS_API_KEY environment variable is required')
    }
    
    return await this.authenticate('api_key', apiKey)
  }

  /**
   * Clear authentication
   */
  clearAuth(): void {
    this.authContext = null
    logger.info('Authentication cleared')
  }

  /**
   * Middleware for MCP operations that require authentication
   */
  requireAuth<T extends any[], R>(
    operation: (...args: T) => Promise<R>
  ): (...args: T) => Promise<R> {
    return async (...args: T): Promise<R> => {
      if (!this.isAuthenticated()) {
        throw new UnauthorizedError('Authentication required for this operation')
      }
      return operation(...args)
    }
  }

  /**
   * Get rate limiting info for current user
   */
  getRateLimitInfo(): { limit: number; window: number; current: number } {
    // Basic rate limiting - in production, you'd implement proper rate limiting
    const isServiceAccount = this.authContext?.profile?.email?.includes('mcp-service')
    
    return {
      limit: isServiceAccount ? 1000 : 100, // requests per window
      window: 3600, // 1 hour in seconds
      current: 0 // would track actual usage
    }
  }

  /**
   * Validate permissions for specific operations
   */
  async validatePermission(resource: string, action: string, resourceId?: string): Promise<boolean> {
    const context = this.getAuthContext()
    
    // Admin role can do everything
    if (context.profile.role === 'admin') {
      return true
    }

    // Basic permission checks
    switch (resource) {
      case 'project':
        return action === 'read' || action === 'create' || context.userId === resourceId
      case 'task':
      case 'document':
        // For tasks and documents, check project ownership through the API service
        return true // Simplified - actual checks happen in API service
      default:
        return false
    }
  }
}

// Export singleton instance
export const authManager = AuthManager.getInstance()

// Helper function for authentication
export async function authenticate(method: 'token' | 'api_key', credentials: string): Promise<AuthContext> {
  return authManager.authenticate(method, credentials)
}

// Helper function to require authentication
export function requireAuth<T extends any[], R>(
  operation: (...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  return authManager.requireAuth(operation)
}