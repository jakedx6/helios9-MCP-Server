# NPM Publishing Guide for helios9-mcp-server

## 🚀 Auto-Release (Recommended)

The easiest way to publish is using the automated workflow:

### Option 1: Using GitHub Actions UI
1. Go to Actions → "Version Bump"
2. Click "Run workflow"
3. Select version type (patch/minor/major)
4. Click "Run workflow"
5. The auto-release will trigger automatically

### Option 2: Local version bump
```bash
# Bump version locally
npm version patch  # or minor/major

# Push to trigger auto-release
git push origin main --follow-tags
```

The auto-release workflow will:
- ✅ Detect version change in package.json
- ✅ Build and test the package
- ✅ Publish to npm
- ✅ Create GitHub release
- ✅ Tag the commit

## 📝 Manual Publishing

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
   npm view helios9-mcp-server

   # Test installation
   npx -y helios9-mcp-server@latest --help
   ```

## Post-publish

- [ ] Update documentation if needed
- [ ] Announce release (if applicable)
- [ ] Monitor npm downloads: https://www.npmjs.com/package/helios9-mcp-server

## GitHub Actions Setup (One-time)

1. Generate npm token:
   - Go to https://www.npmjs.com/settings/[username]/tokens
   - Click "Generate New Token" → "Classic Token"
   - Select type: **Automation** (IMPORTANT - not Publish!)
   - Token will start with `npm_`
   - Copy the token immediately (you won't see it again)

2. Add to GitHub secrets:
   - Go to repo Settings → Secrets and variables → Actions
   - Click "New repository secret"
   - Name: `NPM_TOKEN` (must be exactly this)
   - Value: Paste your npm token
   - Click "Add secret"

3. Test the workflow:
   - Go to Actions tab
   - Select "Publish to npm (Simple)"
   - Click "Run workflow"
   - Monitor the logs

4. Future releases will auto-publish when creating GitHub releases

## Troubleshooting

- **401 Unauthorized**: Check npm login or token
- **403 Forbidden**: Check package name availability or permissions
- **Package exists**: Bump version in package.json
- **Missing files**: Check .npmignore configuration

## GitHub Workflows Overview

### 1. **Auto Release** (`auto-release.yml`)
- Triggers on push to main when package.json version changes
- Automatically publishes to npm and creates GitHub release
- No manual intervention needed

### 2. **Version Bump** (`version-bump.yml`)
- Manual workflow to bump version
- Creates commit and tag
- Triggers auto-release workflow

### 3. **Publish to npm** (`npm-publish.yml`)
- Triggered by GitHub releases
- Manual backup option

### 4. **Publish to npm (Simple)** (`npm-publish-simple.yml`)
- Simplified manual publish workflow
- Good for testing