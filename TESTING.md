# Testing Guide

This project uses [Vitest](https://vitest.dev/) and [Sinon](https://sinonjs.org/) for unit testing with behavioral verification.

## Running Tests

```bash
# Run tests in watch mode
npm test

# Run tests once
npm test -- --run

# Run tests with UI
npm run test:ui

# Generate coverage report
npm run test:coverage
```

## Test Philosophy

Tests verify **behavior**, not implementation details. We use Sinon to:
- **Stub** dependencies to control behavior
- **Spy** on function calls to verify interactions
- **Assert** that the correct methods are called with correct arguments

❌ **Bad Test** (tests output only):
```typescript
it('should return "success"', () => {
  const result = service.doThing();
  expect(result).toBe('success');
});
```

✅ **Good Test** (tests behavior):
```typescript
it('should call dependency with correct arguments', () => {
  const dep = sinon.stub();
  dep.resolves({ data: 'result' });
  const service = new Service(dep);

  await service.doThing('input');

  sinon.assert.calledOnceWithExactly(dep, 'input');
});
```

## Test Structure

All test files are located alongside their source files with a `.test.ts` extension:

```
src/lib/
├── config.ts
├── config.test.ts
├── git.ts
├── git.test.ts
└── ...
```

## Test Utilities

The project follows **Hexagonal Architecture** (Ports & Adapters). Mock adapters are created using Sinon:

### Available Mock Factories

Located in `src/lib/test-utils.ts`:

- `createMockFileSystem()` - Stubbed IFileSystem
- `createMockShell()` - Stubbed IShell
- `createMockConsole()` - Stubbed IConsole
- `createMockProcess()` - Stubbed IProcess

### Example Test

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sinon from 'sinon';
import { GitService } from './git.js';
import { createMockShell } from './test-utils.js';

describe('GitService', () => {
  let shell: sinon.SinonStubbedInstance<any>;
  let service: GitService;

  beforeEach(() => {
    shell = createMockShell();
    service = new GitService(shell as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should execute git fetch with correct arguments', async () => {
    shell.execFile.resolves({ stdout: '', stderr: '' });

    await service.fetch('/repo');

    // Verify behavior - shell.execFile was called correctly
    sinon.assert.calledOnceWithExactly(
      shell.execFile,
      'git',
      ['-C', '/repo', 'fetch', '--all', '--prune'],
      { encoding: 'utf-8' }
    );
  });
});
```

## Key Sinon Methods

### Stubbing Behavior

```typescript
// Return values
stub.returns('value');
stub.resolves('async value');
stub.rejects(new Error('failure'));

// Different behaviors for sequential calls
stub.onFirstCall().resolves('first');
stub.onSecondCall().resolves('second');
stub.onThirdCall().resolves('third');

// Conditional behavior
stub.callsFake((arg) => {
  if (arg === 'special') return 'special response';
  return 'default';
});
```

### Verifying Calls

```typescript
// Called once with exact arguments
sinon.assert.calledOnceWithExactly(stub, 'arg1', 'arg2');

// Called at least once with arguments
sinon.assert.calledWith(stub, 'arg1');

// Call count
sinon.assert.calledTwice(stub);
sinon.assert.callCount(stub, 5);

// Not called
sinon.assert.notCalled(stub);

// Access call arguments
stub.firstCall.args; // ['arg1', 'arg2']
stub.secondCall.args;
```

## Coverage

Test coverage is configured to exclude:
- CLI entry points (`src/cli.ts`)
- Command layer (`src/commands/**`)
- Production adapters (`src/adapters/node.ts`)
- Test files themselves

**Current coverage: 98.24%** across all business logic in `src/lib/`.

## Writing New Tests

When adding a new service:

1. Create a corresponding `.test.ts` file
2. Import mock factories from `test-utils.ts`
3. Use `beforeEach` to create fresh stubs
4. Use `afterEach` to restore Sinon state
5. **Test behavior**: Verify that methods are called with correct arguments
6. **Test error handling**: Ensure errors propagate correctly
7. Run `npm run test:coverage` to ensure adequate coverage

## Common Patterns

### Testing async operations

```typescript
it('should handle errors from async operations', async () => {
  shell.execFile.rejects(new Error('Network error'));

  await expect(service.fetch('/repo')).rejects.toThrow('Network error');
  sinon.assert.calledOnce(shell.execFile);
});
```

### Testing error paths

```typescript
it('should return false when operation fails', async () => {
  stub.rejects(new Error('fail'));

  const result = await service.checkSomething();

  expect(result).toBe(false);
  sinon.assert.calledOnce(stub);
});
```

### Testing multiple calls

```typescript
it('should call stub for each item', async () => {
  stub.resolves('ok');

  await service.processItems(['a', 'b', 'c']);

  expect(stub.callCount).toBe(3);
  sinon.assert.calledWith(stub.firstCall, 'a');
  sinon.assert.calledWith(stub.secondCall, 'b');
  sinon.assert.calledWith(stub.thirdCall, 'c');
});
```
