---
name: commit-and-push
description: Use when user invokes /commit-and-push to commit and push changes in the tutoring repo (push to main triggers deploy)
---

# commit-and-push

User-invocable skill. Commits and pushes changes in this repo (`mitl-feedmysheep/tutoring`).
Pushing to `main` triggers the deploy workflow (`.github/workflows/deploy.yml`) on the Mac mini.

## Usage

```
/commit-and-push
/commit-and-push 메시지에 담고 싶은 내용 (선택)
```

If arguments are given, use them as a hint for the commit message.

## Procedure

1. If this is not a git repo yet: `git init -b main`, `git remote add origin https://github.com/mitl-feedmysheep/tutoring.git`
2. Run `git status -u` and `git diff` (staged + unstaged) in parallel
3. If no changes, stop with message "변경사항 없음"
4. Check the docs are up to date with the changes (see `CLAUDE.md`):
   - Today's worklog `docs/worklog/YYYY-MM-DD.md` mentions this work. If not, add it before committing
   - `docs/roadmap.md` checkboxes reflect finished items
   - If features or policies changed, `docs/requirements.md` and its 변경 이력 are updated
5. Run `npm run lint` and `npm test`. If either fails, report and stop (deploy would fail anyway)
6. Write a conventional commit message in Korean:
   - Format: `type: 한국어 요약` + optional body
   - Types: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
   - Focus on WHY, not WHAT
7. Stage only the changed/new files by name (never `git add -A` or `git add .`)
8. Commit
9. Push to the currently checked-out branch (first push: `git push -u origin main`)
10. If pushed to `main`, find the triggered run with `gh run list --limit 1` and report its URL
11. Report result: branch name, commit hash, push status, deploy run URL

## Rules

- Never amend existing commits
- Never force push
- Never skip hooks (no `--no-verify`)
- Never commit `.env`, credentials, or secrets - warn if detected (secrets live in Doppler)
- If push fails, report the error and stop - do not retry
