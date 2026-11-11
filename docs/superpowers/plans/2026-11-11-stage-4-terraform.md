# Stage 4: The same AWS in Terraform Plan

> **For agentic workers:** There is no Claude app code in this stage. Claude writes skeleton `.tf` starter files (variables, resource blocks named, with bodies as `# TODO(you)`), the guide and the checks. The owner writes the Terraform and runs every `terraform` command, and Claude reviews. Claude never runs `terraform apply` or `destroy`, `git commit` or `git push`.

**Goal:** `infra/` rebuilds stage 3 from code, plus the parts a spot server needs to survive replacement: a data EBS volume, a launch template and a spot Auto Scaling group of 1 whose user-data reattaches the volume and Elastic IP. Then destroy and rebuild once.

**Spec:** `docs/superpowers/specs/2026-11-11-portfolio-design.md` §3, §4 (IaC, spot handling rows), §5 (IAM scope), §8 stage 4, §10 (spot ASG pinned to the volume's AZ), §11 (user-data via AWS CLI with instance-role permissions).

**Depends on:** Stage 3 reviewed and torn down. Terraform ≥ 1.10 installed on the Mac (needed for S3 native locking). Check the current version at execution.

## Reconsider before executing

- **State bootstrap:** the state bucket cannot be created by the state it stores. Proposed: a tiny `infra/bootstrap/` stack with local state that creates only the state bucket (versioning on, public access blocked). Its local `terraform.tfstate` is git-ignored and kept safe. Alternative: create that one bucket by hand.
- **Locking:** S3 native lockfile (`use_lockfile = true`), no DynamoDB table. Check that the current Terraform docs still mark it GA.
- **Volume size:** a 10 GB gp3 data volume (about $0.80/mo) on top of the 20 GB root. The §3 EBS line is about $1.60, so keep the total at or under 30 GB.
- **`prevent_destroy`** on the data volume protects Postgres data, but blocks the "destroy and rebuild once" drill. Proposed: off during this stage, on from stage 5. The owner decides.
- **Spot capacity:** if t4g.small spot is unavailable in the pinned AZ, the ASG waits. A fallback instance type list (t4g.medium is about 2× the price) is a choice for the owner. The default is no fallback, and downtime is accepted (§8 known limits).
- **Region and AMI** carry over from stage 3. The AMI is looked up with a `data "aws_ami"` filter (arm64, owner amazon), not hard-coded.
- **The IAM for CI (OIDC) is stage 6,** not here. This stage's IAM is the node role only.

## Starter files (owner fills the TODOs)

All are in `infra/`, one file per concern:

- `versions.tf`: `# TODO(you): required_version >= 1.10, aws provider pin`, `# TODO(you): backend "s3" { bucket, key, region, use_lockfile }`
- `variables.tf`: `region`, `az`, `instance_type` (default `t4g.small`), `node_name` (default `pf-node`), `data_volume_gb`, `budget_email`. `# TODO(you): validation blocks for az and instance_type`
- `network.tf`: `aws_vpc`, `aws_subnet` (pinned to `var.az`, `map_public_ip_on_launch = false`), `aws_internet_gateway`, `aws_route_table` + association, `aws_security_group` (80/443 in only). `# TODO(you): each body`
- `iam.tf`: node role + instance profile.
  - `# TODO(you): attach AmazonSSMManagedInstanceCore`
  - `# TODO(you): inline policy allowing ec2:AttachVolume on the data volume ARN only, ec2:AssociateAddress on the EIP allocation, ec2:Describe* (cannot be scoped), and s3:PutObject on the backup bucket prefix`
- `storage.tf`: `aws_ebs_volume.data` (gp3, `var.az`, tag `Name=pf-data`), `aws_eip.node`, `aws_s3_bucket.backups`.
  - `# TODO(you): versioning, public access block, a lifecycle rule expiring objects after 30 days, SSE-S3`
- `compute.tf`: `aws_launch_template.node` (IMDSv2 required, no key pair, 20 GB gp3 root, instance profile, `user_data = base64encode(templatefile("user-data.sh.tftpl", {...}))`), and `aws_autoscaling_group.node` (min = max = desired = 1, one subnet, `mixed_instances_policy` with 100% spot).
  - `# TODO(you): the ASG body`
  - `# TODO(you): instance refresh on launch template change (yes or no, and why)`
- `user-data.sh.tftpl`: the outline is written as comments. He writes each step:
  1. `# TODO(you): read instance id and region via IMDSv2 token`
  2. `# TODO(you): aws ec2 attach-volume ${volume_id} as /dev/sdf; wait until attached`
  3. `# TODO(you): find the device by volume id under /dev/disk/by-id/ (Nitro names it nvme*, not sdf)`
  4. `# TODO(you): mkfs.ext4 only if the volume has no filesystem (blkid), never otherwise`
  5. `# TODO(you): mount at /data, add to /etc/fstab with nofail`
  6. `# TODO(you): aws ec2 associate-address --allocation-id ${eip_alloc_id} --allow-reassociation`
  7. `# TODO(you): stage 5 adds the k3s install here (--node-name ${node_name} --data-dir /data/k3s)`
  8. `set -euo pipefail`, logging to `/var/log/pf-user-data.log`
- `budget.tf`: `aws_budgets_budget` ($10/mo, the same alerts as stage 3). `# TODO(you): exclude credits (cost_types)`
- `outputs.tf`: `eip`, `instance_profile`, `data_volume_id`, `backup_bucket`.
- `bootstrap/main.tf`: the state bucket. `# TODO(you): versioning, public access block, a prevent_destroy lifecycle`

`infra/.gitignore` ignores `.terraform/`, `*.tfstate*` and `*.tfvars` (a committed `example.tfvars` holds placeholders).

## Tasks (owner)

- [ ] **1. Bootstrap state:** `terraform -chdir=infra/bootstrap init && terraform -chdir=infra/bootstrap apply`. Check: `aws s3api get-bucket-versioning --bucket <state>`. Expected: `"Status": "Enabled"`.
- [ ] **2. Network, IAM and storage:** `terraform -chdir=infra init`, then `plan`. Expected: only the resources above, no NAT gateway. Then `apply`.
- [ ] **3. Compute:** apply the launch template and ASG. Check: `cat /var/log/pf-user-data.log` through SSM ends with `done`. `lsblk` shows the data volume mounted at `/data`, and `curl -s ifconfig.me` from the instance prints the EIP.
- [ ] **4. Lock check:** run `terraform plan` in two terminals at once. Expected: the second fails with a state-lock error naming the `.tflock` object.
- [ ] **5. Replacement drill:** `touch /data/marker`, terminate the instance from the console, then wait for the ASG to launch a new one. Expected: SSM Online, `/data/marker` present, and the EIP back on the new instance. Time it and write the number in the guide.
- [ ] **6. Destroy and rebuild:** `terraform destroy` (main stack only; keep bootstrap), confirm in the console that nothing billable remains (the stage 3 teardown checks), then `apply` again. Expected: the same outputs except new IDs. `plan` afterwards shows `No changes`.
- [ ] **7. Drift check:** change the SG in the console (add port 22), then run `plan`. Expected: Terraform proposes removing it. Apply to remove it.

## Guide and review

- **Guide artifact and `docs/learn/04-terraform.md`:**
  - what and why: providers, state and locking, plan/apply/destroy, data sources, `templatefile`, lifecycle, why an ASG of 1 (self-healing, not scaling), and why the AZ is pinned (EBS is per-AZ)
  - a diagram: ASG → launch template → instance; boot attaches the EBS volume and associates the EIP
  - the steps, check commands with expected output, and what to paste
  - common mistakes:
    - an ASG in two subnets (wrong AZ for the volume)
    - `mkfs` on every boot (data loss)
    - `/dev/sdf` assumed on Nitro
    - IAM `Resource: "*"` for attach-volume
    - committing tfstate
    - forgetting `--allow-reassociation`
  - 3–5 interview questions per file
- **Review gate:** he pastes every `infra/**/*.tf`, `user-data.sh.tftpl`, the `plan` output from Task 2, the user-data log, and the replacement-drill and lock-check outputs. Claude checks:
  - IAM least privilege
  - the `mkfs` guard is safe
  - the ASG is pinned to the volume's AZ
  - no state or secret files are tracked
  - the budget excludes credits
  - nothing in `plan` costs more than §3 allows

Stage 5 starts only after this review passes.
