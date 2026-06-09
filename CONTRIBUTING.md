# Contributing to Body

Thanks for your interest in contributing to **Body**! We welcome contributions from everyone.

---

## Getting Started

### Prerequisites
- Node.js ≥ 18
- npm or yarn
- Git

### Setup

```bash
# Clone the repo
git clone https://github.com/ReallyArtificial/body.git
cd body

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test
```

---

## Development Workflow

1. **Fork the repo** and create your branch from `main`
2. **Make your changes** — add features, fix bugs, improve docs
3. **Add tests** — all new code should have tests
4. **Run linter** — `npm run lint`
5. **Commit** — use clear, descriptive commit messages
6. **Push** to your fork and **submit a pull request**

### Branch naming
- `feat/your-feature-name` — for new features
- `fix/issue-description` — for bug fixes
- `docs/what-you-changed` — for documentation

---

## Code Style

- **TypeScript**: We use TypeScript for all code
- **Linting**: ESLint + Prettier (run `npm run format` before committing)
- **Testing**: Jest (aim for >80% coverage)

### Example

```typescript
import { defineAction } from './action';
import { z } from 'zod';

export const myAction = defineAction({
  name: 'my_action',
  description: 'What this action does',
  inputs: z.object({
    param: z.string(),
  }),
  execute: async ({ param }) => {
    // Implementation
    return { result: 'success' };
  },
});
```

---

## Testing

All PRs must include tests. We use Jest.

```bash
# Run all tests
npm test

# Run in watch mode
npm test -- --watch

# Check coverage
npm test -- --coverage
```

### Writing Tests

```typescript
import { myAction } from './myAction';

describe('myAction', () => {
  it('should execute successfully', async () => {
    const result = await myAction.execute({ param: 'test' });
    expect(result.result).toBe('success');
  });

  it('should validate inputs', () => {
    expect(() => myAction.inputs.parse({ param: 123 })).toThrow();
  });
});
```

---

## Documentation

- **Code comments**: Document complex logic
- **README updates**: If you add a feature, update the README
- **Architecture docs**: If you change core design, update ARCHITECTURE.md

---

## Good First Issues

New to the project? Look for issues labeled [`good first issue`](https://github.com/ReallyArtificial/body/issues?q=label%3A%22good+first+issue%22).

These are well-scoped tasks that are great for getting familiar with the codebase.

---

## Pull Request Guidelines

### Before submitting

- [ ] Tests pass (`npm test`)
- [ ] Linter passes (`npm run lint`)
- [ ] Code is formatted (`npm run format`)
- [ ] Documentation is updated
- [ ] Commit messages are clear

### PR Description

Please include:

1. **What does this PR do?** (one sentence summary)
2. **Why is this change needed?** (problem it solves)
3. **How was it tested?** (manual testing + automated tests)
4. **Screenshots** (if UI changes)
5. **Breaking changes?** (if any)

---

## Community

- **Discussions**: [GitHub Discussions](https://github.com/ReallyArtificial/body/discussions)
- **Issues**: [GitHub Issues](https://github.com/ReallyArtificial/body/issues)
- **Org**: [Really Artificial](https://github.com/reallyartificial)

---

## Code of Conduct

We follow the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). Please read it before contributing.

---

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

---

Thank you for contributing to **Body**! 🚀
