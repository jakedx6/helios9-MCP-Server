# NPM Publishing Checklist for @helios9/mcp-server

## Pre-publish Checklist

- [ ] Ensure you're on the main/master branch
- [ ] Pull latest changes: `git pull origin master`
- [ ] Run tests (if available): `npm test`
- [ ] Build the project: `npm run build`
- [ ] Test the CLI locally: `node dist/index.js --help`
- [ ] Review package.json version number
- [ ] Check npm login status: `npm whoami`

## Publishing Steps

1. **Login to npm (if not already):**
   ```bash
   npm login
   # Username: [your-npm-username]
   # Password: [your-npm-password]
   # Email: [your-npm-email]
   # OTP: [if 2FA enabled]
   ```

2. **Final dry-run check:**
   ```bash
   npm publish --dry-run
   ```

3. **Publish to npm:**
   ```bash
   # For production release
   npm publish

   # For beta release
   npm publish --tag beta
   ```

4. **Create GitHub release:**
   - Go to https://github.com/helios9/mcp-server/releases
   - Click "Create a new release"
   - Tag version: v1.0.0 (match package.json)
   - Release title: "v1.0.0 - Initial Release"
   - Describe changes
   - Publish release

5. **Verify publication:**
   ```bash
   # Check npm registry
   npm view @helios9/mcp-server

   # Test installation
   npx -y @helios9/mcp-server@latest --help
   ```

## Post-publish

- [ ] Update documentation if needed
- [ ] Announce release (if applicable)
- [ ] Monitor npm downloads: https://www.npmjs.com/package/@helios9/mcp-server

## GitHub Actions Setup (One-time)

1. Generate npm token:
   - Go to https://www.npmjs.com/settings/[username]/tokens
   - Create new token (Automation type)
   - Copy token

2. Add to GitHub secrets:
   - Go to repo Settings → Secrets → Actions
   - Add new secret: `NPM_TOKEN`
   - Paste npm token

3. Future releases will auto-publish when creating GitHub releases

## Troubleshooting

- **401 Unauthorized**: Check npm login or token
- **403 Forbidden**: Check package name availability or permissions
- **Package exists**: Bump version in package.json
- **Missing files**: Check .npmignore configuration