# Stage 8: Run it (backups, restore, retention, monitoring, drills, security pass)

> Guide-and-review stage. The owner writes the CronJobs, the runbook and the alarm. Claude writes the starters, the guide, the security review and the review. Claude runs no git commands. Steps use checkboxes.

**Goal:**
- Nightly `pg_dump` to S3, plus a timed restore drill with a written runbook.
- The nightly retention CronJob.
- Monitoring chosen by measured memory, with one alert that reaches his phone or inbox.
- A spot-interruption drill that shows the server comes back with its data.
- One security-review pass before launch.

**Spec:** `docs/superpowers/specs/2026-11-11-portfolio-design.md`: §2 anti-goals (budget); §3 Memory; §4 rows Backups and Monitoring, plus Spot handling; §5 Privacy and retention, and Security basics ("before launch: one security-review pass"); §8 stage 8; §11 (monitoring choice).

**Depends on:**
- stage 4: the backup bucket with its 30-day lifecycle, and the instance role
- stage 7: the chart and Flux, so every manifest here lands through git
- Plan 2: `node dist/cli/retention.js`, which prints one JSON line of counts and exits 0

## Reconsider before executing

- **Pods and IMDS.** The backup pod uploads with the instance role through IMDSv2. Its default hop limit of 1 blocks containers, so stage 4's launch template needs `http_put_response_hop_limit = 2`. The other option is to put the dump in the api image with no AWS access at all. That fails, because nothing would upload it. Teach the hop limit, and note the trade-off: every pod can reach the role.
- **The instance role's S3 access is write-only:** `s3:PutObject` on `backups/*`. Restores use the owner's own credentials from his Mac, so a compromised pod can't read or delete old dumps.
- **Monitoring decision rule.** Use `kubectl top node` (metrics-server ships with k3s), `free -m` over SSM, and a day of steady traffic.
  - If at least 400 MB is still available, try Grafana Cloud free + Alloy, then measure again. Keep it only if at least 250 MB stays free.
  - Otherwise use the fallback: an AWS-only uptime check plus CloudWatch.
  - Grafana Cloud is the one non-AWS service the spec allows. Confirm the owner is still fine with that.
- **Uptime check cost.** A Route 53 health check on the Elastic IP costs about $0.50/mo, and options such as HTTPS or string matching add about $1/mo each. A CloudWatch `StatusCheckFailed` alarm on the instance is free within 10 alarms, and SNS email is free. Check current prices, and keep the total within the ~$11/mo budget.
- **The external check targets `https://<domain>/api/health`,** which proves Traefik, the api and the DB together. It depends on Plan 1's proposed `GET /api/health` (Plan 1 Reconsider list). `/api/site` can't be the target, because it returns 200 with the public payload even when Postgres is down (fail open). If that route isn't approved, fall back to `/api/site` and accept that a DB outage goes undetected. Plan 1's `/healthz` and `/readyz` are not routed under `/api`, and they stay internal.
- **Spot interruption.** The 2-minute notice isn't handled. A drain handler (AWS Node Termination Handler) is too heavy for 2 GB. The drill measures the real downtime, and the runbook states it. A small user-data shutdown hook is optional.
- **Cost:** S3 dumps are a few MB × 30 days, so cents. Monitoring costs $0–2/mo depending on the choice above.

## Owner's starter files

- `deploy/clusters/prod/backup-cronjob.yaml`
  - `# TODO(you): schedule + timeZone UTC, concurrencyPolicy Forbid, history limits`
  - `# TODO(you): initContainer postgres:17 pg_dump -Fc to emptyDir`
  - `# TODO(you): main container aws-cli s3 cp to s3://<backup-bucket>/backups/<date>.dump`
  - `# TODO(you): non-root, readOnlyRootFilesystem, resources`
- `deploy/clusters/prod/retention-cronjob.yaml`
  - `# TODO(you): api image, command node dist/cli/retention.js, envFrom api secret, schedule offset from backup`
- `deploy/clusters/prod/networkpolicy-backup.yaml`
  - `# TODO(you): allow backup pods → postgres:5432 only`
- `infra/monitoring.tf`
  - `# TODO(you): SNS topic + email subscription`
  - `# TODO(you): the one alarm` (StatusCheckFailed, or the Route 53 health check alarm)
  - `# TODO(you): IMDS hop limit change in the launch template`
- `docs/runbooks/restore.md`
  - `<!-- TODO(you): measured times, exact commands, row-count checks -->`
- `docs/runbooks/spot-interruption.md`
  - `<!-- TODO(you): timeline from the drill -->`
- `docs/learn/08-operate.md`: the guide text.

## Claude's tasks

- [ ] **Security review pass** over Plan 1's gate and guard, Plan 2's beacon and mark link, and every `/api/admin/*` route. Use `/security-review`, plus checks against the live site:
  - `curl -sI https://<domain>/` and `https://admin.<domain>/` show HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` and a CSP with `frame-ancestors 'none'`.
  - `/c/*` and the admin host send `noindex`.
  - The NetworkPolicy blocks other pods: `kubectl run np-test --rm -it --image=busybox -- nc -zv -w2 postgres 5432` → timeout.
  - The guard locks after 20 bad codes from one IP.
  - Login locks after 5 failures.
  - The beacon returns 403 for a foreign Origin.

  Claude reports findings ranked by severity. Fixes to app code are Claude's. Fixes to infra are the owner's.
- [ ] **Write the restore drill script outline** in the guide, not as a finished script: download the newest dump, `pg_restore` into a scratch DB `pf_restore`, and compare row counts with prod.

## Steps

- [ ] **Step 1 (Claude):** Write the starters with the §7 four-part explanation. Publish the guide artifact and write `docs/learn/08-operate.md`.
- [ ] **Step 2 (owner):** Backup.
  - `kubectl create job --from=cronjob/pg-backup pg-backup-now`, then `aws s3 ls s3://<backup-bucket>/backups/` shows today's `.dump` with a size above 0.
  - `aws s3api get-bucket-lifecycle-configuration` shows `Days: 30`.
- [ ] **Step 3 (owner):** Restore drill, timed with a stopwatch.
  - Check: row counts in `pf_restore` for `invites`, `visits`, `events` and `site_content` equal prod's.
  - Write `restore.md` with the measured restore time (RTO) and the backup age (RPO).
- [ ] **Step 4 (owner):** Retention.
  - `kubectl create job --from=cronjob/retention retention-now`, then `kubectl logs job/retention-now` prints one JSON line with five counts, and the Job is `Complete`.
- [ ] **Step 5 (owner):** Measure memory and choose monitoring by the rule in Reconsider. Paste `kubectl top pods -A --sort-by=memory` and `free -m`.
- [ ] **Step 6 (owner):** Set up the one alert, then test it.
  - Scale the api to 0, or stop the instance for the status-check route.
  - Check: an email or push arrives within the alarm period.
  - Restore the service.
- [ ] **Step 7 (owner):** Spot-interruption drill.
  - Write down the `invites` count. Run `aws ec2 terminate-instances --instance-ids <id>`.
  - Check: the ASG launches a replacement.
  - Check: `aws ec2 describe-addresses` shows the EIP on the new instance.
  - Check: `kubectl get nodes` shows the same `--node-name` `Ready`.
  - Check: the `invites` count is unchanged.
  - Check: `curl -sI https://<domain>/` → 200 with the same certificate.
  - Record the minutes of downtime in `spot-interruption.md`.
- [ ] **Step 8: Review gate.** The owner pastes the manifests, `monitoring.tf`, both runbooks and the outputs from Steps 2–7. Claude reviews them and delivers the security pass findings. Launch, meaning invites are sent, happens only when no High findings remain open.

## Guide artifact outline (§7; steps, checks and paste list are the Steps above)

- **What and why:**
  - RPO vs RTO
  - "a backup you never restored is not a backup"
  - least-privilege backup writes
  - why one good alert beats a dashboard nobody watches
- **Diagram:** a CronJob at 03:00 → pg_dump → S3 (30-day lifecycle); the alarm path from instance or health check → CloudWatch → SNS → email; the spot replacement sequence (ASG → user-data → EBS attach → EIP → k3s).
- **Common mistakes:**
  - plain-SQL dumps that are slow to restore (use `-Fc`)
  - the CronJob in local time
  - IMDS hop limit 1
  - the backup role allowed to delete
  - the alert never tested
  - the restore tested only into the live DB
- **Interview questions:**
  - Walk me through your restore and its RTO.
  - How do you handle spot interruptions on one node?
  - Why is the backup role write-only?
  - What would you monitor first, and why?
  - What did your security review find?
