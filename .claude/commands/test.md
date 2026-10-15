# /test - Run Test Suites

Run the test suites for The Hype:

1. **Frontend Vitest Suite** (Progression, 1RM, finish-workout, recovery training logic):
   ```bash
   cd frontend && npm test
   ```

2. **API Backend Suite**:
   ```bash
   cd api && npm test
   ```

3. **MCP Server Suite**:
   ```bash
   cd mcp && npm test
   ```

### Single File or Specific Test:
- Run single test file: `cd frontend && npx vitest run src/lib/progression.test.js`
- Run test by name: `cd frontend && npx vitest run -t "<test-name>"`
