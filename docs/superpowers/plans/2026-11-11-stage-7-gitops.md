# Stage 7: CD with GitOps (Helm + Flux + SOPS)

> Guide-and-review stage. The owner writes the chart, the Flux config and the secrets from starter files. Claude writes the starters, the guide, the broken release and the review. Claude runs no git commands. Steps use checkboxes.

**Goal:**
- The stage 2/5 YAML becomes one Helm chart.
- Flux, installed on the k3s server, reads the public repo with no credentials and applies `deploy/`.
- Secrets live in git encrypted with SOPS + age.
- CI's last job bumps the image tag in `deploy/` with `GITHUB_TOKEN`, and Flux rolls it out.
- Rolling back is `git revert`.

**Spec:** `docs/superpowers/specs/2026-11-11-portfolio-design.md`: §3 Memory; §4 rows Deploys, Packaging, Registry and Secrets; §5 credentials; §7; §8 stage 7; §11 (Helm vs Kustomize).

**Depends on:**
- stage 5: the live cluster with the plain YAML in `deploy/`
- stage 6: CI pushes `ghcr.io/<owner>/pf-{site,admin,api}:sha-<short>`
- Plan 1:
  - the api image runs `node dist/cli/migrate.js` (migrations + seed) and `node dist/cli/admin-init.js`
  - `/healthz` is liveness and `/readyz` is readiness (503 when the DB is down)

## Decision: Helm chart, applied by Flux's HelmRelease from the repo's GitRepository

- **Why:**
  - The spec's stage 7 asks for a Helm chart.
  - Helm is the packaging tool interviewers ask about.
  - The migration fits a `pre-install,pre-upgrade` hook Job.
  - HelmRelease adds an upgrade, test and rollback history that he can inspect.
- **Rejected: Kustomize.** With one environment it adds overlays for nothing, and he already learned plain YAML in stage 2.
- **The chart lives at `deploy/chart/portfolio/`.** Prod values live in `deploy/clusters/prod/values.yaml`, which is the only file CI edits.
- **HelmRelease uses `reconcileStrategy: Revision`,** so a values-only commit triggers an upgrade without a chart version bump.

## Reconsider before executing

- **Memory.** Install only `source-controller`, `kustomize-controller`, `helm-controller` and `notification-controller`. Skip image-automation, because CI bumps the tag. Measure with `kubectl top pods -n flux-system` against the about 300 MB budget shared with Traefik and cert-manager.
- **Bootstrap without credentials.** `flux bootstrap github` needs a write token and a deploy key, which the spec rules out. Instead:
  1. Run `flux install --export` and commit the output to `deploy/flux/flux-system/gotk-components.yaml`.
  2. Run one `kubectl apply` of the sync manifests: a GitRepository over https with no `secretRef`, and a Kustomization on `deploy/clusters/prod`.

  After that, Flux manages itself from git. Check the current Flux version and that its CLI flags still exist at execution time.
- **The age private key exists in exactly two places:** the `sops-age` Secret in `flux-system` (created by hand, never in git) and the owner's password manager. If both are lost, every secret has to be re-created. That is part of the runbook.
- **Tag-bump loop and branch protection.** A push made with `GITHUB_TOKEN` does not trigger new workflow runs (a GitHub rule), so there is no loop. But if `main` requires PRs, the bump push is rejected. Options: leave `main` unprotected for the bot, or have the bump open a PR. The owner decides.
- **HelmRelease remediation.** Set `upgrade.remediation.retries: 0` for the broken-release drill, so he rolls back by hand. Decide afterwards whether to enable auto-rollback.
- **`FEATURE_PREVIEW_KEY` stays out of `.env.example` on purpose:** the drill needs the prod Secret to lack it. The `git revert` removes the requirement again, so no `.env.example` change is needed either way.

## Owner's starter files

- `deploy/chart/portfolio/Chart.yaml`, `values.yaml`, and `templates/{site,admin,api}-{deployment,service}.yaml`
  - `# TODO(you): image repository/tag from values`
  - `# TODO(you): securityContext non-root, readOnlyRootFilesystem`
  - `# TODO(you): probes (/healthz liveness, /readyz readiness)`
  - `# TODO(you): rolling update maxUnavailable 0`
- `templates/ingress.yaml`
  - `# TODO(you): hosts and paths from values, cert-manager annotation`
- `templates/migrate-job.yaml`
  - `# TODO(you): helm.sh/hook pre-install,pre-upgrade; hook-delete-policy before-hook-creation; backoffLimit`
- `templates/networkpolicy.yaml`
  - `# TODO(you): only api pods reach postgres:5432`
- Postgres StatefulSet: keep it outside the chart as its own manifest under `deploy/clusters/prod/`, so a bad chart release can't touch the database.
- `deploy/clusters/prod/helmrelease.yaml`
  - `# TODO(you): chart from GitRepository path, reconcileStrategy Revision, valuesFiles, remediation retries 0`
- `deploy/flux/sync.yaml`
  - `# TODO(you): GitRepository https URL no secretRef, interval`
  - `# TODO(you): Kustomization path, prune true, decryption provider sops secretRef sops-age`
- `.sops.yaml`
  - `# TODO(you): creation_rules path_regex for deploy/**/*secret*.yaml, encrypted_regex ^(data|stringData)$, age recipient`
- `deploy/clusters/prod/api-secret.yaml`, SOPS-encrypted
  - `# TODO(you): DATABASE_URL, TOTP_ENC_KEY, …` (the env list from Plans 1–2)
- `.github/workflows/ci.yml`, new `bump` job
  - `# TODO(you): needs push jobs, permissions contents: write, yq edit of values.yaml tags, commit as github-actions[bot]`
- `docs/learn/07-gitops.md`: the guide text.

## Claude's code task: the deliberately broken release

- [ ] Prepare a branch description (not a commit: Claude doesn't run git) for one small, believable bad change. In the api config schema (Plan 1, `config.ts`), require a new env var `FEATURE_PREVIEW_KEY`. Prod's Secret doesn't have it, so the new pods exit with code 1 and the name of the variable.
- [ ] Expected behaviour that he should observe:
  - The migration hook succeeds.
  - New api pods go into CrashLoopBackOff.
  - The old ReplicaSet keeps serving, because `maxUnavailable: 0`.
  - `flux get helmreleases` shows `upgrade retries exhausted`.
  - The site stays up.
- [ ] Give him only the symptom ("the API is stuck rolling out"), not the cause. He diagnoses it with `kubectl get pods`, `kubectl logs --previous`, `flux get hr` and `kubectl describe hr`.

## Steps

- [ ] **Step 1 (Claude):** Write the starters with the §7 four-part explanation. Publish the guide artifact and write `docs/learn/07-gitops.md`.
- [ ] **Step 2 (owner):** Build the chart.
  - Check: `helm lint deploy/chart/portfolio` → `0 chart(s) failed`.
  - Check: `helm template … | kubectl apply --dry-run=server -f -` → no errors.
- [ ] **Step 3 (owner):** Generate the age key, encrypt the Secret and commit it.
  - Check: `grep -c ENC\[ deploy/clusters/prod/api-secret.yaml` ≥ 1.
  - Check: `sops -d … | grep -c TOTP_ENC_KEY` = 1.
- [ ] **Step 4 (owner):** Install Flux and apply the sync.
  - Check: `flux check` → all checks passed.
  - Check: `flux get sources git` → `READY True`, with no secret listed.
  - Check: `flux get hr -A` → `READY True`.
- [ ] **Step 5 (owner):** Remove the old plain-YAML resources that the chart now owns.
  - Check: `kubectl get deploy -A` shows each app exactly once, managed by Helm (`app.kubernetes.io/managed-by=Helm`).
- [ ] **Step 6 (owner):** Push an app change to main.
  - Check: CI's bump commit appears.
  - Check: within about 2 minutes, `kubectl get deploy pf-api -o jsonpath='{..image}'` shows the new `sha-`.
- [ ] **Step 7 (owner):** Run the broken-release drill. Merge it, diagnose it, run `git revert <sha>` and push.
  - Check: the HelmRelease is `READY True` on the reverted revision.
  - Check: all api pods are `Running`.
  - Record the time from detection to recovery.
- [ ] **Step 8: Review gate.** The owner pastes the chart, the HelmRelease, `sync.yaml`, `.sops.yaml`, the bump job, the outputs from Steps 2–7, and a short incident note from the drill. Claude reviews them. Stage 8 starts only after that.

## Guide artifact outline (§7; steps, checks and paste list are the Steps above)

- **What and why:**
  - push vs pull deploys
  - why CI never holds cluster credentials
  - Helm hooks
  - SOPS envelope encryption
- **Diagram:** git push → CI → GHCR plus the bump commit → Flux source → helm-controller → cluster. A side box shows the age key and where it lives.
- **Common mistakes:**
  - encrypting the whole Secret (`kind` and `metadata` included)
  - committing the age key
  - `prune: false`, which leaves orphans
  - the migration as a plain Job that races the Deployment
  - the hook Job left behind with no delete policy
  - the Postgres StatefulSet inside the chart
- **Interview questions:**
  - GitOps vs push-based CD?
  - How does Flux decrypt SOPS secrets?
  - What does `maxUnavailable: 0` buy you?
  - Helm hook ordering and failure?
  - How do you roll back, and what can't `git revert` undo (a migration that has already run)?
