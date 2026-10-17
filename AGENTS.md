# Agents

- **Before any push or PR, follow [TESTING.md](TESTING.md).** `npm run check` runs the checks your change needs, and
  the pre-push hook refuses a push it hasn't passed. Don't skip it (`--no-verify`) unless the owner says so.
- `scripts/setup.sh` installs the tools and turns the hook on.
- Work in a checkout of your own (`git worktree add`): sessions sharing a folder switch each other's branches. The
  emulator is shared, though: if a run says it's in use, wait for the other session's run, then run yours again.
